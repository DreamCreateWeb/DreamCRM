import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveGbpAccount } from '@/lib/services/zernio'
import {
  getGoogleBusinessLocation,
  listGoogleBusinessMedia,
  type GoogleLocation,
  type GooglePhoto,
} from '@/lib/zernio'
import type {
  FieldSource,
  GbpSyncResult,
  GbpSyncState,
  GooglePhotoView,
  SyncableField,
} from '@/lib/types/zernio'

/**
 * Google Business Profile → clinic_profile sync (the Zernio integration's
 * hours/location PR). PULLs the clinic's VERIFIED hours, address, phone, and
 * photos from their connected Google Business Profile into `clinic_profile`, so
 * the public site, booking slot generation, footer "open today", and JSON-LD
 * all ride the clinic's real Google data automatically. ONE-DIRECTIONAL —
 * Zernio is pull-only for listing fields, so there is NO write-back to Google.
 *
 * SAFETY INVARIANT (the whole point of the `*_source` flags): an automatic /
 * background sync must NOT overwrite a field whose source is 'manual' — only
 * fields currently 'google' (or never synced into a different value) get
 * updated. An EXPLICIT user-initiated "Sync from Google" (`force: true`) MAY
 * overwrite a manual field and flips that field's source to 'google'. Saving a
 * field through any editor flips its source back to 'manual' (see
 * markFieldSourceManual, wired into the save actions).
 *
 * Demo-safe: a connection flagged `isDemo` NEVER hits the network — it applies
 * the seeded synthetic Google data instead. Best-effort: a pull failure records
 * nothing destructive and returns `{ ok:false, error }` (never throws).
 *
 * Photos are kept SEPARATE from the curated `officePhotos` — pulled into
 * `google_photos` and surfaced as an "import from Google" gallery the clinic
 * picks from; we never auto-clobber the curated gallery.
 */

// The clinic_profile day keys, in week order (matches the hours editor + the
// booking service's HoursMap shape). A synced hours object always carries ALL
// seven keys so a day with no Google period reads as closed (null/null), never
// "missing" — keeping the shape identical to what the editors save.
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
type DayKey = (typeof DAY_KEYS)[number]

interface HoursEntry {
  open?: string | null
  close?: string | null
  closed?: boolean
}
type HoursMap = Record<DayKey, HoursEntry>

// ── Connection resolution ────────────────────────────────────────────────────
// The org→GBP-account resolver lives in `lib/services/zernio.ts` (shared with
// google-reviews.ts + gbp-metrics.ts); imported above as `resolveGbpAccount`.

// ── Mapping Google's shape → clinic_profile columns ──────────────────────────

/**
 * Map Google's periods into our `clinic_profile.hours` jsonb shape. Every day
 * key is present; a day with no readable Google period is `{ open:null,
 * close:null }` (renders closed, exactly like the demo's seeded sat/sun). A day
 * with a readable period gets `{ open:'HH:MM', close:'HH:MM' }`. When a day has
 * multiple periods (split shifts — Google allows it), we take the earliest open
 * and the latest close so the single-window slot generator stays correct.
 * Returns null when Google supplied NO usable period at all (so the caller can
 * skip writing rather than blank the clinic's hours).
 */
export function mapGoogleHours(loc: Pick<GoogleLocation, 'periods'>): HoursMap | null {
  const out: HoursMap = {
    mon: { open: null, close: null },
    tue: { open: null, close: null },
    wed: { open: null, close: null },
    thu: { open: null, close: null },
    fri: { open: null, close: null },
    sat: { open: null, close: null },
    sun: { open: null, close: null },
  }
  let any = false
  for (const p of loc.periods) {
    if (!p.day || !p.open || !p.close) continue
    // Google can return inverted (overnight) windows; the booking grid is a
    // single same-day window, so we only take well-formed open<close periods.
    if (p.open >= p.close) continue
    const cur = out[p.day]
    const open = cur.open && cur.open < p.open ? cur.open : p.open
    const close = cur.close && cur.close > p.close ? cur.close : p.close
    out[p.day] = { open, close }
    any = true
  }
  return any ? out : null
}

/** The address columns a sync writes, derived from Google's storefrontAddress. */
interface AddressPatch {
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
}

/**
 * Map Google's storefront address into our address columns. addressLines[0] →
 * addressLine1, addressLines[1] → addressLine2. Returns null when Google
 * supplied neither a street line nor a city (nothing worth writing).
 */
export function mapGoogleAddress(loc: GoogleLocation): AddressPatch | null {
  const line1 = loc.addressLines[0]?.trim() || null
  const line2 = loc.addressLines.slice(1).join(', ').trim() || null
  if (!line1 && !loc.city) return null
  return {
    addressLine1: line1,
    addressLine2: line2,
    city: loc.city,
    state: loc.state,
    postalCode: loc.postalCode,
    // Default to US when Google omits a region (matches the column default).
    country: loc.country || 'US',
  }
}

/** Normalize pulled photos into the persisted/client shape. */
function toPhotoViews(photos: GooglePhoto[]): GooglePhotoView[] {
  const seen = new Set<string>()
  const out: GooglePhotoView[] = []
  for (const p of photos) {
    if (!p.url || seen.has(p.url)) continue
    seen.add(p.url)
    out.push({ url: p.url, sourceUrl: p.sourceUrl, category: p.category })
  }
  return out
}

// ── Demo synthetic Google data (never networks) ──────────────────────────────

/**
 * Synthetic "Google Business Profile" location for the demo (Dream Dental). The
 * values mirror the demo's seeded clinic_profile (Austin TX, Central-time
 * Mon–Fri hours) so a demo "Sync from Google" applies cleanly + idempotently.
 * Periods are in Google's enum-day + HH:MM shape so they exercise the real
 * `mapGoogleHours` path. NEVER reaches the network.
 */
const DEMO_GOOGLE_LOCATION: GoogleLocation = {
  periods: [
    { day: 'mon', open: '08:00', close: '17:00' },
    { day: 'tue', open: '08:00', close: '17:00' },
    { day: 'wed', open: '08:00', close: '17:00' },
    { day: 'thu', open: '08:00', close: '17:00' },
    { day: 'fri', open: '08:00', close: '15:00' },
  ],
  addressLines: ['500 Main St'],
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
  phone: '(512) 555-0100',
  categories: ['Dentist', 'Cosmetic dentist'],
  placeId: 'ChIJDemo000000000_DreamDental',
}

/** Synthetic Google photos for the demo — reuses the demo office-photo URLs so
 *  the import-from-Google gallery showcases real-looking images. */
const DEMO_GOOGLE_PHOTOS: GooglePhoto[] = [
  { url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80', sourceUrl: null, category: 'INTERIOR' },
  { url: 'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1200&q=80', sourceUrl: null, category: 'INTERIOR' },
  { url: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=1200&q=80', sourceUrl: null, category: 'EXTERIOR' },
]

// ── Field source helpers ─────────────────────────────────────────────────────

function asSource(raw: string | null | undefined): FieldSource {
  return raw === 'google' ? 'google' : 'manual'
}

/**
 * Whether a sync may write `field`. An explicit `force` sync always may; an
 * automatic sync only may when the field's current source is NOT 'manual'.
 */
function mayWrite(force: boolean, source: FieldSource): boolean {
  return force || source !== 'manual'
}

/**
 * Populate `clinic_review_config.googlePlaceId` from a GBP-synced Place ID, but
 * ONLY when it's currently empty — a manually-pasted value is never clobbered
 * (we treat any existing value as the clinic's own). Creates the config row with
 * DB defaults if none exists yet. Written directly (not via reviews.ts) to keep
 * gbp-sync free of a reviews-service import cycle.
 */
async function maybeAutofillGooglePlaceId(orgId: string, placeId: string): Promise<void> {
  const value = placeId.trim()
  if (!value) return
  const [cfg] = await db
    .select({ googlePlaceId: schema.clinicReviewConfig.googlePlaceId })
    .from(schema.clinicReviewConfig)
    .where(eq(schema.clinicReviewConfig.organizationId, orgId))
    .limit(1)
  if (cfg) {
    if (cfg.googlePlaceId && cfg.googlePlaceId.trim()) return // manual value — leave it
    await db
      .update(schema.clinicReviewConfig)
      .set({ googlePlaceId: value, updatedAt: new Date() })
      .where(eq(schema.clinicReviewConfig.organizationId, orgId))
  } else {
    await db
      .insert(schema.clinicReviewConfig)
      .values({ organizationId: orgId, googlePlaceId: value })
      .onConflictDoNothing()
  }
}

// ── The sync ──────────────────────────────────────────────────────────────────

/**
 * Pull the clinic's Google Business Profile and apply it to clinic_profile
 * respecting the per-field source flags (see the SAFETY INVARIANT above).
 *
 * - `force: false` (cron / background): only updates fields whose source is
 *   'google' (or never set away from default into a manual value); manual
 *   fields are reported in `skippedManual` and left untouched.
 * - `force: true` (explicit "Sync from Google"): may overwrite manual fields
 *   and flips each written field's source to 'google'.
 *
 * Always stamps `googleSyncedAt`. Photos always refresh `google_photos` (they
 * never touch the curated officePhotos). Demo connections apply the seeded
 * synthetic data without networking. Best-effort — never throws.
 */
export async function syncGoogleBusinessProfile(
  orgId: string,
  opts: { force?: boolean } = {},
): Promise<GbpSyncResult> {
  const force = opts.force === true
  const account = await resolveGbpAccount(orgId)
  if (!account) {
    return { ok: true, applied: [], skippedManual: [], photoCount: 0, skipped: 'no_connection' }
  }

  // Pull location + media (or the demo synthetic data).
  let location: GoogleLocation
  let photos: GooglePhoto[]
  try {
    if (account.isDemo) {
      location = DEMO_GOOGLE_LOCATION
      photos = DEMO_GOOGLE_PHOTOS
    } else {
      ;[location, photos] = await Promise.all([
        getGoogleBusinessLocation({ accountId: account.accountId }),
        // Media is non-critical — a media failure shouldn't fail the whole sync.
        listGoogleBusinessMedia({ accountId: account.accountId }).catch(() => [] as GooglePhoto[]),
      ])
    }
  } catch (e) {
    return { ok: false, applied: [], skippedManual: [], photoCount: 0, error: (e as Error).message }
  }

  // Best-effort: auto-fill the clinic's Google Place ID (powers the "review us
  // on Google" write link) when Zernio surfaced one AND the clinic hasn't set it
  // manually. Its own try/catch so a config write never fails the GBP sync.
  if (location.placeId) {
    try {
      await maybeAutofillGooglePlaceId(orgId, location.placeId)
    } catch (e) {
      console.warn('[gbp-sync] Google Place ID autofill failed', e)
    }
  }

  // Read the current source flags.
  const [profile] = await db
    .select({
      hoursSource: schema.clinicProfile.hoursSource,
      addressSource: schema.clinicProfile.addressSource,
      phoneSource: schema.clinicProfile.phoneSource,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  if (!profile) {
    return { ok: false, applied: [], skippedManual: [], photoCount: 0, error: 'Clinic profile not found.' }
  }

  const sources: Record<SyncableField, FieldSource> = {
    hours: asSource(profile.hoursSource),
    address: asSource(profile.addressSource),
    phone: asSource(profile.phoneSource),
  }

  const applied: SyncableField[] = []
  const skippedManual: SyncableField[] = []
  const patch: Partial<typeof schema.clinicProfile.$inferInsert> = {}

  // Hours — only when Google actually supplied usable hours.
  const mappedHours = mapGoogleHours(location)
  if (mappedHours) {
    if (mayWrite(force, sources.hours)) {
      patch.hours = mappedHours
      patch.hoursSource = 'google'
      applied.push('hours')
    } else {
      skippedManual.push('hours')
    }
  }

  // Address — only when Google supplied a usable address.
  const mappedAddress = mapGoogleAddress(location)
  if (mappedAddress) {
    if (mayWrite(force, sources.address)) {
      patch.addressLine1 = mappedAddress.addressLine1
      patch.addressLine2 = mappedAddress.addressLine2
      patch.city = mappedAddress.city
      patch.state = mappedAddress.state
      patch.postalCode = mappedAddress.postalCode
      patch.country = mappedAddress.country
      patch.addressSource = 'google'
      applied.push('address')
    } else {
      skippedManual.push('address')
    }
  }

  // Phone — only when Google supplied one.
  if (location.phone) {
    if (mayWrite(force, sources.phone)) {
      patch.phone = location.phone
      patch.phoneSource = 'google'
      applied.push('phone')
    } else {
      skippedManual.push('phone')
    }
  }

  // Photos refresh the separate google_photos store (never officePhotos). Only
  // OVERWRITE when the media pull actually returned photos — `listGoogleBusinessMedia`
  // failures are swallowed to [] above, and nulling the store on that flicker
  // would empty the clinic's "import from Google" gallery until the next good
  // sync. (A clinic that truly removed all GBP photos keeps stale ones until a
  // pull returns data — a safe trade vs. wiping on a transient failure.)
  const photoViews = toPhotoViews(photos)
  if (photoViews.length > 0) patch.googlePhotos = photoViews
  patch.googleSyncedAt = new Date()
  patch.updatedAt = new Date()

  await db
    .update(schema.clinicProfile)
    .set(patch)
    .where(eq(schema.clinicProfile.organizationId, orgId))

  return { ok: true, applied, skippedManual, photoCount: photoViews.length }
}

// ── Read for the UI ───────────────────────────────────────────────────────────

/** The state the Settings "Sync from Google" UI renders. Resolves the
 *  connection + per-field provenance + the pulled photo gallery. */
export async function getGbpSyncState(orgId: string): Promise<GbpSyncState> {
  const account = await resolveGbpAccount(orgId)
  const [profile] = await db
    .select({
      hoursSource: schema.clinicProfile.hoursSource,
      addressSource: schema.clinicProfile.addressSource,
      phoneSource: schema.clinicProfile.phoneSource,
      googleSyncedAt: schema.clinicProfile.googleSyncedAt,
      googlePhotos: schema.clinicProfile.googlePhotos,
      officePhotos: schema.clinicProfile.officePhotos,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)

  const googlePhotos = Array.isArray(profile?.googlePhotos)
    ? (profile!.googlePhotos as unknown[])
        .map((p) => {
          if (!p || typeof p !== 'object') return null
          const o = p as Record<string, unknown>
          const url = typeof o.url === 'string' ? o.url.trim() : ''
          if (!url) return null
          return {
            url,
            sourceUrl: typeof o.sourceUrl === 'string' ? o.sourceUrl : null,
            category: typeof o.category === 'string' ? o.category : null,
          } satisfies GooglePhotoView
        })
        .filter((p): p is GooglePhotoView => p !== null)
    : []

  const importedPhotoUrls = Array.isArray(profile?.officePhotos)
    ? (profile!.officePhotos as Array<{ url?: unknown }>)
        .map((p) => (typeof p?.url === 'string' ? p.url : null))
        .filter((u): u is string => u !== null)
    : []

  return {
    connected: account !== null,
    isDemo: account?.isDemo ?? false,
    sources: {
      hours: asSource(profile?.hoursSource),
      address: asSource(profile?.addressSource),
      phone: asSource(profile?.phoneSource),
    },
    lastSyncedAtIso: profile?.googleSyncedAt ? profile.googleSyncedAt.toISOString() : null,
    googlePhotos,
    importedPhotoUrls,
  }
}

// ── Manual-edit tracking ──────────────────────────────────────────────────────

/**
 * Flip a field's source flag to 'manual' — called when the clinic SAVES that
 * field through an editor, so a later automatic sync respects the deliberate
 * edit. Wired into the save actions (updateClinicProfile, saveHours,
 * saveContact, the inline phone save). `field` accepts 'hours' | 'address' |
 * 'phone'; pass multiple to flag several in one write.
 */
export async function markFieldSourceManual(
  orgId: string,
  fields: SyncableField | SyncableField[],
): Promise<void> {
  const list = Array.isArray(fields) ? fields : [fields]
  if (list.length === 0) return
  const patch: Partial<typeof schema.clinicProfile.$inferInsert> = {}
  if (list.includes('hours')) patch.hoursSource = 'manual'
  if (list.includes('address')) patch.addressSource = 'manual'
  if (list.includes('phone')) patch.phoneSource = 'manual'
  if (Object.keys(patch).length === 0) return
  await db
    .update(schema.clinicProfile)
    .set(patch)
    .where(eq(schema.clinicProfile.organizationId, orgId))
}

/**
 * Flip a field's source back to 'manual' WITHOUT changing its value — the
 * "I've customized this, stop letting Google overwrite it" / "keep my version"
 * control in the UI. (The inverse — "use Google's version" — is just a force
 * sync, which re-applies Google + sets the source to 'google'.)
 */
export async function revertFieldToManual(
  orgId: string,
  field: SyncableField,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await markFieldSourceManual(orgId, field)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── Import photos from Google into the curated gallery ────────────────────────

/**
 * Add selected Google photos into the curated `officePhotos` gallery. Appends
 * (skipping URLs already present) — never replaces the clinic's curated set.
 * Returns how many new photos were added. Owner/admin gating happens in the
 * server action.
 */
export async function importGooglePhotos(
  orgId: string,
  urls: string[],
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const wanted = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean)))
  if (wanted.length === 0) return { ok: true, added: 0 }
  try {
    const [profile] = await db
      .select({
        officePhotos: schema.clinicProfile.officePhotos,
        googlePhotos: schema.clinicProfile.googlePhotos,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, orgId))
      .limit(1)
    if (!profile) return { ok: false, error: 'Clinic profile not found.' }

    // Only import URLs that are actually in google_photos — a client can't
    // inject an arbitrary URL into the curated gallery this way.
    const allowed = new Set(
      (Array.isArray(profile.googlePhotos) ? (profile.googlePhotos as Array<{ url?: unknown }>) : [])
        .map((p) => (typeof p?.url === 'string' ? p.url : null))
        .filter((u): u is string => u !== null),
    )

    const existing = (Array.isArray(profile.officePhotos)
      ? (profile.officePhotos as Array<{ id?: string; url?: string; alt?: string | null; caption?: string | null }>)
      : []
    ).filter((p) => p && typeof p.url === 'string')
    const existingUrls = new Set(existing.map((p) => p.url))

    const toAdd = wanted.filter((u) => allowed.has(u) && !existingUrls.has(u))
    if (toAdd.length === 0) return { ok: true, added: 0 }

    const next = [
      ...existing,
      ...toAdd.map((url) => ({
        id: `gph_${Math.random().toString(36).slice(2, 10)}`,
        url,
        alt: null,
        caption: null,
      })),
    ]

    await db
      .update(schema.clinicProfile)
      .set({ officePhotos: next, updatedAt: new Date() })
      .where(eq(schema.clinicProfile.organizationId, orgId))
    return { ok: true, added: toAdd.length }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ── Demo seeding ──────────────────────────────────────────────────────────────

/**
 * Seed (or self-heal) the demo clinic's Google Business sync state so the
 * Settings "Sync from Google" card showcases the populated "From Google ·
 * synced" provenance + the import-from-Google photo gallery — WITHOUT ever
 * networking. Sets the demo's hours/address/phone source flags to 'google',
 * stamps a recent `googleSyncedAt`, and seeds `google_photos` with realistic
 * URLs (one overlapping the curated officePhotos so the "Added" state shows).
 *
 * Idempotent + scoped to the isDemo org by the caller; behind a real-patient
 * guard so an exhausted/empty context can't write an orphan (mirrors
 * `seedDemoZernio` / `seedDemoGoogleReviews`). NON-destructive: only fills the
 * source flags / synced-at / google_photos when they're still at the default
 * ('manual' / null) — a demo a platform admin has hand-edited stays untouched.
 */
export async function seedDemoGbpSync(organizationId: string): Promise<void> {
  // Prerequisite guard — only seed for a real demo org (one with patients).
  const [anyPatient] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
    .limit(1)
  if (!anyPatient) return

  const [profile] = await db
    .select({
      hoursSource: schema.clinicProfile.hoursSource,
      addressSource: schema.clinicProfile.addressSource,
      phoneSource: schema.clinicProfile.phoneSource,
      googleSyncedAt: schema.clinicProfile.googleSyncedAt,
      googlePhotos: schema.clinicProfile.googlePhotos,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!profile) return

  const patch: Partial<typeof schema.clinicProfile.$inferInsert> = {}
  // First-seed only (googleSyncedAt still null): flag the synced fields
  // Google-sourced + stamp a recent synced-at, so the card showcases the
  // populated provenance. Once the demo has been synced once, we NEVER re-flip
  // the per-field sources — a platform admin may have reverted one to manual,
  // and that choice must stick (the no-overwrite guarantee).
  if (!profile.googleSyncedAt) {
    patch.hoursSource = 'google'
    patch.addressSource = 'google'
    patch.phoneSource = 'google'
    // ~2 days ago so the "synced {date}" indicator reads as recent.
    patch.googleSyncedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  }
  if (!profile.googlePhotos) {
    patch.googlePhotos = toPhotoViews(DEMO_GOOGLE_PHOTOS)
  }

  if (Object.keys(patch).length === 0) return
  await db
    .update(schema.clinicProfile)
    .set(patch)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

// ── Cron sweep ────────────────────────────────────────────────────────────────

/**
 * Non-force sync every org with a connected, NON-demo Google Business account.
 * Respects each field's manual flag (background sync never clobbers a manual
 * edit). Driven by the `/api/cron/sync-gbp` route. Each org is best-effort —
 * one failure never aborts the batch.
 */
export async function syncAllGoogleBusinessProfiles(): Promise<{
  scanned: number
  applied: number
  failed: number
  errors: Array<{ organizationId: string; error: string }>
}> {
  const conns = await db
    .select({ organizationId: schema.zernioConnection.organizationId })
    .from(schema.zernioConnection)
    .where(
      and(
        eq(schema.zernioConnection.status, 'connected'),
        eq(schema.zernioConnection.isDemo, 0),
      ),
    )

  const result = {
    scanned: 0,
    applied: 0,
    failed: 0,
    errors: [] as Array<{ organizationId: string; error: string }>,
  }
  for (const conn of conns) {
    result.scanned++
    try {
      const r = await syncGoogleBusinessProfile(conn.organizationId, { force: false })
      if (r.ok) result.applied += r.applied.length
      else {
        result.failed++
        result.errors.push({ organizationId: conn.organizationId, error: r.error ?? 'unknown' })
      }
    } catch (e) {
      result.failed++
      result.errors.push({ organizationId: conn.organizationId, error: (e as Error).message })
    }
  }
  return result
}
