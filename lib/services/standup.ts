import 'server-only'
import { and, eq, gte, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { clinicWeekStart } from '@/lib/clinic-timezone'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import {
  listRecentActions,
  countActionsSince,
  countFailuresSince,
  isWorkEntry,
} from '@/lib/services/action-ledger'
import { readEngineSwitches } from '@/lib/services/engine-switches'
import { countOpenProposals } from '@/lib/services/proposals'
import { countFollowupsDue } from '@/lib/services/patient-followups'
import { countSeatedBetween } from '@/lib/services/patient-journey'
import { getDigestOptOutUserIds } from '@/lib/services/staff-notification-pref'
import { sendNotificationEmail } from '@/lib/email'

/**
 * THE WEEKLY STANDUP (Transformation Phase 2 — DESIGN.md "The North Star",
 * primitive #4, the Narrator). Generated from the Action Ledger, written in
 * the anti-shame voice with names and stories, ending with the short list of
 * things only a human can do. The in-app card renders it on the Overview;
 * the email goes out clinic-local Monday mornings via the daily-digest cron
 * (idempotent through clinic_profile.standup_last_sent_at).
 *
 * The window is the PRIOR clinic-local week — weeks start SUNDAY midnight
 * clinic-local (clinicWeekStart), so this is [Sun-7d, Sun), exclusive upper
 * bound so consecutive weeks tile exactly. "New patients seated" comes from
 * the Phase-1 journey spine (countSeatedBetween) — ONE implementation of the
 * seated law, never a local re-derivation (round-1 Phase-2 audit).
 */

export interface StandupLine {
  capability: string
  /** Short plural noun for the counts line ("appointment reminders"). */
  noun: string
  count: number
}

export interface WeeklyStandup {
  /** Prior-week window (clinic-local SUNDAY midnight to Sunday midnight —
   *  clinicWeekStart is Sunday-based). */
  weekStart: Date
  weekEnd: Date
  /** "Jul 19 – Jul 25" in the clinic's timezone (a Sun–Sat range). */
  weekLabel: string
  totalActions: number
  /** Per-capability counts, biggest first. */
  lines: StandupLine[]
  /** Up to three ledger one-liners with a person in them — the stories. */
  stories: string[]
  /** New patients SEATED in the window — read from the journey spine
   *  (countSeatedBetween), the same law /growth quotes. */
  newPatientsSeated: number
  /** Google/Facebook reviews posted in the window. */
  reviewsReceived: number
  /** The short list of things only a human can do. */
  humanTasks: { openProposals: number; followupsDue: number }
  /** True when the machine has nothing to report AND nothing is waiting —
   *  the email stays quiet instead of celebrating zero. */
  quiet: boolean
  /** The empty-window narration (round-1 audit, the AUDITS.md mandate: a
   *  quiet week must be narrated from automation-CONFIG cross-checks so a
   *  healthy idle clinic and a switched-off engine never look the same).
   *  Set ONLY when totalActions === 0; the card renders it. */
  quietNote: string | null
  /**
   * "Some of my own jobs hit trouble" — on EVERY week, not only quiet ones
   * (round-10 in-phase gap).
   *
   * Round 9 taught the quiet branch to stop claiming an all-clear when the
   * ledger held failures, and left the busy branch — the one a working
   * practice actually reads, fifty weeks a year — reporting "41 reminders,
   * 6 answers" with no mention that four jobs broke. Work counts EXCLUDE
   * failures by law, so a busy week is exactly as capable of hiding them as
   * a quiet one; the sibling was simply never swept. Null when nothing
   * failed.
   */
  failureNote: string | null
  /** True when the whole window predates the clinic's account (round-3
   *  audit): a three-day-old clinic must never read a confident report —
   *  even "a quiet week" — about a week it wasn't a customer. The card
   *  hides and the Monday email skips. */
  predatesAccount: boolean
}

/** Count-line nouns, singular AND plural — the registry labels are verb
 *  phrases ("Send appointment reminders"), which read wrong after a number,
 *  and a hard-plural map read "1 blog posts published" in the normal
 *  single-occurrence week (round-2 audit). */
const STANDUP_NOUNS: Record<string, { one: string; many: string }> = {
  appointment_reminder: { one: 'appointment reminder', many: 'appointment reminders' },
  review_request: { one: 'review invitation', many: 'review invitations' },
  campaign_send: { one: 'campaign send', many: 'campaign sends' },
  retention_automation: { one: 'recall & win-back note', many: 'recall & win-back notes' },
  followup_rule: { one: 'follow-up opened', many: 'follow-ups opened' },
  balance_nudge: { one: 'balance reminder', many: 'balance reminders' },
  auto_reply: { one: 'after-hours reply', many: 'after-hours replies' },
  forms_reminder: { one: 'form nudge', many: 'form nudges' },
  nps_survey: { one: 'visit check-in', many: 'visit check-ins' },
  noshow_rebook: { one: 'rebook invitation', many: 'rebook invitations' },
  waitlist_offer: { one: 'waitlist offer', many: 'waitlist offers' },
  payment_autocharge: { one: 'plan payment collected', many: 'plan payments collected' },
  service_copywriting: { one: 'service page written', many: 'service pages written' },
  scheduled_message: { one: 'scheduled message delivered', many: 'scheduled messages delivered' },
  blog_publish: { one: 'blog post published', many: 'blog posts published' },
  scheduled_social: { one: 'social post published', many: 'social posts published' },
  domain_autorenew: { one: 'domain renewal', many: 'domain renewals' },
  listing_sync: { one: 'listing update', many: 'listing updates' },
  review_feature: { one: 'review featured on your site', many: 'reviews featured on your site' },
  review_reply: { one: 'review reply', many: 'review replies' },
  social_post: { one: 'post published', many: 'posts published' },
  inquiry_response: { one: 'inquiry answered', many: 'inquiries answered' },
  outreach_campaign: { one: 'campaign sent', many: 'campaigns sent' },
  content_plan: { one: 'content plan scheduled', many: 'content plans scheduled' },
}

export function standupNoun(capability: string, count = 2): string {
  const pair = STANDUP_NOUNS[capability]
  if (!pair) return capability.replace(/_/g, ' ')
  return count === 1 ? pair.one : pair.many
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

  const [counts, entries, openProposals, followupsDue, newPatientsSeated, reviewsReceived, orgCreatedAt] =
    await Promise.all([
      countActionsSince(organizationId, weekStart, { until: weekEnd }),
      listRecentActions(organizationId, { since: weekStart, until: weekEnd, limit: 200 }),
      countOpenProposals(organizationId),
      countFollowupsDue(organizationId, now),
      // THE journey spine's windowed seated count — same anchors/suppression
      // as /growth (one law, one implementation; round-1 Phase-2 audit).
      countSeatedBetween(organizationId, weekStart, weekEnd),
      countReviewsInWindow(organizationId, weekStart, weekEnd),
      readOrgCreatedAt(organizationId),
    ])
  // The account is younger than the whole window → there is no week to
  // narrate; anything we'd say ("a quiet week…") would be about a period the
  // clinic wasn't a customer (round-3 audit). Actions in the window anyway
  // (imported history quirks) fall through to honest narration.
  const predatesAccount =
    orgCreatedAt != null && orgCreatedAt >= weekEnd && Object.keys(counts).length === 0

  const lines: StandupLine[] = Object.entries(counts)
    .map(([capability, count]) => ({ capability, noun: standupNoun(capability, count), count }))
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
    // WORK only — an autonomy switch flip and an "I couldn't" note are real
    // events, but neither is a story about something that got done, and the
    // grant sentence was story-eligible under every grantable capability
    // (round-1 Phase-3 audit).
    if (!isWorkEntry(e.detail)) continue
    if (!e.patientId && !STORY_PRIORITY.includes(e.capability)) continue
    if (seenCapability.has(e.capability)) continue
    seenCapability.add(e.capability)
    storied.push(e.summary)
  }

  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' })
  const lastDay = new Date(weekEnd.getTime() - 1)

  // THE EMPTY-WINDOW NARRATION (round-1 audit; the AUDITS.md mandate): a
  // quiet week is narrated from automation-CONFIG cross-checks, so "nothing
  // needed doing" and "nothing ran because a switch is off" never look the
  // same. Only computed when there is nothing else to say.
  // EVERY week reads the failures, not only the quiet ones (round-10 gap).
  // Best-effort: an unreadable count reads as zero, which never invents
  // trouble that wasn't there.
  // ENGINE failures only (round-11 audit). The other producer is the autonomy
  // hand-back — the machine deliberately STOPPING after two tries and putting
  // the card back in front of a human — and it is already narrated as its own
  // ledger line and counted in `openProposals` below. Summing the two made
  // this say "that's mine to sort out, and I'm on it" about a card the same
  // report listed two lines down as waiting on THEM, contradicting the
  // machine's own sentence ("it's back with you").
  const failures = predatesAccount
    ? 0
    : await countFailuresSince(organizationId, weekStart, {
        until: weekEnd,
        kind: 'engine',
      }).catch((e) => {
        console.error('[standup] failure count failed', e)
        return 0
      })
  // NO NUMBER (round-12 audit). The count is rows, and the only producer
  // writes at most one row per org per DAY and collapses several broken
  // steps in a tick into one — so it is neither a count of jobs nor a count
  // of days, and both readings are wrong in the common cases (one job broken
  // for five days reads as "5 jobs"; five jobs broken in one day reads as
  // "1"). The same counter-vs-explainer disagreement round 11 fixed one file
  // over, re-introduced BY that round's fix. There is no honest number to
  // quote here yet, so the sentence quotes none — it says the true thing and
  // owns it, which is all the clinic needed from it anyway.
  const failureNote =
    failures > 0
      ? 'Some of my own jobs hit trouble this week and didn’t get through. That’s mine to sort out, and I’m on it.'
      : null

  let quietNote: string | null = null
  if (totalActions === 0 && !predatesAccount) {
    // AND THE FAILURES (round-9 audit). `totalActions` is WORK-only by law,
    // so a week in which every job the machine attempted FAILED arrives here
    // as zero — arithmetically identical to a week where nothing needed
    // doing. With both switches on, the machine then told the practice
    // "nothing needed sending… I’m watching" while seven days of its own
    // "I couldn't" rows sat in that same clinic's ledger. Round 8 taught the
    // Guardian's clinic-facing sentence to hedge for exactly this and left
    // its sibling here asserting an all-clear — the phase's signature
    // defect, on the product's flagship honesty surface.
    //
    const engine = await readEngineSwitches(organizationId)
    // Mine to fix, not theirs to chase — the same law that keeps failure
    // findings away from the Guardian's clinic audience. It is named, it is
    // owned, and it asks nothing of them.
    const mine = failures > 0 ? ' Some of my own jobs also hit trouble this week — that one’s mine to sort out, and I’m on it.' : ''
    if (!engine.remindersOn && !engine.reviewRequestsOn) {
      quietNote =
        'A quiet week — and a heads up: appointment reminders and review requests are both switched off, so I can’t send any. Turn them on in Settings when you’re ready.' +
        mine
    } else if (!engine.remindersOn) {
      quietNote =
        'A quiet week — one heads up: appointment reminders are switched off, so I can’t send any. Turn them on in Settings when you’re ready.' +
        mine
    } else if (!engine.reviewRequestsOn) {
      quietNote =
        'A quiet week — one heads up: automatic review requests are switched off. Turn them on in Growth → Reviews when you’re ready.' +
        mine
    } else if (failures > 0) {
      // NEVER the all-clear line below. Nothing went out, and the reason is
      // that my own jobs broke — saying "nothing needed sending" here is the
      // machine asserting it is fine when it is not.
      quietNote =
        'A quiet week for sending — but not a clean one: some of my own jobs hit trouble and didn’t get through. That’s mine to sort out, and I’m on it.'
    } else {
      quietNote =
        'A quiet week — nothing needed sending. Reminders and review requests are on, and I’m watching.'
    }
  }

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
    // A WEEK OF FAILURES IS NOT A QUIET WEEK (round-11 audit). `quiet`
    // suppresses the Monday email entirely, and it was computed from
    // work-only counts — so the one week rounds 9 and 10 taught this thing
    // to admit its own breakage was exactly the week the email carrying
    // that admission never sent. "Nothing happened" and "everything I tried
    // broke" are opposite facts arriving as the same zero.
    quiet: totalActions === 0 && failures === 0 && openProposals === 0 && followupsDue === 0,
    quietNote,
    failureNote,
    predatesAccount,
  }
}

/** Best-effort org age read — unknown reads as "old enough to narrate"
 *  (never suppress a real report over a failed lookup). */
async function readOrgCreatedAt(organizationId: string): Promise<Date | null> {
  try {
    const [row] = await db
      .select({ createdAt: schema.organization.createdAt })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1)
    return row?.createdAt ?? null
  } catch (e) {
    // Unknown age reads as "old enough to narrate" (never suppress a real
    // report over a failed lookup) — but says so.
    console.error('[standup] org age read failed', e)
    return null
  }
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
    // The config-cross-checked quiet narration — never a bare zero.
    parts.push(`• ${s.quietNote ?? 'A quiet week on my side — nothing needed sending.'}`)
  }
  // A busy week hides failures exactly as well as a quiet one, because the
  // counts above are work-only by law (round-10 gap). Gated on `lines` so it
  // is not said twice: in a work-empty week the sentence is already inside
  // `quietNote`, which the branch above prints.
  if (s.failureNote && s.lines.length > 0) {
    parts.push('')
    parts.push(s.failureNote)
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
    // NO org-level gate on dailyDigestEnabled (round-2 audit): that column
    // defaults to 0 and no real clinic-creation path sets it, so gating on
    // it made the Monday email dead on arrival for every production clinic
    // — an off DEFAULT where round 1 wanted an off SWITCH. The off switch
    // is the per-staff opt-out below ("every knob has a learned default");
    // a dedicated org toggle ships with the notifications settings page.
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
      // A window that predates the account is skipped like a quiet week —
      // a brand-new clinic's first email must not report on a week it
      // wasn't a customer (round-3 audit).
      if (standup.quiet || standup.predatesAccount) {
        result.skippedQuiet++
        continue
      }

      // Claim the week BEFORE sending so a concurrent run can't double-email —
      // and claim ATOMICALLY (conditional on the prior value): the daily tick
      // is at-least-once, and two overlapping runs both passing the JS check
      // above must not both send (round-1 audit).
      const claimed = await db
        .update(schema.clinicProfile)
        .set({ standupLastSentAt: now })
        .where(
          and(
            eq(schema.clinicProfile.organizationId, clinic.organizationId),
            or(
              isNull(schema.clinicProfile.standupLastSentAt),
              lt(schema.clinicProfile.standupLastSentAt, thisWeekStart),
            ),
          ),
        )
        .returning({ organizationId: schema.clinicProfile.organizationId })
      if (claimed.length === 0) {
        result.skippedAlready++
        continue
      }

      // Every staff member (the office manager is usually 'admin', not
      // 'owner' — the report about her own front desk must reach her),
      // minus anyone who muted DreamCRM email (the same per-staff opt-out
      // the morning digest honors). Round-1 audit.
      const [staff, optedOut] = await Promise.all([
        db
          .select({ userId: schema.member.userId, name: schema.user.name, email: schema.user.email })
          .from(schema.member)
          .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
          .where(and(eq(schema.member.organizationId, clinic.organizationId), ne(schema.member.role, 'patient'))),
        getDigestOptOutUserIds(clinic.organizationId),
      ])

      const body = renderStandupEmailBody(standup, clinic.clinicName ?? 'your clinic')
      for (const s of staff) {
        if (!s.email || optedOut.has(s.userId)) continue
        // Per-recipient isolation (round-2 audit): the week is already
        // claimed, so one bouncing address must cost only that recipient —
        // without this, staff #2..N lost their email and the claimed week
        // never retried. Same shape as the morning digest's fan-out.
        try {
          await sendNotificationEmail({
            to: s.email,
            name: s.name ?? undefined,
            title: `Your week with DreamCRM — ${standup.weekLabel}`,
            body,
            linkPath: '/dashboard',
          })
          result.sent++
        } catch (err) {
          result.errors.push({
            organizationId: clinic.organizationId,
            error: `send to ${s.email} failed: ${err instanceof Error ? err.message : 'unknown'}`,
          })
        }
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
