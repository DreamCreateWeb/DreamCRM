import { describe, it, expect, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE TWIN GUARD.
 *
 * `recallDueWhereSql` is a second expression of `derivePatientRecallStatus`,
 * and it exists for a reason the list cannot avoid: a filter applied in
 * JavaScript after the load cannot survive a page bound. Two expressions of one
 * rule drift — so this file makes drift expensive.
 *
 * Two halves. The first walks a case matrix through the JS derivation and
 * writes down, case by case, what the SQL twin therefore has to do; change the
 * derivation's meaning and these expectations fail, naming the twin. The
 * second renders the SQL and pins that its bounds are COMPUTED from the shared
 * constants rather than typed in — so moving `RECALL_WINDOW_DAYS` or
 * `RECALL_DEFAULT_MONTHS` moves both sides or fails loudly here.
 */

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  return { schema, db: {} }
})

import {
  derivePatientRecallStatus,
  deriveLifecycle,
  lifecycleCaseSql,
  recallDueWhereSql,
  NEW_PATIENT_DAYS,
  RECALL_DEFAULT_MONTHS,
  RECALL_OVERDUE_GRACE_MONTHS,
  RECALL_WINDOW_DAYS,
  RECALL_MONTH_MS,
  type LifecycleFacts,
  type RecallStatus,
} from '@/lib/services/recall-status'
import { lapsedCutoff, LAPSED_DEFAULT_MONTHS } from '@/lib/dates'
import { clinicDayStart } from '@/lib/clinic-timezone'

const NOW = new Date('2026-06-10T12:00:00Z')
const DAY = 86_400_000
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY)
const monthsAgo = (m: number) => new Date(NOW.getTime() - m * RECALL_MONTH_MS)

const isDue = (s: string) => s === 'due' || s === 'overdue'

/** A patient whose clinic stored `0` as their recall interval. */
const ZERO_OVERRIDE = {
  now: NOW,
  hasUpcomingAppt: false,
  hasAnyFutureAppt: false,
  pmsRecallDueAt: null as Date | null,
  lastVisitAt: null as Date | null,
  intervalMonths: 0,
}

describe('the rule the SQL twin has to reproduce', () => {
  const base = {
    now: NOW,
    hasUpcomingAppt: false,
    hasAnyFutureAppt: false,
    pmsRecallDueAt: null as Date | null,
    lastVisitAt: null as Date | null,
    intervalMonths: null as number | null,
  }

  const cases: Array<{ name: string; opts: typeof base; due: boolean }> = [
    {
      name: 'a visit inside the near window is scheduled — never due',
      opts: { ...base, hasUpcomingAppt: true, lastVisitAt: monthsAgo(24) },
      due: false,
    },
    {
      name: 'any live future booking is na — never due, even with a stale PMS date',
      opts: { ...base, hasAnyFutureAppt: true, pmsRecallDueAt: daysFromNow(-400) },
      due: false,
    },
    {
      name: 'PMS date inside the window is due',
      opts: { ...base, pmsRecallDueAt: daysFromNow(RECALL_WINDOW_DAYS - 1) },
      due: true,
    },
    {
      name: 'PMS date well past is overdue — still on the due side of the filter',
      opts: { ...base, pmsRecallDueAt: daysFromNow(-RECALL_WINDOW_DAYS - 90) },
      due: true,
    },
    {
      name: 'PMS date beyond the window is not due yet',
      opts: { ...base, pmsRecallDueAt: daysFromNow(RECALL_WINDOW_DAYS + 1) },
      due: false,
    },
    {
      name: 'PMS date wins over the last-visit heuristic',
      opts: { ...base, pmsRecallDueAt: daysFromNow(365), lastVisitAt: monthsAgo(36) },
      due: false,
    },
    {
      name: 'no PMS date, last visit older than the clinic default → due',
      opts: { ...base, lastVisitAt: monthsAgo(RECALL_DEFAULT_MONTHS + 1) },
      due: true,
    },
    {
      name: 'no PMS date, last visit inside the interval → not due',
      opts: { ...base, lastVisitAt: monthsAgo(RECALL_DEFAULT_MONTHS - 1) },
      due: false,
    },
    {
      name: 'a per-patient interval overrides the default, both directions',
      opts: { ...base, lastVisitAt: monthsAgo(4), intervalMonths: 3 },
      due: true,
    },
    {
      name: 'a longer per-patient interval holds a patient back from due',
      opts: { ...base, lastVisitAt: monthsAgo(9), intervalMonths: 12 },
      due: false,
    },
    {
      name: 'never visited, no PMS date → na, not due',
      opts: { ...base },
      due: false,
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      expect(isDue(derivePatientRecallStatus(c.opts))).toBe(c.due)
    })
  }
})

describe('recallDueWhereSql — bounds computed from the shared constants', () => {
  const dialect = new PgDialect()
  const render = (defaultIntervalMonths = RECALL_DEFAULT_MONTHS) =>
    dialect.sqlToQuery(
      recallDueWhereSql({
        organizationId: 'org_1',
        now: NOW,
        nearWindowEnd: daysFromNow(7),
        defaultIntervalMonths,
      }),
    )

  it('carries the PMS window as a bound param, not a literal', () => {
    const q = render()
    const expected = new Date(NOW.getTime() + RECALL_WINDOW_DAYS * DAY)
    // Bound THROUGH the column's encoder (drizzle's `lte`, not a bare
    // interpolation), so what reaches Postgres is the column's own wire
    // format rather than the host process's local offset.
    expect(q.params).toContain(expected.toISOString())
    // A patient BEYOND the window must not be swept in: the comparison is
    // `<=`, so the bound itself is the whole story.
    expect(q.sql).toContain('"pms_recall_due_at" is not null')
    expect(q.sql.toLowerCase()).toContain('<= $')
  })

  it('measures the heuristic interval with RECALL_MONTH_MS, not a typed-in 30', () => {
    expect(render().sql).toContain(`interval '${RECALL_MONTH_MS / DAY} days'`)
  })

  it('binds the caller’s cadence as the default interval', () => {
    expect(render(4).params).toContain(4)
    expect(render(RECALL_DEFAULT_MONTHS).params).toContain(RECALL_DEFAULT_MONTHS)
  })

  it('prefers the per-patient override exactly where the derivation does', () => {
    const sql = render().sql
    expect(sql).toContain('"recall_interval_months" is not null')
    expect(sql).toContain('"recall_interval_months" > 0')
  })

  it('a ZERO override means six months, not the clinic cadence', () => {
    // The trap: JS reads `p.recallIntervalMonths ?? cadence.recallMonths`, and
    // `??` does not fall through on 0 — so a stored 0 reaches the derivation,
    // fails its `> 0` test, and lands on RECALL_DEFAULT_MONTHS. A SQL `else`
    // that fell back to the cadence would filter a patient by one rule and
    // label them by the other, for every clinic not on a 6-month cadence.
    expect(
      derivePatientRecallStatus({
        ...ZERO_OVERRIDE,
        lastVisitAt: monthsAgo(RECALL_DEFAULT_MONTHS + 1),
      }),
    ).not.toBe('na')
    expect(
      derivePatientRecallStatus({
        ...ZERO_OVERRIDE,
        lastVisitAt: monthsAgo(RECALL_DEFAULT_MONTHS - 1),
      }),
    ).toBe('na')

    // The SQL has to carry a THIRD branch for it — a two-branch case would
    // hand a zero override the clinic's cadence.
    const q = render(24)
    expect(q.sql).toContain('when "patient"."recall_interval_months" > 0')
    expect(q.sql).toContain('when "patient"."recall_interval_months" is not null')
    // Both the default and the cadence are bound, and they are different.
    expect(q.params).toContain(RECALL_DEFAULT_MONTHS)
    expect(q.params).toContain(24)
  })

  it('mirrors the near-window read INCLUDING its cancelled visits', () => {
    // The list's own near-window query does not exclude cancelled visits, and
    // `hasUpcomingAppt` is fed from it. The twin must copy that rather than
    // quietly improve on it, or the filter and the displayed pill disagree.
    const nearWindow = render().sql.slice(0, render().sql.indexOf('and not exists'))
    expect(nearWindow).toContain('"start_time"')
    expect(nearWindow).not.toContain('"status"')
  })

  it('scopes every subquery to the organization', () => {
    const sql = render().sql
    const subqueries = (sql.match(/select 1 from|select max\(/g) ?? []).length
    const orgFilters = (sql.match(/"organization_id" = \$/g) ?? []).length
    expect(subqueries).toBeGreaterThan(0)
    expect(orgFilters).toBe(subqueries)
  })

  it('carries no `--` comment into the rendered statement', () => {
    expect(render().sql).not.toContain('--')
  })
})

// ── The lifecycle twin ───────────────────────────────────────────────────────

const TZ = 'America/Chicago'
const NEW_CUTOFF = clinicDayStart(NOW, TZ, -NEW_PATIENT_DAYS)
const LAPSED_CUTOFF = lapsedCutoff(NOW, LAPSED_DEFAULT_MONTHS)

/** A roster the way a no-PMS practice's reads it after a CSV import plus a
 *  few months of real bookings: every stage appears at least once, and the
 *  two facts that must NOT decide a stage (the stored column, the raw visit
 *  count) are deliberately absent from the facts. */
function patient(over: Partial<LifecycleFacts> = {}): LifecycleFacts {
  return {
    archived: false,
    source: 'booking',
    firstSeenAt: monthsAgo(12),
    hasAnyAppointment: true,
    lastVisitAt: monthsAgo(3),
    hasFutureVisit: false,
    recallStatus: 'na' as RecallStatus,
    newCutoff: NEW_CUTOFF,
    lapsedCutoff: LAPSED_CUTOFF,
    ...over,
  }
}

const ROSTER: Array<{ name: string; facts: LifecycleFacts; expect: ReturnType<typeof deriveLifecycle> }> = [
  { name: 'archived beats everything, even a visit yesterday', facts: patient({ archived: true, lastVisitAt: daysFromNow(-1) }), expect: 'archived' },
  { name: 'a contact-form person who never booked is a lead', facts: patient({ source: 'lead_form', hasAnyAppointment: false, lastVisitAt: null, firstSeenAt: daysFromNow(-3) }), expect: 'lead' },
  { name: 'every booking cancelled is a lead again (the journey resolver agrees)', facts: patient({ hasAnyAppointment: false, lastVisitAt: null, firstSeenAt: monthsAgo(4) }), expect: 'lead' },
  { name: 'joined 10 days ago with a booking is new', facts: patient({ firstSeenAt: daysFromNow(-10), lastVisitAt: null, hasFutureVisit: true }), expect: 'new' },
  { name: 'joined 10 days ago and already seated is still new', facts: patient({ firstSeenAt: daysFromNow(-10), lastVisitAt: daysFromNow(-2) }), expect: 'new' },
  { name: 'joined 31 clinic days ago is no longer new', facts: patient({ firstSeenAt: daysFromNow(-(NEW_PATIENT_DAYS + 1)) }), expect: 'active' },
  { name: 'a CSV roster member imported today is NOT new and NOT a lead — it is the roster', facts: patient({ source: 'import', firstSeenAt: daysFromNow(0), hasAnyAppointment: false, lastVisitAt: null }), expect: 'active' },
  { name: 'a PMS backfill member with no visit rows is active for the same reason', facts: patient({ source: 'pms_import', firstSeenAt: daysFromNow(-1), hasAnyAppointment: false, lastVisitAt: null }), expect: 'active' },
  { name: 'an imported last visit 24 months back reads lapsed — the roster brought the fuel', facts: patient({ source: 'import', firstSeenAt: daysFromNow(0), lastVisitAt: monthsAgo(24), recallStatus: 'overdue' }), expect: 'lapsed' },
  { name: 'lapsed, but with a future booking, is not lapsed (they are coming back)', facts: patient({ lastVisitAt: monthsAgo(24), hasFutureVisit: true }), expect: 'active' },
  { name: 'past the lapsed line AND overdue: lapsed wins — the colder word', facts: patient({ lastVisitAt: monthsAgo(LAPSED_DEFAULT_MONTHS + 1), recallStatus: 'overdue' }), expect: 'lapsed' },
  { name: 'overdue for recall but inside the lapsed line is at risk', facts: patient({ lastVisitAt: monthsAgo(10), recallStatus: 'overdue' }), expect: 'at_risk' },
  { name: 'merely due (not overdue) is active', facts: patient({ lastVisitAt: monthsAgo(7), recallStatus: 'due' }), expect: 'active' },
  { name: 'seen three months ago is active', facts: patient(), expect: 'active' },
  { name: 'a no-show-only person has booked (they are in the show-up war), so: not a lead', facts: patient({ hasAnyAppointment: true, lastVisitAt: null, firstSeenAt: monthsAgo(2) }), expect: 'active' },
  { name: 'null first_seen can never be new', facts: patient({ firstSeenAt: null }), expect: 'active' },
]

describe('deriveLifecycle — the roster, stage by stage', () => {
  for (const row of ROSTER) {
    it(row.name, () => {
      expect(deriveLifecycle(row.facts)).toBe(row.expect)
    })
  }

  it('the lapsed line is the CLINIC’S number, not a constant', () => {
    const twelve = lapsedCutoff(NOW, 12)
    expect(deriveLifecycle(patient({ lastVisitAt: monthsAgo(13), lapsedCutoff: twelve }))).toBe('lapsed')
    expect(deriveLifecycle(patient({ lastVisitAt: monthsAgo(13) }))).toBe('active')
  })
})

describe('lifecycleCaseSql — the twin, branch for branch', () => {
  const dialect = new PgDialect()
  const render = (defaultIntervalMonths = RECALL_DEFAULT_MONTHS) =>
    dialect.sqlToQuery(
      lifecycleCaseSql({
        organizationId: 'org_1',
        now: NOW,
        nearWindowEnd: daysFromNow(7),
        defaultIntervalMonths,
        newCutoff: NEW_CUTOFF,
        lapsedCutoff: LAPSED_CUTOFF,
      }),
    )

  it('carries every branch of the derivation, in its order', () => {
    const sql = render().sql
    const order = ["then 'archived'", "then 'lead'", "then 'new'", "then 'lapsed'", "then 'at_risk'", "else 'active'"]
    const positions = order.map((o) => sql.indexOf(o))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('archived is is_active = 0 — the stored lifecycle column is never read', () => {
    const q = render()
    expect(q.sql).toContain('"patient"."is_active" = $')
    expect(q.sql).not.toContain('"patient"."lifecycle"')
  })

  it('lead and new are both gated on NOT a backfill source, NULL-safe, with the registry bound', () => {
    const q = render()
    const gates = q.sql.match(/\("patient"\."source" is null or "patient"\."source" not in \(/g) ?? []
    expect(gates).toHaveLength(2)
    expect(q.params).toContain('pms_import')
    expect(q.params).toContain('import')
  })

  it('lead means no appointment with a status other than cancelled — a no-show still booked', () => {
    const sql = render().sql
    const lead = sql.slice(sql.indexOf("'archived'"), sql.indexOf("then 'lead'"))
    expect(lead).toContain('not exists (')
    expect(lead).toContain('"appointment"."status" <> $')
    expect(lead).not.toContain('no_show')
  })

  it('new compares first_seen_at against the bound clinic-local cutoff', () => {
    const q = render()
    expect(q.sql).toContain('"patient"."first_seen_at" >= $')
    expect(q.params).toContain(NEW_CUTOFF.toISOString())
  })

  it('lapsed is the last live visit before the bound lapsed cutoff with no live future visit', () => {
    const q = render()
    const lapsed = q.sql.slice(q.sql.indexOf("then 'new'"), q.sql.indexOf("then 'lapsed'"))
    expect(lapsed).toContain('select max("appointment"."start_time")')
    expect(lapsed).toContain('::timestamp')
    expect(lapsed).toContain('not exists (')
    expect(q.params).toContain(LAPSED_CUTOFF.toISOString())
  })

  it('at_risk is the recall twin in OVERDUE mode: the PMS date past the window, the grace added to the interval', () => {
    const q = render(4)
    const atRisk = q.sql.slice(q.sql.indexOf("then 'lapsed'"), q.sql.indexOf("then 'at_risk'"))
    // PMS branch: strictly before now - RECALL_WINDOW_DAYS.
    expect(atRisk).toContain('"patient"."pms_recall_due_at" < $')
    expect(q.params).toContain(new Date(NOW.getTime() - RECALL_WINDOW_DAYS * DAY).toISOString())
    // Heuristic branch: (interval + grace) months, through the SAME interval case.
    expect(atRisk).toContain('when "patient"."recall_interval_months" > 0')
    expect(atRisk).toContain('when "patient"."recall_interval_months" is not null')
    expect(atRisk).toMatch(/end\)::int \+ \$\d+::int\) \* interval '30 days'/)
    expect(q.params).toContain(RECALL_OVERDUE_GRACE_MONTHS)
    expect(q.params).toContain(4)
    expect(q.params).toContain(RECALL_DEFAULT_MONTHS)
  })

  it('the DUE twin did not grow the grace — its heuristic bound is still the bare interval', () => {
    const due = dialect.sqlToQuery(
      recallDueWhereSql({ organizationId: 'org_1', now: NOW, nearWindowEnd: daysFromNow(7), defaultIntervalMonths: 6 }),
    )
    expect(due.sql).not.toMatch(/\+ \$\d+::int\) \* interval/)
    expect(due.params).not.toContain(RECALL_OVERDUE_GRACE_MONTHS)
  })

  it('scopes every subquery to the organization', () => {
    const sql = render().sql
    const subqueries = (sql.match(/select 1 from|select max\(/g) ?? []).length
    const orgFilters = (sql.match(/"organization_id" = \$/g) ?? []).length
    expect(subqueries).toBeGreaterThan(0)
    expect(orgFilters).toBe(subqueries)
  })

  it('carries no `--` comment into the rendered statement', () => {
    expect(render().sql).not.toContain('--')
  })
})
