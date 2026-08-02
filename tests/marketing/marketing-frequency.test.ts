import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The cross-campaign frequency cap (phase 4): max 2 marketing 'sent' events
 * per rolling 7 days per PATIENT, counted across manual campaigns AND
 * automations (one campaign_events query, org-scoped via the campaigns join).
 *
 * The identity moved from email to `patientId ?? email` on 2026-08-02, ahead
 * of SMS. Keying by address was right while email was the only thing that
 * could send; the moment a text can go out it becomes two holes — a
 * phone-only patient with no key at all, and a both-channels patient taking
 * the cap twice over. The cases below pin the new rule and the old one.
 */

const state = { eventRows: [] as Array<{ email: string | null; patientId?: string | null }> }

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.then = (resolve: (v: unknown) => void) => resolve(state.eventRows)
    return obj
  }
  return { db: { select: () => chain() }, schema }
})

import {
  partitionByFrequencyCap,
  partitionByPriorAutomationSend,
  FREQUENCY_MAX_SENDS,
} from '@/lib/services/marketing-frequency'

const r = (email: string | null) => ({ email })
/** A patient recipient: the shape the clinic tenant actually sends to. */
const p = (patientId: string | null, email: string | null = null) => ({ email, patientId })

beforeEach(() => {
  state.eventRows = []
})

describe('partitionByFrequencyCap', () => {
  it('lets everyone through when nobody has recent sends', async () => {
    const { allowed, suppressed } = await partitionByFrequencyCap('org_a', [r('a@x.com'), r('b@x.com')])
    expect(allowed).toHaveLength(2)
    expect(suppressed).toHaveLength(0)
  })

  it('suppresses a recipient at the cap and keeps the rest', async () => {
    // a@x.com already got 2 marketing emails this week; b got 1.
    state.eventRows = [{ email: 'a@x.com' }, { email: 'a@x.com' }, { email: 'b@x.com' }]
    const { allowed, suppressed } = await partitionByFrequencyCap('org_a', [r('a@x.com'), r('b@x.com')])
    expect(suppressed.map((s) => s.email)).toEqual(['a@x.com'])
    expect(allowed.map((a) => a.email)).toEqual(['b@x.com'])
  })

  it('lets through a recipient with NEITHER a patient nor an address — nothing to count', async () => {
    const { allowed, suppressed } = await partitionByFrequencyCap('org_a', [r(null)])
    expect(allowed).toHaveLength(1)
    expect(suppressed).toHaveLength(0)
  })

  it('CAPS a phone-only patient — the hole SMS would have opened', async () => {
    // No email at all. Under the old email-keyed rule this recipient had no
    // key and sailed past the cap however many texts they had already had.
    state.eventRows = [
      { email: null, patientId: 'pat_1' },
      { email: null, patientId: 'pat_1' },
    ]
    const { allowed, suppressed } = await partitionByFrequencyCap('org_a', [p('pat_1')])
    expect(suppressed).toHaveLength(1)
    expect(allowed).toHaveLength(0)
  })

  it('counts a both-channels patient ONCE, not once per channel', async () => {
    // Two sends to the same person. One went by email, one by text, so the
    // rows differ in address — but they are the same patient, and two is the
    // cap. Keying by address would have read this as 1 + 1 and let a third
    // message through.
    state.eventRows = [
      { email: 'sam@x.com', patientId: 'pat_1' },
      { email: null, patientId: 'pat_1' },
    ]
    const { suppressed } = await partitionByFrequencyCap('org_a', [p('pat_1', 'sam@x.com')])
    expect(suppressed).toHaveLength(1)
  })

  it('the patient wins over the address when both are present', async () => {
    // Same person, but the address on file changed since the earlier send.
    // The patient key still matches; an email key would not have.
    state.eventRows = [
      { email: 'old@x.com', patientId: 'pat_1' },
      { email: 'old@x.com', patientId: 'pat_1' },
    ]
    const { suppressed } = await partitionByFrequencyCap('org_a', [p('pat_1', 'new@x.com')])
    expect(suppressed).toHaveLength(1)
  })

  it('customer-source recipients (no patient) still key by address', async () => {
    // The platform tenant's own campaigns write patientId = null forever.
    state.eventRows = [{ email: 'a@x.com' }, { email: 'a@x.com' }]
    const { suppressed, allowed } = await partitionByFrequencyCap('org_a', [r('a@x.com'), r('b@x.com')])
    expect(suppressed.map((s) => s.email)).toEqual(['a@x.com'])
    expect(allowed.map((a) => a.email)).toEqual(['b@x.com'])
  })

  it('the cap is 2 — one prior send is still under it', async () => {
    state.eventRows = Array.from({ length: FREQUENCY_MAX_SENDS - 1 }, () => ({ email: 'a@x.com' }))
    const { allowed } = await partitionByFrequencyCap('org_a', [r('a@x.com')])
    expect(allowed).toHaveLength(1)
  })
})

describe('partitionByPriorAutomationSend (the welcome one-shot guard)', () => {
  it('suppresses a recipient who already got a send from the same automation family', async () => {
    state.eventRows = [{ email: 'a@x.com' }] // welcomed last week
    const { allowed, suppressed } = await partitionByPriorAutomationSend('org_a', 'welcome:', [
      r('a@x.com'),
      r('b@x.com'),
    ])
    expect(suppressed.map((s) => s.email)).toEqual(['a@x.com'])
    expect(allowed.map((a) => a.email)).toEqual(['b@x.com'])
  })

  it('ONE prior send is enough — unlike the frequency cap, this is one-shot', async () => {
    state.eventRows = [{ email: 'a@x.com' }]
    const { suppressed } = await partitionByPriorAutomationSend('org_a', 'welcome:', [r('a@x.com')], 42)
    expect(suppressed).toHaveLength(1)
  })

  it('lets everyone through when nobody has a prior send, and unkeyable rows pass', async () => {
    const { allowed, suppressed } = await partitionByPriorAutomationSend('org_a', 'welcome:', [
      r('a@x.com'),
      r(null),
    ])
    expect(allowed).toHaveLength(2)
    expect(suppressed).toHaveLength(0)
  })

  it('"welcomed exactly once" means once per PERSON — a phone-only patient is not welcomed weekly forever', async () => {
    state.eventRows = [{ email: null, patientId: 'pat_1' }]
    const { suppressed } = await partitionByPriorAutomationSend('org_a', 'welcome:', [p('pat_1')])
    expect(suppressed).toHaveLength(1)
  })
})
