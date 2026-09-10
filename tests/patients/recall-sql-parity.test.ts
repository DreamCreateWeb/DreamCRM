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
  recallDueWhereSql,
  RECALL_DEFAULT_MONTHS,
  RECALL_WINDOW_DAYS,
  RECALL_MONTH_MS,
} from '@/lib/services/recall-status'

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
