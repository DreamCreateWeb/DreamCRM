import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE HOLDS A PARK PUTS ON A PROSPECT (P-01 fixes 2) — the predicates, as
 * the real drizzle builders render them: the pause that rides the existing
 * pause mechanism (C7), the resume that wakes only what a verify pass
 * paused, the system follow-up a park clears while a human's promised
 * callback stays (C15), and the phone lookups that read the same NANP ten
 * digits the writers store (C5/C9). No database required.
 */

const captured: { updates: Array<{ table: string; set: Record<string, unknown>; where: unknown }>; wheres: unknown[] } = {
  updates: [],
  wheres: [],
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const tableName = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = (w: unknown) => {
      captured.wheres.push(w)
      return obj
    }
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve([]).then(onF, onR)
    return obj
  }
  return {
    schema,
    db: {
      select: () => selectChain(),
      update: (table: unknown) => ({
        set: (set: Record<string, unknown>) => ({
          where: async (where: unknown) => {
            captured.updates.push({ table: tableName(table), set, where })
          },
        }),
      }),
    },
  }
})

import {
  clearSystemFollowUp,
  findExistingProspect,
  isKnownContact,
  pauseActiveEnrollments,
  resumeVerifyPausedEnrollments,
  VERIFY_PAUSE_PREFIX,
} from '@/lib/services/prospecting'
import { SYSTEM_FOLLOWUP_REASONS, followUpForOutcome, isHumanPromisedFollowUp } from '@/lib/prospect-followup'

const NOW = new Date('2026-11-10T12:00:00Z')
const dialect = new PgDialect()
const render = (q: unknown) => dialect.sqlToQuery(q as never)

beforeEach(() => {
  captured.updates = []
  captured.wheres = []
})

describe('the system follow-up vs a human’s promise (C15)', () => {
  it('no_answer / voicemail / gatekeeper are the system’s nudges; a callback a human asked for is not', () => {
    for (const outcome of ['no_answer', 'voicemail', 'gatekeeper']) {
      const plan = followUpForOutcome(outcome, NOW)
      expect(SYSTEM_FOLLOWUP_REASONS).toContain(plan.reason)
      expect(isHumanPromisedFollowUp(plan.reason)).toBe(false)
    }
    const callback = followUpForOutcome('callback', NOW)
    expect(SYSTEM_FOLLOWUP_REASONS).not.toContain(callback.reason)
    expect(isHumanPromisedFollowUp(callback.reason)).toBe(true)
    expect(isHumanPromisedFollowUp(null)).toBe(false)
  })

  it('clearSystemFollowUp nulls the follow-up only where its reason is one of the system’s — the SQL names every system reason and the row id', async () => {
    await clearSystemFollowUp('pros_1', NOW)
    expect(captured.updates).toHaveLength(1)
    const u = captured.updates[0]
    expect(u.table).toBe('prospect')
    expect(u.set).toMatchObject({ nextFollowUpAt: null, followUpReason: null, updatedAt: NOW })
    const { sql, params } = render(u.where)
    expect(sql).toMatch(/"prospect"\."id" = \$1/)
    expect(sql).toMatch(/"prospect"\."next_follow_up_at" is not null/)
    expect(sql).toMatch(/"prospect"\."follow_up_reason" in \(\$2, \$3, \$4\)/)
    expect(params).toEqual(['pros_1', ...SYSTEM_FOLLOWUP_REASONS])
    // The promised callback's reason is not among the parameters.
    expect(params).not.toContain(followUpForOutcome('callback', NOW).reason)
  })
})

describe('the pause and the resume ride the existing pause mechanism (C7)', () => {
  it('pauseActiveEnrollments: every live enrollment of the prospect → paused_ooo with the verify reason, its clock removed (the OOO auto-resume never wakes it)', async () => {
    await pauseActiveEnrollments('pros_1', 'verify_site_dead', NOW)
    const u = captured.updates[0]
    expect(u.table).toBe('outreachEnrollment')
    expect(u.set).toEqual({ status: 'paused_ooo', nextSendAt: null, stoppedAt: NOW, stopReason: 'verify_site_dead' })
    const { sql, params } = render(u.where)
    expect(sql).toMatch(/"outreach_enrollment"\."prospect_id" = \$1/)
    expect(sql).toMatch(/"outreach_enrollment"\."status" in \(\$2, \$3\)/)
    expect(params).toEqual(['pros_1', 'active', 'paused_ooo'])
    // A reason without the prefix gets it — the resume reads the prefix.
    await pauseActiveEnrollments('pros_1', 'temporarily_closed', NOW)
    expect(captured.updates[1].set.stopReason).toBe(`${VERIFY_PAUSE_PREFIX}temporarily_closed`)
  })

  it('resumeVerifyPausedEnrollments: only a paused_ooo row whose reason is ours goes back to active, due now — an out-of-office pause keeps its own clock', async () => {
    await resumeVerifyPausedEnrollments('pros_1', NOW)
    const u = captured.updates[0]
    expect(u.table).toBe('outreachEnrollment')
    expect(u.set).toEqual({ status: 'active', nextSendAt: NOW, stoppedAt: null, stopReason: null })
    const { sql, params } = render(u.where)
    expect(sql).toMatch(/"outreach_enrollment"\."prospect_id" = \$1/)
    expect(sql).toMatch(/"outreach_enrollment"\."status" = \$2/)
    expect(sql).toMatch(/"outreach_enrollment"\."stop_reason" ilike \$3/)
    expect(params).toEqual(['pros_1', 'paused_ooo', 'verify_%'])
  })
})

describe('every phone lookup reads NANP ten digits, like the writers (C5/C9)', () => {
  it('findExistingProspect: "+1 (404) 555-1212" finds the row stored as 4045551212 — and a legacy eleven-digit row too', async () => {
    await findExistingProspect({ phone: '+1 (404) 555-1212', name: 'Smile Dental Group', state: 'GA' })
    const { sql, params } = render(captured.wheres[0])
    expect(sql).toMatch(/"prospect"\."phone" in \(\$1, \$2\)/)
    expect(params).toEqual(['4045551212', '14045551212'])
    expect(params).not.toContain('+14045551212')
  })

  it('a short number is matched as typed; nothing under seven digits is looked up by phone', async () => {
    await findExistingProspect({ phone: '555-1212', name: 'X' })
    const { sql, params } = render(captured.wheres[0])
    expect(sql).toMatch(/"prospect"\."phone" = \$1/)
    expect(params).toEqual(['5551212'])
    captured.wheres = []
    await findExistingProspect({ phone: '12345', name: 'X' })
    // Straight to the name match — no phone predicate was rendered.
    expect(render(captured.wheres[0]).sql).not.toMatch(/"prospect"\."phone"/)
  })

  it('isKnownContact: the clinic profile’s "+1 …" is read as the same ten digits — the statement drops an eleven-digit leading 1 and binds a typed text parameter', async () => {
    await isKnownContact({ phone: '+1 (404) 555-1212' })
    const { sql, params } = render(captured.wheres[0])
    expect(sql).toContain(`regexp_replace(regexp_replace(coalesce("clinic_profile"."phone", ''), '\\D', '', 'g'), '^1(\\d{10})$', '\\1') = $1::text`)
    expect(params).toEqual(['4045551212'])
  })
})
