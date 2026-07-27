import 'server-only'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { BACKFILL_PATIENT_SOURCES } from '@/lib/patient-acquisition'
import { clinicWeekStart } from '@/lib/clinic-timezone'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { listRecentActions, countActionsSince } from '@/lib/services/action-ledger'
import { countOpenProposals } from '@/lib/services/proposals'
import { countFollowupsDue } from '@/lib/services/patient-followups'
import { sendNotificationEmail } from '@/lib/email'

/**
 * THE WEEKLY STANDUP (Transformation Phase 2 — DESIGN.md "The North Star",
 * primitive #4, the Narrator). Generated from the Action Ledger, written in
 * the anti-shame voice with names and stories, ending with the short list of
 * things only a human can do. The in-app card renders it on the Overview;
 * the email goes out clinic-local Monday mornings via the daily-digest cron
 * (idempotent through clinic_profile.standup_last_sent_at).
 *
 * The window is the PRIOR clinic-local week, [weekStart-7d, weekStart) —
 * exclusive upper bound so consecutive weeks tile exactly.
 */

export interface StandupLine {
  capability: string
  /** Short plural noun for the counts line ("appointment reminders"). */
  noun: string
  count: number
}

export interface WeeklyStandup {
  /** Prior-week window (clinic-local Monday to Monday). */
  weekStart: Date
  weekEnd: Date
  /** "Jul 20 – Jul 26" in the clinic's timezone. */
  weekLabel: string
  totalActions: number
  /** Per-capability counts, biggest first. */
  lines: StandupLine[]
  /** Up to three ledger one-liners with a person in them — the stories. */
  stories: string[]
  /** New patients SEATED in the window (the honest definition). */
  newPatientsSeated: number
  /** Google/Facebook reviews posted in the window. */
  reviewsReceived: number
  /** The short list of things only a human can do. */
  humanTasks: { openProposals: number; followupsDue: number }
  /** True when the machine has nothing to report AND nothing is waiting —
   *  surfaces stay quiet instead of celebrating zero. */
  quiet: boolean
}

/** Short plural nouns for the counts line — the registry labels are verb
 *  phrases ("Send appointment reminders"), which read wrong after a number. */
const STANDUP_NOUNS: Record<string, string> = {
  appointment_reminder: 'appointment reminders',
  review_request: 'review invitations',
  campaign_send: 'campaign sends',
  retention_automation: 'recall & win-back notes',
  followup_rule: 'follow-ups opened',
  balance_nudge: 'balance reminders',
  auto_reply: 'after-hours replies',
  forms_reminder: 'form nudges',
  nps_survey: 'visit check-ins',
  noshow_rebook: 'rebook invitations',
  waitlist_offer: 'waitlist offers',
  payment_autocharge: 'plan payments collected',
  service_copywriting: 'service pages written',
  scheduled_message: 'scheduled messages delivered',
  blog_publish: 'blog posts published',
  scheduled_social: 'social posts published',
  domain_autorenew: 'domain renewals',
  listing_sync: 'listing updates',
  review_feature: 'reviews featured on your site',
  review_reply: 'review replies',
  social_post: 'posts published',
  inquiry_response: 'inquiries answered',
  outreach_campaign: 'campaigns sent',
}

export function standupNoun(capability: string): string {
  return STANDUP_NOUNS[capability] ?? capability.replace(/_/g, ' ')
}

/** Capabilities whose entries make the best stories (a person + an outcome). */
const STORY_PRIORITY = [
  'review_feature',
  'outreach_campaign',
  'noshow_rebook',
  'payment_autocharge',
  'inquiry_response',
  'review_reply',
  'waitlist_offer',
  'retention_automation',
]

export async function buildWeeklyStandup(
  organizationId: string,
  now: Date = new Date(),
): Promise<WeeklyStandup> {
  const tz = await getClinicTimeZone(organizationId)
  const weekEnd = clinicWeekStart(now, tz)
  const weekStart = clinicWeekStart(new Date(weekEnd.getTime() - 1), tz)

  const [counts, entries, openProposals, followupsDue, newPatientsSeated, reviewsReceived] =
    await Promise.all([
      countActionsSince(organizationId, weekStart, { until: weekEnd }),
      listRecentActions(organizationId, { since: weekStart, until: weekEnd, limit: 200 }),
      countOpenProposals(organizationId),
      countFollowupsDue(organizationId, now),
      countSeatedInWindow(organizationId, weekStart, weekEnd),
      countReviewsInWindow(organizationId, weekStart, weekEnd),
    ])

  const lines: StandupLine[] = Object.entries(counts)
    .map(([capability, count]) => ({ capability, noun: standupNoun(capability), count }))
    .sort((a, b) => b.count - a.count)
  const totalActions = lines.reduce((sum, l) => sum + l.count, 0)

  // Stories: prefer the capabilities with a person + an outcome, then any
  // entry that touched a patient; oldest week entries last (recency first).
  const storied: string[] = []
  const seenCapability = new Set<string>()
  const ranked = [...entries].sort((a, b) => {
    const ai = STORY_PRIORITY.indexOf(a.capability)
    const bi = STORY_PRIORITY.indexOf(b.capability)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  for (const e of ranked) {
    if (storied.length >= 3) break
    if (!e.patientId && !STORY_PRIORITY.includes(e.capability)) continue
    if (seenCapability.has(e.capability)) continue
    seenCapability.add(e.capability)
    storied.push(e.summary)
  }

  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
  const lastDay = new Date(weekEnd.getTime() - 1)

  return {
    weekStart,
    weekEnd,
    weekLabel: `${fmt.format(weekStart)} – ${fmt.format(lastDay)}`,
    totalActions,
    lines,
    stories: storied,
    newPatientsSeated,
    reviewsReceived,
    humanTasks: { openProposals, followupsDue },
    quiet: totalActions === 0 && openProposals === 0 && followupsDue === 0,
  }
}

/**
 * New patients SEATED in the window: first MINTABLE completed visit fell
 * inside it. Mirrors the journey law: 'pms_import' rows never mint (their
 * completedAt is the sync moment — counting them would spike the standup the
 * week a clinic connects Open Dental), and roster patients (an imported
 * appointment on file, or a backfill patient.source) are already patients —
 * their first organic visit with us is a return, not a new-patient seat.
 */
async function countSeatedInWindow(organizationId: string, since: Date, until: Date): Promise<number> {
  const firsts = await db
    .select({
      patientId: schema.appointment.patientId,
      seatedAt: sql<Date | null>`min(${schema.appointment.completedAt})`,
    })
    .from(schema.appointment)
    .where(
      and(
        eq(schema.appointment.organizationId, organizationId),
        eq(schema.appointment.status, 'completed'),
        sql`${schema.appointment.completedAt} is not null`,
        sql`${schema.appointment.source} is distinct from 'pms_import'`,
      ),
    )
    .groupBy(schema.appointment.patientId)

  const candidates = firsts.filter((r) => {
    if (!r.patientId || !r.seatedAt) return false
    const t = r.seatedAt instanceof Date ? r.seatedAt : new Date(r.seatedAt as unknown as string)
    return t >= since && t < until
  })
  if (candidates.length === 0) return 0
  const ids = candidates.map((r) => r.patientId!)

  const [importedAppts, patientRows] = await Promise.all([
    db
      .select({ patientId: schema.appointment.patientId })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          inArray(schema.appointment.patientId, ids),
          sql`${schema.appointment.source} = 'pms_import'`,
        ),
      ),
    db
      .select({ id: schema.patient.id, source: schema.patient.source })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, organizationId), inArray(schema.patient.id, ids))),
  ])
  const rosterAnchored = new Set(importedAppts.map((r) => r.patientId))
  const backfillPatients = new Set(
    patientRows.filter((r) => BACKFILL_PATIENT_SOURCES.has(r.source ?? '')).map((r) => r.id),
  )
  return candidates.filter((r) => !rosterAnchored.has(r.patientId) && !backfillPatients.has(r.patientId!)).length
}

async function countReviewsInWindow(organizationId: string, since: Date, until: Date): Promise<number> {
  const rows = await db
    .select({ id: schema.platformReview.id })
    .from(schema.platformReview)
    .where(
      and(
        eq(schema.platformReview.organizationId, organizationId),
        gte(schema.platformReview.reviewCreatedAt, since),
        lt(schema.platformReview.reviewCreatedAt, until),
      ),
    )
  return rows.length
}

// ── The Monday email ─────────────────────────────────────────────────────────

/** Render the standup as the plain-text email body (sendNotificationEmail
 *  pre-wraps it). Kept pure for tests. */
export function renderStandupEmailBody(s: WeeklyStandup, clinicName: string): string {
  const parts: string[] = []
  parts.push(`Here's what I got done for ${clinicName} last week (${s.weekLabel}):`)
  parts.push('')
  if (s.lines.length > 0) {
    for (const l of s.lines.slice(0, 8)) parts.push(`• ${l.count} ${l.noun}`)
    if (s.lines.length > 8) {
      const rest = s.lines.slice(8).reduce((sum, l) => sum + l.count, 0)
      parts.push(`• …and ${rest} more small things`)
    }
  } else {
    parts.push('• A quiet week on my side — nothing needed sending.')
  }
  if (s.newPatientsSeated > 0 || s.reviewsReceived > 0) {
    parts.push('')
    if (s.newPatientsSeated > 0) {
      parts.push(
        s.newPatientsSeated === 1
          ? '1 new patient sat in the chair for the first time.'
          : `${s.newPatientsSeated} new patients sat in the chair for the first time.`,
      )
    }
    if (s.reviewsReceived > 0) {
      parts.push(
        s.reviewsReceived === 1
          ? '1 new review came in.'
          : `${s.reviewsReceived} new reviews came in.`,
      )
    }
  }
  if (s.stories.length > 0) {
    parts.push('')
    parts.push('A few moments worth knowing about:')
    for (const story of s.stories) parts.push(`• ${story}`)
  }
  parts.push('')
  const human: string[] = []
  if (s.humanTasks.openProposals > 0) {
    human.push(
      s.humanTasks.openProposals === 1
        ? '1 piece of work is waiting on your yes'
        : `${s.humanTasks.openProposals} pieces of work are waiting on your yes`,
    )
  }
  if (s.humanTasks.followupsDue > 0) {
    human.push(
      s.humanTasks.followupsDue === 1
        ? '1 follow-up is due'
        : `${s.humanTasks.followupsDue} follow-ups are due`,
    )
  }
  parts.push(
    human.length > 0
      ? `Only-you list: ${human.join(', and ')} — it's all on your overview.`
      : 'Nothing is waiting on you right now. Have a good week.',
  )
  return parts.join('\n')
}

export interface StandupRunResult {
  scanned: number
  sent: number
  skippedNotMonday: number
  skippedAlready: number
  skippedQuiet: number
  errors: Array<{ organizationId: string; error: string }>
}

/**
 * Email each clinic's staff their weekly standup. Rides the DAILY digest
 * cron: fires only on the clinic-local Monday, once per clinic per week
 * (clinic_profile.standup_last_sent_at >= this week's start = already sent).
 * Demo clinics never email. Quiet standups don't send — a report with
 * nothing in it teaches people to ignore the reports that matter.
 */
export async function sendWeeklyStandups(opts?: { now?: Date }): Promise<StandupRunResult> {
  const now = opts?.now ?? new Date()
  const result: StandupRunResult = {
    scanned: 0,
    sent: 0,
    skippedNotMonday: 0,
    skippedAlready: 0,
    skippedQuiet: 0,
    errors: [],
  }

  const clinics = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      standupLastSentAt: schema.clinicProfile.standupLastSentAt,
      isDemo: schema.organization.isDemo,
      clinicName: schema.organization.name,
    })
    .from(schema.clinicProfile)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicProfile.organizationId))

  for (const clinic of clinics) {
    if (!clinic.organizationId || clinic.isDemo) continue
    result.scanned++
    try {
      const tz = await getClinicTimeZone(clinic.organizationId)
      const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now)
      if (weekday !== 'Mon') {
        result.skippedNotMonday++
        continue
      }
      const thisWeekStart = clinicWeekStart(now, tz)
      if (clinic.standupLastSentAt && clinic.standupLastSentAt >= thisWeekStart) {
        result.skippedAlready++
        continue
      }

      const standup = await buildWeeklyStandup(clinic.organizationId, now)
      if (standup.quiet) {
        result.skippedQuiet++
        continue
      }

      // Claim the week BEFORE sending so a concurrent run can't double-email.
      await db
        .update(schema.clinicProfile)
        .set({ standupLastSentAt: now })
        .where(eq(schema.clinicProfile.organizationId, clinic.organizationId))

      const staff = await db
        .select({ name: schema.user.name, email: schema.user.email, role: schema.member.role })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
        .where(and(eq(schema.member.organizationId, clinic.organizationId), eq(schema.member.role, 'owner')))

      const body = renderStandupEmailBody(standup, clinic.clinicName ?? 'your clinic')
      for (const s of staff) {
        if (!s.email) continue
        await sendNotificationEmail({
          to: s.email,
          name: s.name ?? undefined,
          title: `Your week with DreamCRM — ${standup.weekLabel}`,
          body,
          linkPath: '/dashboard',
        })
        result.sent++
      }
    } catch (err) {
      result.errors.push({
        organizationId: clinic.organizationId,
        error: err instanceof Error ? err.message : 'unknown',
      })
    }
  }
  return result
}
