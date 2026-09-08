import 'server-only'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { marketingSpend } from '@/lib/db/schema/domain'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import {
  MARKETING_CHANNELS,
  parseSignupAttribution,
  type MarketingChannel,
} from '@/lib/marketing-attribution'
import {
  MONTH_KEY_RE,
  assessDials,
  monthKeyOf,
  type DialsAssessment,
  type MonthCohortInput,
} from '@/lib/marketing-dials'
import { hasPaidSubscription } from '@/lib/trial'

/**
 * The dials cockpit's server side (docs/marketing-engine.md, slice 3):
 * record what was spent, join it with the signup cohorts the sensor layer
 * already stamps, and hand the pure dial math a month-by-month picture.
 * Platform-facing only — Dream Create's own money.
 */

/** How far back the cockpit looks. 6 months covers two judged (60-day-lag)
 *  months plus the collecting window, without turning into an archive. */
const REPORT_MONTHS = 6

const isChannel = (c: string): c is MarketingChannel =>
  (MARKETING_CHANNELS as readonly string[]).includes(c)

export interface RecordSpendInput {
  month: string
  channel: string
  /** Whole dollars from the form; stored as cents. */
  amountCents: number
  note?: string | null
}

export type RecordSpendResult = { ok: true } | { ok: false; error: string }

/** Upsert one (month, channel) spend figure. Re-entering replaces — the
 *  owner's latest number is the number. */
export async function recordSpend(input: RecordSpendInput): Promise<RecordSpendResult> {
  if (!MONTH_KEY_RE.test(input.month)) return { ok: false, error: 'Pick a month.' }
  if (!isChannel(input.channel)) return { ok: false, error: 'Pick a channel.' }
  const amount = Math.round(input.amountCents)
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_00 * 10) {
    return { ok: false, error: 'Enter the month’s spend in dollars.' }
  }
  const note = (input.note ?? '').trim().slice(0, 200) || null
  await db
    .insert(marketingSpend)
    .values({ month: input.month, channel: input.channel, amountCents: amount, note })
    .onConflictDoUpdate({
      target: [marketingSpend.month, marketingSpend.channel],
      set: { amountCents: amount, note, updatedAt: new Date() },
    })
  return { ok: true }
}

export interface SpendRow {
  month: string
  channel: MarketingChannel
  amountCents: number
  note: string | null
}

export interface DialsReport {
  assessment: DialsAssessment
  /** The raw recorded rows (newest month first) so the entry form can show
   *  and correct what's on file. */
  spendRows: SpendRow[]
}

/** Month keys for the trailing window, oldest → newest, current included. */
function windowMonths(now: Date): string[] {
  const months: string[] = []
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  for (let i = REPORT_MONTHS - 1; i >= 0; i--) {
    months.push(monthKeyOf(new Date(Date.UTC(y, m - i, 1))))
  }
  return months
}

/**
 * The whole cockpit read: recorded spend + signup cohorts by calendar month
 * (UTC, same bucketing as the pageview rollup), graded through the SAME
 * paid rules as the billing wall. Demo orgs excluded — a seeded clinic is
 * not an acquisition, and it is definitely not a CAC.
 */
export async function getDialsReport(now: Date = new Date()): Promise<DialsReport> {
  const months = windowMonths(now)
  const firstMonth = months[0]
  const windowStart = new Date(`${firstMonth}-01T00:00:00.000Z`)

  const spendRowsRaw = await db
    .select({
      month: marketingSpend.month,
      channel: marketingSpend.channel,
      amountCents: marketingSpend.amountCents,
      note: marketingSpend.note,
    })
    .from(marketingSpend)
    .where(gte(marketingSpend.month, firstMonth))
  const spendRows: SpendRow[] = spendRowsRaw
    .filter((r) => isChannel(r.channel))
    .map((r) => ({ ...r, channel: r.channel as MarketingChannel }))
    .sort((a, b) => (a.month > b.month ? -1 : a.month < b.month ? 1 : a.channel.localeCompare(b.channel)))

  const signupRows = await db
    .select({
      createdAt: clinicProfile.createdAt,
      attribution: clinicProfile.signupAttribution,
      subscriptionStatus: clinicProfile.subscriptionStatus,
      stripeSubscriptionId: clinicProfile.stripeSubscriptionId,
    })
    .from(clinicProfile)
    .innerJoin(organization, eq(organization.id, clinicProfile.organizationId))
    .where(
      and(
        eq(organization.type, 'clinic'),
        eq(organization.isDemo, false),
        gte(clinicProfile.createdAt, windowStart),
      ),
    )

  const cohorts = new Map<string, MonthCohortInput>(
    months.map((month) => [
      month,
      {
        month,
        spendByChannel: {},
        signupsByChannel: {},
        payingByChannel: {},
        totalSignups: 0,
        totalPaying: 0,
      },
    ]),
  )

  for (const r of spendRows) {
    const c = cohorts.get(r.month)
    if (!c) continue // outside the window — sorted rows can't hit this, kept for safety
    c.spendByChannel[r.channel] = (c.spendByChannel[r.channel] ?? 0) + r.amountCents
  }

  for (const s of signupRows) {
    const c = cohorts.get(monthKeyOf(s.createdAt))
    if (!c) continue
    const paid = hasPaidSubscription(s)
    c.totalSignups++
    if (paid) c.totalPaying++
    const stamp = parseSignupAttribution(s.attribution)
    if (!stamp) continue
    c.signupsByChannel[stamp.channel] = (c.signupsByChannel[stamp.channel] ?? 0) + 1
    if (paid) c.payingByChannel[stamp.channel] = (c.payingByChannel[stamp.channel] ?? 0) + 1
  }

  return {
    assessment: assessDials(Array.from(cohorts.values()), now),
    spendRows,
  }
}
