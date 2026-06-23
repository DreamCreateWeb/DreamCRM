import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Form packets: createPacket filters to the org's own non-archived forms + drops
 * dupes; getPacketWithForms preserves packet order and drops archived/missing
 * forms.
 */

let ownedForms: Array<{ id: string }> = []
let allForms: Array<{ id: string; title: string; slug: string }> = []
let packetRow: Record<string, unknown> | null = null
const inserted: unknown[] = []

vi.mock('@/lib/db', () => {
  const makeThenable = (resolve: () => unknown) => {
    const chain: Record<string, unknown> = {
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      then: (onF: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onF),
    }
    return chain
  }
  return {
    db: {
      select: () => ({
        from: (table: unknown) => makeThenable(() => (table === 'form_packet' ? (packetRow ? [packetRow] : []) : table === 'form_template' && pendingOwned ? ownedForms : allForms)),
      }),
      insert: () => ({ values: (v: Record<string, unknown>) => ({ returning: async () => { inserted.push(v); return [v] } }) }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
    },
  }
})
vi.mock('@/lib/db/schema/clinic', () => ({
  formTemplate: 'form_template',
  formPacket: 'form_packet',
  formSubmission: 'form_submission',
  patient: 'patient',
}))
vi.mock('@/lib/utils', () => ({ newId: (p: string) => `${p}_1`, slugify: (s: string) => s.toLowerCase().replace(/\s+/g, '-') }))

// createPacket reads owned forms first; getPacketWithForms reads the packet then
// all forms. A flag toggles which form_template result the mock hands back.
let pendingOwned = false

import { createPacket, getPacketWithForms } from '@/lib/services/forms'

beforeEach(() => {
  ownedForms = []
  allForms = []
  packetRow = null
  inserted.length = 0
  pendingOwned = false
})

describe('createPacket', () => {
  it('keeps only the org\'s own forms, drops dupes, preserves order', async () => {
    pendingOwned = true
    ownedForms = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const out = await createPacket('org_1', { title: 'New Patient Packet', formIds: ['b', 'a', 'b', 'foreign'] })
    expect(out.formIds).toEqual(['b', 'a']) // dupe 'b' + foreign dropped, order kept
    expect(out.slug).toBe('new-patient-packet')
    expect(inserted).toHaveLength(1)
  })
})

describe('getPacketWithForms', () => {
  it('returns null when the packet is missing', async () => {
    packetRow = null
    expect(await getPacketWithForms('org_1', 'nope')).toBeNull()
  })

  it('preserves packet order + drops a since-archived form', async () => {
    packetRow = { id: 'pkt_1', title: 'Packet', slug: 'p', formIds: ['c', 'a', 'gone'] }
    allForms = [
      { id: 'a', title: 'A', slug: 'a' },
      { id: 'c', title: 'C', slug: 'c' },
    ]
    const res = await getPacketWithForms('org_1', 'p')
    expect(res?.forms.map((f) => f.id)).toEqual(['c', 'a']) // packet order; 'gone' dropped
  })

  it('returns null when none of the packet forms survive', async () => {
    packetRow = { id: 'pkt_1', title: 'Packet', slug: 'p', formIds: ['gone'] }
    allForms = []
    expect(await getPacketWithForms('org_1', 'p')).toBeNull()
  })
})
