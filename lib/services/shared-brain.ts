import 'server-only'
import { sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  learnBestSendHour,
  resolveSharedBrain,
  type HourStat,
  type SendHourFinding,
  type SharedBrain,
} from '@/lib/shared-brain'
import { readPlatformConfig, writePlatformConfig } from '@/lib/services/platform-config'

/**
 * THE SHARED BRAIN (Transformation Phase 4), service half. Aggregates what
 * every clinic's sends have taught the platform, and stores the conclusion
 * where every clinic's scheduler reads it.
 *
 * THE PRIVACY LINE, and where it is drawn: the correlation between a send
 * and an open needs the recipient's address, so that join happens INSIDE
 * Postgres and nothing but `(hour, sent, opened, clinics)` ever comes back
 * over the wire. No address, no patient id, no clinic id crosses into
 * application memory, let alone into the stored default. The learned value
 * is one integer between 8 and 18.
 *
 * The window is deliberately long (90 days): send-time behaviour is a
 * seasonal, slow-moving thing, and a short window would make the platform
 * chase last week's noise.
 */

const LOOKBACK_DAYS = 90

/**
 * Per clinic-local hour: how many sends went out, and how many of those
 * recipients opened.
 *
 * The correlation is the whole point and the easy thing to get wrong: an
 * OPEN event carries the time it was opened, not the time it was sent. A
 * naive `group by hour of occurred_at` buckets a 10 AM send opened at 2 PM
 * under 2 PM, and the platform would "learn" that the best time to send is
 * whenever people happen to read email. So sends are bucketed by their OWN
 * hour and opens are joined back to the send they belong to.
 *
 * The hour is the SENDING CLINIC's wall clock (`at time zone` against that
 * clinic's stored timezone, so it is DST-correct), because that is the only
 * frame in which "10 AM" means the same thing to a practice in Boston and
 * one in Portland.
 */
export function sendHourStatsQuery(since: Date) {
  const fallbackTz = 'America/New_York'
  return sql`
    with sends as (
      select ce.campaign_id           as campaign_id,
             ce.recipient_email       as recipient_email,
             c.organization_id        as organization_id,
             min(ce.occurred_at)      as sent_at
      from ${schema.campaignEvents} ce
      join ${schema.campaigns} c on c.id = ce.campaign_id
      where ce.type = 'sent' and ce.occurred_at >= ${since}::timestamptz
      group by 1, 2, 3
    ),
    opens as (
      select distinct ce.campaign_id as campaign_id, ce.recipient_email as recipient_email
      from ${schema.campaignEvents} ce
      where ce.type = 'open' and ce.occurred_at >= ${since}::timestamptz
    )
    select
      extract(hour from s.sent_at at time zone coalesce(cp.timezone, ${fallbackTz}::text))::int as hour,
      count(*)::int                                as sent,
      count(o.campaign_id)::int                    as opened,
      count(distinct s.organization_id)::int       as clinics
    from sends s
    left join ${schema.clinicProfile} cp on cp.organization_id = s.organization_id
    left join opens o
      on o.campaign_id = s.campaign_id and o.recipient_email = s.recipient_email
    group by 1
    order by 1
  `
}

/** The anonymous buckets. Best-effort: a platform that cannot aggregate
 *  keeps its shipped default rather than losing its scheduler. */
export async function collectSendHourStats(now: Date = new Date()): Promise<HourStat[]> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
  const res = (await db.execute(sendHourStatsQuery(since))) as unknown as {
    rows?: Array<Record<string, unknown>>
  }
  const rows = Array.isArray(res) ? res : (res.rows ?? [])
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    hour: Number(r.hour ?? 0),
    sent: Number(r.sent ?? 0),
    opened: Number(r.opened ?? 0),
    clinics: Number(r.clinics ?? 0),
  }))
}

export interface LearnResult {
  finding: SendHourFinding
  /** False when the pass could not read the data at all. */
  ok: boolean
  error?: string
}

/**
 * One learning pass: look at the platform, decide, and store. Runs weekly.
 *
 * A pass that CANNOT read keeps whatever was learned before rather than
 * overwriting it with a fallback — "we lost the database for an hour" must
 * not read as "we un-learned the best send hour".
 */
export async function runSharedBrainLearning(now: Date = new Date()): Promise<LearnResult> {
  let stats: HourStat[]
  try {
    stats = await collectSendHourStats(now)
  } catch (e) {
    const current = await getSharedBrain()
    return {
      ok: false,
      error: (e as Error).message,
      finding: {
        hour: current.sendHour,
        learned: current.sendHourLearned,
        why: current.sendHourWhy,
        sampleSends: 0,
      },
    }
  }

  const finding = learnBestSendHour(stats)
  await writePlatformConfig({
    sharedBrain: {
      sendHour: finding.hour,
      sendHourLearned: finding.learned,
      sendHourWhy: finding.why,
      learnedAt: now.toISOString(),
    },
  })
  return { ok: true, finding }
}

/** What the platform currently knows. Floored at the shipped defaults on
 *  every failure path — a scheduler must never receive an undefined hour. */
export async function getSharedBrain(): Promise<SharedBrain> {
  return resolveSharedBrain(await readPlatformConfig())
}
