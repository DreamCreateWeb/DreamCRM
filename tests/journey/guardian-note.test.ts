import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE HEADS-UP THE CLINIC ACTUALLY READS (Phase 4 slice 3).
 *
 * The clinic-facing half writes a `guardian_note` ledger entry — and the
 * ledger's only clinic surfaces are the standup's COUNT chips and the
 * autonomous strip, neither of which shows the sentence. So this reader is
 * what makes the report a report rather than a write nobody reads, and
 * these are the two ways it could lie: showing a warning about a switch
 * that has since been turned back on, and showing one forever.
 */

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  switches: { remindersOn: true, reviewRequestsOn: true },
  switchReads: 0,
  fail: false,
  audience: 'clinic' as 'platform' | 'clinic',
  captured: { since: null as Date | null, capability: null as unknown },
}))

vi.mock('@/lib/services/platform-config', () => ({
  getGuardianAudience: vi.fn(async () => state.audience),
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  return {
    db: {
      select: () => {
        const api: Record<string, unknown> = {}
        api.from = () => api
        api.where = () => api
        api.orderBy = () => api
        api.limit = async () => {
          if (state.fail) throw new Error('db down')
          return state.rows
        }
        return api
      },
    },
    schema: {
      actionLedger: {
        organizationId: col('organization_id'),
        capability: col('capability'),
        summary: col('summary'),
        detail: col('detail'),
        occurredAt: col('occurred_at'),
      },
      organization: { id: col('id'), name: col('name'), type: col('type'), isDemo: col('is_demo'), createdAt: col('created_at') },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: (c: { __col: string }, v: unknown) => {
    if (c.__col === 'capability') state.captured.capability = v
    return { op: 'eq', col: c.__col, v }
  },
  gte: (c: { __col: string }, v: Date) => {
    if (c.__col === 'occurred_at') state.captured.since = v
    return { op: 'gte', col: c.__col, v }
  },
  lt: () => ({ op: 'lt' }),
  desc: () => ({ op: 'desc' }),
  sql: Object.assign(() => ({ op: 'sql' }), { raw: () => ({ op: 'sql' }), join: () => ({ op: 'sql' }) }),
}))

vi.mock('@/lib/services/engine-switches', () => ({
  readEngineSwitches: vi.fn(async () => {
    state.switchReads++
    return state.switches
  }),
}))
vi.mock('@/lib/services/patient-journey', () => ({ countSeatedBetween: vi.fn(async () => 0) }))
vi.mock('@/lib/services/proposals', () => ({ countOpenProposals: vi.fn(async () => 0) }))

import { getActiveGuardianNote } from '@/lib/services/guardian'
import { NOTE_VISIBLE_DAYS, RE_ALERT_DAYS } from '@/lib/guardian'

const NOW = new Date('2026-07-29T14:00:00Z')

function note(guardianState: string, summary = 'a heads up') {
  return { summary, detail: { guardianState }, occurredAt: new Date('2026-07-28T14:00:00Z') }
}

beforeEach(() => {
  state.rows = []
  state.switches = { remindersOn: true, reviewRequestsOn: true }
  state.switchReads = 0
  state.fail = false
  state.audience = 'clinic'
  state.captured = { since: null, capability: null }
})

describe('getActiveGuardianNote', () => {
  it('shows nothing when the machine has said nothing', async () => {
    expect(await getActiveGuardianNote('org_1', NOW)).toBeNull()
  })

  it('reads only guardian notes, and only inside the visibility window', async () => {
    state.rows = [note('stalled')]
    await getActiveGuardianNote('org_1', NOW)
    expect(state.captured.capability).toBe('guardian_note')
    // Self-expiring: nothing has to remember to clear a note, because the
    // window drops it once the guardian stops re-writing it.
    const expected = new Date(NOW.getTime() - NOTE_VISIBLE_DAYS * 24 * 60 * 60 * 1000)
    expect(state.captured.since).toEqual(expected)
  })

  it('the visibility window OUTLASTS the re-write cadence, so the card cannot go dark under a live problem', async () => {
    // Round-9 audit. Both bounds used to be RE_ALERT_DAYS and both are
    // measured from the sweep's own `now`, so the read window closed at the
    // exact instant the re-write became due — and EventBridge does not fire
    // at the same millisecond every day. A day-7 run starting a second
    // earlier than a week ago wrote nothing, and the amber card (the note's
    // ONLY clinic surface) vanished for a day. A coin flip on cron jitter.
    expect(NOTE_VISIBLE_DAYS).toBeGreaterThan(RE_ALERT_DAYS)
  })

  it('a stall note is shown as written — a closed 30-day window cannot go stale in a week', async () => {
    state.rows = [note('stalled', 'Fewer new patients came in this past month')]
    const r = await getActiveGuardianNote('org_1', NOW)
    expect(r?.summary).toContain('Fewer new patients')
    expect(r?.state).toBe('stalled')
    // No live re-check needed, so none is paid for.
    expect(state.switchReads).toBe(0)
  })

  it('a switch note is RE-VERIFIED: both engines back on and the note is gone', async () => {
    state.rows = [note('blocked', 'Appointment reminders are switched off right now')]
    state.switches = { remindersOn: true, reviewRequestsOn: true }
    // Telling a practice something untrue about their own settings is worse
    // than saying nothing, so the ledger is never trusted on its own here.
    expect(await getActiveGuardianNote('org_1', NOW)).toBeNull()
    expect(state.switchReads).toBe(1)
  })

  it('a switch note SURVIVES while the switch is still off', async () => {
    state.rows = [note('blocked')]
    state.switches = { remindersOn: false, reviewRequestsOn: true }
    expect(await getActiveGuardianNote('org_1', NOW)).not.toBeNull()

    state.switches = { remindersOn: true, reviewRequestsOn: false }
    expect(await getActiveGuardianNote('org_1', NOW)).not.toBeNull()
  })

  it('an entry it cannot characterize is not rendered — never a warning with no shape', async () => {
    for (const bad of ['silent', 'healthy', 'quiet', 'nonsense', undefined, null, 42]) {
      state.rows = [{ summary: 's', detail: { guardianState: bad }, occurredAt: NOW }]
      expect(await getActiveGuardianNote('org_1', NOW)).toBeNull()
    }
    state.rows = [{ summary: 's', detail: null, occurredAt: NOW }]
    expect(await getActiveGuardianNote('org_1', NOW)).toBeNull()
  })

  it('the LOCK governs the read too — closing it stops notes appearing, immediately', async () => {
    // The owner's control says "Keep it to me instead". Without this check
    // that button would be a lie for a week: notes written while the lock
    // was open would keep showing on clinic Overviews after it closed.
    state.rows = [note('stalled')]
    expect(await getActiveGuardianNote('org_1', NOW)).not.toBeNull()

    state.audience = 'platform'
    expect(await getActiveGuardianNote('org_1', NOW)).toBeNull()
  })

  it('an unreadable ledger shows nothing rather than half a warning', async () => {
    state.fail = true
    expect(await getActiveGuardianNote('org_1', NOW)).toBeNull()
  })

  it('a failed switch read never leaves a switch note showing on a guess', async () => {
    const mod = await import('@/lib/services/engine-switches')
    vi.mocked(mod.readEngineSwitches).mockRejectedValueOnce(new Error('nope'))
    state.rows = [note('blocked')]
    expect(await getActiveGuardianNote('org_1', NOW)).toBeNull()
  })
})

/**
 * THE LIVE RE-DERIVE (round-1 audit). The re-verification used to be
 * all-or-nothing: it cleared the note only when BOTH switches were back on,
 * so a practice that turned one back on kept reading a note insisting both
 * were off — the machine telling somebody something untrue about their own
 * settings, which is the exact failure the live check exists to prevent.
 */
describe('getActiveGuardianNote — the sentence is re-derived, not replayed', () => {
  it('a "both off" note becomes a single-switch note when one comes back on', async () => {
    state.rows = [note('blocked', 'Appointment reminders and automatic review requests are both switched off right now, so I can’t send either.')]
    state.switches = { remindersOn: true, reviewRequestsOn: false }

    const r = await getActiveGuardianNote('org_1', NOW)
    expect(r).not.toBeNull()
    expect(r!.summary).toMatch(/review requests/i)
    // It must no longer claim reminders are off — they are not.
    expect(r!.summary).not.toMatch(/appointment reminders/i)
  })

  it('reports WHICH switches are off, so the card can link to the right page', async () => {
    state.rows = [note('blocked')]
    state.switches = { remindersOn: false, reviewRequestsOn: true }
    const r = await getActiveGuardianNote('org_1', NOW)
    expect(r!.remindersOn).toBe(false)
    expect(r!.reviewRequestsOn).toBe(true)
  })

  it('a stall note is replayed as written — its window is closed and cannot go stale', async () => {
    state.rows = [note('stalled', 'Fewer new patients came in this past month')]
    const r = await getActiveGuardianNote('org_1', NOW)
    expect(r!.summary).toBe('Fewer new patients came in this past month')
    expect(r!.remindersOn).toBeUndefined()
  })
})
