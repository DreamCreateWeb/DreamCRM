import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Zernio connection service — find-or-create profile, connect URL, account
 * sync (upsert + demo no-network), disconnect, demo seed. The Zernio client is
 * mocked (no network); the DB is a controllable in-memory fake.
 */

// ── Zernio client mock ──────────────────────────────────────────────────────
const z = {
  listProfiles: vi.fn(),
  createProfile: vi.fn(),
  getConnectUrl: vi.fn(),
  listAccounts: vi.fn(),
  deleteAccount: vi.fn(),
}
vi.mock('@/lib/zernio', () => ({
  listProfiles: (...a: unknown[]) => z.listProfiles(...a),
  createProfile: (...a: unknown[]) => z.createProfile(...a),
  getConnectUrl: (...a: unknown[]) => z.getConnectUrl(...a),
  listAccounts: (...a: unknown[]) => z.listAccounts(...a),
  deleteAccount: (...a: unknown[]) => z.deleteAccount(...a),
}))

// ── In-memory DB fake ───────────────────────────────────────────────────────
// Two tables we care about: zernio_connection (keyed by organizationId) and
// zernio_account (keyed by id). The fake interprets the drizzle-style chain.
interface Store {
  connections: Record<string, Record<string, unknown>>
  accounts: Array<Record<string, unknown>>
  patients: Array<Record<string, unknown>>
}
const store: Store = { connections: {}, accounts: [], patients: [] }

// We can't read drizzle's column refs, so the fake disambiguates by which
// "table" object the query targets. We tag each schema table with a __name.
// NOTE: these strings are inlined inside the factory below — vi.mock is hoisted
// above module-level consts, so the factory can't reference them.

vi.mock('@/lib/db', () => {
  // Local to the (hoisted) factory.
  const T_CONN = 'zernio_connection'
  const T_ACCT = 'zernio_account'
  const T_PAT = 'patient'

  // ── select() ──
  function select(_cols?: unknown) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => {
      table = t.__name
      return api
    }
    // where() receives our predicate-builder result (an array of preds).
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as (r: Record<string, unknown>) => boolean)
      else if (typeof preds === 'function') filters.push(preds as (r: Record<string, unknown>) => boolean)
      return api
    }
    const run = () => {
      const rows =
        table === T_CONN ? Object.values(store.connections) : table === T_PAT ? store.patients : store.accounts
      return rows.filter((r) => filters.every((f) => f(r)))
    }
    api.limit = async () => run()
    api.then = (resolve: (v: unknown) => void) => resolve(run())
    return api
  }

  // ── insert() ──
  function insert(t: { __name: string }) {
    const table = t.__name
    let pending: Record<string, unknown> = {}
    const api: Record<string, unknown> = {}
    api.values = (v: Record<string, unknown>) => {
      pending = { ...v }
      return api
    }
    api.onConflictDoUpdate = async ({ set }: { set: Record<string, unknown> }) => {
      if (table === T_CONN) {
        const id = pending.organizationId as string
        store.connections[id] = { ...(store.connections[id] ?? pending), ...pending, ...set }
      } else {
        const id = pending.id as string
        const idx = store.accounts.findIndex((a) => a.id === id)
        if (idx >= 0) store.accounts[idx] = { ...store.accounts[idx], ...set }
        else store.accounts.push({ ...pending })
      }
    }
    api.onConflictDoNothing = async () => {
      if (table === T_CONN) {
        const id = pending.organizationId as string
        if (!store.connections[id]) store.connections[id] = { ...pending }
      } else {
        const id = pending.id as string
        if (!store.accounts.some((a) => a.id === id)) store.accounts.push({ ...pending })
      }
    }
    // Plain insert (no conflict clause) resolves as a thenable.
    api.then = (resolve: (v: unknown) => void) => {
      if (table === T_CONN) store.connections[pending.organizationId as string] = { ...pending }
      else store.accounts.push({ ...pending })
      resolve(undefined)
    }
    return api
  }

  // ── delete() ──
  function del(t: { __name: string }) {
    const table = t.__name
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as (r: Record<string, unknown>) => boolean)
      else if (typeof preds === 'function') filters.push(preds as (r: Record<string, unknown>) => boolean)
      return api
    }
    api.then = (resolve: (v: unknown) => void) => {
      if (table === T_ACCT) {
        store.accounts = store.accounts.filter((r) => !filters.every((f) => f(r)))
      } else {
        for (const k of Object.keys(store.connections)) {
          if (filters.every((f) => f(store.connections[k]))) delete store.connections[k]
        }
      }
      resolve(undefined)
    }
    return api
  }

  return {
    db: { select, insert, delete: del },
    schema: {
      zernioConnection: {
        __name: T_CONN,
        organizationId: { col: 'organizationId' },
      },
      zernioAccount: {
        __name: T_ACCT,
        id: { col: 'id' },
        organizationId: { col: 'organizationId' },
        platform: { col: 'platform' },
      },
      patient: {
        __name: T_PAT,
        id: { col: 'id' },
        organizationId: { col: 'organizationId' },
      },
    },
  }
})

// drizzle eq/and → predicate builders over our row objects.
vi.mock('drizzle-orm', () => ({
  eq: (colRef: { col: string }, val: unknown) => (r: Record<string, unknown>) => r[colRef.col] === val,
  and: (...preds: Array<(r: Record<string, unknown>) => boolean>) => (r: Record<string, unknown>) =>
    preds.every((p) => p(r)),
}))

import {
  ensureProfileForOrg,
  profileNameForOrg,
  getGoogleBusinessConnectUrl,
  getPlatformConnectUrl,
  syncConnectedAccounts,
  getZernioConnection,
  disconnectPlatform,
  seedDemoZernio,
} from '@/lib/services/zernio'

beforeEach(() => {
  store.connections = {}
  store.accounts = []
  store.patients = []
  z.listProfiles.mockReset()
  z.createProfile.mockReset()
  z.getConnectUrl.mockReset()
  z.listAccounts.mockReset()
  z.deleteAccount.mockReset()
})

describe('profileNameForOrg', () => {
  it('embeds the org id so same-named clinics never collide', () => {
    expect(profileNameForOrg('org_1', 'Acme Dental')).toBe('Acme Dental [org_1]')
    expect(profileNameForOrg('org_2', '')).toBe('Clinic [org_2]')
  })
})

describe('ensureProfileForOrg', () => {
  it('creates a profile when none exists and persists the id', async () => {
    z.listProfiles.mockResolvedValue([])
    z.createProfile.mockResolvedValue({ _id: 'prof_new' })
    const id = await ensureProfileForOrg('org_1', 'Acme')
    expect(id).toBe('prof_new')
    expect(z.createProfile).toHaveBeenCalledWith('Acme [org_1]')
    expect(store.connections['org_1'].zernioProfileId).toBe('prof_new')
  })

  it('reuses the id already persisted on the connection (no API call)', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_saved' }
    const id = await ensureProfileForOrg('org_1', 'Acme')
    expect(id).toBe('prof_saved')
    expect(z.listProfiles).not.toHaveBeenCalled()
    expect(z.createProfile).not.toHaveBeenCalled()
  })

  it('reuses an existing Zernio profile found by name instead of creating a dup', async () => {
    z.listProfiles.mockResolvedValue([{ _id: 'prof_found', name: 'Acme [org_1]' }])
    const id = await ensureProfileForOrg('org_1', 'Acme')
    expect(id).toBe('prof_found')
    expect(z.createProfile).not.toHaveBeenCalled()
    expect(store.connections['org_1'].zernioProfileId).toBe('prof_found')
  })

  it('falls back to create when listProfiles throws', async () => {
    z.listProfiles.mockRejectedValue(new Error('rate limited'))
    z.createProfile.mockResolvedValue({ _id: 'prof_after_fail' })
    const id = await ensureProfileForOrg('org_1', 'Acme')
    expect(id).toBe('prof_after_fail')
  })
})

describe('getGoogleBusinessConnectUrl', () => {
  it('ensures a profile then returns the authUrl', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1' }
    z.getConnectUrl.mockResolvedValue({ authUrl: 'https://accounts.google.com/x' })
    const url = await getGoogleBusinessConnectUrl('org_1', 'Acme', 'https://app/cb')
    expect(url).toBe('https://accounts.google.com/x')
    expect(z.getConnectUrl).toHaveBeenCalledWith('googlebusiness', 'prof_1', 'https://app/cb')
  })
})

describe('getPlatformConnectUrl', () => {
  it('ensures a profile then returns the authUrl for any platform', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1' }
    z.getConnectUrl.mockResolvedValue({ authUrl: 'https://www.instagram.com/oauth' })
    const url = await getPlatformConnectUrl('org_1', 'Acme', 'instagram', 'https://app/cb')
    expect(url).toBe('https://www.instagram.com/oauth')
    expect(z.getConnectUrl).toHaveBeenCalledWith('instagram', 'prof_1', 'https://app/cb')
  })

  it('creates the profile when none exists yet (find-or-create)', async () => {
    z.listProfiles.mockResolvedValue([])
    z.createProfile.mockResolvedValue({ _id: 'prof_new' })
    z.getConnectUrl.mockResolvedValue({ authUrl: 'https://facebook.com/oauth' })
    const url = await getPlatformConnectUrl('org_2', 'Beta', 'facebook')
    expect(url).toBe('https://facebook.com/oauth')
    expect(z.getConnectUrl).toHaveBeenCalledWith('facebook', 'prof_new', undefined)
  })

  it('getGoogleBusinessConnectUrl is the GBP wrapper over getPlatformConnectUrl', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1' }
    z.getConnectUrl.mockResolvedValue({ authUrl: 'https://accounts.google.com/y' })
    await getGoogleBusinessConnectUrl('org_1', 'Acme')
    expect(z.getConnectUrl).toHaveBeenCalledWith('googlebusiness', 'prof_1', undefined)
  })
})

describe('syncConnectedAccounts', () => {
  it('upserts GBP accounts and flips status to connected', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', isDemo: 0 }
    z.listAccounts.mockResolvedValue({
      accounts: [{ _id: 'a1', platform: 'googlebusiness', profileId: 'prof_1', username: 'acme', displayName: 'Acme Dental' }],
      hasAnalyticsAccess: true,
    })
    await syncConnectedAccounts('org_1')
    expect(store.accounts).toHaveLength(1)
    expect(store.accounts[0]).toMatchObject({ id: 'a1', platform: 'googlebusiness', displayName: 'Acme Dental' })
    expect(store.connections['org_1'].status).toBe('connected')
  })

  it('normalizes an embedded profileId object', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', isDemo: 0 }
    z.listAccounts.mockResolvedValue({
      accounts: [{ _id: 'a1', platform: 'googlebusiness', profileId: { _id: 'prof_1' } }],
      hasAnalyticsAccess: false,
    })
    await syncConnectedAccounts('org_1')
    expect(store.accounts).toHaveLength(1)
    expect(store.connections['org_1'].status).toBe('connected')
  })

  it('stays disconnected when no GBP account comes back', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', isDemo: 0 }
    z.listAccounts.mockResolvedValue({ accounts: [], hasAnalyticsAccess: false })
    await syncConnectedAccounts('org_1')
    expect(store.connections['org_1'].status).toBe('disconnected')
  })

  it('removes local accounts no longer present at Zernio', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', isDemo: 0 }
    store.accounts = [{ id: 'stale', organizationId: 'org_1', platform: 'googlebusiness', accountId: 'stale' }]
    z.listAccounts.mockResolvedValue({ accounts: [], hasAnalyticsAccess: false })
    await syncConnectedAccounts('org_1')
    expect(store.accounts).toHaveLength(0)
  })

  it('records error + lastError when listAccounts throws (best-effort)', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', isDemo: 0 }
    z.listAccounts.mockRejectedValue(new Error('boom'))
    await syncConnectedAccounts('org_1')
    expect(store.connections['org_1'].status).toBe('error')
    expect(store.connections['org_1'].lastError).toBe('boom')
  })

  it('NEVER hits the network for a demo connection', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'demo_profile', isDemo: 1, status: 'connected' }
    await syncConnectedAccounts('org_1')
    expect(z.listAccounts).not.toHaveBeenCalled()
    expect(store.connections['org_1'].status).toBe('connected')
  })

  it('leaves status disconnected when there is no profile yet', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: null, isDemo: 0 }
    await syncConnectedAccounts('org_1')
    expect(z.listAccounts).not.toHaveBeenCalled()
    expect(store.connections['org_1'].status).toBe('disconnected')
  })
})

describe('getZernioConnection', () => {
  it('returns the connection view with GBP accounts', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', status: 'connected', isDemo: 0, lastError: null }
    store.accounts = [{ id: 'a1', organizationId: 'org_1', platform: 'googlebusiness', accountId: 'a1', username: 'acme', displayName: 'Acme Dental' }]
    const view = await getZernioConnection('org_1')
    expect(view.status).toBe('connected')
    expect(view.zernioProfileId).toBe('prof_1')
    expect(view.googleBusinessAccounts).toHaveLength(1)
    expect(view.googleBusinessAccounts[0].displayName).toBe('Acme Dental')
  })

  it('returns ALL accounts (GBP + social) in `accounts`, GBP-only in googleBusinessAccounts', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', status: 'connected', isDemo: 0, lastError: null }
    store.accounts = [
      { id: 'g1', organizationId: 'org_1', platform: 'googlebusiness', accountId: 'g1', username: 'acme-gbp', displayName: 'Acme Dental' },
      { id: 'ig1', organizationId: 'org_1', platform: 'instagram', accountId: 'ig1', username: '@acme', displayName: 'Acme' },
      { id: 'fb1', organizationId: 'org_1', platform: 'facebook', accountId: 'fb1', username: 'acmefb', displayName: 'Acme' },
    ]
    const view = await getZernioConnection('org_1')
    expect(view.accounts).toHaveLength(3)
    const platforms = view.accounts.map((a) => a.platform).sort()
    expect(platforms).toEqual(['facebook', 'googlebusiness', 'instagram'])
    // Back-compat slice unchanged for the GBP consumers (resolveGbpAccount).
    expect(view.googleBusinessAccounts).toHaveLength(1)
    expect(view.googleBusinessAccounts[0].platform).toBe('googlebusiness')
  })

  it('only scopes to the org (does not leak another org\'s accounts)', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', status: 'connected', isDemo: 0 }
    store.accounts = [
      { id: 'ig1', organizationId: 'org_1', platform: 'instagram', accountId: 'ig1' },
      { id: 'ig2', organizationId: 'org_other', platform: 'instagram', accountId: 'ig2' },
    ]
    const view = await getZernioConnection('org_1')
    expect(view.accounts).toHaveLength(1)
    expect(view.accounts[0].id).toBe('ig1')
  })

  it('returns disconnected for an org with no connection row', async () => {
    const view = await getZernioConnection('org_none')
    expect(view.status).toBe('disconnected')
    expect(view.googleBusinessAccounts).toEqual([])
    expect(view.accounts).toEqual([])
    expect(view.isDemo).toBe(false)
  })
})

describe('disconnectPlatform', () => {
  it('deletes accounts at Zernio + drops local rows + recomputes status', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', status: 'connected', isDemo: 0 }
    store.accounts = [{ id: 'a1', organizationId: 'org_1', platform: 'googlebusiness', accountId: 'a1' }]
    z.deleteAccount.mockResolvedValue(undefined)
    await disconnectPlatform('org_1', 'googlebusiness')
    expect(z.deleteAccount).toHaveBeenCalledWith('a1')
    expect(store.accounts).toHaveLength(0)
    expect(store.connections['org_1'].status).toBe('disconnected')
  })

  it('still drops local rows when the Zernio delete fails', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', status: 'connected', isDemo: 0 }
    store.accounts = [{ id: 'a1', organizationId: 'org_1', platform: 'googlebusiness', accountId: 'a1' }]
    z.deleteAccount.mockRejectedValue(new Error('500'))
    await disconnectPlatform('org_1', 'googlebusiness')
    expect(store.accounts).toHaveLength(0)
    expect(store.connections['org_1'].status).toBe('disconnected')
  })

  it('never calls Zernio for a demo connection', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', isDemo: 1, status: 'connected' }
    store.accounts = [{ id: 'demo_gbp', organizationId: 'org_1', platform: 'googlebusiness', accountId: 'demo_gbp' }]
    await disconnectPlatform('org_1', 'googlebusiness')
    expect(z.deleteAccount).not.toHaveBeenCalled()
    expect(store.accounts).toHaveLength(0)
  })

  it('disconnects a SOCIAL platform — drops only that platform\'s rows, GBP stays', async () => {
    store.connections['org_1'] = { organizationId: 'org_1', zernioProfileId: 'prof_1', status: 'connected', isDemo: 0 }
    store.accounts = [
      { id: 'g1', organizationId: 'org_1', platform: 'googlebusiness', accountId: 'g1' },
      { id: 'ig1', organizationId: 'org_1', platform: 'instagram', accountId: 'ig1' },
    ]
    z.deleteAccount.mockResolvedValue(undefined)
    await disconnectPlatform('org_1', 'instagram')
    expect(z.deleteAccount).toHaveBeenCalledWith('ig1')
    // Only the IG row is gone; GBP remains + status stays connected (GBP present).
    expect(store.accounts.map((a) => a.platform)).toEqual(['googlebusiness'])
    expect(store.connections['org_1'].status).toBe('connected')
  })
})

describe('seedDemoZernio', () => {
  it('seeds a connected demo connection + synthetic GBP account (no network)', async () => {
    store.patients = [{ id: 'pat_1', organizationId: 'org_demo' }]
    await seedDemoZernio('org_demo', 'Dream Dental')
    expect(store.connections['org_demo'].status).toBe('connected')
    expect(store.connections['org_demo'].isDemo).toBe(1)
    const gbp = store.accounts.find((a) => a.platform === 'googlebusiness')
    expect(gbp).toBeTruthy()
    expect(gbp?.displayName).toBe('Dream Dental')
    expect(z.listAccounts).not.toHaveBeenCalled()
    expect(z.createProfile).not.toHaveBeenCalled()
  })

  it('seeds 2 synthetic SOCIAL accounts (Instagram + Facebook) so Channels showcases a partial cap', async () => {
    store.patients = [{ id: 'pat_1', organizationId: 'org_demo' }]
    await seedDemoZernio('org_demo', 'Dream Dental')
    const ig = store.accounts.find((a) => a.platform === 'instagram')
    const fb = store.accounts.find((a) => a.platform === 'facebook')
    expect(ig?.username).toBe('@dreamdental')
    expect(fb?.displayName).toBe('Dream Dental')
    // 1 GBP + 2 social = 3 total; the cap meter reads "2 of N social used".
    const social = store.accounts.filter((a) => a.platform !== 'googlebusiness')
    expect(social).toHaveLength(2)
    expect(z.listAccounts).not.toHaveBeenCalled()
  })

  it('bails (no insert) when the org has no patients — not a real demo clinic', async () => {
    await seedDemoZernio('org_empty')
    expect(store.connections['org_empty']).toBeUndefined()
    expect(store.accounts).toHaveLength(0)
  })

  it('is idempotent — a second call does not duplicate GBP or social accounts', async () => {
    store.patients = [{ id: 'pat_1', organizationId: 'org_demo' }]
    await seedDemoZernio('org_demo')
    await seedDemoZernio('org_demo')
    expect(store.accounts.filter((a) => a.platform === 'googlebusiness')).toHaveLength(1)
    expect(store.accounts.filter((a) => a.platform === 'instagram')).toHaveLength(1)
    expect(store.accounts.filter((a) => a.platform === 'facebook')).toHaveLength(1)
  })

  it('re-connects a demo that was disconnected mid-session', async () => {
    store.connections['org_demo'] = { organizationId: 'org_demo', isDemo: 1, status: 'disconnected' }
    await seedDemoZernio('org_demo')
    expect(store.connections['org_demo'].status).toBe('connected')
  })

  it('leaves a real (non-demo) connection untouched', async () => {
    store.connections['org_demo'] = { organizationId: 'org_demo', isDemo: 0, status: 'connected', zernioProfileId: 'real' }
    await seedDemoZernio('org_demo')
    expect(store.connections['org_demo'].zernioProfileId).toBe('real')
    expect(store.accounts).toHaveLength(0)
  })
})
