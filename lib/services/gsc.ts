import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { gscConnection } from '@/lib/db/schema/clinic'
import { encryptSecret, decryptSecret } from '@/lib/crypto'

/**
 * Google Search Console OAuth + API. User-delegated (each clinic connects
 * their OWN verified property) — mirrors the Gmail integration. Talks to
 * Google directly via fetch; no SDK. Read-only scope.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const WEBMASTERS_API = 'https://www.googleapis.com/webmasters/v3'

export const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

export function gscOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
}

export function getGscAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GSC_SCOPE,
    access_type: 'offline',
    prompt: 'consent', // force a refresh token
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

async function refreshGscToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`GSC token refresh failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<GoogleTokenResponse>
}

/** Store the OAuth tokens for an org. Status starts 'needs_site' until the
 * clinic picks which verified property to track. */
export async function saveGscConnection(opts: {
  organizationId: string
  connectedByUserId: string
  tokens: GoogleTokenResponse
}): Promise<void> {
  const expiresAt = new Date(Date.now() + (opts.tokens.expires_in - 30) * 1000)
  const [existing] = await db
    .select({ organizationId: gscConnection.organizationId, siteUrl: gscConnection.siteUrl })
    .from(gscConnection)
    .where(eq(gscConnection.organizationId, opts.organizationId))
    .limit(1)
  // Google only returns a refresh_token on first consent; keep the old one if
  // it's a re-auth that didn't include it.
  const encrypted = opts.tokens.refresh_token ? encryptSecret(opts.tokens.refresh_token) : null

  if (existing) {
    await db
      .update(gscConnection)
      .set({
        accessToken: opts.tokens.access_token,
        accessExpiresAt: expiresAt,
        scope: opts.tokens.scope,
        lastError: null,
        ...(encrypted ? { refreshTokenEncrypted: encrypted } : {}),
        status: existing.siteUrl ? 'connected' : 'needs_site',
        updatedAt: new Date(),
      })
      .where(eq(gscConnection.organizationId, opts.organizationId))
    return
  }
  if (!encrypted) throw new Error('No refresh token returned — reconnect with consent.')
  await db.insert(gscConnection).values({
    organizationId: opts.organizationId,
    connectedByUserId: opts.connectedByUserId,
    refreshTokenEncrypted: encrypted,
    accessToken: opts.tokens.access_token,
    accessExpiresAt: expiresAt,
    scope: opts.tokens.scope,
    status: 'needs_site',
  })
}

async function getGscAccessToken(organizationId: string): Promise<string> {
  const [row] = await db.select().from(gscConnection).where(eq(gscConnection.organizationId, organizationId)).limit(1)
  if (!row) throw new Error('Search Console is not connected.')
  const exp = row.accessExpiresAt ? new Date(row.accessExpiresAt).getTime() : 0
  if (row.accessToken && exp > Date.now() + 5000) return row.accessToken
  const refreshed = await refreshGscToken(decryptSecret(row.refreshTokenEncrypted))
  await db
    .update(gscConnection)
    .set({
      accessToken: refreshed.access_token,
      accessExpiresAt: new Date(Date.now() + (refreshed.expires_in - 30) * 1000),
      updatedAt: new Date(),
    })
    .where(eq(gscConnection.organizationId, organizationId))
  return refreshed.access_token
}

export interface GscConnectionView {
  connected: boolean
  status: string
  siteUrl: string | null
}

export async function getGscConnectionView(organizationId: string): Promise<GscConnectionView> {
  const [row] = await db
    .select({ status: gscConnection.status, siteUrl: gscConnection.siteUrl })
    .from(gscConnection)
    .where(eq(gscConnection.organizationId, organizationId))
    .limit(1)
  if (!row) return { connected: false, status: 'disconnected', siteUrl: null }
  return { connected: true, status: row.status, siteUrl: row.siteUrl }
}

export interface GscSite {
  siteUrl: string
  permissionLevel: string
}

/** The verified properties the connected Google account can access. */
export async function listGscSites(organizationId: string): Promise<GscSite[]> {
  const token = await getGscAccessToken(organizationId)
  const res = await fetch(`${WEBMASTERS_API}/sites`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`GSC sites list failed: ${res.status}`)
  const body = (await res.json()) as { siteEntry?: GscSite[] }
  return (body.siteEntry ?? []).filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
}

export async function setGscSite(organizationId: string, siteUrl: string): Promise<void> {
  await db
    .update(gscConnection)
    .set({ siteUrl, status: 'connected', updatedAt: new Date() })
    .where(eq(gscConnection.organizationId, organizationId))
}

export async function disconnectGsc(organizationId: string): Promise<void> {
  await db.delete(gscConnection).where(eq(gscConnection.organizationId, organizationId))
}

export interface GscPerformance {
  clicks: number
  impressions: number
  ctr: number // 0-1
  position: number
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Search-analytics totals + top queries for the connected property. Returns
 * null when no property is selected. Note: GSC data lags ~2-3 days. */
export async function getGscPerformance(organizationId: string, days = 28): Promise<GscPerformance | null> {
  const view = await getGscConnectionView(organizationId)
  if (!view.connected || !view.siteUrl) return null
  const token = await getGscAccessToken(organizationId)
  const endDate = ymd(new Date())
  const startDate = ymd(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
  const base = `${WEBMASTERS_API}/sites/${encodeURIComponent(view.siteUrl)}/searchAnalytics/query`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const [totalsRes, queriesRes] = await Promise.all([
    fetch(base, { method: 'POST', headers, body: JSON.stringify({ startDate, endDate }) }),
    fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 10 }),
    }),
  ])
  if (!totalsRes.ok) throw new Error(`GSC query failed: ${totalsRes.status}`)
  const totals = (await totalsRes.json()) as { rows?: Array<{ clicks: number; impressions: number; ctr: number; position: number }> }
  const queries = (await queriesRes.json().catch(() => ({}))) as {
    rows?: Array<{ keys: string[]; clicks: number; impressions: number; position: number }>
  }
  const t = totals.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  return {
    clicks: t.clicks,
    impressions: t.impressions,
    ctr: t.ctr,
    position: t.position,
    topQueries: (queries.rows ?? []).map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    })),
  }
}
