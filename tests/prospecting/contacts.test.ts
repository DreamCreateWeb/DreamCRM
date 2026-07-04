import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The reachability orchestrator — syncProspectContacts builds contact rows
 * from discovered addresses, MX-verifies them, ranks, and mirrors the best
 * deliverable one onto prospect.email (a named dentist over a shared desk;
 * nothing sendable → clears the send target so the prospect drops to the
 * phone queue). Drives the real function through a mocked db + verifier.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: Record<string, unknown> = {}
    const self = () => obj
    obj.from = self
    obj.where = self
    obj.orderBy = self
    obj.limit = self
    ;(obj as { then: unknown }).then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          state.inserts.push({ table: (table as { _n: string })._n, values })
          return { onConflictDoUpdate: async () => undefined }
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: (table as { _n: string })._n, values })
          },
        }),
      }),
    },
    schema: {
      prospect: { _n: 'prospect', id: 'id', email: 'email', emailSource: 'email_source', authorizedOfficialName: 'aon' },
      prospectContact: {
        _n: 'prospect_contact',
        id: 'id', prospectId: 'pid', email: 'email', isPrimary: 'is_primary', rank: 'rank',
      },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}))

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))
vi.mock('@/lib/services/prospect-email-verify', () => ({ verifyEmail: verifyMock }))

import { syncProspectContacts } from '@/lib/services/prospect-contacts'

function contactRow(over: Record<string, unknown>) {
  return {
    id: 'c', prospectId: 'pros_1', email: 'x@x.com', name: null, role: 'unknown',
    source: 'crawl_mailto', verifyStatus: 'valid', verifyReason: 'mx_ok', rank: 0,
    isPrimary: 0, createdAt: new Date(), updatedAt: new Date(), verifiedAt: new Date(),
    ...over,
  }
}

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  vi.clearAllMocks()
  verifyMock.mockResolvedValue({ status: 'valid', reason: 'mx_ok' })
})

describe('syncProspectContacts', () => {
  it('upserts every discovered address and mirrors the owner’s inbox as primary', async () => {
    // resyncPrimary: (1) the prospect row, (2) the contact list post-upsert.
    state.selectQueue.push([{ email: null, emailSource: null, officialName: 'Jane Roe' }])
    state.selectQueue.push([
      contactRow({ id: 'c1', email: 'info@smiledental.com', role: 'generic', rank: 30 }),
      contactRow({ id: 'c2', email: 'drjane@smiledental.com', role: 'owner', rank: 100 }),
    ])

    const res = await syncProspectContacts(
      { id: 'pros_1', authorizedOfficialName: 'Jane Roe', email: null, emailSource: null },
      ['info@smiledental.com', 'drjane@smiledental.com'],
    )

    expect(res.upserted).toBe(2)
    expect(res.verified).toBe(2)
    // Both addresses stored as contacts.
    const contactInserts = state.inserts.filter((i) => i.table === 'prospect_contact')
    expect(contactInserts.map((i) => i.values.email).sort()).toEqual([
      'drjane@smiledental.com', 'info@smiledental.com',
    ])
    // The named owner became the send target on prospect.email.
    const mirror = state.updates.filter((u) => u.table === 'prospect').at(-1)
    expect(mirror!.values.email).toBe('drjane@smiledental.com')
    // And that contact got pinned primary.
    const pin = state.updates.find((u) => u.table === 'prospect_contact' && u.values.isPrimary === 1)
    expect(pin).toBeTruthy()
  })

  it('clears the send target when no address is deliverable (→ phone queue)', async () => {
    verifyMock.mockResolvedValue({ status: 'invalid', reason: 'no_mx' })
    state.selectQueue.push([{ email: 'dead@nowhere.test', emailSource: 'crawl_mailto', officialName: null }])
    state.selectQueue.push([contactRow({ id: 'c1', email: 'dead@nowhere.test', verifyStatus: 'invalid', rank: -1000 })])

    await syncProspectContacts(
      { id: 'pros_2', authorizedOfficialName: null, email: 'dead@nowhere.test', emailSource: 'crawl_mailto' },
      ['dead@nowhere.test'],
    )

    // prospect.email nulled — nothing sendable, so auto-enroll skips it.
    const mirror = state.updates.filter((u) => u.table === 'prospect').at(-1)
    expect(mirror!.values.email).toBeNull()
  })

  it('respects a human-pinned (manual) address and does not re-pick', async () => {
    state.selectQueue.push([{ email: 'chosen@smiledental.com', emailSource: 'manual', officialName: 'Jane Roe' }])
    state.selectQueue.push([
      contactRow({ id: 'c1', email: 'chosen@smiledental.com', source: 'manual', rank: 55, isPrimary: 1 }),
      contactRow({ id: 'c2', email: 'drjane@smiledental.com', role: 'owner', rank: 100 }),
    ])

    await syncProspectContacts(
      { id: 'pros_3', authorizedOfficialName: 'Jane Roe', email: 'chosen@smiledental.com', emailSource: 'manual' },
      ['drjane@smiledental.com'],
    )

    // No mirror update to prospect.email — the pin stands even though a
    // higher-ranked owner address exists.
    const mirror = state.updates.find((u) => u.table === 'prospect' && 'email' in u.values)
    expect(mirror).toBeUndefined()
  })
})
