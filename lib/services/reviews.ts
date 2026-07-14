import 'server-only'
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { deliver } from '@/lib/email'
import { renderAutomatedEmail } from '@/lib/services/email-automations'
import type { EmailSlots } from '@/lib/types/email-automations'
import { queueCommLogWriteBack } from '@/lib/services/pms/sync'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { getGoogleReviewStats, listFeaturableGoogleReviews } from '@/lib/services/google-reviews'
import type { ClinicTestimonial } from '@/lib/types/clinic-content'

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
  /** Minimum star rating a Google review needs to auto-feature on the public
   *  site. 4 = feature 4★ + 5★ (default); 5 = 5★ only. */
  featureMinStars: number
  /** Whether the /r/<token> landing shows the optional "tell us privately"
   *  path (feedback routed to staff, never public). Shown to everyone. */
  showPrivateFeedback: boolean
  /** Optional "How was your visit?" ask before the platform links. Every
   *  rating sees the SAME public links (FTC-clean) — a low rating just
   *  LEADS with the private-feedback form. Off by default. */
  starGateEnabled: boolean
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
  /** The window these stats cover, in days (30 by default; 90 from the
   *  Analytics range toggle). The `*30d` field-name suffixes below are a
   *  legacy default-window label — the VALUES reflect `windowDays`. */
  windowDays: number
  /** Total requests sent in the window. */
  sent30d: number
  /** Sent → clicked (opened the review link) rate as a percentage (0-100),
   *  null if no sends. There is no email-open tracking on review_request —
   *  `clicked` (the patient opened the /r/<token> landing) is the only real
   *  engagement signal we measure, so the funnel is Sent → Opened → Reviewed. */
  clickRate30d: number | null
  /** Clicked → completed rate as a percentage, null if no clicks. */
  completionRate30d: number | null
  /** Requests whose link was opened (clicked) within the window — a real,
   *  measured count (NOT reconstructed from a rate). */
  clicked30d: number
  /** Total completed (proxy for "left a review") in the window. */
  completed30d: number
  /** Eligible patients: had a completed visit in last 30d, no recent
   * request, has email. Drives the "ready to send" CTA. Always 30-day
   * scoped (the ask cadence), independent of the stats window. */
  eligibleCount: number
  /** Per-site completion breakdown for the window. */
  byPlatform: { google: number; healthgrades: number; facebook: number; yelp: number }
  /** Pending requests not yet sent (all-time, not window-scoped). */
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
  // Auto-ask after a visit is marked completed — ON by default (the module is
  // built around this loop). Delay 0 = fire immediately from markCompleted(); a
  // positive delay defers to the hourly cron. Still gated at send time by a
  // configured platform + patient opt-in + rate limit.
  autoSendEnabled: true,
  autoSendDelayHours: 0,
  // Auto-feature 4★+ Google reviews on the public site by default.
  featureMinStars: 4,
  // Offer the optional private-feedback path on the review landing by default.
  showPrivateFeedback: true,
  // The star ask is opt-in — clinics choose the triage flow deliberately.
  starGateEnabled: false,
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
    featureMinStars: row.featureMinStars,
    showPrivateFeedback: row.showPrivateFeedback === 1,
    starGateEnabled: row.starGateEnabled === 1,
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

  // Column-shaped patch (booleans → 0/1). Only keys present in `updates` are set.
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (updates.googlePlaceId !== undefined) patch.googlePlaceId = updates.googlePlaceId
  if (updates.healthgradesUrl !== undefined) patch.healthgradesUrl = updates.healthgradesUrl
  if (updates.facebookPageId !== undefined) patch.facebookPageId = updates.facebookPageId
  if (updates.yelpBusinessSlug !== undefined) patch.yelpBusinessSlug = updates.yelpBusinessSlug
  if (updates.minDaysBetweenRequests !== undefined) patch.minDaysBetweenRequests = updates.minDaysBetweenRequests
  if (updates.npsEnabled !== undefined) patch.npsEnabled = updates.npsEnabled ? 1 : 0
  if (updates.autoSendEnabled !== undefined) patch.autoSendEnabled = updates.autoSendEnabled ? 1 : 0
  if (updates.autoSendDelayHours !== undefined) patch.autoSendDelayHours = updates.autoSendDelayHours
  if (updates.featureMinStars !== undefined) patch.featureMinStars = updates.featureMinStars
  if (updates.showPrivateFeedback !== undefined) patch.showPrivateFeedback = updates.showPrivateFeedback ? 1 : 0
  if (updates.starGateEnabled !== undefined) patch.starGateEnabled = updates.starGateEnabled ? 1 : 0
  if (updates.privateFeedbackEmail !== undefined) patch.privateFeedbackEmail = updates.privateFeedbackEmail

  if (existing[0]) {
    await db
      .update(schema.clinicReviewConfig)
      .set(patch)
      .where(eq(schema.clinicReviewConfig.organizationId, organizationId))
  } else {
    // Insert: start from DEFAULT_CONFIG converted to column (int) shape, then
    // overlay the (already column-shaped) patch. Rebuilding the row explicitly
    // avoids spreading boolean defaults into integer columns.
    await db.insert(schema.clinicReviewConfig).values({
      organizationId,
      googlePlaceId: DEFAULT_CONFIG.googlePlaceId,
      healthgradesUrl: DEFAULT_CONFIG.healthgradesUrl,
      facebookPageId: DEFAULT_CONFIG.facebookPageId,
      yelpBusinessSlug: DEFAULT_CONFIG.yelpBusinessSlug,
      minDaysBetweenRequests: DEFAULT_CONFIG.minDaysBetweenRequests,
      npsEnabled: DEFAULT_CONFIG.npsEnabled ? 1 : 0,
      autoSendEnabled: DEFAULT_CONFIG.autoSendEnabled ? 1 : 0,
      autoSendDelayHours: DEFAULT_CONFIG.autoSendDelayHours,
      featureMinStars: DEFAULT_CONFIG.featureMinStars,
      showPrivateFeedback: DEFAULT_CONFIG.showPrivateFeedback ? 1 : 0,
      starGateEnabled: DEFAULT_CONFIG.starGateEnabled ? 1 : 0,
      privateFeedbackEmail: DEFAULT_CONFIG.privateFeedbackEmail,
      ...patch,
    })
  }
}

// ── Auto-send eligibility helpers ────────────────────────────────────

/** Auto-send is active when the clinic left it on AND has a platform set up. */
export function autoSendActive(config: ReviewConfig): boolean {
  return config.autoSendEnabled && isReviewConfigComplete(config)
}

/** Send the request the moment a visit is marked completed (delay 0). A
 *  positive delay defers to the hourly cron instead. */
export function shouldSendImmediately(config: ReviewConfig): boolean {
  return autoSendActive(config) && config.autoSendDelayHours === 0
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
        // Don't let a failed/skipped send hide a patient from "Ready to ask".
        ne(schema.reviewRequest.status, 'failed'),
        ne(schema.reviewRequest.status, 'skipped'),
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
  /** User who clicked Send (manual flow), or null for system-initiated
   *  sends (auto-trigger cron). The column is nullable; we record null
   *  rather than impersonating a staff user. */
  requestedByUserId: string | null
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
        // A failed/skipped send never reached the patient — it must not lock
        // them out of a real ask for the whole rate-limit window.
        ne(schema.reviewRequest.status, 'failed'),
        ne(schema.reviewRequest.status, 'skipped'),
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
    requestedByUserId: input.requestedByUserId ?? null,
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
  const sender = await getClinicSenderIdentity(input.organizationId)
  const clinicName = sender.name || orgRow?.name || 'your clinic'
  const reviewUrl = buildReviewRedirectUrl(token)

  // Editable copy (Settings → Automations → Emails). Auto-send on/off + timing
  // live in clinic_review_config; this is content only, so no enable check here.
  const rendered = await renderAutomatedEmail(input.organizationId, 'review_request', {
    firstName: patient.firstName,
    clinicName,
  })

  try {
    await sendReviewRequestEmail({
      to: patient.email,
      reviewUrl,
      content: rendered.full,
      from: sender.from,
      replyTo: sender.replyTo,
      gmail: sender.gmail,
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
  reviewUrl: string
  /** Clinic-editable, token-filled slots (Settings → Automations → Emails). */
  content: EmailSlots
  /** Per-clinic From header + Reply-To so the ask comes FROM the clinic. */
  from?: string
  replyTo?: string | null
  /** Tier 2: send via the clinic's connected Gmail account AS their address. */
  gmail?: { accountId: string; from: string }
}): Promise<void> {
  const subject = opts.content.subject
  const headingHtml = opts.content.heading != null ? slotToHtml(opts.content.heading) : ''
  const bodyHtml = slotToHtml(opts.content.body)
  const closingHtml = opts.content.closing != null ? slotToHtml(opts.content.closing) : ''
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:32px 40px">
    <p style="font-size:15px;line-height:1.55;margin:0 0 16px">${headingHtml}</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 16px">${bodyHtml}</p>
    <p style="margin:24px 0">
      <a href="${opts.reviewUrl}" style="display:inline-block;padding:12px 24px;background:#1c1917;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Leave a review</a>
    </p>
    <p style="font-size:13px;line-height:1.55;color:#57534e;margin:24px 0 0">${closingHtml}</p>
  </div>
</body></html>`

  // Route through the shared deliver() path — the SAME provider/driver/Gmail-
  // fallback every other patient-facing send uses. This drops the duplicate
  // Resend client + its stale hardcoded `Dream Create <Hello@DreamCreateWeb.com>`
  // From; the clinic sender identity (Tier 1/2) supplied by the caller now owns
  // the From + Reply-To + Gmail routing.
  await deliver({
    to: opts.to,
    from: opts.from,
    replyTo: opts.replyTo,
    gmail: opts.gmail,
    subject,
    html,
  })
}

/** Escape + honour clinic line breaks — the trust boundary for editable review
 *  copy (mirrors slotToHtml in lib/email.ts). */
function slotToHtml(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>')
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
  /** The Google "write a review" deep link when the clinic has a Place ID —
   *  the PRIMARY call to action on the landing page. Null when unset. */
  googleUrl: string | null
  /** Whether to show the optional "rather tell us privately?" path. */
  showPrivateFeedback: boolean
  /** The opt-in "How was your visit?" star ask (see ReviewConfig). */
  starGateEnabled: boolean
  patientFirstName: string
  /** Legacy first-party review text (pre-redesign). Kept so an old completed
   *  request still shows the patient their words back. Null otherwise. */
  existingReviewText: string | null
  existingRating: number | null
  /** Private note the patient already left for the team (never public). Shown
   *  back on the "already done" branch so they know it landed. */
  existingPrivateFeedback: string | null
  /** Clinic branding so the public review page wears the clinic's identity
   *  (warm ground + brand accent + logo + name) rather than generic gray. */
  clinic: {
    displayName: string | null
    brandColor: string | null
    logoUrl: string | null
    slug: string | null
    websiteDomain: string | null
  }
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
      reviewText: schema.reviewRequest.reviewText,
      privateFeedback: schema.reviewRequest.privateFeedback,
      rating: schema.reviewRequest.rating,
      patientFirstName: schema.patient.firstName,
      clinicName: schema.organization.name,
      orgSlug: schema.organization.slug,
      displayName: schema.clinicProfile.displayName,
      brandColor: schema.clinicProfile.brandColor,
      logoUrl: schema.clinicProfile.logoUrl,
      websiteDomain: schema.clinicProfile.websiteDomain,
    })
    .from(schema.reviewRequest)
    .innerJoin(schema.patient, eq(schema.reviewRequest.patientId, schema.patient.id))
    .innerJoin(schema.organization, eq(schema.reviewRequest.organizationId, schema.organization.id))
    .leftJoin(schema.clinicProfile, eq(schema.clinicProfile.organizationId, schema.reviewRequest.organizationId))
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
    googleUrl: reviewPlatformUrl('google', config),
    showPrivateFeedback: config.showPrivateFeedback,
    starGateEnabled: config.starGateEnabled,
    patientFirstName: row.patientFirstName,
    existingReviewText: row.reviewText,
    existingRating: row.rating,
    existingPrivateFeedback: row.privateFeedback,
    clinic: {
      displayName: row.displayName ?? null,
      brandColor: row.brandColor ?? null,
      logoUrl: row.logoUrl ?? null,
      slug: row.orgSlug ?? null,
      websiteDomain: row.websiteDomain ?? null,
    },
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

/**
 * Record the star-gate rating the patient picked on the landing (the opt-in
 * "How was your visit?" ask). Rating only — the patient hasn't chosen a
 * destination yet; a later platform tap / private note completes the funnel.
 * Never downgrades: an existing rating (e.g. from private feedback) wins.
 */
export async function recordGateRating(
  token: string,
  rating: number,
): Promise<{ ok: boolean }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false }
  await db
    .update(schema.reviewRequest)
    .set({
      rating: sql`COALESCE(${schema.reviewRequest.rating}, ${rating})`,
      updatedAt: new Date(),
    })
    .where(eq(schema.reviewRequest.token, token))
  return { ok: true }
}

/**
 * Submit the actual review text + optional rating on the public landing
 * page. This is the PRIMARY completion path (the old "tap a platform"
 * path stays as a secondary action — "would you also share on Google?").
 * Idempotent on second submit: overwrites the text + rating, keeps the
 * earliest completedAt. Returns ok=false instead of throwing when the
 * token is invalid so the public page can render a friendly state.
 */
export async function submitReviewText(input: {
  token: string
  text: string
  rating?: number | null
}): Promise<{ ok: true; organizationId: string; patientId: string } | { ok: false; error: string }> {
  const text = input.text.trim()
  if (!text) return { ok: false, error: 'Please write a review before submitting.' }
  if (text.length > 2000) return { ok: false, error: 'Reviews must be 2000 characters or fewer.' }
  if (input.rating != null && (input.rating < 1 || input.rating > 5)) {
    return { ok: false, error: 'Rating must be 1–5.' }
  }

  const [row] = await db
    .select({
      id: schema.reviewRequest.id,
      organizationId: schema.reviewRequest.organizationId,
      patientId: schema.reviewRequest.patientId,
      status: schema.reviewRequest.status,
    })
    .from(schema.reviewRequest)
    .where(eq(schema.reviewRequest.token, input.token))
    .limit(1)
  if (!row) return { ok: false, error: 'This review link is no longer valid.' }

  // Only an in-flight (or already-completed, for an edit) request may be
  // submitted. Without this, any held/forwarded token could resurrect a
  // staff-`skipped` request to `completed` (re-surfacing a patient the clinic
  // deliberately chose not to ask) or complete a `failed` send (which never
  // reached the patient and must not lock the rate limit). recordReviewClick
  // only promotes 'sent'->'clicked', so skipped/failed never sneak in via a click.
  const SUBMITTABLE_STATUSES = new Set(['sent', 'clicked', 'completed'])
  if (!SUBMITTABLE_STATUSES.has(row.status)) {
    return { ok: false, error: 'This review link is no longer active.' }
  }

  const now = new Date()
  await db
    .update(schema.reviewRequest)
    .set({
      status: 'completed',
      reviewText: text,
      ...(input.rating != null ? { rating: input.rating } : {}),
      completedAt: sql`COALESCE(${schema.reviewRequest.completedAt}, ${now})`,
      updatedAt: now,
    })
    .where(eq(schema.reviewRequest.id, row.id))

  // Ping the front desk so a fresh review can be featured (or a low rating
  // followed up) promptly. Best-effort — the completion above is the truth.
  try {
    const [p] = await db
      .select({ firstName: schema.patient.firstName, lastName: schema.patient.lastName, email: schema.patient.email })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, row.organizationId), eq(schema.patient.id, row.patientId)))
      .limit(1)
    const who = p ? `${p.firstName} ${p.lastName}`.trim() : 'a patient'
    const rating = input.rating ?? null
    // A 1–2★ submission is a SERVICE-RECOVERY moment: the patient is unhappy and
    // hasn't posted publicly yet. Escalate it (urgent title + force-email even if
    // push is muted) so an owner can reach out personally before they leave a
    // public 1★. We do NOT change the patient-facing "share publicly" CTA — that
    // stays the same for everyone (FTC-clean, no review gating).
    const lowRating = rating != null && rating <= 2
    const stars = rating != null ? `${rating}★ ` : ''
    const { notifyOrgMembers } = await import('@/lib/services/notifications')
    await notifyOrgMembers(
      row.organizationId,
      lowRating
        ? {
            bucket: 'comments',
            type: 'review_low_rating',
            title: `⚠️ ${rating}★ review from ${who} — reach out before it goes public`,
            body: `“${text.slice(0, 120)}” — a quick personal follow-up now is the best save.`,
            linkPath: '/growth/reviews/received',
            forceEmail: true,
            meta: { reviewRequestId: row.id, patientId: row.patientId, rating },
          }
        : {
            bucket: 'comments',
            type: 'review_submitted',
            title: `New review — ${stars}from ${who}`.replace('  ', ' '),
            body: text.slice(0, 140),
            linkPath: '/growth/reviews/received',
            meta: { reviewRequestId: row.id, patientId: row.patientId, rating },
          },
      // Never notify the reviewer about their own review — when the acting
      // patient's email belongs to a staff-hat user (owner who is also a
      // patient, or a platform admin demoing), the alert must not land in
      // the inbox that just submitted it.
      { roles: ['owner', 'admin'], excludeEmail: p?.email ?? null },
    )
  } catch (err) {
    console.warn('[reviews.submitReviewText] notification failed', err)
  }

  return { ok: true, organizationId: row.organizationId, patientId: row.patientId }
}

/**
 * Submit PRIVATE feedback from the /r/<token> landing — the optional "rather
 * tell us privately?" path. Writes `review_request.privateFeedback` (NOT
 * `reviewText`, so it can NEVER become a public testimonial) + marks the
 * request completed + pings the front desk. Shown to every patient equally
 * alongside the Google button (no rating gating → FTC-clean). Returns ok=false
 * rather than throwing so the public page can render a friendly state.
 */
export async function submitPrivateFeedback(input: {
  token: string
  text: string
  rating?: number | null
}): Promise<{ ok: true; organizationId: string; patientId: string } | { ok: false; error: string }> {
  const text = input.text.trim()
  if (!text) return { ok: false, error: 'Please write a note before sending.' }
  if (text.length > 2000) return { ok: false, error: 'Feedback must be 2000 characters or fewer.' }
  if (input.rating != null && (input.rating < 1 || input.rating > 5)) {
    return { ok: false, error: 'Rating must be 1–5.' }
  }

  const [row] = await db
    .select({
      id: schema.reviewRequest.id,
      organizationId: schema.reviewRequest.organizationId,
      patientId: schema.reviewRequest.patientId,
      status: schema.reviewRequest.status,
    })
    .from(schema.reviewRequest)
    .where(eq(schema.reviewRequest.token, input.token))
    .limit(1)
  if (!row) return { ok: false, error: 'This link is no longer valid.' }

  // Same gate as submitReviewText: only a live request may be completed, so a
  // replayed token can't resurrect a skipped/failed request.
  const SUBMITTABLE_STATUSES = new Set(['sent', 'clicked', 'completed'])
  if (!SUBMITTABLE_STATUSES.has(row.status)) {
    return { ok: false, error: 'This link is no longer active.' }
  }

  const now = new Date()
  await db
    .update(schema.reviewRequest)
    .set({
      status: 'completed',
      selectedSite: 'private_feedback',
      privateFeedback: text,
      ...(input.rating != null ? { rating: input.rating } : {}),
      completedAt: sql`COALESCE(${schema.reviewRequest.completedAt}, ${now})`,
      updatedAt: now,
    })
    .where(eq(schema.reviewRequest.id, row.id))

  // The patient chose to tell the office something — always ping staff. A low
  // rating force-emails even if push is muted (service-recovery moment). Never
  // touches the public site (privateFeedback is not reviewText).
  try {
    const [p] = await db
      .select({ firstName: schema.patient.firstName, lastName: schema.patient.lastName, email: schema.patient.email })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, row.organizationId), eq(schema.patient.id, row.patientId)))
      .limit(1)
    const who = p ? `${p.firstName} ${p.lastName}`.trim() : 'a patient'
    const rating = input.rating ?? null
    const lowRating = rating != null && rating <= 2
    const { notifyOrgMembers } = await import('@/lib/services/notifications')
    await notifyOrgMembers(
      row.organizationId,
      {
        bucket: 'comments',
        type: lowRating ? 'review_low_rating' : 'private_feedback',
        title: lowRating
          ? `⚠️ Private feedback from ${who} — worth a personal reach-out`
          : `Private feedback from ${who}`,
        body: text.slice(0, 140),
        linkPath: '/growth/reviews',
        linkLabel: 'Open the private feedback inbox →',
        forceEmail: lowRating,
        meta: { reviewRequestId: row.id, patientId: row.patientId, rating },
      },
      // Never notify the reviewer about their own review — when the acting
      // patient's email belongs to a staff-hat user (owner who is also a
      // patient, or a platform admin demoing), the alert must not land in
      // the inbox that just submitted it.
      { roles: ['owner', 'admin'], excludeEmail: p?.email ?? null },
    )
  } catch (err) {
    console.warn('[reviews.submitPrivateFeedback] notification failed', err)
  }

  return { ok: true, organizationId: row.organizationId, patientId: row.patientId }
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
    // Same gate as submitReviewText: only a live request (sent/clicked/completed)
    // can be completed. A 'skipped' (staff chose not to ask) or 'failed' (never
    // reached the patient) request must NOT be resurrected by a replayed token.
    .where(
      and(
        eq(schema.reviewRequest.token, token),
        inArray(schema.reviewRequest.status, ['sent', 'clicked', 'completed']),
      ),
    )
}

// ── Dashboard reads ──────────────────────────────────────────────────

/**
 * All-time count of completed `review_request` rows for the org. Used by
 * the public site's "happy patients" trust stat — clinics with 5 completed
 * reviews show "5", clinics with 8,500 show "8k+". The single source of
 * truth so the homepage doesn't lie. See `formatReviewCount` in
 * `components/clinic-site/templates/modern/home.tsx` for display formatting.
 *
 * Not 30-day-scoped: the trust stat is cumulative ("we've made N patients
 * happy"), not a recent-activity gauge. `getReviewStats` covers the 30-day
 * funnel for the dashboard.
 */
export async function getCompletedReviewCount(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.reviewRequest)
    .where(
      and(
        eq(schema.reviewRequest.organizationId, organizationId),
        isNotNull(schema.reviewRequest.completedAt),
      ),
    )
  return Number(row?.c ?? 0)
}

/**
 * Review funnel stats for the dashboard + the Analytics Reputation band.
 *
 * `windowDays` (30 default; 90 from the Analytics range toggle) scopes the
 * sent / clicked / completed / platform-mix aggregates. Only `clicked`
 * (the patient opened the /r/<token> landing) is a measured engagement
 * signal — review_request has no email-open tracking — so the funnel is
 * Sent → Opened (clicked) → Reviewed, with no reconstructed-from-a-rate
 * counts. `eligibleCount` stays 30-day scoped (the ask cadence) and
 * `pending` is all-time, independent of the window.
 */
export async function getReviewStats(
  organizationId: string,
  windowDays = 30,
  opts: { includeEligible?: boolean } = {},
): Promise<ReviewStats> {
  // The eligible-patients scan (3 queries, up to 1000 rows) is only for the
  // "Ready to ask" KPI on the Reviews dashboard. Analytics never reads it, and
  // the dashboard page now computes the eligible LIST itself (and passes the
  // count down) — so both callers pass includeEligible:false to skip it.
  const { includeEligible = true } = opts
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const [sentAgg, clickAgg, completedAgg, pendingAgg, byPlatformRows] = await Promise.all([
    db
      .select({ c: count() })
      .from(schema.reviewRequest)
      .where(
        and(
          eq(schema.reviewRequest.organizationId, organizationId),
          gte(schema.reviewRequest.sentAt, since),
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
          gte(schema.reviewRequest.clickedAt, since),
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
          gte(schema.reviewRequest.completedAt, since),
          // Private feedback ("tell us privately") never became a public
          // review — counting it made the "Reviewed" headline exceed the
          // platform-mix bars beneath it. It has its own inbox on
          // /growth/reviews/received.
          or(
            isNull(schema.reviewRequest.selectedSite),
            ne(schema.reviewRequest.selectedSite, 'private_feedback'),
          ),
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
          gte(schema.reviewRequest.completedAt, since),
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

  const eligibleCount = includeEligible
    ? (await listEligiblePatients(organizationId, 1000)).length
    : 0

  return {
    windowDays,
    sent30d: sentAgg,
    // Clamp to 100%: the numerator (clicked/completed IN the window) and the
    // denominator (sent IN the window) are counted independently, so a request
    // sent before the window but clicked/completed inside it can push the raw
    // ratio over 100% — which reads as broken. Clamp so the KPI stays sane.
    clickRate30d: sentAgg > 0 ? Math.min(100, Math.round((clickAgg / sentAgg) * 100)) : null,
    completionRate30d: clickAgg > 0 ? Math.min(100, Math.round((completedAgg / clickAgg) * 100)) : null,
    clicked30d: clickAgg,
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

// ── Private feedback (received) ───────────────────────────────────────

export interface PrivateFeedbackRow {
  id: string
  patientId: string
  patientName: string
  privateFeedback: string
  rating: number | null
  completedAt: Date | null
}

/**
 * Private notes patients left via the "tell us privately" path on the review
 * landing — NEVER shown publicly. Powers the private-feedback inbox on the
 * Reviews dashboard so the front desk can follow up. Keyed off the
 * `privateFeedback` column, distinct from the legacy public `reviewText`
 * column (no longer written by anything — public reviews go through Google).
 */
export async function listPrivateFeedback(
  organizationId: string,
  limit = 50,
): Promise<PrivateFeedbackRow[]> {
  const rows = await db
    .select({
      id: schema.reviewRequest.id,
      patientId: schema.reviewRequest.patientId,
      patientFirstName: schema.patient.firstName,
      patientLastName: schema.patient.lastName,
      privateFeedback: schema.reviewRequest.privateFeedback,
      rating: schema.reviewRequest.rating,
      completedAt: schema.reviewRequest.completedAt,
    })
    .from(schema.reviewRequest)
    .innerJoin(schema.patient, eq(schema.reviewRequest.patientId, schema.patient.id))
    .where(
      and(
        eq(schema.reviewRequest.organizationId, organizationId),
        isNotNull(schema.reviewRequest.privateFeedback),
      ),
    )
    .orderBy(desc(schema.reviewRequest.completedAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientName: `${r.patientFirstName} ${r.patientLastName}`,
    privateFeedback: r.privateFeedback ?? '',
    rating: r.rating,
    completedAt: r.completedAt,
  }))
}

/**
 * Patient ids already represented in clinic_profile.testimonials. Used to
 * badge the "Reviews received" rows as "Featured ✓" + prevent
 * double-promotion of the same patient.
 */
export async function listFeaturedTestimonialPatientIds(
  organizationId: string,
): Promise<Set<string>> {
  const [profile] = await db
    .select({ testimonials: schema.clinicProfile.testimonials })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const list = (profile?.testimonials ?? []) as ClinicTestimonial[]
  const out = new Set<string>()
  for (const t of list) {
    if (t.patientId) out.add(t.patientId)
  }
  return out
}

/** The "proof" your review program puts on your public website — the
 *  testimonials currently showcased (drillable to each patient) + the live
 *  Google star snippet. Current-state, not windowed: featuring + the rating
 *  are an ongoing presence, not a 30-day event. Feeds the Analytics Reputation
 *  band so a clinic can see reviews → public credibility → acquisition. */
export interface ReviewsProof {
  featuredCount: number
  /** Capped sample of testimonials live on the site, for drill chips. */
  featured: Array<{ patientId: string | null; label: string }>
  /** The star snippet patients see on the site + in search (Google). */
  googleRating: number | null
  googleCount: number
}

export async function getReviewsProof(organizationId: string): Promise<ReviewsProof> {
  const [profileRows, google, googleFeatured] = await Promise.all([
    db
      .select({ testimonials: schema.clinicProfile.testimonials })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1),
    getGoogleReviewStats(organizationId),
    // 4★+ Google reviews auto-feature on the public site — count them in the
    // "proof" alongside the manual testimonials so Analytics reflects reality.
    listFeaturableGoogleReviews(organizationId).catch(() => []),
  ])
  const list = (profileRows[0]?.testimonials ?? []) as ClinicTestimonial[]
  const manual = list.map((t) => ({
    patientId: t.patientId ?? null,
    label: t.authorLocation ? `${t.authorName} · ${t.authorLocation}` : t.authorName,
  }))
  const fromGoogle = googleFeatured.map((t) => ({
    patientId: null as string | null,
    label: `${t.authorName} · Google`,
  }))
  const featured = [...manual, ...fromGoogle]
  return {
    featuredCount: featured.length,
    featured: featured.slice(0, 8),
    googleRating: google.averageRating,
    googleCount: google.count,
  }
}

// ── Shared per-appointment send (immediate trigger + cron) ───────────

/** Classify a createAndSendReviewRequest failure: expected user-state guard
 *  misses ("opted out", "no email", already asked, no platforms) are a benign
 *  'skipped'; anything else is a real 'failed' worth surfacing. */
function classifyReviewSendError(msg: string): 'skipped' | 'failed' {
  if (
    msg.includes('opted out') ||
    msg.includes('no email') ||
    msg.includes('already asked') ||
    msg.includes('No review platforms')
  ) {
    return 'skipped'
  }
  return 'failed'
}

/**
 * Fire a review request for ONE completed appointment — the single send path
 * shared by the immediate `markCompleted()` trigger AND the hourly cron.
 *
 * The per-appointment idempotency guard lives HERE (a SELECT on appointmentId).
 * This is what makes the immediate send and the cron mutually exclusive:
 * whichever fires first writes a review_request row pointing at the appointment,
 * and the other then no-ops. (createAndSendReviewRequest itself only dedupes by
 * patient rate-limit, NOT by appointmentId, so this guard is load-bearing.)
 * Never throws — returns the outcome so callers can be best-effort.
 */
export async function fireReviewRequestForAppointment(
  organizationId: string,
  appointmentId: string,
  patientId: string,
  sendFn: typeof createAndSendReviewRequest = createAndSendReviewRequest,
): Promise<{ outcome: 'sent' | 'skipped' | 'failed'; error?: string }> {
  const [existing] = await db
    .select({ id: schema.reviewRequest.id })
    .from(schema.reviewRequest)
    .where(eq(schema.reviewRequest.appointmentId, appointmentId))
    .limit(1)
  if (existing) return { outcome: 'skipped' }
  try {
    await sendFn({
      organizationId,
      patientId,
      appointmentId,
      channel: 'email',
      requestedByUserId: null,
    })
    return { outcome: 'sent' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    const outcome = classifyReviewSendError(msg)
    return outcome === 'failed' ? { outcome, error: msg } : { outcome }
  }
}

// ── Auto-send cron sweep ─────────────────────────────────────────────
//
// Triggered by the EventBridge → /api/cron/auto-send-reviews schedule
// (hourly). It's the SAFETY NET for the immediate markCompleted() trigger:
// it catches appointments completed while a clinic had a positive delay set,
// or where the immediate send was missed. Running multiple times is safe —
// fireReviewRequestForAppointment's per-appointment guard means only the
// FIRST visit to a completed appointment fires a send.
//
// Per-appointment idempotency: the query left-joins reviewRequest on
// appointmentId and only surfaces appointments with no review_request row yet;
// fireReviewRequestForAppointment re-checks the same guard before sending.
//
// Per-appointment idempotency: we left-join reviewRequest on
// appointmentId and only attempt sends where no review_request row
// already points at the appointment. So a failed send (Resend down,
// patient bounced, etc) doesn't block a manual retry from the staff
// dashboard — but it DOES block the cron from re-firing on the next
// hourly tick, which is the right call (the front desk knows their
// patient + the failure mode better than the cron does).

export interface AutoSendResult {
  scanned: number
  sent: number
  /** Skipped per the createAndSendReviewRequest guards (opted out,
   *  no email, rate-limited, no platforms configured). Expected, fine. */
  skipped: number
  /** Send actually failed (Resend error, DB error). Worth alerting on. */
  failed: number
  errors: Array<{ organizationId: string; appointmentId: string; error: string }>
}

export async function autoSendDueReviewRequests(opts?: {
  now?: Date
  /** Optional override for the actual send call. Production passes
   *  nothing (defaults to the in-module createAndSendReviewRequest);
   *  tests inject a stub to assert orchestration without exercising the
   *  full send path (which has its own dedicated test file). */
  sendFn?: typeof createAndSendReviewRequest
}): Promise<AutoSendResult> {
  const now = opts?.now ?? new Date()
  const send = opts?.sendFn ?? createAndSendReviewRequest

  const orgs = await db
    .select({
      organizationId: schema.clinicReviewConfig.organizationId,
      autoSendDelayHours: schema.clinicReviewConfig.autoSendDelayHours,
    })
    .from(schema.clinicReviewConfig)
    .where(eq(schema.clinicReviewConfig.autoSendEnabled, 1))

  const result: AutoSendResult = { scanned: 0, sent: 0, skipped: 0, failed: 0, errors: [] }

  for (const org of orgs) {
    const config = await getReviewConfig(org.organizationId)
    if (!isReviewConfigComplete(config)) {
      // Auto-send is on but no platform is set up — staff misconfig;
      // skip silently. They'll see Sent=0 on the dashboard.
      continue
    }

    const cutoff = new Date(now.getTime() - (org.autoSendDelayHours ?? 24) * 60 * 60 * 1000)
    // Ask-while-fresh floor: never auto-request a review for a visit completed
    // more than 7 days ago. Without it, flipping auto-send ON (or a long cron
    // outage) would blast requests for months-old visits — embarrassing asks
    // the patient no longer connects to anything. 7 days generously covers the
    // real safety-net cases (configured delays up to 48h + missed ticks).
    const freshFloor = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const candidates = await db
      .select({
        appointmentId: schema.appointment.id,
        patientId: schema.appointment.patientId,
      })
      .from(schema.appointment)
      .leftJoin(
        schema.reviewRequest,
        eq(schema.reviewRequest.appointmentId, schema.appointment.id),
      )
      .where(
        and(
          eq(schema.appointment.organizationId, org.organizationId),
          eq(schema.appointment.status, 'completed'),
          lte(schema.appointment.completedAt, cutoff),
          gte(schema.appointment.completedAt, freshFloor),
          isNull(schema.reviewRequest.id),
        ),
      )
      .limit(100)

    for (const c of candidates) {
      result.scanned++
      const r = await fireReviewRequestForAppointment(
        org.organizationId,
        c.appointmentId,
        c.patientId,
        send,
      )
      if (r.outcome === 'sent') {
        result.sent++
      } else if (r.outcome === 'skipped') {
        result.skipped++
      } else {
        result.failed++
        result.errors.push({
          organizationId: org.organizationId,
          appointmentId: c.appointmentId,
          error: r.error ?? 'unknown',
        })
      }
    }
  }

  return result
}

// Suppress unused-warning imports
void ne
