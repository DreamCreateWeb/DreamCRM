import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Google Business Profile → clinic_profile sync service. The Zernio client + the
 * connection resolver are mocked; the DB is a small in-memory fake (one
 * clinic_profile row + a patient + zernio_connection rows). Covers the SAFETY
 * INVARIANT (apply google fields / SKIP manual on non-force / overwrite + flip
 * source on force), demo-no-network, best-effort error, the pure mappers,
 * revertFieldToManual, importGooglePhotos, and the demo seed.
 */

// ── Zernio client mock ───────────────────────────────────────────────────────
const client = {
  getGoogleBusinessLocation: vi.fn(),
  listGoogleBusinessMedia: vi.fn(),
}
vi.mock('@/lib/zernio', () => ({
  getGoogleBusinessLocation: (...a: unknown[]) => client.getGoogleBusinessLocation(...a),
  listGoogleBusinessMedia: (...a: unknown[]) => client.listGoogleBusinessMedia(...a),
}))

// ── Connection resolver mock ─────────────────────────────────────────────────
const conn = { value: null as null | { status: string; isDemo: boolean; googleBusinessAccounts: Array<{ id: string }> } }
vi.mock('@/lib/services/zernio', () => ({
  getZernioConnection: vi.fn(async () => conn.value ?? { status: 'disconnected', isDemo: false, googleBusinessAccounts: [] }),
  // `resolveGbpAccount` now lives in lib/services/zernio (shared); the service
  // imports it from there, so mirror the real derivation off `conn.value`.
  resolveGbpAccount: vi.fn(async () => {
    const c = conn.value
    if (!c || c.status !== 'connected') return null
    const account = c.googleBusinessAccounts[0]
    if (!account) return null
    return { accountId: account.id, isDemo: c.isDemo }
  }),
}))

// ── In-memory DB fake ────────────────────────────────────────────────────────
interface ProfileRow {
  organizationId: string
  hours?: unknown
  hoursSource: string
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  addressSource: string
  phone?: string | null
  phoneSource: string
  googleSyncedAt?: Date | null
  googlePhotos?: unknown
  officePhotos?: unknown
  updatedAt?: Date
}
const store: {
  profiles: ProfileRow[]
  patients: Array<{ organizationId: string; id: string }>
  conns: Array<{ organizationId: string; status: string; isDemo: number }>
} = { profiles: [], patients: [], conns: [] }

const { recordActionMock } = vi.hoisted(() => ({ recordActionMock: vi.fn(async (..._a: unknown[]) => true) }))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: recordActionMock }))

vi.mock('@/lib/db', () => {
  const T_PROFILE = 'clinic_profile'
  const T_PAT = 'patient'
  const T_CONN = 'zernio_connection'

  function select(cols?: Record<string, unknown>) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as (r: Record<string, unknown>) => boolean)
      else if (typeof preds === 'function') filters.push(preds as (r: Record<string, unknown>) => boolean)
      return api
    }
    api.orderBy = () => api
    const rowsFor = (): Record<string, unknown>[] => {
      let rows: Record<string, unknown>[]
      if (table === T_PROFILE) rows = store.profiles as unknown as Record<string, unknown>[]
      else if (table === T_PAT) rows = store.patients as unknown as Record<string, unknown>[]
      else if (table === T_CONN) rows = store.conns as unknown as Record<string, unknown>[]
      else rows = []
      const out = rows.filter((r) => filters.every((f) => f(r)))
      if (cols) return out.map((r) => Object.fromEntries(Object.keys(cols).map((k) => [k, r[k]])))
      return out
    }
    api.limit = async () => rowsFor()
    api.then = (resolve: (v: unknown) => void) => resolve(rowsFor())
    return api
  }

  function update(t: { __name: string }) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    let patch: Record<string, unknown> = {}
    const api: Record<string, unknown> = {}
    api.set = (p: Record<string, unknown>) => { patch = p; return api }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as (r: Record<string, unknown>) => boolean)
      else if (typeof preds === 'function') filters.push(preds as (r: Record<string, unknown>) => boolean)
      return api
    }
    api.then = (resolve: (v: unknown) => void) => {
      if (t.__name === T_PROFILE) {
        for (const r of store.profiles as unknown as Record<string, unknown>[]) {
          if (filters.every((f) => f(r))) Object.assign(r, patch)
        }
      }
      resolve(undefined)
    }
    return api
  }

  const col = (name: string) => ({ __col: name })
  const schema = {
    clinicProfile: {
      __name: T_PROFILE,
      organizationId: col('organizationId'),
      hours: col('hours'),
      hoursSource: col('hoursSource'),
      addressLine1: col('addressLine1'),
      addressLine2: col('addressLine2'),
      city: col('city'),
      state: col('state'),
      postalCode: col('postalCode'),
      country: col('country'),
      addressSource: col('addressSource'),
      phone: col('phone'),
      phoneSource: col('phoneSource'),
      googleSyncedAt: col('googleSyncedAt'),
      googlePhotos: col('googlePhotos'),
      officePhotos: col('officePhotos'),
      updatedAt: col('updatedAt'),
    },
    patient: { __name: T_PAT, organizationId: col('organizationId'), id: col('id') },
    zernioConnection: { __name: T_CONN, organizationId: col('organizationId'), status: col('status'), isDemo: col('isDemo') },
  }

  return { db: { select, update }, schema }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  and: (...preds: unknown[]) => preds.flat(),
}))

import {
  syncGoogleBusinessProfile,
  getGbpSyncState,
  revertFieldToManual,
  importGooglePhotos,
  markFieldSourceManual,
  mapGoogleHours,
  mapGoogleAddress,
  seedDemoGbpSync,
  syncAllGoogleBusinessProfiles,
} from '@/lib/services/gbp-sync'
import type { GoogleLocation } from '@/lib/zernio'

const ORG = 'org_1'

function fullProfile(over: Partial<ProfileRow> = {}): ProfileRow {
  return {
    organizationId: ORG,
    hoursSource: 'manual',
    addressSource: 'manual',
    phoneSource: 'manual',
    ...over,
  }
}

function setConnected(opts: { isDemo?: boolean; accountId?: string } = {}) {
  conn.value = {
    status: 'connected',
    isDemo: opts.isDemo ?? false,
    googleBusinessAccounts: [{ id: opts.accountId ?? 'acct_1' }],
  }
}

const GOOGLE_LOC: GoogleLocation = {
  periods: [
    { day: 'mon', open: '09:00', close: '17:00' },
    { day: 'fri', open: '09:00', close: '15:00' },
  ],
  addressLines: ['742 Evergreen Terrace', 'Suite 5'],
  city: 'Springfield',
  state: 'IL',
  postalCode: '62704',
  country: 'US',
  phone: '(555) 867-5309',
  categories: ['Dentist'],
  placeId: null,
  websiteUri: null,
  reviewUrl: null,
  mapsUri: null,
  isVerified: null,
  title: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  store.profiles = [fullProfile()]
  recordActionMock.mockClear()
  store.patients = [{ organizationId: ORG, id: 'pat_1' }]
  store.conns = []
  conn.value = null
  client.getGoogleBusinessLocation.mockResolvedValue(GOOGLE_LOC)
  client.listGoogleBusinessMedia.mockResolvedValue([
    { url: 'https://g/photo1.jpg', sourceUrl: null, category: 'INTERIOR' },
    { url: 'https://g/photo2.jpg', sourceUrl: null, category: 'EXTERIOR' },
  ])
})

// ── Pure mappers ──────────────────────────────────────────────────────────────

describe('mapGoogleHours', () => {
  it('maps periods into the clinic_profile.hours shape (all 7 days, missing → null)', () => {
    const h = mapGoogleHours(GOOGLE_LOC)!
    expect(h.mon).toEqual({ open: '09:00', close: '17:00' })
    expect(h.fri).toEqual({ open: '09:00', close: '15:00' })
    // Days with no Google period render closed (null/null), never absent.
    expect(h.tue).toEqual({ open: null, close: null })
    expect(h.sat).toEqual({ open: null, close: null })
    expect(Object.keys(h).sort()).toEqual(['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed'])
  })
  it('collapses split shifts into the widest single window', () => {
    const h = mapGoogleHours({
      periods: [
        { day: 'mon', open: '09:00', close: '12:00' },
        { day: 'mon', open: '13:00', close: '17:00' },
      ],
    })!
    expect(h.mon).toEqual({ open: '09:00', close: '17:00' })
  })
  it('skips inverted/incomplete periods and returns null when nothing usable', () => {
    expect(mapGoogleHours({ periods: [{ day: 'mon', open: '17:00', close: '09:00' }] })).toBeNull()
    expect(mapGoogleHours({ periods: [{ day: null, open: '09:00', close: '17:00' }] })).toBeNull()
    expect(mapGoogleHours({ periods: [] })).toBeNull()
  })
})

describe('mapGoogleAddress', () => {
  it('maps storefront address → columns (line1, joined line2, region defaults US)', () => {
    expect(mapGoogleAddress(GOOGLE_LOC)).toEqual({
      addressLine1: '742 Evergreen Terrace',
      addressLine2: 'Suite 5',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62704',
      country: 'US',
    })
  })
  it('defaults country to US when regionCode is absent', () => {
    expect(mapGoogleAddress({ ...GOOGLE_LOC, country: null })!.country).toBe('US')
  })
  it('returns null when there is neither a street line nor a city', () => {
    expect(mapGoogleAddress({ ...GOOGLE_LOC, addressLines: [], city: null })).toBeNull()
  })
})

// ── syncGoogleBusinessProfile ─────────────────────────────────────────────────

describe('syncGoogleBusinessProfile', () => {
  it('skips with no_connection when no GBP is connected (no network)', async () => {
    conn.value = null
    const r = await syncGoogleBusinessProfile(ORG)
    expect(r).toMatchObject({ ok: true, applied: [], skipped: 'no_connection' })
    expect(client.getGoogleBusinessLocation).not.toHaveBeenCalled()
  })

  it('non-force: SKIPS fields whose source is manual (never clobbers a manual edit)', async () => {
    // All three fields start 'manual' (the default) → none should be written.
    setConnected()
    const r = await syncGoogleBusinessProfile(ORG, { force: false })
    expect(r.ok).toBe(true)
    expect(r.applied).toEqual([])
    expect(r.skippedManual.sort()).toEqual(['address', 'hours', 'phone'])
    const p = store.profiles[0]
    expect(p.hours).toBeUndefined()
    expect(p.addressLine1).toBeUndefined()
    expect(p.phone).toBeUndefined()
    // Sources stay manual; only googleSyncedAt + googlePhotos refresh.
    expect(p.hoursSource).toBe('manual')
    expect(p.googleSyncedAt).toBeInstanceOf(Date)
    expect(p.googlePhotos).toHaveLength(2)
  })

  it('non-force: APPLIES fields whose source is already google', async () => {
    store.profiles = [fullProfile({ hoursSource: 'google', addressSource: 'google', phoneSource: 'google' })]
    setConnected()
    const r = await syncGoogleBusinessProfile(ORG, { force: false })
    expect(r.applied.sort()).toEqual(['address', 'hours', 'phone'])
    expect(r.skippedManual).toEqual([])
    const p = store.profiles[0]
    expect(p.hours).toEqual({
      mon: { open: '09:00', close: '17:00' },
      tue: { open: null, close: null },
      wed: { open: null, close: null },
      thu: { open: null, close: null },
      fri: { open: '09:00', close: '15:00' },
      sat: { open: null, close: null },
      sun: { open: null, close: null },
    })
    expect(p.addressLine1).toBe('742 Evergreen Terrace')
    expect(p.phone).toBe('(555) 867-5309')
    // The machine changed patient-visible fields → ONE narrated ledger entry
    // (listing_sync, change-detected; round-3 audit).
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('listing_sync')
    expect(String(entry.summary)).toContain('Google Business listing')
    // The detail carries a from/to snapshot per changed field, captured at
    // write time — the entry stays reviewable after later syncs move values
    // again (round-5 close-out).
    const detail = entry.detail as { fields: string[]; changes: Record<string, { from: unknown; to: unknown }> }
    expect(detail.fields.sort()).toEqual(['address', 'hours', 'phone'])
    expect(detail.changes.phone).toEqual({ from: undefined, to: '(555) 867-5309' })
    expect((detail.changes.address.to as Record<string, unknown>).addressLine1).toBe('742 Evergreen Terrace')
    expect(detail.changes.hours.to).toBeTruthy()
  })

  it('stamps the LISTING TRUTH snapshot (gbp_listing) on every sync — even when all profile fields are manual', async () => {
    store.profiles = [fullProfile()] // all sources manual → no field writes
    setConnected()
    client.getGoogleBusinessLocation.mockResolvedValue({
      ...GOOGLE_LOC,
      websiteUri: 'https://old-wix-site.com/home',
      reviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJx',
      mapsUri: 'https://maps.google.com/maps?cid=9',
      isVerified: true,
      title: 'Springfield Dental',
      placeId: 'ChIJx',
    })
    const r = await syncGoogleBusinessProfile(ORG, { force: false })
    expect(r.ok).toBe(true)
    const snap = store.profiles[0].gbpListing as Record<string, unknown>
    // A snapshot of GOOGLE's state, not a clinic setting — the manual-source
    // safety invariant must NOT suppress it (the mismatch detector's feed).
    expect(snap.websiteUri).toBe('https://old-wix-site.com/home')
    expect(snap.reviewUrl).toContain('writereview')
    expect(snap.isVerified).toBe(true)
    expect(snap.title).toBe('Springfield Dental')
    expect(typeof snap.fetchedAt).toBe('string')
  })

  it('a change ONLY in addressLine2/state still narrates — every written address column is compared (round-5 close-out)', async () => {
    const mappedHours = mapGoogleHours(GOOGLE_LOC)
    store.profiles = [fullProfile({
      hoursSource: 'google', addressSource: 'google', phoneSource: 'google',
      hours: mappedHours,
      phone: '(555) 867-5309',
      // Everything matches Google except the suite number.
      addressLine1: '742 Evergreen Terrace', addressLine2: 'Suite 4',
      city: 'Springfield', state: 'IL', postalCode: '62704', country: 'US',
    })]
    setConnected()
    await syncGoogleBusinessProfile(ORG, { force: false })
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    const detail = entry.detail as { fields: string[]; changes: Record<string, { from: unknown; to: unknown }> }
    expect(detail.fields).toEqual(['address'])
    expect((detail.changes.address.from as Record<string, unknown>).addressLine2).toBe('Suite 4')
    expect((detail.changes.address.to as Record<string, unknown>).addressLine2).toBe('Suite 5')
  })

  it('re-applying IDENTICAL Google data narrates nothing — maintenance is not a story', async () => {
    store.profiles = [fullProfile({ hoursSource: 'google', addressSource: 'google', phoneSource: 'google' })]
    setConnected()
    await syncGoogleBusinessProfile(ORG, { force: false }) // first sync writes values
    recordActionMock.mockClear()
    await syncGoogleBusinessProfile(ORG, { force: false }) // identical re-run
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('the jsonb round-trip cannot false-positive: REORDERED-key hours still narrate nothing (round-4: Postgres sorts jsonb keys)', async () => {
    store.profiles = [fullProfile({ hoursSource: 'google', addressSource: 'google', phoneSource: 'google' })]
    setConnected()
    await syncGoogleBusinessProfile(ORG, { force: false }) // writes hours in builder order
    // Simulate the Postgres jsonb round-trip: same VALUES, keys re-sorted the
    // way jsonb stores them (length, then bytewise — fri,mon,sat,...).
    const stored = store.profiles[0].hours as Record<string, unknown>
    const reordered: Record<string, unknown> = {}
    for (const k of Object.keys(stored).sort((a, b) => a.length - b.length || (a < b ? -1 : 1))) reordered[k] = stored[k]
    store.profiles[0].hours = reordered
    recordActionMock.mockClear()
    await syncGoogleBusinessProfile(ORG, { force: false })
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('a HUMAN-initiated sync narrates nothing even when values change — their click is their work (round-4 actor gate)', async () => {
    setConnected()
    // force:true overwrites the manual-source defaults, so values change…
    await syncGoogleBusinessProfile(ORG, { force: true, initiatedByUserId: 'user_9' })
    // …but the staff member drove it: no machine ledger entry.
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('force: OVERWRITES manual fields + flips each written source to google', async () => {
    setConnected()
    const r = await syncGoogleBusinessProfile(ORG, { force: true })
    expect(r.applied.sort()).toEqual(['address', 'hours', 'phone'])
    expect(r.skippedManual).toEqual([])
    const p = store.profiles[0]
    expect(p.hoursSource).toBe('google')
    expect(p.addressSource).toBe('google')
    expect(p.phoneSource).toBe('google')
    expect(p.addressLine1).toBe('742 Evergreen Terrace')
    expect(p.city).toBe('Springfield')
  })

  it('a DEMO connection applies seeded synthetic data WITHOUT networking', async () => {
    setConnected({ isDemo: true })
    store.profiles = [fullProfile({ hoursSource: 'google', addressSource: 'google', phoneSource: 'google' })]
    const r = await syncGoogleBusinessProfile(ORG, { force: true })
    expect(client.getGoogleBusinessLocation).not.toHaveBeenCalled()
    expect(client.listGoogleBusinessMedia).not.toHaveBeenCalled()
    expect(r.ok).toBe(true)
    // The demo synthetic location is Austin TX, Mon–Fri.
    const p = store.profiles[0]
    expect(p.city).toBe('Austin')
    expect((p.hours as Record<string, unknown>).mon).toEqual({ open: '08:00', close: '17:00' })
    expect(p.googlePhotos).toBeTruthy()
  })

  it('best-effort: an API failure returns ok:false and writes nothing', async () => {
    setConnected()
    client.getGoogleBusinessLocation.mockRejectedValue(new Error('Zernio 500'))
    const r = await syncGoogleBusinessProfile(ORG, { force: true })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Zernio 500')
    const p = store.profiles[0]
    expect(p.googleSyncedAt).toBeUndefined()
    expect(p.hoursSource).toBe('manual')
  })

  it('a media failure does not fail the sync AND preserves the stored Google photos (no wipe)', async () => {
    // The profile already has Google photos. A transient media-pull failure must
    // NOT null them — the old code emptied the clinic's "import from Google"
    // gallery on a flaky media call.
    store.profiles = [fullProfile({ hoursSource: 'google', googlePhotos: [{ url: 'https://g/keep.jpg' }] })]
    setConnected()
    client.listGoogleBusinessMedia.mockRejectedValue(new Error('media down'))
    const r = await syncGoogleBusinessProfile(ORG, { force: false })
    expect(r.ok).toBe(true)
    expect(r.applied).toContain('hours')
    expect(r.photoCount).toBe(0)
    // Existing photos preserved (not overwritten with null).
    expect(store.profiles[0].googlePhotos).toEqual([{ url: 'https://g/keep.jpg' }])
  })

  it('does not write hours when Google supplied no usable hours', async () => {
    store.profiles = [fullProfile({ hoursSource: 'google' })]
    setConnected()
    client.getGoogleBusinessLocation.mockResolvedValue({ ...GOOGLE_LOC, periods: [] })
    const r = await syncGoogleBusinessProfile(ORG, { force: true })
    expect(r.applied).not.toContain('hours')
    expect(store.profiles[0].hours).toBeUndefined()
  })
})

// ── getGbpSyncState ───────────────────────────────────────────────────────────

describe('getGbpSyncState', () => {
  it('reports disconnected when no GBP is connected', async () => {
    conn.value = null
    const s = await getGbpSyncState(ORG)
    expect(s.connected).toBe(false)
    expect(s.sources).toEqual({ hours: 'manual', address: 'manual', phone: 'manual' })
  })

  it('reports per-field sources + last-synced + google photos + imported urls', async () => {
    setConnected()
    store.profiles = [
      fullProfile({
        hoursSource: 'google',
        addressSource: 'manual',
        phoneSource: 'google',
        googleSyncedAt: new Date('2026-06-10T00:00:00Z'),
        googlePhotos: [{ url: 'https://g/a.jpg', sourceUrl: null, category: 'INTERIOR' }],
        officePhotos: [{ id: 'op1', url: 'https://g/a.jpg' }, { id: 'op2', url: 'https://curated/b.jpg' }],
      }),
    ]
    const s = await getGbpSyncState(ORG)
    expect(s.connected).toBe(true)
    expect(s.sources).toEqual({ hours: 'google', address: 'manual', phone: 'google' })
    expect(s.lastSyncedAtIso).toBe('2026-06-10T00:00:00.000Z')
    expect(s.googlePhotos).toEqual([{ url: 'https://g/a.jpg', sourceUrl: null, category: 'INTERIOR' }])
    // The google photo already imported into officePhotos shows in importedPhotoUrls.
    expect(s.importedPhotoUrls).toContain('https://g/a.jpg')
  })
})

// ── revertFieldToManual + markFieldSourceManual ───────────────────────────────

describe('revertFieldToManual', () => {
  it('flips a field source to manual WITHOUT changing its value', async () => {
    store.profiles = [fullProfile({ hoursSource: 'google', hours: { mon: { open: '09:00', close: '17:00' } } })]
    const r = await revertFieldToManual(ORG, 'hours')
    expect(r.ok).toBe(true)
    expect(store.profiles[0].hoursSource).toBe('manual')
    // Value untouched.
    expect(store.profiles[0].hours).toEqual({ mon: { open: '09:00', close: '17:00' } })
  })
})

describe('markFieldSourceManual', () => {
  it('flips multiple field sources to manual in one write', async () => {
    store.profiles = [fullProfile({ addressSource: 'google', phoneSource: 'google' })]
    await markFieldSourceManual(ORG, ['address', 'phone'])
    expect(store.profiles[0].addressSource).toBe('manual')
    expect(store.profiles[0].phoneSource).toBe('manual')
  })
  it('no-ops on an empty list', async () => {
    store.profiles = [fullProfile({ hoursSource: 'google' })]
    await markFieldSourceManual(ORG, [])
    expect(store.profiles[0].hoursSource).toBe('google')
  })
})

// ── importGooglePhotos ────────────────────────────────────────────────────────

describe('importGooglePhotos', () => {
  it('appends only google_photos URLs not already in officePhotos', async () => {
    store.profiles = [
      fullProfile({
        googlePhotos: [{ url: 'https://g/x.jpg' }, { url: 'https://g/y.jpg' }],
        officePhotos: [{ id: 'op1', url: 'https://g/x.jpg' }],
      }),
    ]
    const r = await importGooglePhotos(ORG, ['https://g/x.jpg', 'https://g/y.jpg'])
    expect(r).toMatchObject({ ok: true, added: 1 })
    const photos = store.profiles[0].officePhotos as Array<{ url: string }>
    expect(photos).toHaveLength(2)
    expect(photos.map((p) => p.url)).toContain('https://g/y.jpg')
  })

  it('rejects URLs not present in google_photos (no arbitrary injection)', async () => {
    store.profiles = [fullProfile({ googlePhotos: [{ url: 'https://g/x.jpg' }], officePhotos: [] })]
    const r = await importGooglePhotos(ORG, ['https://evil/inject.jpg'])
    expect(r).toMatchObject({ ok: true, added: 0 })
    expect(store.profiles[0].officePhotos).toEqual([])
  })

  it('no-ops on an empty url list', async () => {
    store.profiles = [fullProfile()]
    const r = await importGooglePhotos(ORG, [])
    expect(r).toMatchObject({ ok: true, added: 0 })
  })
})

// ── seedDemoGbpSync ───────────────────────────────────────────────────────────

describe('seedDemoGbpSync', () => {
  it('flags sources google + stamps synced + seeds google_photos (idempotent, non-destructive)', async () => {
    store.profiles = [fullProfile()]
    await seedDemoGbpSync(ORG)
    const p = store.profiles[0]
    expect(p.hoursSource).toBe('google')
    expect(p.addressSource).toBe('google')
    expect(p.phoneSource).toBe('google')
    expect(p.googleSyncedAt).toBeInstanceOf(Date)
    expect((p.googlePhotos as unknown[]).length).toBeGreaterThan(0)

    // Idempotent — a second run leaves the already-filled fields alone.
    const firstSynced = p.googleSyncedAt
    await seedDemoGbpSync(ORG)
    expect(store.profiles[0].googleSyncedAt).toBe(firstSynced)
  })

  it('is guarded behind a real patient (no orphan write on an empty org)', async () => {
    store.patients = [] // no patients
    store.profiles = [fullProfile()]
    await seedDemoGbpSync(ORG)
    expect(store.profiles[0].hoursSource).toBe('manual')
    expect(store.profiles[0].googlePhotos).toBeUndefined()
  })

  it('does NOT overwrite a hand-customized demo field (source flipped back to manual)', async () => {
    store.profiles = [fullProfile({ hoursSource: 'manual', addressSource: 'google', phoneSource: 'google', googleSyncedAt: new Date('2026-01-01T00:00:00Z'), googlePhotos: [{ url: 'kept' }] })]
    await seedDemoGbpSync(ORG)
    // hours stays manual (clinic customized it); existing synced/photos untouched.
    expect(store.profiles[0].hoursSource).toBe('manual')
    expect(store.profiles[0].googlePhotos).toEqual([{ url: 'kept' }])
  })
})

// ── syncAllGoogleBusinessProfiles (cron sweep) ────────────────────────────────

describe('syncAllGoogleBusinessProfiles', () => {
  it('sweeps connected non-demo orgs, best-effort per org', async () => {
    store.conns = [{ organizationId: ORG, status: 'connected', isDemo: 0 }]
    store.profiles = [fullProfile({ hoursSource: 'google' })]
    setConnected()
    const res = await syncAllGoogleBusinessProfiles()
    expect(res.scanned).toBe(1)
    expect(res.failed).toBe(0)
    expect(res.applied).toBeGreaterThanOrEqual(1)
  })
})
