import 'server-only'
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolvePatientAudience, type PatientAudienceFilterT } from './marketing'
import { getAutomationTemplate } from './marketing-templates'
import type { RetentionKind } from '@/lib/types/retention'

export type { RetentionKind }

/**
 * Retention automations — "set & forget" recall nudges.
 *
 * Two opt-in automations a clinic flips on once and never thinks about again:
 *
 *   - **Birthday** — a daily send to patients whose birthday is *today*.
 *   - **Reactivation** — a monthly send to patients who lapsed ~9 months ago
 *     (a "newly lapsed" window, so we catch them once rather than nagging the
 *     long-gone every month).
 *
 * **How it stays compliant + honest.** Rather than blasting raw email, an
 * automation *creates a scheduled campaign* and lets the existing
 * scheduled-send cron deliver it. That reuses the whole campaign machinery —
 * the CAN-SPAM unsubscribe footer + physical postal address, RFC-8058
 * List-Unsubscribe headers, open/click tracking, the duplicate-send claim, and
 * the per-recipient `{{firstName}}`/`{{bookingUrl}}` merge — so an auto-send is
 * indistinguishable from one the clinic sent by hand, and it shows up in their
 * campaign list for full transparency (no invisible sends).
 *
 * **Idempotency.** Each campaign is stamped a deterministic `automationKey`
 * (`birthday:<org>:<YYYY-MM-DD>` / `reactivation:<org>:<YYYY-MM>`). A partial
 * unique index on `(organization_id, automation_key)` makes a second run in the
 * same window a no-op (the loser hits the unique constraint and skips), so the
 * cron can run as often as it likes and a patient is greeted exactly once.
 *
 * The audience is resolved up front purely to *skip creating an empty campaign*
 * on a day with no birthdays; the authoritative recipient resolution still
 * happens at send time inside `sendCampaign`.
 */

/** "Newly lapsed" window for reactivation: last visit between 9 and 10 months
 *  ago. A patient drifts past 9mo (a missed 6-month recall + a grace period)
 *  exactly once before the window moves on, so we don't re-nag every month. */
const REACTIVATION_MIN_DAYS = 270
const REACTIVATION_MAX_DAYS = 300

const BIRTHDAY_FILTER: PatientAudienceFilterT = {
  birthdayToday: true,
  requireEmailOptIn: true,
  requireSmsOptIn: false,
  includeArchived: false,
}

const REACTIVATION_FILTER: PatientAudienceFilterT = {
  lastVisitAtLeastDaysAgo: REACTIVATION_MIN_DAYS,
  lastVisitWithinDays: REACTIVATION_MAX_DAYS,
  requireEmailOptIn: true,
  requireSmsOptIn: false,
  includeArchived: false,
}

/** Use-your-benefits: insured, no upcoming visit, and not seen in ~4 months
 *  (someone in last month already used this year's checkup). Oct–Dec only. */
const BENEFITS_FILTER: PatientAudienceFilterT = {
  hasInsurance: true,
  noUpcomingVisit: true,
  lastVisitAtLeastDaysAgo: 120,
  requireEmailOptIn: true,
  requireSmsOptIn: false,
  includeArchived: false,
}

/** Welcome: patients whose first (and so far only recent) visit was within
 *  the past 7 days. Weekly key + 7-day window → each new patient is welcomed
 *  exactly once, a few days after their first visit (same window≈key-period
 *  trick the reactivation automation uses to avoid re-nagging). */
const WELCOME_FILTER: PatientAudienceFilterT = {
  lifecycles: ['new'],
  lastVisitWithinDays: 7,
  requireEmailOptIn: true,
  requireSmsOptIn: false,
  includeArchived: false,
}

const KIND_FILTERS: Record<RetentionKind, PatientAudienceFilterT> = {
  birthday: BIRTHDAY_FILTER,
  reactivation: REACTIVATION_FILTER,
  benefits: BENEFITS_FILTER,
  welcome: WELCOME_FILTER,
}

/** UTC months (0-indexed) the benefits automation is live: Oct, Nov, Dec. */
const BENEFITS_MONTHS = new Set([9, 10, 11])

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** UTC calendar-day key (YYYY-MM-DD) — stable across a cron's runs that day. */
function ymd(now: Date): string {
  return now.toISOString().slice(0, 10)
}
/** UTC year-month key (YYYY-MM). */
function yearMonth(now: Date): string {
  return now.toISOString().slice(0, 7)
}
/** UTC week key — the Monday of the current week as YYYY-MM-DD. Paired with
 *  the 7-day welcome window so each new patient lands in exactly one run. */
function weekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = d.getUTCDay() // 0=Sun
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7)) // back to Monday
  return d.toISOString().slice(0, 10)
}

export interface RetentionRunResult {
  /** Orgs with at least one automation enabled. */
  scanned: number
  /** Campaigns created this run (one per org per due automation). */
  created: number
  /** Automations that were already created this window (idempotent skip). */
  alreadyCreated: number
  /** Automations skipped because no patient matched (no empty campaign made). */
  emptyAudience: number
  details: Array<{ organizationId: string; kind: RetentionKind; campaignId: number; recipients: number }>
  errors: Array<{ organizationId: string; kind: RetentionKind; error: string }>
}

/**
 * Sweep every clinic with a retention automation enabled and create any due
 * campaign. Birthday runs daily; reactivation is keyed monthly so re-runs
 * within the month are no-ops. Safe to call from the cron as often as desired.
 */
export async function runRetentionAutomations(opts?: { now?: Date }): Promise<RetentionRunResult> {
  const now = opts?.now ?? new Date()
  const result: RetentionRunResult = {
    scanned: 0,
    created: 0,
    alreadyCreated: 0,
    emptyAudience: 0,
    details: [],
    errors: [],
  }

  const clinics = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      birthday: schema.clinicProfile.birthdayAutoSendEnabled,
      reactivation: schema.clinicProfile.lapsedReactivationEnabled,
      benefits: schema.clinicProfile.benefitsAutoSendEnabled,
      welcome: schema.clinicProfile.welcomeAutoSendEnabled,
      isDemo: schema.organization.isDemo,
    })
    .from(schema.clinicProfile)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicProfile.organizationId))

  for (const clinic of clinics) {
    const orgId = clinic.organizationId
    if (!orgId) continue
    // Demo clinics never send real email — the demo seeds enabled toggles purely
    // so the settings card showcases the "on" state; skip them here.
    if (clinic.isDemo) continue
    const birthdayOn = clinic.birthday === 1
    const reactivationOn = clinic.reactivation === 1
    // Benefits season is Oct–Dec — outside it the toggle stays armed but quiet.
    const benefitsOn = clinic.benefits === 1 && BENEFITS_MONTHS.has(now.getUTCMonth())
    const welcomeOn = clinic.welcome === 1
    if (!birthdayOn && !reactivationOn && !benefitsOn && !welcomeOn) continue
    result.scanned++

    if (birthdayOn) {
      await runOne(result, orgId, 'birthday', `birthday:${orgId}:${ymd(now)}`, now)
    }
    if (reactivationOn) {
      await runOne(result, orgId, 'reactivation', `reactivation:${orgId}:${yearMonth(now)}`, now)
    }
    if (benefitsOn) {
      await runOne(result, orgId, 'benefits', `benefits:${orgId}:${yearMonth(now)}`, now)
    }
    if (welcomeOn) {
      await runOne(result, orgId, 'welcome', `welcome:${orgId}:${weekKey(now)}`, now)
    }
  }

  return result
}

async function runOne(
  result: RetentionRunResult,
  organizationId: string,
  kind: RetentionKind,
  automationKey: string,
  now: Date,
): Promise<void> {
  try {
    // Idempotent: bail if this window's campaign already exists.
    const [existing] = await db
      .select({ id: schema.campaigns.id })
      .from(schema.campaigns)
      .where(
        and(
          eq(schema.campaigns.organizationId, organizationId),
          eq(schema.campaigns.automationKey, automationKey),
        ),
      )
      .limit(1)
    if (existing) {
      result.alreadyCreated++
      return
    }

    const filter = KIND_FILTERS[kind]
    // Resolve once, only to skip an empty send (no birthdays / nobody newly
    // lapsed). The authoritative resolution happens again at send time.
    const recipients = await resolvePatientAudience(organizationId, filter)
    if (recipients.length === 0) {
      result.emptyAudience++
      return
    }

    const audienceId = await findOrCreateAutomationAudience(organizationId, kind)
    // The org's edited message when one exists, else the system default —
    // the clinic owns the words that go out under their name.
    const template = await getAutomationTemplate(organizationId, kind)
    const name =
      kind === 'birthday'
        ? `Birthday greetings · ${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCDate()}`
        : kind === 'benefits'
          ? `Use your benefits · ${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}`
          : kind === 'welcome'
            ? `New-patient welcome · week of ${automationKey.slice(-10)}`
            : `Reactivation · ${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}`

    let campaignId: number
    try {
      const [row] = await db
        .insert(schema.campaigns)
        .values({
          organizationId,
          name,
          subject: template.subject,
          previewText: template.previewText,
          bodyHtml: template.bodyHtml,
          audienceId,
          recipientSource: 'patients',
          sendChannel: 'resend',
          status: 'scheduled',
          // Immediately due — the every-15-min scheduled-send cron picks it up.
          scheduledAt: now,
          automationKey,
          createdBy: null,
        })
        .returning({ id: schema.campaigns.id })
      campaignId = row.id
    } catch (err) {
      // A concurrent run won the unique-index race — treat as already created.
      if (isUniqueViolation(err)) {
        result.alreadyCreated++
        return
      }
      throw err
    }

    result.created++
    result.details.push({ organizationId, kind, campaignId, recipients: recipients.length })
  } catch (err) {
    result.errors.push({
      organizationId,
      kind,
      error: err instanceof Error ? err.message : 'unknown',
    })
  }
}

/**
 * One reusable audience per (org, automation kind) so the clinic's audience
 * list stays clean (not a new segment every day). The filter is rewritten on
 * reuse so a definition change in code propagates without a manual edit.
 */
async function findOrCreateAutomationAudience(
  organizationId: string,
  kind: RetentionKind,
): Promise<number> {
  const name =
    kind === 'birthday'
      ? 'Birthday automation — birthdays today'
      : kind === 'benefits'
        ? 'Benefits automation — insured, no upcoming visit'
        : kind === 'welcome'
          ? 'Welcome automation — new this week'
          : 'Reactivation automation — newly lapsed'
  const description =
    kind === 'birthday'
      ? 'Auto-managed: patients with a birthday today (email opt-in). Used by the birthday auto-send.'
      : kind === 'benefits'
        ? 'Auto-managed: insured patients with no upcoming visit and 4+ months since the last (email opt-in). Used by the Oct–Dec use-your-benefits auto-send.'
        : kind === 'welcome'
          ? 'Auto-managed: patients whose first visit was in the past 7 days (email opt-in). Used by the weekly new-patient welcome auto-send.'
          : 'Auto-managed: patients whose last visit was 9–10 months ago (email opt-in). Used by the reactivation auto-send.'
  const patientFilter = KIND_FILTERS[kind]

  const [existing] = await db
    .select({ id: schema.audiences.id })
    .from(schema.audiences)
    .where(
      and(
        eq(schema.audiences.organizationId, organizationId),
        eq(schema.audiences.name, name),
      ),
    )
    .limit(1)
  if (existing) {
    await db
      .update(schema.audiences)
      .set({ patientFilter, recipientSource: 'patients', description, updatedAt: new Date() })
      .where(eq(schema.audiences.id, existing.id))
    return existing.id
  }

  const [row] = await db
    .insert(schema.audiences)
    .values({
      organizationId,
      name,
      description,
      recipientSource: 'patients',
      filter: {},
      patientFilter,
      createdBy: null,
    })
    .returning({ id: schema.audiences.id })
  return row.id
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505'
}

export interface RetentionSettings {
  birthdayAutoSend: boolean
  lapsedReactivation: boolean
  benefitsAutoSend: boolean
  welcomeAutoSend: boolean
}

/** Read the automation toggles for a clinic. */
export async function getRetentionSettings(organizationId: string): Promise<RetentionSettings> {
  const [row] = await db
    .select({
      birthday: schema.clinicProfile.birthdayAutoSendEnabled,
      reactivation: schema.clinicProfile.lapsedReactivationEnabled,
      benefits: schema.clinicProfile.benefitsAutoSendEnabled,
      welcome: schema.clinicProfile.welcomeAutoSendEnabled,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  return {
    birthdayAutoSend: row?.birthday === 1,
    lapsedReactivation: row?.reactivation === 1,
    benefitsAutoSend: row?.benefits === 1,
    welcomeAutoSend: row?.welcome === 1,
  }
}

/** Flip one automation on/off. Caller enforces owner/admin. */
export async function setRetentionAutomation(
  organizationId: string,
  kind: RetentionKind,
  enabled: boolean,
): Promise<void> {
  const value = enabled ? 1 : 0
  const patch =
    kind === 'birthday'
      ? { birthdayAutoSendEnabled: value }
      : kind === 'benefits'
        ? { benefitsAutoSendEnabled: value }
        : kind === 'welcome'
          ? { welcomeAutoSendEnabled: value }
          : { lapsedReactivationEnabled: value }
  await db
    .update(schema.clinicProfile)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

// ---------- Per-automation proof (campaigns phase 2) ----------

export interface AutomationStats {
  /** Emails sent by this automation's campaigns in the window. */
  sent: number
  /** Appointments provably booked from those campaigns (campaign_events 'booked'). */
  booked: number
}

/**
 * Sent + booked counts per automation kind over the trailing window —
 * the proof line on each automations-card row ("43 sent · 6 booked").
 * Campaigns are matched by their automationKey prefix (`<kind>:`), events
 * by campaign id; both org-scoped.
 */
export async function getAutomationStats(
  organizationId: string,
  opts?: { windowDays?: number; now?: Date },
): Promise<Record<RetentionKind, AutomationStats>> {
  const now = opts?.now ?? new Date()
  const since = new Date(now.getTime() - (opts?.windowDays ?? 30) * 24 * 60 * 60 * 1000)
  const empty = (): AutomationStats => ({ sent: 0, booked: 0 })
  const stats: Record<RetentionKind, AutomationStats> = {
    birthday: empty(),
    reactivation: empty(),
    benefits: empty(),
    welcome: empty(),
  }

  const rows = await db
    .select({ id: schema.campaigns.id, automationKey: schema.campaigns.automationKey })
    .from(schema.campaigns)
    .where(
      and(
        eq(schema.campaigns.organizationId, organizationId),
        isNotNull(schema.campaigns.automationKey),
        gte(schema.campaigns.createdAt, since),
      ),
    )
  const kindByCampaign = new Map<number, RetentionKind>()
  for (const r of rows) {
    const kind = (r.automationKey ?? '').split(':')[0] as RetentionKind
    if (kind in stats) kindByCampaign.set(r.id, kind)
  }
  if (kindByCampaign.size === 0) return stats

  const events = await db
    .select({
      campaignId: schema.campaignEvents.campaignId,
      type: schema.campaignEvents.type,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.campaignEvents)
    .where(inArray(schema.campaignEvents.campaignId, Array.from(kindByCampaign.keys())))
    .groupBy(schema.campaignEvents.campaignId, schema.campaignEvents.type)

  for (const e of events) {
    const kind = kindByCampaign.get(e.campaignId)
    if (!kind) continue
    if (e.type === 'sent') stats[kind].sent += e.count
    else if (e.type === 'booked') stats[kind].booked += e.count
  }
  return stats
}

/**
 * Count how many patients each automation would reach *right now* — drives the
 * settings card so the clinic sees the impact before flipping a toggle on. The
 * birthday count is for the whole current month (not just today) so the number
 * isn't usually zero when they're looking at the setting.
 */
export async function previewRetentionAudiences(
  organizationId: string,
): Promise<{ birthdaysThisMonth: number; newlyLapsed: number; benefitsEligible: number; newThisWeek: number }> {
  const [birthdayRows, lapsedRows, benefitsRows, welcomeRows] = await Promise.all([
    resolvePatientAudience(organizationId, {
      birthdayThisMonth: true,
      requireEmailOptIn: true,
      requireSmsOptIn: false,
      includeArchived: false,
    }),
    resolvePatientAudience(organizationId, REACTIVATION_FILTER),
    resolvePatientAudience(organizationId, BENEFITS_FILTER),
    resolvePatientAudience(organizationId, WELCOME_FILTER),
  ])
  return {
    birthdaysThisMonth: birthdayRows.length,
    newlyLapsed: lapsedRows.length,
    benefitsEligible: benefitsRows.length,
    newThisWeek: welcomeRows.length,
  }
}
