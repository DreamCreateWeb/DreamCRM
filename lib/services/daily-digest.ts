import 'server-only'
import { randomBytes } from 'crypto'
import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getMyDay, type MyDayData } from '@/lib/services/my-day'
import { getDigestOptOutUserIds } from '@/lib/services/staff-notification-pref'
import { sendNotificationEmail } from '@/lib/email'
import { formatDueLabel, todayYmd } from '@/lib/types/followups'

/**
 * Morning digest — the cockpit, delivered. A daily cron emails each staff member
 * with their follow-ups due, visits still to confirm, and the team's new leads,
 * linking back into /my-day. Opt-in per clinic (default off); demo clinics
 * skipped; idempotent per user per day via daily_digest_log. Reuses getMyDay for
 * the content + the staff-facing sendNotificationEmail for delivery.
 */

function newId(): string {
  return `ddl_${randomBytes(8).toString('hex')}`
}

export async function getDigestEnabled(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ on: schema.clinicProfile.dailyDigestEnabled })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  return row?.on === 1
}

export async function setDigestEnabled(organizationId: string, enabled: boolean): Promise<void> {
  await db
    .update(schema.clinicProfile)
    .set({ dailyDigestEnabled: enabled ? 1 : 0, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
}

export interface DigestContent {
  subject: string
  body: string
  /** False when there's nothing worth emailing about (so we stay quiet). */
  hasContent: boolean
}

/**
 * Render a staff member's My-Day data into the digest subject + plain-text body
 * (no greeting — the staff email shell adds "Hi {name},"). Pure + exported for
 * tests. "Unconfirmed today" is the slice of today's visits still on `scheduled`
 * (a text still needs to go out).
 */
export function buildDigestContent(data: MyDayData, clinicName: string): DigestContent {
  const followupsDue = data.followups.overdue + data.followups.today
  const unconfirmed = data.unconfirmedTodayCount
  const conversations = data.conversations.length
  const leads = data.newLeadsCount
  const balanceCount = data.balances.count
  const auditItems = data.tomorrow?.items ?? []
  const hasContent =
    followupsDue > 0 || unconfirmed > 0 || conversations > 0 || leads > 0 || balanceCount > 0 || auditItems.length > 0

  const parts: string[] = []
  parts.push(`Here's what's waiting on you at ${clinicName} today.`)
  parts.push('')

  if (followupsDue > 0) {
    const overduePart = data.followups.overdue > 0 ? ` (${data.followups.overdue} overdue)` : ''
    parts.push(`📋 ${followupsDue} follow-up${followupsDue === 1 ? '' : 's'} due${overduePart}:`)
    for (const f of data.followups.items.slice(0, 5)) {
      parts.push(`   • ${f.title} — ${formatDueLabel(f.dueDate)} · ${f.patientName}`)
    }
    if (data.followups.items.length > 5) parts.push(`   …and more`)
    parts.push('')
  }
  if (unconfirmed > 0) {
    parts.push(`📅 ${unconfirmed} visit${unconfirmed === 1 ? '' : 's'} today still need${unconfirmed === 1 ? 's' : ''} a confirmation.`)
  }
  if (conversations > 0) {
    parts.push(`💬 ${conversations} conversation${conversations === 1 ? '' : 's'} assigned to you.`)
  }
  if (leads > 0) {
    parts.push(`🌱 ${leads} new website lead${leads === 1 ? '' : 's'} waiting on the team.`)
  }
  if (balanceCount > 0) {
    const dollars = Math.round(data.balances.totalCents / 100).toLocaleString('en-US')
    parts.push(`💰 ${balanceCount} patient${balanceCount === 1 ? '' : 's'} owe a balance ($${dollars} total).`)
  }
  if (auditItems.length > 0) {
    parts.push('')
    parts.push(
      `🔍 Tomorrow: ${auditItems.length} of ${data.tomorrow.visitCount} visit${data.tomorrow.visitCount === 1 ? '' : 's'} need${auditItems.length === 1 ? 's' : ''} prep:`,
    )
    for (const it of auditItems.slice(0, 6)) {
      parts.push(`   • ${it.patientName} — ${it.flags.map((f) => f.label).join(' · ')}`)
    }
    if (auditItems.length > 6) parts.push(`   …and ${auditItems.length - 6} more on My Day`)
  }
  if (!hasContent) {
    parts.push("You're all caught up — nothing needs you this morning. Have a great day.")
  }

  const subjBits: string[] = []
  if (followupsDue > 0) subjBits.push(`${followupsDue} follow-up${followupsDue === 1 ? '' : 's'}`)
  if (unconfirmed > 0) subjBits.push(`${unconfirmed} to confirm`)
  if (leads > 0) subjBits.push(`${leads} new lead${leads === 1 ? '' : 's'}`)
  const subject = subjBits.length > 0 ? `Your day: ${subjBits.join(', ')}` : `Your day at ${clinicName}`

  return { subject, body: parts.join('\n'), hasContent }
}

export interface DigestRunResult {
  scanned: number
  sent: number
  skippedEmpty: number
  skippedAlready: number
  errors: Array<{ userId: string; error: string }>
}

/** Send the morning digest to every opted-in clinic's staff. */
export async function runDailyDigest(opts?: { now?: Date }): Promise<DigestRunResult> {
  const now = opts?.now ?? new Date()
  const sentOn = todayYmd(now)
  const result: DigestRunResult = { scanned: 0, sent: 0, skippedEmpty: 0, skippedAlready: 0, errors: [] }

  const clinics = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      enabled: schema.clinicProfile.dailyDigestEnabled,
      isDemo: schema.organization.isDemo,
      clinicName: schema.organization.name,
    })
    .from(schema.clinicProfile)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicProfile.organizationId))

  for (const clinic of clinics) {
    if (!clinic.organizationId || clinic.isDemo || clinic.enabled !== 1) continue

    // Staff with an email (exclude patients) + the per-staff opt-out set.
    const [staff, optedOut] = await Promise.all([
      db
        .select({ userId: schema.member.userId, name: schema.user.name, email: schema.user.email })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
        .where(and(eq(schema.member.organizationId, clinic.organizationId), ne(schema.member.role, 'patient'))),
      getDigestOptOutUserIds(clinic.organizationId),
    ])

    for (const s of staff) {
      if (!s.email || optedOut.has(s.userId)) continue
      result.scanned++
      try {
        // Idempotency: skip if this user already got today's digest.
        const [already] = await db
          .select({ id: schema.dailyDigestLog.id })
          .from(schema.dailyDigestLog)
          .where(and(eq(schema.dailyDigestLog.userId, s.userId), eq(schema.dailyDigestLog.sentOn, sentOn)))
          .limit(1)
        if (already) { result.skippedAlready++; continue }

        const data = await getMyDay(clinic.organizationId, s.userId)
        const content = buildDigestContent(data, clinic.clinicName ?? 'your clinic')
        if (!content.hasContent) { result.skippedEmpty++; continue }

        // Claim the day first (unique index makes a concurrent run skip), then send.
        try {
          await db.insert(schema.dailyDigestLog).values({
            id: newId(),
            organizationId: clinic.organizationId,
            userId: s.userId,
            sentOn,
          })
        } catch (err) {
          if (isUniqueViolation(err)) { result.skippedAlready++; continue }
          throw err
        }

        await sendNotificationEmail({
          to: s.email,
          name: s.name ?? undefined,
          title: content.subject,
          body: content.body,
          linkPath: '/my-day',
        })
        result.sent++
      } catch (err) {
        result.errors.push({ userId: s.userId, error: err instanceof Error ? err.message : 'unknown' })
      }
    }
  }
  return result
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505'
}
