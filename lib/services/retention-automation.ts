import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolvePatientAudience, type PatientAudienceFilterT } from './marketing'
import { SYSTEM_TEMPLATES } from './marketing-templates'

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

const BIRTHDAY_TEMPLATE = SYSTEM_TEMPLATES.find((t) => t.category === 'birthday')!
const REACTIVATION_TEMPLATE = SYSTEM_TEMPLATES.find((t) => t.category === 'reactivation')!
const BENEFITS_TEMPLATE = SYSTEM_TEMPLATES.find((t) => t.name.startsWith('Use your benefits'))!

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
    if (!birthdayOn && !reactivationOn && !benefitsOn) continue
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

    const filter =
      kind === 'birthday' ? BIRTHDAY_FILTER : kind === 'benefits' ? BENEFITS_FILTER : REACTIVATION_FILTER
    // Resolve once, only to skip an empty send (no birthdays / nobody newly
    // lapsed). The authoritative resolution happens again at send time.
    const recipients = await resolvePatientAudience(organizationId, filter)
    if (recipients.length === 0) {
      result.emptyAudience++
      return
    }

    const audienceId = await findOrCreateAutomationAudience(organizationId, kind)
    const template =
      kind === 'birthday' ? BIRTHDAY_TEMPLATE : kind === 'benefits' ? BENEFITS_TEMPLATE : REACTIVATION_TEMPLATE
    const name =
      kind === 'birthday'
        ? `Birthday greetings · ${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCDate()}`
        : kind === 'benefits'
          ? `Use your benefits · ${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}`
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
        : 'Reactivation automation — newly lapsed'
  const description =
    kind === 'birthday'
      ? 'Auto-managed: patients with a birthday today (email opt-in). Used by the birthday auto-send.'
      : kind === 'benefits'
        ? 'Auto-managed: insured patients with no upcoming visit and 4+ months since the last (email opt-in). Used by the Oct–Dec use-your-benefits auto-send.'
        : 'Auto-managed: patients whose last visit was 9–10 months ago (email opt-in). Used by the reactivation auto-send.'
  const patientFilter =
    kind === 'birthday' ? BIRTHDAY_FILTER : kind === 'benefits' ? BENEFITS_FILTER : REACTIVATION_FILTER

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

export type RetentionKind = 'birthday' | 'reactivation' | 'benefits'

export interface RetentionSettings {
  birthdayAutoSend: boolean
  lapsedReactivation: boolean
  benefitsAutoSend: boolean
}

/** Read the two automation toggles for a clinic. */
export async function getRetentionSettings(organizationId: string): Promise<RetentionSettings> {
  const [row] = await db
    .select({
      birthday: schema.clinicProfile.birthdayAutoSendEnabled,
      reactivation: schema.clinicProfile.lapsedReactivationEnabled,
      benefits: schema.clinicProfile.benefitsAutoSendEnabled,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  return {
    birthdayAutoSend: row?.birthday === 1,
    lapsedReactivation: row?.reactivation === 1,
    benefitsAutoSend: row?.benefits === 1,
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
        : { lapsedReactivationEnabled: value }
  await db
    .update(schema.clinicProfile)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

/**
 * Count how many patients each automation would reach *right now* — drives the
 * settings card so the clinic sees the impact before flipping a toggle on. The
 * birthday count is for the whole current month (not just today) so the number
 * isn't usually zero when they're looking at the setting.
 */
export async function previewRetentionAudiences(
  organizationId: string,
): Promise<{ birthdaysThisMonth: number; newlyLapsed: number; benefitsEligible: number }> {
  const [birthdayRows, lapsedRows, benefitsRows] = await Promise.all([
    resolvePatientAudience(organizationId, {
      birthdayThisMonth: true,
      requireEmailOptIn: true,
      requireSmsOptIn: false,
      includeArchived: false,
    }),
    resolvePatientAudience(organizationId, REACTIVATION_FILTER),
    resolvePatientAudience(organizationId, BENEFITS_FILTER),
  ])
  return {
    birthdaysThisMonth: birthdayRows.length,
    newlyLapsed: lapsedRows.length,
    benefitsEligible: benefitsRows.length,
  }
}
