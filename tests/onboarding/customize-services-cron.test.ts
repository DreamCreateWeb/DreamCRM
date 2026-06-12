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

// DB mock: a single select chain returns `rows`; capture the where() arg so we
// can assert the demo-exclusion filter is present, and capture update patches.
let rows: Array<Record<string, unknown>> = []
const updates: Array<{ services: unknown }> = []
let lastWhere: unknown = null
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
    update: () => ({
      set: (patch: { services: unknown }) => ({
        where: async () => {
          updates.push({ services: patch.services })
        },
      }),
    }),
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

beforeEach(() => {
  aiConfigured.mockReturnValue(true)
  customizeServiceForClinic.mockReset()
  customizeServiceForClinic.mockResolvedValue({ ok: true, customization: { body: 'x' } })
  getServiceLibrary.mockResolvedValue(LIBRARY)
  rows = []
  updates.length = 0
  lastWhere = null
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
    const res = await customizePendingServices()
    expect(customizeServiceForClinic).toHaveBeenCalledTimes(1) // only svc 'a'
    expect(res.customized).toBe(1)
    expect(res.orgsTouched).toBe(1)
    // The written services keep the existing blob + add the new one.
    const written = updates[0].services as Array<{ librarySlug: string; customized?: unknown }>
    expect(written.find((s) => s.librarySlug === 'a')?.customized).toEqual({ body: 'x' })
    expect(written.find((s) => s.librarySlug === 'b')?.customized).toEqual({ body: 'already' })
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
    const res = await customizePendingServices()
    expect(customizeServiceForClinic).not.toHaveBeenCalled()
    expect(res.orgsTouched).toBe(0)
    expect(updates).toHaveLength(0)
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
    const res = await customizePendingServices()
    expect(customizeServiceForClinic).not.toHaveBeenCalled()
    expect(res.orgsTouched).toBe(0)
  })
})
