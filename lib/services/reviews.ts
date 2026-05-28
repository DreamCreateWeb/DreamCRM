import 'server-only'
import { and, count, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { Resend } from 'resend'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'

/**
 * Reviews & Reputation service. Post-visit review requests routed
 * through Google / Yelp / Facebook. Same dental-product pattern Weave /
 * Birdeye / Podium / NiceJob / Swell ship.
 *
 * v1 scope:
 *   - Per-org config table (`clinic_review_config`) for review-site IDs +
 *     spam-rate limit. Empty by default; UI prompts setup on first use.
 *   - Manual send: staff clicks "Request review" on a completed
 *     appointment. Auto-trigger on appointment.status='completed' is
 *     v1.1 (needs cron).
 *   - Email channel only (Resend send path). SMS via Twilio is Phase B.
 *   - Public landing at /r/<token> — multi-platform tap-through. Records
 *     click + completed transitions for the funnel.
 *   - Dashboard funnel: Sent → Clicked → Completed.
 *
 * NOT in v1 (v1.1 / Phase 2):
 *   - NPS triage (1-5 star ask first, route private feedback for ≤3
 *     stars). Schema columns present; UI off. Done right per FTC:
 *     all responses public when configured, no review gating.
 *   - Auto-trigger cron (24-48h after completedAt).
 *   - Read inbound reviews via Google Business Profile API.
 *   - Reply to reviews from inside the product.
 *   - Per-patient opt-out flag (relies on marketing_email_opt_in for now).
 */

// ── Types ────────────────────────────────────────────────────────────

export type ReviewChannel = 'email' | 'sms'
export type ReviewStatus = 'pending' | 'sent' | 'clicked' | 'completed' | 'skipped' | 'failed'
// 'google' is primary (~80% of dental review value). 'healthgrades' is
// the dental-specialty platform. 'facebook' captures older demographics.
// 'yelp' is supported but DELIBERATELY OFF the default landing page —
// Yelp filters solicited reviews into a "not recommended" bucket so
// prompts hurt more than they help. The org has to manually fill the
// yelpBusinessSlug to surface it.
export type ReviewSite = 'google' | 'healthgrades' | 'facebook' | 'yelp'

export interface ReviewConfig {
  organizationId: string
  googlePlaceId: string | null
  healthgradesUrl: string | null
  facebookPageId: string | null
  yelpBusinessSlug: string | null
  minDaysBetweenRequests: number
  npsEnabled: boolean
  autoSendEnabled: boolean
  autoSendDelayHours: number
  privateFeedbackEmail: string | null
}

export interface ReviewRequestRow {
  id: string
  patientId: string
  patientName: string
  patientEmail: string | null
  appointmentId: string | null
  channel: ReviewChannel
  status: ReviewStatus
  sentAt: Date | null
  clickedAt: Date | null
  completedAt: Date | null
  selectedSite: ReviewSite | null
  rating: number | null
  createdAt: Date
}

export interface ReviewStats {
  /** Total requests sent in the last 30 days. */
  sent30d: number
  /** Sent → clicked rate as a percentage (0-100), null if no sends. */
  clickRate30d: number | null
  /** Clicked → completed rate as a percentage, null if no clicks. */
  completionRate30d: number | null
  /** Total completed (proxy for "left a review") in the last 30 days. */
  completed30d: number
  /** Eligible patients: had a completed visit in last 30d, no recent
   * request, has email. Drives the "ready to send" CTA. */
  eligibleCount: number
  /** Per-site completion breakdown for the recent window. */
  byPlatform: { google: number; healthgrades: number; facebook: number; yelp: number }
  /** Pending requests not yet sent. */
  pending: number
}

export interface EligiblePatient {
  patientId: string
  patientName: string
  patientEmail: string | null
  appointmentId: string
  appointmentType: string
  appointmentCompletedAt: Date
}

// ── Config ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Omit<ReviewConfig, 'organizationId'> = {
  googlePlaceId: null,
  healthgradesUrl: null,
  facebookPageId: null,
  yelpBusinessSlug: null,
  // Per research: 365-day default rate limit (NiceJob's 6-month lockout
  // dialed conservative for dental — most patients visit 1-2x/year).
  minDaysBetweenRequests: 365,
  // NPS-gating is now an FTC violation (2024 Fake Reviews Rule, $53k
  // per violation) — off by default. When clinic-enabled in v1.1, the
  // implementation routes ALL responses to public, never branches by
  // rating. The "private feedback" path is opt-in patient choice, not
  // a happiness funnel.
  npsEnabled: false,
  // Auto-trigger 24h after appointment.status='completed'. Off for v1
  // (manual send only); v1.1 wires the Vercel cron.
  autoSendEnabled: false,
  autoSendDelayHours: 24,
  privateFeedbackEmail: null,
}

export async function getReviewConfig(organizationId: string): Promise<ReviewConfig> {
  const [row] = await db
    .select()
    .from(schema.clinicReviewConfig)
    .where(eq(schema.clinicReviewConfig.organizationId, organizationId))
    .limit(1)
  if (!row) return { organizationId, ...DEFAULT_CONFIG }
  return {
    organizationId,
    googlePlaceId: row.googlePlaceId,
    healthgradesUrl: row.healthgradesUrl,
    facebookPageId: row.facebookPageId,
    yelpBusinessSlug: row.yelpBusinessSlug,
    minDaysBetweenRequests: row.minDaysBetweenRequests,
    npsEnabled: row.npsEnabled === 1,
    autoSendEnabled: row.autoSendEnabled === 1,
    autoSendDelayHours: row.autoSendDelayHours,
    privateFeedbackEmail: row.privateFeedbackEmail,
  }
}

export async function updateReviewConfig(
  organizationId: string,
  updates: Partial<Omit<ReviewConfig, 'organizationId'>>,
): Promise<void> {
  const existing = await db
    .select({ org: schema.clinicReviewConfig.organizationId })
    .from(schema.clinicReviewConfig)
    .where(eq(schema.clinicReviewConfig.organizationId, organizationId))
    .limit(1)

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (updates.googlePlaceId !== undefined) patch.googlePlaceId = updates.googlePlaceId
  if (updates.healthgradesUrl !== undefined) patch.healthgradesUrl = updates.healthgradesUrl
  if (updates.facebookPageId !== undefined) patch.facebookPageId = updates.facebookPageId
  if (updates.yelpBusinessSlug !== undefined) patch.yelpBusinessSlug = updates.yelpBusinessSlug
  if (updates.minDaysBetweenRequests !== undefined) patch.minDaysBetweenRequests = updates.minDaysBetweenRequests
  if (updates.npsEnabled !== undefined) patch.npsEnabled = updates.npsEnabled ? 1 : 0
  if (updates.autoSendEnabled !== undefined) patch.autoSendEnabled = updates.autoSendEnabled ? 1 : 0
  if (updates.autoSendDelayHours !== undefined) patch.autoSendDelayHours = updates.autoSendDelayHours
  if (updates.privateFeedbackEmail !== undefined) patch.privateFeedbackEmail = updates.privateFeedbackEmail

  if (existing[0]) {
    await db
      .update(schema.clinicReviewConfig)
      .set(patch)
      .where(eq(schema.clinicReviewConfig.organizationId, organizationId))
  } else {
    await db.insert(schema.clinicReviewConfig).values({
      organizationId,
      ...DEFAULT_CONFIG,
      ...updates,
      npsEnabled: updates.npsEnabled ? 1 : 0,
      autoSendEnabled: updates.autoSendEnabled ? 1 : 0,
    })
  }
}

/** True when the org has at least one review platform configured. */
export function isReviewConfigComplete(config: ReviewConfig): boolean {
  return !!(
    config.googlePlaceId ||
    config.healthgradesUrl ||
    config.facebookPageId ||
    config.yelpBusinessSlug
  )
}

// ── Public-platform URLs ─────────────────────────────────────────────

export function reviewPlatformUrl(site: ReviewSite, config: ReviewConfig): string | null {
  switch (site) {
    case 'google':
      return config.googlePlaceId
        ? `https://search.google.com/local/writereview?placeid=${config.googlePlaceId}`
        : null
    case 'healthgrades':
      // Clinics enter their own Healthgrades URL (no public API for
      // deep-linking write-review the way Google has).
      return config.healthgradesUrl ?? null
    case 'facebook':
      return config.facebookPageId
        ? `https://www.facebook.com/${config.facebookPageId}/reviews`
        : null
    case 'yelp':
      return config.yelpBusinessSlug
        ? `https://www.yelp.com/writeareview/biz/${config.yelpBusinessSlug}`
        : null
  }
}

/**
 * Platforms surfaced on the public landing page, in display order.
 * Google is primary (industry consensus: 80% of dental review value);
 * Healthgrades + Facebook secondary; Yelp last, and ONLY if the org
 * explicitly opts in by filling the slug (Yelp's solicited-review
 * filter makes prompts net-negative — see schema comment).
 */
export function availableSites(config: ReviewConfig): ReviewSite[] {
  const sites: ReviewSite[] = []
  if (config.googlePlaceId) sites.push('google')
  if (config.healthgradesUrl) sites.push('healthgrades')
  if (config.facebookPageId) sites.push('facebook')
  if (config.yelpBusinessSlug) sites.push('yelp')
  return sites
}

export const PLATFORM_LABEL: Record<ReviewSite, string> = {
  google: 'Google',
  healthgrades: 'Healthgrades',
  facebook: 'Facebook',
  yelp: 'Yelp',
}

// ── Eligible patients (ready-to-send list) ───────────────────────────

/**
 * Patients who had a completed visit in the last 30 days, have an email
 * on file, have not already gotten a recent review request, and are
 * opted into marketing email. Drives the "Ready to ask" list on the
 * dashboard.
 */
export async function listEligiblePatients(
  organizationId: string,
  limit = 25,
): Promise<EligiblePatient[]> {
  const config = await getReviewConfig(organizationId)
  const rateLimit = config.minDaysBetweenRequests
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const rateLimitCutoff = new Date(Date.now() - rateLimit * 24 * 60 * 60 * 1000)

  // Completed appointments in the last 30 days
  const completed = await db
    .select({
      appointmentId: schema.appointment.id,
      patientId: schema.appointment.patientId,
      type: schema.appointment.type,
      completedAt: schema.appointment.completedAt,
    })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.status, 'completed'),
        isNotNull(schema.appointment.completedAt),
        gte(schema.appointment.completedAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(schema.appointment.completedAt))

  if (completed.length === 0) return []

  const patientIds = Array.from(new Set(completed.map((c) => c.patientId)))

  // Patients that match: email + opt-in
  const patients = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      marketingEmailOptIn: schema.patient.marketingEmailOptIn,
    })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        inArray(schema.patient.id, patientIds),
        isNotNull(schema.patient.email),
        eq(schema.patient.marketingEmailOptIn, 1),
      ),
    )
  const patientById = new Map(patients.map((p) => [p.id, p]))

  // Recent requests (within rate limit window)
  const recent = await db
    .select({ patientId: schema.reviewRequest.patientId })
    .from(schema.reviewRequest)
    .where(
      and(
        eq(schema.reviewRequest.organizationId, organizationId),
        inArray(schema.reviewRequest.patientId, patientIds),
        gte(schema.reviewRequest.createdAt, rateLimitCutoff),
      ),
    )
  const recentlyAsked = new Set(recent.map((r) => r.patientId))

  const rows: EligiblePatient[] = []
  const seen = new Set<string>()
  for (const c of completed) {
    if (rows.length >= limit) break
    if (recentlyAsked.has(c.patientId)) continue
    if (seen.has(c.patientId)) continue
    const p = patientById.get(c.patientId)
    if (!p) continue
    seen.add(c.patientId)
    rows.push({
      patientId: c.patientId,
      patientName: `${p.firstName} ${p.lastName}`,
      patientEmail: p.email,
      appointmentId: c.appointmentId,
      appointmentType: c.type,
      appointmentCompletedAt: c.completedAt!,
    })
  }
  return rows
}

// ── Send + status mutations ──────────────────────────────────────────

function newRequestId(): string {
  return `revreq_${randomBytes(10).toString('hex')}`
}

function newReviewToken(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Create a review_request row + send via the configured channel. Returns
 * the inserted row id. Throws on rate-limit hit, missing email, or
 * SMS-in-v1.
 */
export async function createAndSendReviewRequest(input: {
  organizationId: string
  patientId: string
  appointmentId?: string
  channel: ReviewChannel
  requestedByUserId: string
}): Promise<{ id: string; token: string }> {
  if (input.channel === 'sms') {
    throw new Error('SMS channel is not enabled in this build (Phase B). Use email.')
  }

  const [patient] = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      marketingEmailOptIn: schema.patient.marketingEmailOptIn,
    })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, input.organizationId),
        eq(schema.patient.id, input.patientId),
      ),
    )
    .limit(1)
  if (!patient) throw new Error('Patient not found')
  if (!patient.email) throw new Error('Patient has no email address on file')
  if (patient.marketingEmailOptIn === 0) {
    throw new Error('Patient has opted out of marketing email')
  }

  const config = await getReviewConfig(input.organizationId)
  if (!isReviewConfigComplete(config)) {
    throw new Error('No review platforms configured. Add a Google Place ID, Yelp business slug, or Facebook page id in Settings.')
  }

  // Rate-limit check
  const rateLimitCutoff = new Date(Date.now() - config.minDaysBetweenRequests * 24 * 60 * 60 * 1000)
  const [recent] = await db
    .select({ id: schema.reviewRequest.id })
    .from(schema.reviewRequest)
    .where(
      and(
        eq(schema.reviewRequest.organizationId, input.organizationId),
        eq(schema.reviewRequest.patientId, input.patientId),
        gte(schema.reviewRequest.createdAt, rateLimitCutoff),
      ),
    )
    .limit(1)
  if (recent) {
    throw new Error(`This patient was already asked within the last ${config.minDaysBetweenRequests} days. Wait it out or adjust the rate-limit in Settings.`)
  }

  const id = newRequestId()
  const token = newReviewToken()
  const now = new Date()

  await db.insert(schema.reviewRequest).values({
    id,
    organizationId: input.organizationId,
    patientId: input.patientId,
    appointmentId: input.appointmentId ?? null,
    requestedByUserId: input.requestedByUserId,
    channel: input.channel,
    status: 'pending',
    token,
    createdAt: now,
    updatedAt: now,
  })

  // Send the email
  const [orgRow] = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, input.organizationId))
    .limit(1)
  const clinicName = orgRow?.name ?? 'your clinic'
  const reviewUrl = buildReviewRedirectUrl(token)

  try {
    await sendReviewRequestEmail({
      to: patient.email,
      patientFirstName: patient.firstName,
      clinicName,
      reviewUrl,
    })
    // Mirror into OD's CommLog so the front desk sees the ask in the chart.
    await queueCommLogWriteBack(input.organizationId, input.patientId, {
      note: `Review request sent: ${reviewUrl}`,
      mode: 'Email',
    })
    await db
      .update(schema.reviewRequest)
      .set({ status: 'sent', sentAt: now, updatedAt: now })
      .where(eq(schema.reviewRequest.id, id))
  } catch (err) {
    await db
      .update(schema.reviewRequest)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'unknown',
        updatedAt: now,
      })
      .where(eq(schema.reviewRequest.id, id))
    throw err
  }

  return { id, token }
}

function buildReviewRedirectUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://dreamcreatestudio.com'
  return `${base}/r/${token}`
}

async function sendReviewRequestEmail(opts: {
  to: string
  patientFirstName: string
  clinicName: string
  reviewUrl: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY env var is not set')
  const resend = new Resend(apiKey)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Quick favor from ${escapeHtml(opts.clinicName)}</title></head>
<body style="margin:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:32px 40px">
    <p style="font-size:15px;line-height:1.55;margin:0 0 16px">Hi ${escapeHtml(opts.patientFirstName)},</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 16px">Thanks for coming in. Quick favor — would you take a minute to share how it went? It really helps other people find us, and your honest take (good, bad, or in-between) is what we want.</p>
    <p style="margin:24px 0">
      <a href="${opts.reviewUrl}" style="display:inline-block;padding:12px 24px;background:#1c1917;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Leave a review</a>
    </p>
    <p style="font-size:13px;line-height:1.55;color:#57534e;margin:24px 0 0">Thank you,<br/>The team at ${escapeHtml(opts.clinicName)}</p>
  </div>
</body></html>`
  const text = `Hi ${opts.patientFirstName},

Thanks for coming in. Quick favor — would you take a minute to share how it went? It really helps other people find us, and your honest take (good, bad, or in-between) is what we want.

Leave a review: ${opts.reviewUrl}

Thank you,
The team at ${opts.clinicName}`
  await resend.emails.send({
    from: `Dream Create <Hello@DreamCreateWeb.com>`,
    to: opts.to,
    subject: `Quick favor from ${opts.clinicName}`,
    html,
    text,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Mark a request 'skipped' — staff decision not to ask. */
export async function skipReviewRequest(
  organizationId: string,
  requestId: string,
): Promise<void> {
  await db
    .update(schema.reviewRequest)
    .set({ status: 'skipped', updatedAt: new Date() })
    .where(
      and(
        eq(schema.reviewRequest.id, requestId),
        eq(schema.reviewRequest.organizationId, organizationId),
      ),
    )
}

// ── Public-side actions (called from /r/<token> route) ───────────────

export interface PublicReviewContext {
  request: {
    id: string
    organizationId: string
    status: ReviewStatus
    selectedSite: ReviewSite | null
  }
  clinicName: string
  config: ReviewConfig
  sites: ReviewSite[]
  patientFirstName: string
}

/**
 * Look up the request + config for the public landing page. Returns null
 * if the token is invalid or the request was deleted.
 */
export async function getPublicReviewContext(token: string): Promise<PublicReviewContext | null> {
  const [row] = await db
    .select({
      requestId: schema.reviewRequest.id,
      organizationId: schema.reviewRequest.organizationId,
      status: schema.reviewRequest.status,
      selectedSite: schema.reviewRequest.selectedSite,
      patientFirstName: schema.patient.firstName,
      clinicName: schema.organization.name,
    })
    .from(schema.reviewRequest)
    .innerJoin(schema.patient, eq(schema.reviewRequest.patientId, schema.patient.id))
    .innerJoin(schema.organization, eq(schema.reviewRequest.organizationId, schema.organization.id))
    .where(eq(schema.reviewRequest.token, token))
    .limit(1)
  if (!row) return null

  const config = await getReviewConfig(row.organizationId)
  return {
    request: {
      id: row.requestId,
      organizationId: row.organizationId,
      status: row.status as ReviewStatus,
      selectedSite: row.selectedSite as ReviewSite | null,
    },
    clinicName: row.clinicName,
    config,
    sites: availableSites(config),
    patientFirstName: row.patientFirstName,
  }
}

/** Record that the patient opened the landing page. */
export async function recordReviewClick(token: string): Promise<void> {
  const now = new Date()
  await db
    .update(schema.reviewRequest)
    .set({
      // Only flip to 'clicked' if currently 'sent' — don't downgrade a
      // 'completed' to 'clicked' if the patient revisits the page.
      status: sql`CASE WHEN ${schema.reviewRequest.status} = 'sent' THEN 'clicked' ELSE ${schema.reviewRequest.status} END`,
      clickedAt: sql`COALESCE(${schema.reviewRequest.clickedAt}, ${now})`,
      updatedAt: now,
    })
    .where(eq(schema.reviewRequest.token, token))
}

/** Record that the patient picked a platform. */
export async function recordReviewCompleted(token: string, site: ReviewSite): Promise<void> {
  const now = new Date()
  await db
    .update(schema.reviewRequest)
    .set({
      status: 'completed',
      selectedSite: site,
      completedAt: sql`COALESCE(${schema.reviewRequest.completedAt}, ${now})`,
      updatedAt: now,
    })
    .where(eq(schema.reviewRequest.token, token))
}

// ── Dashboard reads ──────────────────────────────────────────────────

export async function getReviewStats(organizationId: string): Promise<ReviewStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [sentAgg, clickAgg, completedAgg, pendingAgg, byPlatformRows] = await Promise.all([
    db
      .select({ c: count() })
      .from(schema.reviewRequest)
      .where(
        and(
          eq(schema.reviewRequest.organizationId, organizationId),
          gte(schema.reviewRequest.sentAt, thirtyDaysAgo),
        ),
      )
      .then((r) => Number(r[0]?.c ?? 0)),
    db
      .select({ c: count() })
      .from(schema.reviewRequest)
      .where(
        and(
          eq(schema.reviewRequest.organizationId, organizationId),
          isNotNull(schema.reviewRequest.clickedAt),
          gte(schema.reviewRequest.clickedAt, thirtyDaysAgo),
        ),
      )
      .then((r) => Number(r[0]?.c ?? 0)),
    db
      .select({ c: count() })
      .from(schema.reviewRequest)
      .where(
        and(
          eq(schema.reviewRequest.organizationId, organizationId),
          eq(schema.reviewRequest.status, 'completed'),
          gte(schema.reviewRequest.completedAt, thirtyDaysAgo),
        ),
      )
      .then((r) => Number(r[0]?.c ?? 0)),
    db
      .select({ c: count() })
      .from(schema.reviewRequest)
      .where(
        and(
          eq(schema.reviewRequest.organizationId, organizationId),
          eq(schema.reviewRequest.status, 'pending'),
        ),
      )
      .then((r) => Number(r[0]?.c ?? 0)),
    db
      .select({
        selectedSite: schema.reviewRequest.selectedSite,
        c: count(),
      })
      .from(schema.reviewRequest)
      .where(
        and(
          eq(schema.reviewRequest.organizationId, organizationId),
          eq(schema.reviewRequest.status, 'completed'),
          gte(schema.reviewRequest.completedAt, thirtyDaysAgo),
          isNotNull(schema.reviewRequest.selectedSite),
        ),
      )
      .groupBy(schema.reviewRequest.selectedSite),
  ])

  const byPlatform = { google: 0, healthgrades: 0, facebook: 0, yelp: 0 }
  for (const r of byPlatformRows) {
    if (r.selectedSite === 'google') byPlatform.google = Number(r.c)
    else if (r.selectedSite === 'healthgrades') byPlatform.healthgrades = Number(r.c)
    else if (r.selectedSite === 'facebook') byPlatform.facebook = Number(r.c)
    else if (r.selectedSite === 'yelp') byPlatform.yelp = Number(r.c)
  }

  const eligibleCount = (await listEligiblePatients(organizationId, 1000)).length

  return {
    sent30d: sentAgg,
    clickRate30d: sentAgg > 0 ? Math.round((clickAgg / sentAgg) * 100) : null,
    completionRate30d: clickAgg > 0 ? Math.round((completedAgg / clickAgg) * 100) : null,
    completed30d: completedAgg,
    eligibleCount,
    byPlatform,
    pending: pendingAgg,
  }
}

export async function listReviewRequests(
  organizationId: string,
  limit = 50,
): Promise<ReviewRequestRow[]> {
  const rows = await db
    .select({
      id: schema.reviewRequest.id,
      patientId: schema.reviewRequest.patientId,
      patientFirstName: schema.patient.firstName,
      patientLastName: schema.patient.lastName,
      patientEmail: schema.patient.email,
      appointmentId: schema.reviewRequest.appointmentId,
      channel: schema.reviewRequest.channel,
      status: schema.reviewRequest.status,
      sentAt: schema.reviewRequest.sentAt,
      clickedAt: schema.reviewRequest.clickedAt,
      completedAt: schema.reviewRequest.completedAt,
      selectedSite: schema.reviewRequest.selectedSite,
      rating: schema.reviewRequest.rating,
      createdAt: schema.reviewRequest.createdAt,
    })
    .from(schema.reviewRequest)
    .innerJoin(schema.patient, eq(schema.reviewRequest.patientId, schema.patient.id))
    .where(eq(schema.reviewRequest.organizationId, organizationId))
    .orderBy(desc(schema.reviewRequest.createdAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientName: `${r.patientFirstName} ${r.patientLastName}`,
    patientEmail: r.patientEmail,
    appointmentId: r.appointmentId,
    channel: r.channel as ReviewChannel,
    status: r.status as ReviewStatus,
    sentAt: r.sentAt,
    clickedAt: r.clickedAt,
    completedAt: r.completedAt,
    selectedSite: r.selectedSite as ReviewSite | null,
    rating: r.rating,
    createdAt: r.createdAt,
  }))
}

// Suppress unused-warning imports
void lte
void ne
