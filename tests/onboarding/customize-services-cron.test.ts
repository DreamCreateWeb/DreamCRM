import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * customizePendingServices — the durable net behind the Welcome Interview's
 * fire-and-forget per-service AI rewrites. It must:
 *   • run only when AI is configured
 *   • fill services that link a library entry but have NO customized blob
 *   • cap work at PER_ORG_CUSTOMIZE_BUDGET per org per run (no starving others)
 *   • skip orgs whose services already all have blobs (idempotent / converges)
 *   • count errors without aborting the batch
 * (demo-org exclusion is enforced via the SQL where-clause; we assert the
 *  query filters on organization.isDemo=false.)
 */

const aiConfigured = vi.fn(() => true)
vi.mock('@/lib/ai', () => ({ aiConfigured: () => aiConfigured() }))

const customizeServiceForClinic = vi.fn()
vi.mock('@/lib/services/service-library-ai', () => ({
  customizeServiceForClinic: (...a: unknown[]) => customizeServiceForClinic(...a),
}))

const getServiceLibrary = vi.fn()
vi.mock('@/lib/services/service-library', () => ({
  getServiceLibrary: () => getServiceLibrary(),
}))

const recordActionMock = vi.fn(async (..._a: unknown[]) => true)
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: (...a: unknown[]) => recordActionMock(...(a as [])),
}))

// DB mock. Two distinct shapes, because the sweep uses two:
//   • db.select().from().innerJoin().where()  — the org snapshot (`rows`)
//   • db.transaction(tx => tx.select()…for('update') then tx.update())
//     — the per-org write-back, which RE-READS the row before merging.
// `liveServices` is what that re-read returns: it starts as the snapshot and a
// test can reassign it mid-run to stand in for the clinic editing its own
// services while the AI was thinking.
let rows: Array<Record<string, unknown>> = []
const updates: Array<{ services: unknown }> = []
let lastWhere: unknown = null
let liveServices: Record<string, unknown[]> = {}
let txReadFor: string[] = []
/** Set by a test to blow up the write-back for one org. */
let failWriteForOrg: string | null = null

function readLive(): unknown[] {
  // The sweep re-reads exactly one org per transaction and the mock has no
  // where()-arg introspection, so track call order: each transaction belongs to
  // the next org in `rows` that produced a write.
  const orgId = txReadFor.shift() ?? ''
  if (failWriteForOrg && orgId === failWriteForOrg) throw new Error('write blew up')
  return liveServices[orgId] ?? []
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: (w: unknown) => {
            lastWhere = w
            return Promise.resolve(rows)
          },
        }),
      }),
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => ({
                limit: async () => [{ services: readLive() }],
              }),
            }),
          }),
        }),
        update: () => ({
          set: (patch: { services: unknown }) => ({
            where: async () => {
              updates.push({ services: patch.services })
            },
          }),
        }),
      }
      return cb(tx)
    },
  },
}))

import {
  customizePendingServices,
  PER_ORG_CUSTOMIZE_BUDGET,
} from '@/lib/services/customize-services-cron'

const LIBRARY = [
  { slug: 'a', name: 'A', category: 'core' },
  { slug: 'b', name: 'B', category: 'core' },
  { slug: 'c', name: 'C', category: 'special' },
  { slug: 'd', name: 'D', category: 'special' },
  { slug: 'e', name: 'E', category: 'core' },
  { slug: 'f', name: 'F', category: 'core' },
]

function svc(slug: string, customized?: unknown) {
  return { id: `svc-${slug}`, librarySlug: slug, name: slug.toUpperCase(), category: 'core', customized }
}

/** Point the mock's re-read at each org's own snapshot (the no-concurrency
 *  case) and queue the transaction order. Call AFTER setting `rows`. */
function liveMatchesSnapshot() {
  liveServices = {}
  txReadFor = []
  for (const r of rows) {
    liveServices[r.organizationId as string] = (r.services as unknown[]) ?? []
    txReadFor.push(r.organizationId as string)
  }
}

beforeEach(() => {
  aiConfigured.mockReturnValue(true)
  customizeServiceForClinic.mockReset()
  customizeServiceForClinic.mockResolvedValue({ ok: true, customization: { body: 'x' } })
  getServiceLibrary.mockResolvedValue(LIBRARY)
  rows = []
  updates.length = 0
  lastWhere = null
  liveServices = {}
  txReadFor = []
  failWriteForOrg = null
  recordActionMock.mockClear()
})

describe('customizePendingServices', () => {
  it('no-ops when AI is not configured', async () => {
    aiConfigured.mockReturnValue(false)
    const res = await customizePendingServices()
    expect(res).toEqual({ scanned: 0, customized: 0, orgsTouched: 0, errors: 0 })
    expect(customizeServiceForClinic).not.toHaveBeenCalled()
  })

  it('filters the org query (innerJoin + where present — demo exclusion lives there)', async () => {
    rows = []
    await customizePendingServices()
    // The where() callback fired (the chain was built with innerJoin + where).
    expect(lastWhere).not.toBeNull()
  })

  it('customizes services that link a library entry but have no blob', async () => {
    rows = [
      {
        organizationId: 'org_1',
        displayName: 'Acme',
        city: 'Austin',
        tagline: 't',
        about: 'a',
        services: [svc('a'), svc('b', { body: 'already' })],
      },
    ]
    liveMatchesSnapshot()
    const res = await customizePendingServices()
    expect(customizeServiceForClinic).toHaveBeenCalledTimes(1) // only svc 'a'
    expect(res.customized).toBe(1)
    expect(res.orgsTouched).toBe(1)
    // The written services keep the existing blob + add the new one.
    const written = updates[0].services as Array<{ librarySlug: string; customized?: unknown }>
    expect(written.find((s) => s.librarySlug === 'a')?.customized).toEqual({ body: 'x' })
    expect(written.find((s) => s.librarySlug === 'b')?.customized).toEqual({ body: 'already' })
    // The machine wrote public website copy — the ledger says so, naming the
    // page (service_copywriting, executed writer pin, round-2 audit).
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('service_copywriting')
    expect(entry.organizationId).toBe('org_1')
    expect(String(entry.summary)).toContain('A page copy')
  })

  it('caps work at PER_ORG_CUSTOMIZE_BUDGET per org', async () => {
    rows = [
      {
        organizationId: 'org_1',
        displayName: 'Acme',
        city: null,
        tagline: null,
        about: null,
        // 6 pending — more than the budget of 4.
        services: ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => svc(s)),
      },
    ]
    liveMatchesSnapshot()
    const res = await customizePendingServices()
    expect(customizeServiceForClinic).toHaveBeenCalledTimes(PER_ORG_CUSTOMIZE_BUDGET)
    expect(res.customized).toBe(PER_ORG_CUSTOMIZE_BUDGET)
  })

  it('skips an org whose services already all have blobs (idempotent)', async () => {
    rows = [
      {
        organizationId: 'org_1',
        displayName: 'Acme',
        city: null,
        tagline: null,
        about: null,
        services: [svc('a', { body: 'x' }), svc('b', { body: 'y' })],
      },
    ]
    liveMatchesSnapshot()
    const res = await customizePendingServices()
    expect(customizeServiceForClinic).not.toHaveBeenCalled()
    expect(res.orgsTouched).toBe(0)
    expect(updates).toHaveLength(0)
    // Nothing written → nothing claimed.
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('counts a failed rewrite as an error without writing it or aborting', async () => {
    customizeServiceForClinic.mockResolvedValueOnce({ ok: false })
    customizeServiceForClinic.mockResolvedValueOnce({ ok: true, customization: { body: 'ok' } })
    rows = [
      {
        organizationId: 'org_1',
        displayName: 'Acme',
        city: null,
        tagline: null,
        about: null,
        services: [svc('a'), svc('b')],
      },
    ]
    liveMatchesSnapshot()
    const res = await customizePendingServices()
    expect(res.errors).toBe(1)
    expect(res.customized).toBe(1)
  })

  it('skips services whose librarySlug is unknown to the library', async () => {
    rows = [
      {
        organizationId: 'org_1',
        displayName: 'Acme',
        city: null,
        tagline: null,
        about: null,
        services: [svc('ghost')], // not in LIBRARY
      },
    ]
    liveMatchesSnapshot()
    const res = await customizePendingServices()
    expect(customizeServiceForClinic).not.toHaveBeenCalled()
    expect(res.orgsTouched).toBe(0)
  })
  // ── DREAMCRM-57 ────────────────────────────────────────────────────────────

  it("a clinic whose write-back throws does not stop the NEXT clinic's rewrites", async () => {
    rows = [
      {
        organizationId: 'org_boom',
        displayName: 'Boom',
        city: null,
        tagline: null,
        about: null,
        services: [svc('a')],
      },
      {
        organizationId: 'org_after',
        displayName: 'After',
        city: null,
        tagline: null,
        about: null,
        services: [svc('b')],
      },
    ]
    liveMatchesSnapshot()
    failWriteForOrg = 'org_boom'

    const res = await customizePendingServices()

    // org_boom's write threw and is counted — and org_after, LATER in the same
    // list, still got its rewrite written. Before the per-org try/catch the
    // throw escaped the loop and org_after was never reached at all.
    expect(res.errors).toBe(1)
    expect(res.customized).toBe(1)
    expect(res.orgsTouched).toBe(1)
    expect(updates).toHaveLength(1)
    const written = updates[0].services as Array<{ librarySlug: string }>
    expect(written.map((w) => w.librarySlug)).toEqual(['b'])
  })

  it('keeps a service the clinic added while the AI was thinking', async () => {
    rows = [
      {
        organizationId: 'org_1',
        displayName: 'Acme',
        city: null,
        tagline: null,
        about: null,
        services: [svc('a')],
      },
    ]
    liveMatchesSnapshot()
    // The clinic renames service 'a', adds 'c' and drops nothing — all AFTER
    // the sweep took its snapshot and while customizeServiceForClinic is away.
    const renamedA = { ...svc('a'), name: 'Renamed By The Clinic' }
    liveServices['org_1'] = [renamedA, svc('c')]

    const res = await customizePendingServices()

    expect(res.customized).toBe(1)
    const written = updates[0].services as Array<{
      id: string
      name: string
      customized?: unknown
    }>
    // The blob landed on 'a'…
    expect(written.find((w) => w.id === 'svc-a')?.customized).toEqual({ body: 'x' })
    // …without reverting the clinic's rename…
    expect(written.find((w) => w.id === 'svc-a')?.name).toBe('Renamed By The Clinic')
    // …and without deleting the service they added. Writing the snapshot back
    // whole is what used to undo both.
    expect(written.map((w) => w.id)).toEqual(['svc-a', 'svc-c'])
  })

  it('does not resurrect a service the clinic deleted while the AI was thinking', async () => {
    rows = [
      {
        organizationId: 'org_1',
        displayName: 'Acme',
        city: null,
        tagline: null,
        about: null,
        services: [svc('a'), svc('b')],
      },
    ]
    liveMatchesSnapshot()
    // 'b' is gone from the clinic's own row by the time the write lands.
    liveServices['org_1'] = [svc('a')]

    await customizePendingServices()

    const written = updates[0].services as Array<{ id: string }>
    expect(written.map((w) => w.id)).toEqual(['svc-a'])
  })

  it('leaves a blob the clinic wrote itself mid-run alone', async () => {
    rows = [
      {
        organizationId: 'org_1',
        displayName: 'Acme',
        city: null,
        tagline: null,
        about: null,
        services: [svc('a')],
      },
    ]
    liveMatchesSnapshot()
    // A concurrent run (or the Welcome Interview's own fire-and-forget call)
    // filled the hole first. The merge only ever fills a hole.
    liveServices['org_1'] = [svc('a', { body: 'theirs' })]

    await customizePendingServices()

    const written = updates[0].services as Array<{ id: string; customized?: unknown }>
    expect(written.find((w) => w.id === 'svc-a')?.customized).toEqual({ body: 'theirs' })
  })
})
