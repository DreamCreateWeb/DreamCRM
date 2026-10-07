import 'server-only'
import { ALL_ON, parseDoorsClosed, type FeatureKey } from '@/lib/feature-switches'
import { randomBytes } from 'crypto'
import { and, eq, ne } from 'drizzle-orm'
import { listShutDownOrgIds } from './billing-state'
import { db, schema } from '@/lib/db'
import { getMyDay, type MyDayData } from '@/lib/services/my-day'
import { getDigestOptOutUserIds } from '@/lib/services/staff-notification-pref'
import { getWeeklySiteDigest, type SiteTraffic } from '@/lib/services/site-analytics'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { sendNotificationEmail } from '@/lib/email'
import { formatDueLabel, todayYmd } from '@/lib/types/followups'
import { sweepClinics } from '@/lib/services/cron-sweep'
import type { SweepProgress } from '@/lib/cron-budget'
import { countActionsSince, countFailuresSince } from '@/lib/services/action-ledger'
import { countOpenProposals, listOpenProposalsOnYou } from '@/lib/services/proposals'
import { getFeatureSwitchState } from '@/lib/services/feature-switches'
import { getReadinessReport } from '@/lib/services/readiness'
import { listPendingOnUs, readMergedActivation } from '@/lib/services/first-week'
import { dayNumber } from '@/lib/first-week'
import { buildMorningAfter, type MorningAfter } from '@/lib/morning-after'

/**
 * Morning digest — the cockpit, delivered. A daily cron emails each staff member
 * with their follow-ups due, visits still to confirm, and the team's new leads,
 * linking back into /my-day. Opt-in per clinic (default off); demo clinics
 * skipped; idempotent per user per day via daily_digest_log. Reuses getMyDay for
 * the content + the staff-facing sendNotificationEmail for delivery.
 *
 * THE MORNING AFTER (docs/ACTIVATION.md law 6, S7): the email also says what
 * the machine did since yesterday, names ONE thing to do, and says what is
 * still on the platform — read once per clinic (lib/morning-after.ts is the
 * pure half). A clinic in its first week gets the email even when its to-do
 * list is empty; before this, "nothing to do" meant no email, and the thin
 * day-two clinic the setup call had just promised a morning email heard
 * nothing.
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
  /** Where the email's button goes: My Day, or the one thing's own door when
   *  there is no routine to-do to land on. */
  linkPath: string
}

/**
 * Render the Monday "your website last week" block from real traffic + lead
 * counts — the weekly return path for the public site, riding the digest the
 * staff already read instead of a separate email. Returns null when the site
 * has NO recorded traffic in either window (a day-0 clinic shouldn't get a
 * weekly "0 visits" line). Pure + exported for tests.
 */
export function buildWebsiteWeekSection(traffic: SiteTraffic, leads7d: number): string | null {
  if (traffic.total === 0 && traffic.totalPrev === 0) return null
  const lines: string[] = []
  let delta = ''
  if (traffic.totalPrev > 0) {
    const pct = Math.round(((traffic.total - traffic.totalPrev) / traffic.totalPrev) * 100)
    delta =
      pct > 0 ? ` (up ${pct}% vs the week before)` : pct < 0 ? ` (down ${Math.abs(pct)}% vs the week before)` : ' (steady vs the week before)'
  }
  lines.push(`🌐 Your website last week: ${traffic.total.toLocaleString('en-US')} visit${traffic.total === 1 ? '' : 's'}${delta}`)
  if (leads7d > 0) {
    lines.push(`   • ${leads7d} lead${leads7d === 1 ? '' : 's'} came in through the site`)
  }
  if (traffic.topPages.length > 0) {
    const tops = traffic.topPages
      .slice(0, 2)
      .map((p) => `${p.path === '/' ? 'Home' : p.path} (${p.views.toLocaleString('en-US')})`)
      .join(' · ')
    lines.push(`   • Most visited: ${tops}`)
  }
  return lines.join('\n')
}

/**
 * Render a staff member's My-Day data into the digest subject + plain-text body
 * (no greeting — the staff email shell adds "Hi {name},"). Pure + exported for
 * tests. "Unconfirmed today" is the slice of today's visits still on `scheduled`
 * (a text still needs to go out).
 */
export function buildDigestContent(
  data: MyDayData,
  clinicName: string,
  /** Monday-only weekly website block (buildWebsiteWeekSection) — appended
   *  after the to-dos and counted as content on its own. */
  websiteSection?: string | null,
  /** The morning after (S7): what happened, one thing, what it waits on. */
  morning?: MorningAfter | null,
  /** The clinic's doors (law 1): a closed Follow-ups / Inquiries door keeps its list and its subject word out of the email. Defaults open. */
  doors?: { followups?: boolean; leads?: boolean } | null,
): DigestContent {
  // A closed door's list is not a to-do (verification round 2: the Overview
  // hides the follow-ups card with its door; the email must agree).
  const followupsDue = doors?.followups === false ? 0 : data.followups.overdue + data.followups.today
  const unconfirmed = data.unconfirmedTodayCount
  const conversations = data.conversations.length
  const leads = doors?.leads === false ? 0 : data.newLeadsCount
  const balanceCount = data.balances.count
  const proposals = data.openProposalsCount ?? 0
  const auditItems = data.tomorrow?.items ?? []
  const routine =
    followupsDue > 0 || unconfirmed > 0 || conversations > 0 || leads > 0 || balanceCount > 0 || proposals > 0 ||
    auditItems.length > 0
  const hasContent = routine || !!websiteSection || !!morning?.sendsAlone

  const parts: string[] = []
  parts.push(routine ? `Here's what's waiting on you at ${clinicName} today.` : `Good morning from ${clinicName}'s Dream Team.`)
  parts.push('')
  // What happened first — the law says "what it did overnight" before the asks.
  if (morning?.happened) {
    parts.push(morning.happened)
    parts.push('')
  }
  if (morning?.oneThing) {
    parts.push(`⭐ One thing today: ${morning.oneThing.text}`)
    parts.push('')
  }

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
  if (proposals > 0 && morning?.oneThing?.kind !== 'card') {
    // Phase 2 (round-1 audit): the Approval Inbox must reach the morning
    // email — drafted work expires quietly if nobody is told it exists.
    // (When the one thing above already NAMES the first card, this generic
    // count would say the same thing twice.)
    parts.push(`✨ ${proposals} piece${proposals === 1 ? '' : 's'} of finished work ${proposals === 1 ? 'is' : 'are'} waiting on your yes (on your Dream Team page).`)
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
  if (morning?.waitingOn) {
    parts.push('')
    parts.push(morning.waitingOn)
  }
  if (websiteSection) {
    parts.push('')
    parts.push(websiteSection)
  }
  if (morning?.quietLine) {
    parts.push(morning.quietLine)
  } else if (!hasContent) {
    parts.push("You're all caught up — nothing needs you this morning. Have a great day.")
  }

  const subjBits: string[] = []
  if (followupsDue > 0) subjBits.push(`${followupsDue} follow-up${followupsDue === 1 ? '' : 's'}`)
  if (unconfirmed > 0) subjBits.push(`${unconfirmed} to confirm`)
  if (leads > 0) subjBits.push(`${leads} new lead${leads === 1 ? '' : 's'}`)
  const subject =
    subjBits.length > 0
      ? `Your day: ${subjBits.join(', ')}`
      : morning?.happened
        ? `Your day at ${clinicName}: what I did overnight`
        : morning?.oneThing
          ? `Your day at ${clinicName}: one thing`
          : `Your day at ${clinicName}`

  // The button lands on the one thing's own door only when there is no
  // routine to-do for My Day to show — otherwise My Day holds the list.
  const linkPath = !routine && morning?.oneThing ? morning.oneThing.href : '/my-day'

  return { subject, body: parts.join('\n'), hasContent, linkPath }
}

/**
 * The morning-after inputs for one clinic, read once per clinic (not per
 * staff member), every read best-effort: a failed read says less, never
 * blocks the morning to-dos. Returns null only when the whole thing fails.
 */
export async function readMorningAfter(organizationId: string, createdAt: Date, now: Date): Promise<MorningAfter | null> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const quiet = async <T,>(fallback: T, read: () => Promise<T>): Promise<T> => {
    try {
      return await read()
    } catch (e) {
      console.error('[daily-digest] morning-after read failed:', e)
      return fallback
    }
  }
  try {
    const [work, failures, cards, cardsTotal, report, pendingOnUs, activation, site] = await Promise.all([
      quiet({} as Record<string, number>, () => countActionsSince(organizationId, since, { until: now })),
      quiet(0, () => countFailuresSince(organizationId, since, { until: now, kind: 'engine' })),
      quiet([], () => listOpenProposalsOnYou(organizationId, 5)),
      // The list is capped; the COUNT is the number the email says (audit round 1).
      quiet(null as number | null, () => countOpenProposals(organizationId)),
      quiet(null, () => getReadinessReport(organizationId)),
      quiet([], () => listPendingOnUs(organizationId)),
      readMergedActivation(organizationId),
      quiet(null as { siteLiveAt: Date | null; doorsClosed: unknown } | null, async () => {
        const [row] = await db
          .select({ siteLiveAt: schema.clinicProfile.siteLiveAt, doorsClosed: schema.clinicProfile.doorsClosed })
          .from(schema.clinicProfile)
          .where(eq(schema.clinicProfile.organizationId, organizationId))
          .limit(1)
        return row ?? null
      }),
    ])
    return buildMorningAfter({
      day: dayNumber(createdAt, now),
      activation,
      work,
      failures,
      openCards: cards.map((c) => ({ title: c.title })),
      openCardsTotal: cardsTotal ?? undefined,
      siteLive: site ? site.siteLiveAt != null : undefined,
      doorsClosed: site ? (Object.keys(parseDoorsClosed(site.doorsClosed)) as FeatureKey[]) : undefined,
      pendingOnUs: pendingOnUs.map((p) => ({ label: p.label, kind: p.kind })),
      attention: (report?.attention ?? []).map((f) => ({ label: f.label, summary: f.summary, href: f.href })),
    })
  } catch (e) {
    console.error('[daily-digest] morning-after failed:', e)
    return null
  }
}

export interface DigestRunResult {
  scanned: number
  sent: number
  skippedEmpty: number
  skippedAlready: number
  errors: Array<{ userId: string; error: string }>
  /** How the budgeted, resumable walk over clinics went (lib/cron-budget.ts).
   *  `completed: false` means the tick ran out of time and the next one picks
   *  up where this stopped — not that anything failed. */
  sweep: SweepProgress
}

/** Send the morning digest to every opted-in clinic's staff. */
export async function runDailyDigest(opts?: { now?: Date }): Promise<DigestRunResult> {
  const now = opts?.now ?? new Date()
  const sentOn = todayYmd(now)
  const result: Omit<DigestRunResult, 'sweep'> = {
    scanned: 0,
    sent: 0,
    skippedEmpty: 0,
    skippedAlready: 0,
    errors: [],
  }

  const clinics = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      enabled: schema.clinicProfile.dailyDigestEnabled,
      isDemo: schema.organization.isDemo,
      clinicName: schema.organization.name,
      createdAt: schema.organization.createdAt,
    })
    .from(schema.clinicProfile)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicProfile.organizationId))

  // THE KILL (owner ruling): no morning digest from a shut-down practice —
  // the dashboard wall is the only thing its staff should hear from.
  const shutDown = await listShutDownOrgIds(now)
  // Filter BEFORE the walk, so the budget is spent on clinics that will
  // actually be mailed and the cursor advances past real work rather than
  // past a run of skips.
  const due = clinics.filter(
    (c): c is (typeof clinics)[number] & { organizationId: string } =>
      !!c.organizationId && !c.isDemo && c.enabled === 1 && !shutDown.has(c.organizationId),
  )

  // Budgeted + resumable: the walk stops before the route's maxDuration does
  // and the next tick starts after the last clinic served. Without this, an
  // overrun kills the request mid-loop and — because the list always started
  // at the same end — the clinics past the cut-off were never reached at all.
  const sweep = await sweepClinics(
    'daily-digest',
    due,
    (c) => c.organizationId,
    async (clinic) => {

    // Monday (clinic-local) → append the weekly website block. Fetched ONCE per
    // clinic (not per staff member) and strictly best-effort: a traffic-read
    // hiccup must never block the morning to-dos.
    let websiteSection: string | null = null
    try {
      const tz = await getClinicTimeZone(clinic.organizationId)
      const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now)
      if (weekday === 'Mon') {
        const week = await getWeeklySiteDigest(clinic.organizationId)
        websiteSection = buildWebsiteWeekSection(week.traffic, week.leads7d)
      }
    } catch {
      websiteSection = null
    }

    // The morning after (S7): once per clinic, best-effort.
    const morning = await readMorningAfter(clinic.organizationId, clinic.createdAt ?? now, now)
    // The button must land on a page the clinic HAS: My Day is a switch, and
    // a closed one shows its intro card, not the list the email promised
    // (audit round 1). The Overview carries the same summons strip.
    const switches = await getFeatureSwitchState(clinic.organizationId).catch(() => ALL_ON)
    const myDayOn = switches.my_day

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
        const content = buildDigestContent(data, clinic.clinicName ?? 'your clinic', websiteSection, morning, { followups: switches.followups, leads: switches.leads })
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
          linkPath: content.linkPath === '/my-day' && !myDayOn ? '/dashboard' : content.linkPath,
        })
        result.sent++
      } catch (err) {
        result.errors.push({ userId: s.userId, error: err instanceof Error ? err.message : 'unknown' })
      }
    }
    },
    {
      // A clinic whose staff query fails used to throw straight out of this
      // function and take the WHOLE morning's digest down with it. Now it is
      // one clinic's error and the walk carries on past it.
      onError: (clinic, err) =>
        result.errors.push({
          userId: `org:${clinic.organizationId}`,
          error: err instanceof Error ? err.message : 'unknown',
        }),
    },
  )
  return { ...result, sweep }
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505'
}
