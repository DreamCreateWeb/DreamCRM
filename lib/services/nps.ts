import 'server-only'
import { randomBytes } from 'crypto'
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { authEmailShell, deliver } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { newId } from '@/lib/utils'

/**
 * Post-visit NPS surveys (Solutionreach/Lighthouse parity). Opt-in per clinic
 * (clinic_review_config.nps_enabled, default OFF): three days after a
 * completed visit the patient gets a one-question email → the public
 * /n/[token] landing (token-is-auth) records 0–10 + an optional comment.
 * Detractors (0–6) escalate to staff like 1–2★ review feedback does.
 *
 * Deliberately separate from review requests (which ask for a PUBLIC Google
 * review right after the visit): the survey is private pulse-taking, delayed
 * three days so the same patient never gets two asks in one afternoon, and
 * throttled to one survey per patient per 180 days.
 */

const SURVEY_DELAY_DAYS = 3
const SURVEY_WINDOW_DAYS = 10 // visits older than this never get a late survey
const PER_PATIENT_THROTTLE_DAYS = 180
const DAY_MS = 24 * 60 * 60 * 1000

const APP_BASE =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://www.dreamcreatestudio.com'

// ── Sending ──────────────────────────────────────────────────────────────────

export interface NpsSurveyRunResult {
  orgsScanned: number
  candidates: number
  sent: number
  throttled: number
  skipped: number
  errors: Array<{ organizationId: string; appointmentId: string; error: string }>
}

/**
 * The daily engine: for every clinic with nps_enabled, survey visits
 * completed SURVEY_DELAY_DAYS..SURVEY_WINDOW_DAYS ago. Idempotent — one
 * survey per appointment ever (nps_response.appointment_id), one per patient
 * per PER_PATIENT_THROTTLE_DAYS. Demo orgs never send.
 */
export async function runDueNpsSurveys(opts?: { now?: Date }): Promise<NpsSurveyRunResult> {
  const now = opts?.now ?? new Date()
  const result: NpsSurveyRunResult = {
    orgsScanned: 0, candidates: 0, sent: 0, throttled: 0, skipped: 0, errors: [],
  }

  const configs = await db
    .select({ organizationId: schema.clinicReviewConfig.organizationId })
    .from(schema.clinicReviewConfig)
    .where(eq(schema.clinicReviewConfig.npsEnabled, 1))

  for (const cfg of configs) {
    const orgId = cfg.organizationId
    const [org] = await db
      .select({ isDemo: schema.organization.isDemo })
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId))
      .limit(1)
    if (org?.isDemo) continue
    result.orgsScanned++

    const windowEnd = new Date(now.getTime() - SURVEY_DELAY_DAYS * DAY_MS)
    const windowStart = new Date(now.getTime() - SURVEY_WINDOW_DAYS * DAY_MS)
    const candidates = await db
      .select({
        appointmentId: schema.appointment.id,
        patientId: schema.appointment.patientId,
        firstName: schema.patient.firstName,
        email: schema.patient.email,
      })
      .from(schema.appointment)
      .innerJoin(schema.patient, eq(schema.appointment.patientId, schema.patient.id))
      .where(
        and(
          eq(schema.appointment.organizationId, orgId),
          eq(schema.appointment.status, 'completed'),
          isNotNull(schema.appointment.completedAt),
          gte(schema.appointment.completedAt, windowStart),
          lte(schema.appointment.completedAt, windowEnd),
          eq(schema.patient.isActive, 1),
          isNotNull(schema.patient.email),
          ne(schema.patient.email, ''),
        ),
      )
      .limit(200)
    if (candidates.length === 0) continue

    // Batch idempotency: appointments already surveyed + patients surveyed
    // within the throttle window.
    const apptIds = candidates.map((c) => c.appointmentId)
    const patientIds = Array.from(new Set(candidates.map((c) => c.patientId).filter((x): x is string => !!x)))
    const [byAppt, byPatient] = await Promise.all([
      db
        .select({ appointmentId: schema.npsResponse.appointmentId })
        .from(schema.npsResponse)
        .where(
          and(
            eq(schema.npsResponse.organizationId, orgId),
            inArray(schema.npsResponse.appointmentId, apptIds),
          ),
        ),
      patientIds.length
        ? db
            .select({ patientId: schema.npsResponse.patientId })
            .from(schema.npsResponse)
            .where(
              and(
                eq(schema.npsResponse.organizationId, orgId),
                inArray(schema.npsResponse.patientId, patientIds),
                gte(schema.npsResponse.sentAt, new Date(now.getTime() - PER_PATIENT_THROTTLE_DAYS * DAY_MS)),
              ),
            )
        : Promise.resolve([]),
    ])
    const surveyedAppts = new Set(byAppt.map((r) => r.appointmentId))
    const throttledPatients = new Set(byPatient.map((r) => r.patientId))
    const sentThisRun = new Set<string>()

    let sender: Awaited<ReturnType<typeof getClinicSenderIdentity>> | null = null

    for (const c of candidates) {
      result.candidates++
      if (!c.patientId || !c.email) { result.skipped++; continue }
      if (surveyedAppts.has(c.appointmentId)) { result.skipped++; continue }
      if (throttledPatients.has(c.patientId) || sentThisRun.has(c.patientId)) {
        result.throttled++
        continue
      }

      try {
        sender ??= await getClinicSenderIdentity(orgId)
        const token = `nps_${randomBytes(16).toString('base64url')}`
        await db.insert(schema.npsResponse).values({
          id: newId('nps'),
          organizationId: orgId,
          patientId: c.patientId,
          appointmentId: c.appointmentId,
          token,
        })
        await deliver({
          to: c.email,
          from: sender.from,
          replyTo: sender.replyTo,
          gmail: sender.gmail,
          subject: `One quick question about your visit — ${sender.name}`,
          html: authEmailShell({
            heading: 'How did we do?',
            introHtml: `Hi ${escapeHtml(c.firstName)},<br><br>Thanks for coming in — one quick question (it takes ten seconds, promise): how likely are you to recommend ${escapeHtml(sender.name)} to a friend?`,
            buttonUrl: `${APP_BASE}/n/${token}`,
            buttonLabel: 'Answer in 10 seconds',
            footnoteHtml:
              'Your answer goes straight to the team — it’s how we get better. Nothing is posted anywhere public.',
          }),
        })
        sentThisRun.add(c.patientId)
        result.sent++
      } catch (err) {
        result.errors.push({
          organizationId: orgId,
          appointmentId: c.appointmentId,
          error: err instanceof Error ? err.message : 'unknown',
        })
      }
    }
  }

  return result
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── The public /n/[token] landing ────────────────────────────────────────────

export interface NpsLandingContext {
  organizationId: string
  clinicName: string
  brandColor: string | null
  logoUrl: string | null
  patientFirstName: string
  /** Already answered → the landing thanks instead of re-asking. */
  score: number | null
  comment: string | null
}

/**
 * The portal's post-visit survey — mint-on-view. When the logged-in patient
 * has a fresh completed visit (within the same SURVEY_WINDOW_DAYS the email
 * engine uses, but with NO delay — they're right here), return an answerable
 * survey token: an existing unanswered row is reused (email- or portal-
 * minted), the 180-day per-patient throttle is honored against ANSWERED rows,
 * and one-row-per-appointment stays true. Returns null when there's nothing
 * to ask — the dashboard simply doesn't render the card. Same npsEnabled
 * switch as the email engine; demo orgs mint nothing.
 */
export async function getOrCreatePortalSurvey(
  organizationId: string,
  patientId: string,
  opts?: { now?: Date },
): Promise<{ token: string } | null> {
  const now = opts?.now ?? new Date()
  const [cfg] = await db
    .select({ enabled: schema.clinicReviewConfig.npsEnabled })
    .from(schema.clinicReviewConfig)
    .where(eq(schema.clinicReviewConfig.organizationId, organizationId))
    .limit(1)
  if (cfg?.enabled !== 1) return null
  const [org] = await db
    .select({ isDemo: schema.organization.isDemo })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1)
  if (org?.isDemo) return null

  const windowStart = new Date(now.getTime() - SURVEY_WINDOW_DAYS * DAY_MS)

  // A fresh unanswered survey already exists → reuse it (don't double-mint).
  const [pending] = await db
    .select({ token: schema.npsResponse.token, sentAt: schema.npsResponse.sentAt })
    .from(schema.npsResponse)
    .where(
      and(
        eq(schema.npsResponse.organizationId, organizationId),
        eq(schema.npsResponse.patientId, patientId),
        isNull(schema.npsResponse.score),
        gte(schema.npsResponse.sentAt, windowStart),
      ),
    )
    .orderBy(desc(schema.npsResponse.sentAt))
    .limit(1)
  if (pending) return { token: pending.token }

  // Throttle: surveyed (and answered, or stale-unanswered) recently → stay quiet.
  const [recent] = await db
    .select({ id: schema.npsResponse.id })
    .from(schema.npsResponse)
    .where(
      and(
        eq(schema.npsResponse.organizationId, organizationId),
        eq(schema.npsResponse.patientId, patientId),
        gte(schema.npsResponse.sentAt, new Date(now.getTime() - PER_PATIENT_THROTTLE_DAYS * DAY_MS)),
      ),
    )
    .limit(1)
  if (recent) return null

  // A completed visit inside the window, not yet surveyed → mint.
  const [visit] = await db
    .select({ id: schema.appointment.id })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.patientId, patientId),
        eq(schema.appointment.status, 'completed'),
        isNotNull(schema.appointment.completedAt),
        gte(schema.appointment.completedAt, windowStart),
      ),
    )
    .orderBy(desc(schema.appointment.completedAt))
    .limit(1)
  if (!visit) return null
  const [surveyed] = await db
    .select({ id: schema.npsResponse.id })
    .from(schema.npsResponse)
    .where(
      and(
        eq(schema.npsResponse.organizationId, organizationId),
        eq(schema.npsResponse.appointmentId, visit.id),
      ),
    )
    .limit(1)
  if (surveyed) return null

  const token = `nps_${randomBytes(16).toString('base64url')}`
  await db.insert(schema.npsResponse).values({
    id: newId('nps'),
    organizationId,
    patientId,
    appointmentId: visit.id,
    token,
  })
  return { token }
}

export async function getNpsByToken(token: string): Promise<NpsLandingContext | null> {
  const [row] = await db
    .select({
      organizationId: schema.npsResponse.organizationId,
      score: schema.npsResponse.score,
      comment: schema.npsResponse.comment,
      firstName: schema.patient.firstName,
    })
    .from(schema.npsResponse)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.npsResponse.patientId))
    .where(eq(schema.npsResponse.token, token))
    .limit(1)
  if (!row) return null
  const [profile] = await db
    .select({
      displayName: schema.clinicProfile.displayName,
      brandColor: schema.clinicProfile.brandColor,
      logoUrl: schema.clinicProfile.logoUrl,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, row.organizationId))
    .limit(1)
  return {
    organizationId: row.organizationId,
    clinicName: profile?.displayName || 'Your clinic',
    brandColor: profile?.brandColor ?? null,
    logoUrl: profile?.logoUrl ?? null,
    patientFirstName: row.firstName,
    score: row.score,
    comment: row.comment,
  }
}

/** Record the 0–10 tap. The token is private to the patient, so a re-tap
 *  simply updates their own answer (changing your mind is allowed). */
export async function recordNpsScore(token: string, score: number): Promise<boolean> {
  if (!Number.isInteger(score) || score < 0 || score > 10) return false
  const updated = await db
    .update(schema.npsResponse)
    .set({ score, respondedAt: new Date() })
    .where(eq(schema.npsResponse.token, token))
    .returning({
      id: schema.npsResponse.id,
      organizationId: schema.npsResponse.organizationId,
      patientId: schema.npsResponse.patientId,
    })
  const row = updated[0]
  if (!row) return false

  // Detractor escalation — same posture as 1–2★ review feedback: the team
  // hears about it while the visit is still fresh. Best-effort.
  if (score <= 6) {
    try {
      const [p] = await db
        .select({ firstName: schema.patient.firstName, lastName: schema.patient.lastName })
        .from(schema.patient)
        .where(eq(schema.patient.id, row.patientId))
        .limit(1)
      const who = p ? `${p.firstName} ${p.lastName}`.trim() : 'A patient'
      const { notifyOrgMembers } = await import('@/lib/services/notifications')
      await notifyOrgMembers(
        row.organizationId,
        {
          bucket: 'comments',
          type: 'nps_detractor',
          title: `Survey score ${score}/10 from ${who}`,
          body: 'A low post-visit score — worth a personal follow-up while it’s fresh.',
          linkPath: `/patients/${row.patientId}`,
          linkLabel: `Open ${who.split(' ')[0]}’s record →`,
        },
        { roles: ['owner', 'admin'] },
      )
    } catch (err) {
      console.warn('[nps] detractor escalation failed', err)
    }
  }
  return true
}

/** Attach the optional comment (post-score). */
export async function recordNpsComment(token: string, comment: string): Promise<boolean> {
  const clean = comment.trim().slice(0, 2000)
  if (!clean) return false
  const updated = await db
    .update(schema.npsResponse)
    .set({ comment: clean })
    .where(and(eq(schema.npsResponse.token, token), isNotNull(schema.npsResponse.score)))
    .returning({ id: schema.npsResponse.id })
  return updated.length > 0
}

// ── Staff results (the /reviews pulse section) ───────────────────────────────

export interface NpsSummary {
  /** Classic NPS: %promoters − %detractors, −100..100. Null = no responses. */
  score: number | null
  responses: number
  sent: number
  promoters: number
  passives: number
  detractors: number
  recentComments: Array<{
    patientId: string
    patientName: string
    score: number
    comment: string
    respondedAt: Date | null
  }>
}

/** Rolling 90-day pulse for the /reviews section. */
export async function getNpsSummary(organizationId: string, opts?: { now?: Date }): Promise<NpsSummary> {
  const now = opts?.now ?? new Date()
  const since = new Date(now.getTime() - 90 * DAY_MS)

  const [counts] = await db
    .select({
      sent: sql<number>`count(*)::int`,
      responses: sql<number>`count(${schema.npsResponse.score})::int`,
      promoters: sql<number>`count(*) filter (where ${schema.npsResponse.score} >= 9)::int`,
      passives: sql<number>`count(*) filter (where ${schema.npsResponse.score} in (7, 8))::int`,
      detractors: sql<number>`count(*) filter (where ${schema.npsResponse.score} <= 6)::int`,
    })
    .from(schema.npsResponse)
    .where(
      and(eq(schema.npsResponse.organizationId, organizationId), gte(schema.npsResponse.sentAt, since)),
    )

  const responses = counts?.responses ?? 0
  const promoters = counts?.promoters ?? 0
  const detractors = counts?.detractors ?? 0

  const commentRows = await db
    .select({
      patientId: schema.npsResponse.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      score: schema.npsResponse.score,
      comment: schema.npsResponse.comment,
      respondedAt: schema.npsResponse.respondedAt,
    })
    .from(schema.npsResponse)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.npsResponse.patientId))
    .where(
      and(
        eq(schema.npsResponse.organizationId, organizationId),
        gte(schema.npsResponse.sentAt, since),
        isNotNull(schema.npsResponse.comment),
        isNotNull(schema.npsResponse.score),
      ),
    )
    .orderBy(desc(schema.npsResponse.respondedAt))
    .limit(8)

  return {
    score: responses > 0 ? Math.round(((promoters - detractors) / responses) * 100) : null,
    responses,
    sent: counts?.sent ?? 0,
    promoters,
    passives: counts?.passives ?? 0,
    detractors,
    recentComments: commentRows.map((r) => ({
      patientId: r.patientId,
      patientName: `${r.firstName} ${r.lastName ?? ''}`.trim(),
      score: r.score ?? 0,
      comment: r.comment ?? '',
      respondedAt: r.respondedAt,
    })),
  }
}
