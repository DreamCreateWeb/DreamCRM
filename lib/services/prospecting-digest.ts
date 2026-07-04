import 'server-only'
import { and, eq, ne } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { sendNotificationEmail } from '@/lib/email'
import { getPlatformOrgId } from '@/lib/services/gsc'
import { getProspectingConfig, getHuntStats, getFunnelStats, counterDay, type HuntStats } from './prospecting'
import type { ProspectFunnelStats } from '@/lib/types/prospecting'

/**
 * The daily hunt digest — one email to platform owner/admins summarizing
 * what the machine did in the last 24 hours (sends, opens, replies, new
 * call-list entries, auto-enrolls, deliverability health, funnel). Reuses
 * the staff-notification email shell + daily_digest_log idempotency. Skips
 * quietly when nothing happened.
 */

export interface DigestStats {
  hunt: HuntStats
  funnel: ProspectFunnelStats
  watchdogTripped: boolean
  callList: Array<{ name: string; intentSummary: string | null }>
}

export interface ProspectingDigestContent {
  subject: string
  body: string
  hasContent: boolean
}

/** Pure content builder — testable without the DB. */
export function buildProspectingDigestContent(stats: DigestStats): ProspectingDigestContent {
  const { hunt, funnel } = stats
  const hasContent =
    hunt.sent24h > 0 ||
    hunt.dryRun24h > 0 ||
    hunt.opens24h > 0 ||
    hunt.replies24h > 0 ||
    hunt.newCallList24h > 0 ||
    hunt.autoEnrolledToday > 0
  if (!hasContent) return { subject: '', body: '', hasContent: false }

  const sentLabel = hunt.sent24h > 0 ? `${hunt.sent24h} sent` : `${hunt.dryRun24h} drafted (dry-run)`
  const subject = `The hunt: ${sentLabel} · ${hunt.replies24h} replies · ${hunt.newCallList24h} for your call list`

  const lines: string[] = ['Here is what the machine did in the last 24 hours.', '']
  lines.push(
    `📤 Outreach: ${sentLabel} · ${hunt.opens24h} opened · ${hunt.clicks24h} clicked · ${hunt.replies24h} replied`,
  )
  if (stats.callList.length > 0) {
    lines.push('', '📞 New on your call list:')
    for (const c of stats.callList) {
      lines.push(`   • ${c.name}${c.intentSummary ? ` — "${c.intentSummary}"` : ''}`)
    }
  }
  if (hunt.autoEnrolledToday > 0) {
    lines.push('', `🤖 Auto-enrolled ${hunt.autoEnrolledToday} new prospect(s) into sequences.`)
  }
  lines.push(
    '',
    stats.watchdogTripped
      ? '🛡️ Deliverability: ALARM — sending is auto-paused. Review it in Settings.'
      : '🛡️ Deliverability: healthy.',
  )
  lines.push(
    '',
    `📊 Funnel: ${funnel.discovered.toLocaleString()} discovered → ${funnel.enriched.toLocaleString()} enriched → ${funnel.contacted.toLocaleString()} contacted → ${funnel.engaged.toLocaleString()} engaged → ${funnel.callList.toLocaleString()} call list → ${funnel.converted.toLocaleString()} converted`,
  )
  return { subject, body: lines.join('\n'), hasContent: true }
}

export async function runProspectingDigest(opts?: { now?: Date }): Promise<{ sent: number; skipped?: string }> {
  const now = opts?.now ?? new Date()
  const config = await getProspectingConfig()
  if (!config.digest.enabled) return { sent: 0, skipped: 'disabled' }

  const orgId = await getPlatformOrgId()
  if (!orgId) return { sent: 0, skipped: 'no_platform_org' }

  const hunt = await getHuntStats({ now })
  const funnel = await getFunnelStats()
  const content = buildProspectingDigestContent({
    hunt,
    funnel,
    watchdogTripped: Boolean(config.watchdog.trippedAt),
    callList: hunt.hottest
      .filter((h) => h.status === 'call_list')
      .map((h) => ({ name: h.name, intentSummary: h.intentSummary })),
  })
  if (!content.hasContent) return { sent: 0, skipped: 'nothing_happened' }

  const recipients = await db
    .select({ userId: schema.member.userId, name: schema.user.name, email: schema.user.email })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.organizationId, orgId), ne(schema.member.role, 'patient')))

  const sentOn = counterDay(now)
  let sent = 0
  for (const r of recipients) {
    if (!r.email) continue
    try {
      // Idempotency: one digest per user per day.
      const [already] = await db
        .select({ id: schema.dailyDigestLog.id })
        .from(schema.dailyDigestLog)
        .where(and(eq(schema.dailyDigestLog.userId, r.userId), eq(schema.dailyDigestLog.sentOn, sentOn)))
        .limit(1)
      if (already) continue
      await db
        .insert(schema.dailyDigestLog)
        .values({ id: newId('ddl'), organizationId: orgId, userId: r.userId, sentOn })
        .onConflictDoNothing()
      await sendNotificationEmail({
        to: r.email,
        name: r.name,
        title: content.subject,
        body: content.body,
        linkPath: '/platform/prospecting',
        linkLabel: 'Open the hunt →',
      })
      sent++
    } catch (err) {
      console.warn('[prospecting-digest] send failed', r.userId, err)
    }
  }
  return { sent }
}
