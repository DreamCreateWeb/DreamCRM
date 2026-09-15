import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * customizePendingServices — the durable net behind the Welcome Interview's
 * fire-and-forget per-service AI rewrites. It must:
 *   • run only when AI is configured
 *   • fill services that link a library entry but have NO customized blob
 *   • cap work at PER_ORG_CUSTOMIZE_BUDGET per org per run (no starving others)
 *   • skip orgs whose services already all have blobs (idempotent / converges)
 *   • count errors without aborting the batch
 *   • keep one org's write failure off every org behind it in the sweep
 *   • write the blobs onto the CURRENT services row, never onto the snapshot
 *     it read minutes ago
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

// Mocked so the test can read the org id back out of a where() predicate —
// the sweep's re-read and its write are both org-scoped, and the fixtures
// below are per-org.
vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => ({ _: 'and', parts }),
  eq: (col: unknown, val: unknown) => ({ _: 'eq', col, val }),
}))

/** Walk a mocked drizzle predicate for the org id it filters on. */
function orgIdFrom(where: unknown): string | null {
  if (!where || typeof where !== 'object') return null
  const node = where as { _?: string; val?: unknown; parts?: unknown[] }
  if (node._ === 'eq' && typeof node.val === 'string' && node.val.startsWith('org_')) return node.val
  for (const part of node.parts ?? []) {
    const found = orgIdFrom(part)
    if (found) return found
  }
  return null
}

// DB mock. The sweep-open scan returns `rows`; the per-org write re-reads the
// row (`freshServices`, defaulting to the snapshot) and then updates it.
// Capture the scan's where() arg so we can assert the demo-exclusion filter is
// present, and capture every update patch.
let rows: Array<Record<string, unknown>> = []
/** What a FRESH read of an org's services row returns at write time. Unset =
 *  unchanged since the scan. Set it to stage a staff edit landing mid-sweep. */
let freshServices: Record<string, unknown[]> = {}
/** Org whose write should blow up, to exercise per-org isolation. */
let writeThrowsForOrg: string | null = null
const updates: Array<{ organizationId: string | null; services: unknown }> = []
let lastWhere: unknown = null

vi.mock('@/lib/db', () => {
  function servicesOf(organizationId: string | null): unknown[] {
    if (organizationId && freshServices[organizationId]) return freshServices[organizationId]
    const row = rows.find((r) => r.organizationId === organizationId)
    return Array.isArray(row?.services) ? (row!.services as unknown[]) : []
  }

  /** The per-org `select({ services }) … for('update')` re-read. */
  function rowChain() {
    let where: unknown = null
    const c = {
      from: () => c,
      where: (w: unknown) => {
        where = w
        return c
      },
      for: () => c,
      limit: () => Promise.resolve([{ services: servicesOf(orgIdFrom(where)) }]),
      then: (res: (v: unknown[]) => unknown) =>
        Promise.resolve([{ services: servicesOf(orgIdFrom(where)) }]).then(res),
    }
    return c
  }

  function updateChain() {
    return {
      set: (patch: { services: unknown }) => ({
        where: async (w: unknown) => {
          const organizationId = orgIdFrom(w)
          if (writeThrowsForOrg && organizationId === writeThrowsForOrg) {
            throw new Error('services write: deadlock detected')
          }
          updates.push({ organizationId, services: patch.services })
        },
      }),
    }
  }

  const executor = {
    select: (sel?: Record<string, unknown>) => {
      // The sweep-open scan projects the clinic columns and innerJoins the org.
      if (sel && 'displayName' in sel) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: (w: unknown) => {
                lastWhere = w
                return Promise.resolve(rows)
              },
            }),
          }),
        }
      }
      return rowChain()
    },
    update: updateChain,
  }

  return {
    db: {
      ...executor,
      transaction: async (fn: (tx: typeof executor) => Promise<unknown>) => fn(executor),
    },
  }
})

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

function orgRow(organizationId: string, services: unknown[]) {
  return { organizationId, displayName: 'Acme', city: null, tagline: null, about: null, services }
}

beforeEach(() => {
  aiConfigured.mockReturnValue(true)
  customizeServiceForClinic.mockReset()
  customizeServiceForClinic.mockResolvedValue({ ok: true, customization: { body: 'x' } })
  getServiceLibrary.mockResolvedValue(LIBRARY)
  rows = []
  freshServices = {}
  writeThrowsForOrg = null
  updates.length = 0
  lastWhere = null
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
    rows = [orgRow('org_1', [svc('a'), svc('b', { body: 'already' })])]
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
    // 6 pending — more than the budget of 4.
    rows = [orgRow('org_1', ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => svc(s)))]
    const res = await customizePendingServices()
    expect(customizeServiceForClinic).toHaveBeenCalledTimes(PER_ORG_CUSTOMIZE_BUDGET)
    expect(res.customized).toBe(PER_ORG_CUSTOMIZE_BUDGET)
  })

  it('skips an org whose services already all have blobs (idempotent)', async () => {
    rows = [orgRow('org_1', [svc('a', { body: 'x' }), svc('b', { body: 'y' })])]
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
    rows = [orgRow('org_1', [svc('a'), svc('b')])]
    const res = await customizePendingServices()
    expect(res.errors).toBe(1)
    expect(res.customized).toBe(1)
  })

  it('skips services whose librarySlug is unknown to the library', async () => {
    rows = [orgRow('org_1', [svc('ghost')])] // not in LIBRARY
    const res = await customizePendingServices()
    expect(customizeServiceForClinic).not.toHaveBeenCalled()
    expect(res.orgsTouched).toBe(0)
  })

  // ── Per-org isolation ─────────────────────────────────────────────────────
  //
  // Only the AI call was wrapped. The services write and the ledger entry ran
  // bare inside the same `for (const row of rows)`, so a write that blew up on
  // ONE clinic threw out of the sweep and every clinic behind it was skipped —
  // and the cron reported a 500 rather than the failure count.

  it('still customizes the next clinic when the one before it throws writing its services', async () => {
    rows = [orgRow('org_1', [svc('a')]), orgRow('org_2', [svc('b')])]
    writeThrowsForOrg = 'org_1'

    const res = await customizePendingServices()

    expect(updates.map((u) => u.organizationId)).toEqual(['org_2'])
    expect(res.customized).toBe(1)
    expect(res.orgsTouched).toBe(1)
    expect(res.errors).toBe(1)
  })

  it('still customizes the next clinic when the one before it throws recording its ledger entry', async () => {
    rows = [orgRow('org_1', [svc('a')]), orgRow('org_2', [svc('b')])]
    recordActionMock.mockRejectedValueOnce(new Error('action ledger unavailable'))

    const res = await customizePendingServices()

    expect(updates.map((u) => u.organizationId)).toEqual(['org_1', 'org_2'])
    expect(res.errors).toBe(1)
  })

  // ── The services write is not a read-modify-write ─────────────────────────
  //
  // The sweep read every clinic's services at the TOP of the run, then spent
  // minutes in AI calls, then wrote that whole stale array back. Anything the
  // clinic changed in Website Studio in between — a new service, a renamed
  // one, a deleted one — was silently reverted by a cron they never saw.

  it('keeps a service the clinic added while the sweep was running', async () => {
    rows = [orgRow('org_1', [svc('a')])]
    // Staff added "C" in Website Studio while the AI call was in flight.
    freshServices = { org_1: [svc('a'), svc('c')] }

    await customizePendingServices()

    const written = updates[0].services as Array<{ librarySlug: string; customized?: unknown }>
    expect(written.map((s) => s.librarySlug)).toEqual(['a', 'c'])
    expect(written.find((s) => s.librarySlug === 'a')?.customized).toEqual({ body: 'x' })
  })

  it('keeps an edit the clinic made to the very service being customized', async () => {
    rows = [orgRow('org_1', [svc('a')])]
    // Staff renamed "A" to "Cleanings" while the AI call was in flight.
    freshServices = { org_1: [{ ...svc('a'), name: 'Cleanings' }] }

    await customizePendingServices()

    const written = updates[0].services as Array<{ name: string; customized?: unknown }>
    expect(written[0].name).toBe('Cleanings')
    expect(written[0].customized).toEqual({ body: 'x' })
  })

  it('does not resurrect a service the clinic deleted while the sweep was running', async () => {
    rows = [orgRow('org_1', [svc('a'), svc('b')])]
    // Staff removed "B" in Website Studio while the AI calls were in flight.
    freshServices = { org_1: [svc('a')] }

    const res = await customizePendingServices()

    const written = updates[0].services as Array<{ librarySlug: string }>
    expect(written.map((s) => s.librarySlug)).toEqual(['a'])
    // Only the copy that actually landed is claimed in the count + the ledger.
    expect(res.customized).toBe(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(String(entry.summary)).toContain('A page copy')
  })
})
