import 'server-only'
import { sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  DEFAULT_SEND_HOUR,
  learnBestSendHour,
  resolveSharedBrain,
  type HourStat,
  type SendHourFinding,
  type SharedBrain,
} from '@/lib/shared-brain'
import {
  readPlatformConfig,
  readPlatformConfigStrict,
  writePlatformConfig,
} from '@/lib/services/platform-config'

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
 *
 * WHY THIS IS INERT, AND HONESTLY SO (round-14 in-phase gap). Restricting
 * the sample to the population the learned hour actually acts on —
 * automation campaigns — surfaces the structural fact underneath: every
 * automated send already aims at the hour in force, so exactly one bucket
 * fills and `eligible.length < 2` holds forever. The brain therefore cannot
 * move the hour on its own, and that is the correct behaviour rather than a
 * bug: the only honest way to learn a better hour is to deliberately send
 * some of them somewhere else and compare, which is an EXPLORATION ARM (a
 * small holdout at another hour) this phase does not ship. It is named in
 * docs/AUDITS.md as the next slice. Pooling incomparable sends to
 * manufacture a second bucket is the one thing we will not do — that is a
 * confounded comparison wearing a finding's clothes.
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
      join ${schema.organization} o on o.id = c.organization_id
      where ce.type = 'sent' and ce.occurred_at >= ${since}::timestamptz
        -- AUTOMATION SENDS ONLY (round-14 in-phase gap). THE LEARNED HOUR IS
        -- APPLIED TO EXACTLY ONE THING -- automationSendAt in
        -- retention-automation.ts -- so the sample has to be the same
        -- population the action lands on. Without this the aggregate pooled
        -- automated birthday/reactivation/welcome mail with human-made
        -- marketing blasts, which do not share an open rate at ANY hour and
        -- systematically go out at DIFFERENT hours (automations at the
        -- incumbent by construction, blasts whenever staff hit send). The
        -- buckets differed by CONTENT before they differed by TIME, and
        -- MIN_LIFT 3-point margin is far smaller than the gap between
        -- those two kinds of mail — so all three floors could pass on a
        -- comparison that never controlled for what was being sent. The
        -- floors bound sample size and margin; they cannot bound
        -- comparability.
        and c.automation_key is not null
        -- REAL CLINICS ONLY (round-1 audit). Without this the aggregate
        -- counted the DEMO org — whose seeder writes real campaign_events
        -- rows, re-dated on every deploy — and the platform tenant's own
        -- B2B marketing sends. Both have their own organization_id, so
        -- count(distinct …) happily cleared MIN_CLINICS_PER_HOUR on two
        -- real practices plus fabricated seed data, and the platform could
        -- announce a "cross-clinic" finding that was nothing of the kind.
        -- The same predicate guardian.ts and proposal-generators.ts use.
        and o.type = 'clinic' and o.is_demo = false
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
  // What is in force today — the incumbent a challenger has to beat.
  //
  // A FAILED READ ABORTS THE PASS (round-6 audit). Falling back to the
  // shipped default here would silently swap the incumbent: MIN_LIFT would
  // measure the week's winner against hour 10 while every clinic was sending
  // at a learned 3 PM, and a marginal challenger would win a comparison it
  // should have lost. The same failure the round-1 fix removed, re-entering
  // through the error path. Not knowing what is in force is a reason to skip
  // a weekly pass, never a reason to guess.
  // STRICT, so the branch below is reachable (round-7 audit: the plain read
  // swallows every error and returns {}, which made this abort dead code —
  // the incumbent silently became the shipped default and the pass carried
  // on and overwrote what was known).
  let current: SharedBrain
  try {
    current = resolveSharedBrain(await readPlatformConfigStrict())
  } catch (e) {
    return {
      ok: false,
      error: `config unreadable: ${(e as Error).message}`,
      finding: { hour: DEFAULT_SEND_HOUR, learned: false, why: 'Could not read what is in force.', sampleSends: 0 },
    }
  }
  let stats: HourStat[]
  try {
    stats = await collectSendHourStats(now)
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message,
      finding: {
        hour: current.sendHour,
        learned: current.sendHourLearned,
        why: current.sendHourWhy,
        sampleSends: current.sampleSends,
      },
    }
  }

  const finding = learnBestSendHour(stats, current.sendHour, current.sendHourLearned)
  await writePlatformConfig({
    sharedBrain: {
      sendHour: finding.hour,
      sendHourLearned: finding.learned,
      sendHourWhy: finding.why,
      learnedAt: now.toISOString(),
      // Stored so the card can show the sample against the floors — the
      // difference between an honest wait and a magic number (round-10 gap).
      sampleSends: finding.sampleSends,
    },
  })
  return { ok: true, finding }
}

/** What the platform currently knows. Floored at the shipped defaults on
 *  every failure path — a scheduler must never receive an undefined hour. */
export async function getSharedBrain(): Promise<SharedBrain> {
  return resolveSharedBrain(await readPlatformConfig())
}
