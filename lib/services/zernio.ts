import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  listProfiles,
  createProfile,
  getConnectUrl as zernioGetConnectUrl,
  listAccounts,
  deleteAccount,
  type ZernioRawAccount,
} from '@/lib/zernio'
import type { ZernioAccount, ZernioConnectionView, ZernioPlatform } from '@/lib/types/zernio'
import { ZERNIO_CONNECTED_QS } from '@/lib/types/zernio'

/**
 * Zernio connection service. The orbital layer over a clinic's Google Business
 * Profile (and, later, social) via Zernio's hosted-OAuth API.
 *
 * FOUNDATION scope: connection plumbing only —
 *   - ensure a Zernio profile exists per org (idempotent)
 *   - hand back a hosted-OAuth connect URL for Google Business
 *   - sync connected accounts back into our DB
 *   - read the connection for the UI
 *   - disconnect (best-effort at Zernio + always drop our rows)
 *
 * Demo-safe: a connection flagged `isDemo` NEVER hits the network — every
 * function short-circuits to the seeded synthetic state.
 */

const GOOGLE_BUSINESS: ZernioPlatform = 'googlebusiness'

// ── DB row helpers ──────────────────────────────────────────────────────────

async function getConnectionRow(organizationId: string): Promise<schema.ZernioConnection | null> {
  const [row] = await db
    .select()
    .from(schema.zernioConnection)
    .where(eq(schema.zernioConnection.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

async function upsertConnection(
  organizationId: string,
  fields: Partial<Pick<schema.ZernioConnection, 'zernioProfileId' | 'status' | 'lastError' | 'isDemo'>>,
): Promise<void> {
  const now = new Date()
  await db
    .insert(schema.zernioConnection)
    .values({
      organizationId,
      zernioProfileId: fields.zernioProfileId ?? null,
      status: fields.status ?? 'disconnected',
      lastError: fields.lastError ?? null,
      isDemo: fields.isDemo ?? 0,
    })
    .onConflictDoUpdate({
      target: schema.zernioConnection.organizationId,
      set: {
        ...(fields.zernioProfileId !== undefined ? { zernioProfileId: fields.zernioProfileId } : {}),
        ...(fields.status !== undefined ? { status: fields.status } : {}),
        ...(fields.lastError !== undefined ? { lastError: fields.lastError } : {}),
        ...(fields.isDemo !== undefined ? { isDemo: fields.isDemo } : {}),
        updatedAt: now,
      },
    })
}

/** Normalize a raw Zernio SocialAccount into our narrowed shape. `profileId`
 *  can be a string OR an embedded Profile object. */
function normalizeAccount(raw: ZernioRawAccount): ZernioAccount {
  const profileId = typeof raw.profileId === 'string' ? raw.profileId : (raw.profileId?._id ?? '')
  return {
    id: raw._id,
    platform: raw.platform,
    profileId,
    username: raw.username ?? null,
    displayName: raw.displayName ?? null,
    profilePicture: raw.profilePicture ?? null,
    profileUrl: raw.profileUrl ?? null,
  }
}

// ── Profile (find-or-create) ────────────────────────────────────────────────

/**
 * Ensure a Zernio profile exists for this org and return its id. Idempotent:
 * reuses the id already persisted on `zernio_connection` if present; otherwise
 * looks for a matching profile by name in Zernio, else creates one. Persists
 * the resolved id back onto the connection row.
 *
 * NEVER call this for a demo connection — demo callers short-circuit upstream.
 */
export async function ensureProfileForOrg(orgId: string, orgName: string): Promise<string> {
  const existing = await getConnectionRow(orgId)
  if (existing?.zernioProfileId) return existing.zernioProfileId

  // We tag each org's profile with a stable name so a re-connect after a wiped
  // local row still finds the same Zernio profile instead of creating a dup.
  const profileName = profileNameForOrg(orgId, orgName)

  let profileId: string | undefined
  try {
    const profiles = await listProfiles()
    profileId = profiles.find((p) => p.name === profileName)?._id
  } catch {
    // List failed — fall through to create (create surfaces its own error).
  }

  if (!profileId) {
    const created = await createProfile(profileName)
    profileId = created._id
  }

  await upsertConnection(orgId, { zernioProfileId: profileId })
  return profileId
}

/** Stable per-org Zernio profile name. Includes the org id so two clinics with
 *  the same display name don't collide. */
export function profileNameForOrg(orgId: string, orgName: string): string {
  const name = (orgName || 'Clinic').trim()
  return `${name} [${orgId}]`
}

// ── Connect URL ─────────────────────────────────────────────────────────────

/**
 * Resolve the hosted-OAuth connect URL for ANY connectable platform (Google
 * Business or a shortlisted social platform). Ensures the org's Zernio profile
 * first, then asks Zernio for an `authUrl` (the platform's real consent screen).
 * `redirectUrl` (optional) is where Zernio returns the user after connecting —
 * Zernio appends `?connected={platform}&profileId=…&accountId=…&username=…`. When
 * omitted, Zernio returns the user to its own dashboard, so the UI also polls on
 * focus.
 *
 * The cap check for SOCIAL platforms lives in the connect route (it must redirect
 * the user with an at-limit param instead of starting OAuth); this function is
 * the pure URL resolver and does NOT gate.
 */
export async function getPlatformConnectUrl(
  orgId: string,
  orgName: string,
  platform: ZernioPlatform,
  redirectUrl?: string,
): Promise<string> {
  const profileId = await ensureProfileForOrg(orgId, orgName)
  const { authUrl } = await zernioGetConnectUrl(platform, profileId, redirectUrl)
  return authUrl
}

/**
 * Google Business convenience wrapper over {@link getPlatformConnectUrl}. Kept
 * so the existing GBP call sites (and tests) read intent without re-passing the
 * platform slug.
 */
export async function getGoogleBusinessConnectUrl(
  orgId: string,
  orgName: string,
  redirectUrl?: string,
): Promise<string> {
  return getPlatformConnectUrl(orgId, orgName, GOOGLE_BUSINESS, redirectUrl)
}

// ── Sync connected accounts ─────────────────────────────────────────────────

/**
 * Pull the org's connected accounts from Zernio and reconcile them into
 * `zernio_account`, then set the connection status. Best-effort: on any API
 * failure we record `status='error'` + `lastError` and return (never throws to
 * the caller). Demo connections never hit the network — they keep their seeded
 * state.
 *
 * v1 scope: we upsert ALL platforms Zernio returns for the org's profile (so a
 * future social module finds them already synced) but the UI surfaces only
 * Google Business. Status flips to 'connected' when ≥1 GBP account exists.
 */
export async function syncConnectedAccounts(orgId: string): Promise<void> {
  const conn = await getConnectionRow(orgId)
  if (conn?.isDemo) return // demo: seeded state stands, no network

  const profileId = conn?.zernioProfileId
  if (!profileId) {
    // Nothing connected yet (no profile) — leave as disconnected.
    await upsertConnection(orgId, { status: 'disconnected', lastError: null })
    return
  }

  let raw: ZernioRawAccount[]
  try {
    const res = await listAccounts({ profileId })
    raw = res.accounts
  } catch (e) {
    await upsertConnection(orgId, { status: 'error', lastError: (e as Error).message })
    return
  }

  // Defensive: the API may not honor the profileId filter, so re-filter here.
  const accounts = raw
    .map(normalizeAccount)
    .filter((a) => a.id && (!a.profileId || a.profileId === profileId))

  // Reconcile: upsert every account, then delete local rows no longer present.
  const seenIds = new Set<string>()
  for (const a of accounts) {
    seenIds.add(a.id)
    await db
      .insert(schema.zernioAccount)
      .values({
        id: a.id,
        organizationId: orgId,
        platform: a.platform,
        accountId: a.id,
        username: a.username,
        displayName: a.displayName,
      })
      .onConflictDoUpdate({
        target: schema.zernioAccount.id,
        set: {
          platform: a.platform,
          username: a.username,
          displayName: a.displayName,
        },
      })
  }

  // Drop local rows for accounts the clinic disconnected at Zernio's end.
  const localRows = await db
    .select({ id: schema.zernioAccount.id })
    .from(schema.zernioAccount)
    .where(eq(schema.zernioAccount.organizationId, orgId))
  const stale = localRows.filter((r) => !seenIds.has(r.id)).map((r) => r.id)
  for (const id of stale) {
    await db
      .delete(schema.zernioAccount)
      .where(and(eq(schema.zernioAccount.organizationId, orgId), eq(schema.zernioAccount.id, id)))
  }

  const hasGbp = accounts.some((a) => a.platform === GOOGLE_BUSINESS)
  await upsertConnection(orgId, {
    status: hasGbp ? 'connected' : 'disconnected',
    lastError: null,
  })
}

// ── Read for UI ─────────────────────────────────────────────────────────────

/**
 * Connection + ALL connected accounts (GBP + social), shaped for the Channels +
 * Integrations UI. Returns every `zernio_account` row for the org grouped into
 * `accounts` (all platforms) plus a `googleBusinessAccounts` convenience slice
 * (back-compat for the GBP card + `resolveGbpAccount`). The connection `status`
 * still tracks GBP (it flips connected when ≥1 GBP account exists) — social
 * connectedness is read per-platform off `accounts`, never off the top-level
 * status.
 */
export async function getZernioConnection(orgId: string): Promise<ZernioConnectionView> {
  const conn = await getConnectionRow(orgId)
  const rows = await db
    .select()
    .from(schema.zernioAccount)
    .where(eq(schema.zernioAccount.organizationId, orgId))

  const accounts: ZernioAccount[] = rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    profileId: conn?.zernioProfileId ?? '',
    username: r.username,
    displayName: r.displayName,
    profilePicture: null,
    profileUrl: null,
  }))

  return {
    status: (conn?.status as ZernioConnectionView['status']) ?? 'disconnected',
    zernioProfileId: conn?.zernioProfileId ?? null,
    lastError: conn?.lastError ?? null,
    isDemo: conn?.isDemo === 1,
    googleBusinessAccounts: accounts.filter((a) => a.platform === GOOGLE_BUSINESS),
    accounts,
  }
}

/**
 * Resolve the org's connected Google Business account: the Zernio accountId +
 * whether the connection is the demo (no-network) one, or `null` when no GBP is
 * connected. The single shared resolver for every GBP-data consumer — the
 * auto-resolved replacement for the hand-pasted `clinic_review_config.
 * googlePlaceId`. Used by `google-reviews.ts`, `gbp-sync.ts`, and
 * `gbp-metrics.ts` (which previously each carried an identical private copy).
 */
export async function resolveGbpAccount(
  orgId: string,
): Promise<{ accountId: string; isDemo: boolean } | null> {
  const conn = await getZernioConnection(orgId)
  if (conn.status !== 'connected') return null
  const account = conn.googleBusinessAccounts[0]
  if (!account) return null
  return { accountId: account.id, isDemo: conn.isDemo }
}

// ── Disconnect ──────────────────────────────────────────────────────────────

/**
 * Disconnect a platform for the org: best-effort delete each account at Zernio,
 * then ALWAYS drop our local rows for that platform and recompute status. Demo
 * connections skip the network. A Zernio delete failure never blocks the local
 * cleanup — the clinic's intent ("disconnect") is honored regardless.
 */
export async function disconnectPlatform(orgId: string, platform: ZernioPlatform): Promise<void> {
  const conn = await getConnectionRow(orgId)
  const rows = await db
    .select({ id: schema.zernioAccount.id })
    .from(schema.zernioAccount)
    .where(and(eq(schema.zernioAccount.organizationId, orgId), eq(schema.zernioAccount.platform, platform)))

  if (!conn?.isDemo) {
    for (const r of rows) {
      try {
        await deleteAccount(r.id)
      } catch {
        // Best-effort — still drop the local row below.
      }
    }
  }

  await db
    .delete(schema.zernioAccount)
    .where(and(eq(schema.zernioAccount.organizationId, orgId), eq(schema.zernioAccount.platform, platform)))

  // Recompute status from what's left (demo stays 'connected' off its seed).
  if (conn?.isDemo) return
  const remaining = await db
    .select({ id: schema.zernioAccount.id })
    .from(schema.zernioAccount)
    .where(and(eq(schema.zernioAccount.organizationId, orgId), eq(schema.zernioAccount.platform, GOOGLE_BUSINESS)))
  await upsertConnection(orgId, {
    status: remaining.length > 0 ? 'connected' : 'disconnected',
    lastError: null,
  })
}

// ── Demo seeding ────────────────────────────────────────────────────────────

/** Synthetic Google Business account id for the demo (never a real Zernio id). */
const DEMO_GBP_ACCOUNT_ID = 'demo_gbp_dream_dental'

/**
 * Synthetic SOCIAL accounts for the demo (never real Zernio ids). The demo is
 * Premium + add-on (5 social slots, from PR 1), so seeding 2 connected social
 * accounts showcases the Channels surface's connected-social state + a
 * partially-used cap ("2 of 5 used"). Per the no-fake-content rule, these
 * populate exactly what the Channels rows render.
 */
const DEMO_SOCIAL_ACCOUNTS: ReadonlyArray<{
  id: string
  platform: ZernioPlatform
  username: string
  displayName: string
}> = [
  { id: 'demo_ig_dream_dental', platform: 'instagram', username: '@dreamdental', displayName: 'Dream Dental' },
  { id: 'demo_fb_dream_dental', platform: 'facebook', username: 'dreamdentalaustin', displayName: 'Dream Dental' },
]

/**
 * Seed (or self-heal) the demo clinic's Zernio connection so the Integrations
 * Google Business card showcases the CONNECTED state without ever touching the
 * network. Idempotent: no-op once a connected demo row exists. Scoped to the
 * isDemo org by the caller. Per the no-fake-content rule, this populates exactly
 * what the card renders (a connection row + one GBP account).
 */
export async function seedDemoZernio(organizationId: string, displayName = 'Dream Dental'): Promise<void> {
  const existing = await getConnectionRow(organizationId)
  if (!existing) {
    // Only seed for a real demo org (one that actually has patients) — mirrors
    // seedDemoPms's prerequisite guard so an exhausted/empty context can't
    // spawn an orphan connection.
    const [anyPatient] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, organizationId))
      .limit(1)
    if (!anyPatient) return
    await db.insert(schema.zernioConnection).values({
      organizationId,
      zernioProfileId: 'demo_profile',
      status: 'connected',
      isDemo: 1,
    })
  } else if (existing.isDemo === 1 && existing.status !== 'connected') {
    // A platform admin may have disconnected the demo mid-session — re-connect.
    await upsertConnection(organizationId, { status: 'connected', lastError: null, isDemo: 1 })
  } else if (existing.isDemo !== 1) {
    // Not a demo connection (a real one somehow exists) — leave it alone.
    return
  }

  // Ensure exactly one synthetic GBP account.
  const [acct] = await db
    .select({ id: schema.zernioAccount.id })
    .from(schema.zernioAccount)
    .where(and(eq(schema.zernioAccount.organizationId, organizationId), eq(schema.zernioAccount.platform, GOOGLE_BUSINESS)))
    .limit(1)
  if (!acct) {
    await db
      .insert(schema.zernioAccount)
      .values({
        id: DEMO_GBP_ACCOUNT_ID,
        organizationId,
        platform: GOOGLE_BUSINESS,
        accountId: DEMO_GBP_ACCOUNT_ID,
        username: 'dream-dental-austin',
        displayName,
      })
      .onConflictDoNothing()
  }

  // Ensure the synthetic SOCIAL accounts (Instagram + Facebook) so the Channels
  // surface showcases connected social + a partially-used cap. Idempotent —
  // onConflictDoNothing keyed by the synthetic id. GBP status is untouched (it
  // tracks GBP only); social connectedness is read per-platform off accounts.
  for (const s of DEMO_SOCIAL_ACCOUNTS) {
    await db
      .insert(schema.zernioAccount)
      .values({
        id: s.id,
        organizationId,
        platform: s.platform,
        accountId: s.id,
        username: s.username,
        displayName: s.displayName,
      })
      .onConflictDoNothing()
  }
}

/** The query-string flag the connect-return path / callback uses. Re-exported
 *  here so route + UI code import it from one place. */
export { ZERNIO_CONNECTED_QS }
