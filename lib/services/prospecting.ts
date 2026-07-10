import 'server-only'
import { and, asc, desc, eq, exists, ilike, inArray, isNotNull, isNull, notInArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import {
  resolveProspectingConfig,
  LOSS_REASON_LABELS,
  type ProspectingConfig,
  type ProspectFilters,
  type ProspectFunnelStats,
  type ProspectListRow,
  type ProspectLossReason,
  type WinLossReport,
} from '@/lib/types/prospecting'
import { SEGMENT_LABELS, type OutreachSegment } from '@/lib/types/prospecting'
import { stateZip3Prefixes, stateTimeZone } from '@/lib/types/us-geo'
import { followUpForOutcome } from '@/lib/prospect-followup'
import { lossReasonForSuppression } from '@/lib/prospect-learnings'
import { relativeDayTime } from '@/lib/prospect-when'

/**
 * Prospecting core — Dream Create's own outbound growth engine. Queries,
 * config, and metering for the platform-global prospect tables. Every
 * caller is a requirePlatformAdmin() server action or a CRON_SECRET cron;
 * these tables are platform-operator data, not tenant data (see the schema
 * header for the scoping rationale).
 */

// ── Manual entry (clinics the owner cold-called, not NPPES discovery) ───────

/**
 * Add a clinic the owner personally called + is working by hand — the manual
 * on-ramp into the pipeline (discovery normally only fills it from NPPES). It
 * lands as a warm, human-sourced lead in the CALL LIST (status 'call_list' +
 * a demo_request intent), so it shows up alongside the hot inbound ones in the
 * daily briefing and the working table — but NOT in the auto-enroll pool (that
 * pulls status='enriched' only), so a hand-worked prospect never gets a cold
 * drip email. npi + dedupeHash stay null (Postgres allows many null uniques),
 * so this never collides with a discovered row.
 */
export async function addManualProspect(input: {
  name: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  websiteUrl?: string | null
  /** Free-text call notes — what they said, what they want to see. Seeds the
   *  intent summary + talking points so the deal room + call card have context. */
  note?: string | null
  /** True when a demo came out of the call (logs the call as demo_booked). */
  demoBooked?: boolean
  calledByUserId?: string | null
}): Promise<{ id: string }> {
  const id = newId('pros')
  const email = input.email?.trim().toLowerCase() || null
  const rawSite = input.websiteUrl?.trim() || null
  const websiteUrl = rawSite ? (/^https?:\/\//.test(rawSite) ? rawSite : `https://${rawSite}`) : null
  const state = input.state?.trim().toUpperCase().slice(0, 2) || null
  const note = input.note?.trim() || null
  await db.insert(schema.prospect).values({
    id,
    name: input.name.trim(),
    authorizedOfficialName: input.contactName?.trim() || null,
    phone: input.phone ? input.phone.replace(/\D/g, '') || null : null,
    email,
    emailSource: email ? 'manual' : null,
    addressLine1: input.addressLine1?.trim() || null,
    city: input.city?.trim() || null,
    state,
    // Prospect-facing times (demo confirmation, reminders) render in this tz.
    timezone: stateTimeZone(state),
    websiteUrl,
    status: 'call_list',
    scoreBand: 'warm',
    intentSignal: 'demo_request',
    intentAt: new Date(),
    intentSummary: note || 'Added by hand — sourced from an outbound call.',
    talkingPoints: note ? [note] : null,
  })
  // A manual add represents a call that already happened — log it so the clinic
  // correctly shows as "communicated" on the pipeline board (a called clinic is
  // past the untouched-prospect stage). demo_booked when a demo came out of it.
  await db.insert(schema.prospectCallLog).values({
    id: newId('pcall'),
    prospectId: id,
    outcome: input.demoBooked ? 'demo_booked' : 'callback',
    note: note,
    calledByUserId: input.calledByUserId ?? null,
  })
  return { id }
}

/**
 * Is this clinic likely already in the pipeline? Checked before a manual add so
 * the owner doesn't create a duplicate of a discovered (or previously-added)
 * prospect. Matches on normalized phone first (strongest signal), then on an
 * exact name + state match. Returns the existing row's headline fields for the
 * "already in your pipeline — open it?" prompt, or null.
 */
export async function findExistingProspect(input: {
  phone?: string | null
  name: string
  state?: string | null
}): Promise<{ id: string; name: string; city: string | null; status: string } | null> {
  const cols = {
    id: schema.prospect.id,
    name: schema.prospect.name,
    city: schema.prospect.city,
    status: schema.prospect.status,
  }
  const phone = input.phone ? input.phone.replace(/\D/g, '') : ''
  if (phone.length >= 7) {
    const [byPhone] = await db.select(cols).from(schema.prospect).where(eq(schema.prospect.phone, phone)).limit(1)
    if (byPhone) return byPhone
  }
  const name = input.name.trim().toLowerCase()
  const state = input.state?.trim().toUpperCase().slice(0, 2) || null
  const [byName] = await db
    .select(cols)
    .from(schema.prospect)
    .where(
      and(
        sql`lower(${schema.prospect.name}) = ${name}`,
        state ? eq(schema.prospect.state, state) : sql`true`,
      ),
    )
    .limit(1)
  return byName ?? null
}

// ── Pipeline board (the Kanban) ─────────────────────────────────────────────

/** Prospects we treat as closed/off-board (won or lost). */
const PIPELINE_TERMINAL = ['converted', 'suppressed', 'disqualified', 'not_interested']

/** Colors the card's next-step line: what to DO, not just what happened. */
export type PipelineCardTone = 'due' | 'reply' | 'quiet'

export interface PipelineCard {
  prospectId: string
  name: string
  city: string | null
  state: string | null
  /** One-line next step / context (a demo time, "Replied — call them", …). */
  subtitle: string | null
  href: string
  /** Time-sensitive — a booked demo happening today or tomorrow. */
  soon?: boolean
  /** Semantic color for the subtitle (Communicated cards' next-step). */
  tone?: PipelineCardTone
}

export interface PipelineBoard {
  /**
   * Untouched leads (not yet communicated or demoed) + the grand total tracked,
   * plus the warmth breakdown of the waiting pool (hot/warm/cool, cool absorbing
   * low + unscored) so the count reads as a quality signal, not just a number.
   */
  prospects: { count: number; tracked: number; hot: number; warm: number; cool: number }
  communicated: { count: number; cards: PipelineCard[] }
  demoScheduled: { count: number; cards: PipelineCard[] }
  demoCompleted: { count: number; cards: PipelineCard[] }
}

/** A booked demo this close counts as "soon" — earns the highlight treatment. */
const SOON_WINDOW_MS = 36 * 60 * 60 * 1000

/**
 * The pipeline board — every active prospect projected onto its FURTHEST stage:
 *
 *   Prospects → Communicated → Demo Scheduled → Demo Completed
 *
 * Derived purely from data (no stage column, no dragging): a prospect is
 * "communicated" once it has an AI outreach touch or a logged call; "demo
 * scheduled" once it has a booked meeting in the future; "demo completed" once
 * that meeting's time has passed. It moves itself. Won/lost drop off the board.
 */
export async function getPipelineBoard(opts?: { now?: Date; perColumn?: number }): Promise<PipelineBoard> {
  const now = opts?.now ?? new Date()
  const per = opts?.perColumn ?? 6
  const config = await getProspectingConfig()
  const hostTz = config.booking.hostTimeZone || 'America/New_York'
  // Humanize demo times relative to the host's today ("Today · 2:00 PM",
  // "Tomorrow · …", weekday, else absolute) — shared with the demos page.
  const fmtWhen = (d: Date) => relativeDayTime(d, hostTz, now)

  const p = schema.prospect
  const detail = `/platform/prospecting?prospect=`

  // Demos joined to active prospects → each prospect's soonest-upcoming or
  // most-recent-past meeting.
  const meetings = await db
    .select({
      prospectId: schema.prospectMeeting.prospectId,
      scheduledAt: schema.prospectMeeting.scheduledAt,
      mstatus: schema.prospectMeeting.status,
      name: p.name,
      city: p.city,
      state: p.state,
    })
    .from(schema.prospectMeeting)
    .innerJoin(p, eq(p.id, schema.prospectMeeting.prospectId))
    .where(
      and(
        inArray(schema.prospectMeeting.status, ['booked', 'completed', 'no_show']),
        isNotNull(schema.prospectMeeting.scheduledAt),
        notInArray(p.status, PIPELINE_TERMINAL),
      ),
    )
    .orderBy(desc(schema.prospectMeeting.scheduledAt))

  const upById = new Map<string, { card: PipelineCard; ms: number }>()
  const doneById = new Map<string, { card: PipelineCard; ms: number }>()
  for (const m of meetings) {
    if (!m.scheduledAt) continue
    const ms = m.scheduledAt.getTime()
    const card: PipelineCard = {
      prospectId: m.prospectId,
      name: m.name,
      city: m.city,
      state: m.state,
      subtitle: fmtWhen(m.scheduledAt),
      href: `${detail}${m.prospectId}`,
      soon: ms > now.getTime() && ms - now.getTime() <= SOON_WINDOW_MS,
    }
    if (ms > now.getTime() && m.mstatus === 'booked') {
      const cur = upById.get(m.prospectId)
      if (!cur || ms < cur.ms) upById.set(m.prospectId, { card, ms }) // soonest
    } else {
      const cur = doneById.get(m.prospectId)
      if (!cur || ms > cur.ms) doneById.set(m.prospectId, { card, ms }) // most recent
    }
  }
  // An upcoming demo outranks a past one for the same prospect.
  upById.forEach((_v, pid) => doneById.delete(pid))
  const demoIds = new Set<string>([...Array.from(upById.keys()), ...Array.from(doneById.keys())])
  const scheduledCards = Array.from(upById.values()).sort((a, b) => a.ms - b.ms).map((x) => x.card)
  const completedCards = Array.from(doneById.values()).sort((a, b) => b.ms - a.ms).map((x) => x.card)

  // Communicated: an AI outreach touch (sent) OR a logged call — minus anyone
  // already in a demo stage. We also pull the follow-up state + the most
  // recent contact so each card can say what to DO next, not just that we
  // talked. lastContactAt = latest of a sent touch or a logged call (GREATEST
  // skips nulls in Postgres).
  const commRows = await db
    .select({
      id: p.id,
      name: p.name,
      city: p.city,
      state: p.state,
      intentSignal: p.intentSignal,
      intentAt: p.intentAt,
      nextFollowUpAt: p.nextFollowUpAt,
      followUpReason: p.followUpReason,
      lastContactAt: sql<string | null>`GREATEST(
        (SELECT MAX(${schema.outreachTouchLog.sentAt}) FROM ${schema.outreachTouchLog}
           WHERE ${schema.outreachTouchLog.prospectId} = ${p.id} AND ${schema.outreachTouchLog.status} = 'sent'),
        (SELECT MAX(${schema.prospectCallLog.createdAt}) FROM ${schema.prospectCallLog}
           WHERE ${schema.prospectCallLog.prospectId} = ${p.id})
      )`,
    })
    .from(p)
    .where(
      and(
        notInArray(p.status, PIPELINE_TERMINAL),
        or(
          exists(
            db
              .select({ x: sql`1` })
              .from(schema.outreachTouchLog)
              .where(
                and(
                  eq(schema.outreachTouchLog.prospectId, p.id),
                  eq(schema.outreachTouchLog.status, 'sent'),
                ),
              ),
          ),
          exists(
            db
              .select({ x: sql`1` })
              .from(schema.prospectCallLog)
              .where(eq(schema.prospectCallLog.prospectId, p.id)),
          ),
        ),
      ),
    )
    .orderBy(desc(p.intentAt))

  const commActive = commRows.filter((r) => !demoIds.has(r.id))
  // A positive inbound signal → they raised a hand; call them. (not_interested
  // is terminal and already filtered out, so it's not here.)
  const POSITIVE_REPLY = ['interested', 'question', 'demo_request', 'reply']
  const DAY_MS = 24 * 60 * 60 * 1000
  // Compact so it fits the narrow column; the tone carries the urgency.
  const nextStep = (r: (typeof commActive)[number]): { subtitle: string; tone?: PipelineCardTone } => {
    if (r.nextFollowUpAt && r.nextFollowUpAt.getTime() <= now.getTime()) {
      const overdue = Math.floor((now.getTime() - r.nextFollowUpAt.getTime()) / DAY_MS)
      const due = overdue <= 0 ? 'now' : `${overdue}d`
      return { subtitle: `⏰ Follow up · ${due}`, tone: 'due' }
    }
    if (r.intentSignal && POSITIVE_REPLY.includes(r.intentSignal)) {
      return { subtitle: '📞 Call them', tone: 'reply' }
    }
    const last = r.lastContactAt ? new Date(r.lastContactAt) : null
    const days = last ? Math.floor((now.getTime() - last.getTime()) / DAY_MS) : null
    if (days !== null && days >= 7) return { subtitle: `${days}d quiet`, tone: 'quiet' }
    if (days !== null && days >= 1) return { subtitle: `Sent · ${days}d` }
    return { subtitle: 'Sent today' }
  }
  const communicatedCards: PipelineCard[] = commActive.slice(0, per).map((r) => {
    const step = nextStep(r)
    return {
      prospectId: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      subtitle: step.subtitle,
      tone: step.tone,
      href: `${detail}${r.id}`,
    }
  })

  // Pull id + band for every active prospect so we can both total them and
  // tally the warmth of the *untouched* pool (excluding anyone already
  // communicated or in a demo stage) — a few thousand rows at most.
  const activeRows = await db
    .select({ id: p.id, band: p.scoreBand })
    .from(p)
    .where(notInArray(p.status, PIPELINE_TERMINAL))
  const activeTotal = activeRows.length

  const worked = new Set<string>([...commActive.map((r) => r.id), ...Array.from(demoIds)])
  let hot = 0
  let warm = 0
  let cool = 0 // absorbs cool + low + unscored
  for (const r of activeRows) {
    if (worked.has(r.id)) continue
    if (r.band === 'hot') hot++
    else if (r.band === 'warm') warm++
    else cool++
  }

  const communicatedCount = commActive.length
  const untouched = Math.max(0, activeTotal - communicatedCount - scheduledCards.length - completedCards.length)

  return {
    prospects: { count: untouched, tracked: activeTotal, hot, warm, cool },
    communicated: { count: communicatedCount, cards: communicatedCards },
    demoScheduled: { count: scheduledCards.length, cards: scheduledCards.slice(0, per) },
    demoCompleted: { count: completedCards.length, cards: completedCards.slice(0, per) },
  }
}

// ── Pipeline momentum (this-week flow, week-over-week) ──────────────────────

/** One momentum metric: this-week count + the prior week's, for a delta. */
export interface MomentumMetric {
  now: number
  prev: number
}
export interface PipelineMomentum {
  /** Emails the hunter sent + calls you logged. */
  reachedOut: MomentumMetric
  /** Replies that came back. */
  replies: MomentumMetric
  /** Demos that got a time on the calendar. */
  demosBooked: MomentumMetric
  /** Prospects that became paying clinics. */
  won: MomentumMetric
}

/**
 * The machine's FLOW over the trailing 7 days, paired with the 7 days before
 * it so each number reads as momentum, not just a total. Complements the board
 * (a snapshot) and the briefing (today's actions): this answers "are we
 * building?". All windows are rolling from `now` — no timezone bucketing
 * needed, these are volume counts, not day labels.
 */
export async function getPipelineMomentum(opts?: { now?: Date }): Promise<PipelineMomentum> {
  const now = opts?.now ?? new Date()
  const DAY = 24 * 60 * 60 * 1000
  const w1 = new Date(now.getTime() - 7 * DAY) // start of the current week window
  const w2 = new Date(now.getTime() - 14 * DAY) // start of the prior week window

  // count(*) FILTER split: rows in [w1, now] → cur; rows in [w2, w1) → prev.
  const split = (col: ReturnType<typeof sql>) => ({
    cur: sql<number>`count(*) filter (where ${col} >= ${w1})::int`,
    prev: sql<number>`count(*) filter (where ${col} >= ${w2} and ${col} < ${w1})::int`,
  })

  const sc = schema.outreachTouchLog.sentAt
  const [sends = { cur: 0, prev: 0 }] = await db
    .select(split(sql`${sc}`))
    .from(schema.outreachTouchLog)
    .where(and(inArray(schema.outreachTouchLog.channel, ['resend', 'gmail']), sql`${sc} >= ${w2}`))

  const cc = schema.prospectCallLog.createdAt
  const [calls = { cur: 0, prev: 0 }] = await db
    .select(split(sql`${cc}`))
    .from(schema.prospectCallLog)
    .where(sql`${cc} >= ${w2}`)

  const ec = schema.outreachEvent.occurredAt
  const [replies = { cur: 0, prev: 0 }] = await db
    .select(split(sql`${ec}`))
    .from(schema.outreachEvent)
    .where(and(eq(schema.outreachEvent.type, 'reply'), sql`${ec} >= ${w2}`))

  const bc = schema.prospectMeeting.bookedAt
  const [demos = { cur: 0, prev: 0 }] = await db
    .select(split(sql`${bc}`))
    .from(schema.prospectMeeting)
    .where(and(isNotNull(bc), sql`${bc} >= ${w2}`))

  const oc = schema.prospect.outcomeAt
  const [won = { cur: 0, prev: 0 }] = await db
    .select(split(sql`${oc}`))
    .from(schema.prospect)
    .where(and(eq(schema.prospect.status, 'converted'), isNotNull(oc), sql`${oc} >= ${w2}`))

  return {
    reachedOut: { now: sends.cur + calls.cur, prev: sends.prev + calls.prev },
    replies: { now: replies.cur, prev: replies.prev },
    demosBooked: { now: demos.cur, prev: demos.prev },
    won: { now: won.cur, prev: won.prev },
  }
}

export interface CommItem {
  kind: 'email' | 'call' | 'reply'
  prospectId: string
  prospectName: string
  city: string | null
  title: string
  detail: string | null
  at: Date
  href: string
}

const CALL_OUTCOME_LABEL: Record<string, string> = {
  demo_booked: 'Demo booked',
  callback: 'Spoke — following up',
  no_answer: 'No answer',
  voicemail: 'Left a voicemail',
  not_interested: 'Not interested',
  won: 'Won',
}

/**
 * Every communication that's gone out (or come back) — AI outreach emails,
 * logged calls, and replies — merged into one reverse-chronological feed for
 * the "All communications" page.
 */
export async function listCommunications(limit = 120): Promise<CommItem[]> {
  const p = schema.prospect
  const href = (id: string) => `/platform/prospecting?prospect=${id}`

  const [touches, calls, replies] = await Promise.all([
    db
      .select({
        prospectId: schema.outreachTouchLog.prospectId,
        name: p.name,
        city: p.city,
        subject: schema.outreachTouchLog.subject,
        channel: schema.outreachTouchLog.channel,
        at: schema.outreachTouchLog.sentAt,
      })
      .from(schema.outreachTouchLog)
      .innerJoin(p, eq(p.id, schema.outreachTouchLog.prospectId))
      .where(eq(schema.outreachTouchLog.status, 'sent'))
      .orderBy(desc(schema.outreachTouchLog.sentAt))
      .limit(limit),
    db
      .select({
        prospectId: schema.prospectCallLog.prospectId,
        name: p.name,
        city: p.city,
        outcome: schema.prospectCallLog.outcome,
        note: schema.prospectCallLog.note,
        at: schema.prospectCallLog.createdAt,
      })
      .from(schema.prospectCallLog)
      .innerJoin(p, eq(p.id, schema.prospectCallLog.prospectId))
      .orderBy(desc(schema.prospectCallLog.createdAt))
      .limit(limit),
    db
      .select({
        prospectId: schema.outreachEvent.prospectId,
        name: p.name,
        city: p.city,
        at: schema.outreachEvent.occurredAt,
      })
      .from(schema.outreachEvent)
      .innerJoin(p, eq(p.id, schema.outreachEvent.prospectId))
      .where(eq(schema.outreachEvent.type, 'reply'))
      .orderBy(desc(schema.outreachEvent.occurredAt))
      .limit(limit),
  ])

  const items: CommItem[] = []
  for (const t of touches) {
    items.push({
      kind: 'email',
      prospectId: t.prospectId,
      prospectName: t.name,
      city: t.city,
      title: t.subject,
      detail: t.channel === 'dry_run' ? 'Dry run — not actually sent' : `Sent via ${t.channel}`,
      at: t.at as Date,
      href: href(t.prospectId),
    })
  }
  for (const c of calls) {
    items.push({
      kind: 'call',
      prospectId: c.prospectId,
      prospectName: c.name,
      city: c.city,
      title: CALL_OUTCOME_LABEL[c.outcome] ?? 'Call',
      detail: c.note,
      at: c.at as Date,
      href: href(c.prospectId),
    })
  }
  for (const r of replies) {
    items.push({
      kind: 'reply',
      prospectId: r.prospectId,
      prospectName: r.name,
      city: r.city,
      title: 'They replied',
      detail: null,
      at: r.at as Date,
      href: href(r.prospectId),
    })
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime())
  return items.slice(0, limit)
}

// ── Config (singleton row, resolve-with-defaults) ──────────────────────────

export async function getProspectingConfig(): Promise<ProspectingConfig> {
  const [row] = await db
    .select({ config: schema.prospectingConfig.config })
    .from(schema.prospectingConfig)
    .where(eq(schema.prospectingConfig.id, 'default'))
    .limit(1)
  return resolveProspectingConfig(row?.config ?? null)
}

export async function updateProspectingConfig(
  patch: Partial<ProspectingConfig>,
): Promise<ProspectingConfig> {
  const current = await getProspectingConfig()
  const next: ProspectingConfig = resolveProspectingConfig({ ...current, ...patch })
  await db
    .insert(schema.prospectingConfig)
    .values({ id: 'default', config: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.prospectingConfig.id,
      set: { config: next, updatedAt: new Date() },
    })
  // Newly enabled states get their discovery tasks seeded immediately.
  for (const state of next.enabledStates) {
    if (!current.enabledStates.includes(state)) await seedDiscoveryTasks(state)
  }
  return next
}

// ── Counters (platform-global metering) ────────────────────────────────────

/** 'YYYY-MM' for monthly budgets. */
export function counterMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}
/** 'YYYY-MM-DD' for the daily send cap. */
export function counterDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export async function bumpProspectingCounter(
  period: string,
  kind: string,
  by = 1,
): Promise<void> {
  await db
    .insert(schema.prospectingCounter)
    .values({ id: newId('pctr'), period, kind, count: by, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.prospectingCounter.period, schema.prospectingCounter.kind],
      set: {
        count: sql`${schema.prospectingCounter.count} + ${by}`,
        updatedAt: new Date(),
      },
    })
}

export async function getProspectingCounter(period: string, kind: string): Promise<number> {
  const [row] = await db
    .select({ count: schema.prospectingCounter.count })
    .from(schema.prospectingCounter)
    .where(
      and(
        eq(schema.prospectingCounter.period, period),
        eq(schema.prospectingCounter.kind, kind),
      ),
    )
    .limit(1)
  return row?.count ?? 0
}

// ── Discovery task seeding ─────────────────────────────────────────────────

/** Seed the state's zip3 task grid (idempotent — conflict rows skipped). */
export async function seedDiscoveryTasks(state: string): Promise<number> {
  const prefixes = stateZip3Prefixes(state)
  if (prefixes.length === 0) return 0
  const rows = prefixes.map((zipPrefix) => ({
    id: newId('pdt'),
    state,
    zipPrefix,
    status: 'pending' as const,
  }))
  await db.insert(schema.prospectDiscoveryTask).values(rows).onConflictDoNothing()
  return rows.length
}

// ── Prospect queries ───────────────────────────────────────────────────────

const LIST_PAGE_SIZE = 50

export async function listProspects(
  filters: ProspectFilters,
  page = 1,
): Promise<{ rows: ProspectListRow[]; total: number; pageSize: number }> {
  const conds = []
  if (filters.state) conds.push(eq(schema.prospect.state, filters.state))
  if (filters.status) conds.push(eq(schema.prospect.status, filters.status))
  if (filters.scoreBand) conds.push(eq(schema.prospect.scoreBand, filters.scoreBand))
  if (filters.hasWebsite === true) conds.push(isNotNull(schema.prospect.websiteUrl))
  if (filters.hasWebsite === false) conds.push(isNull(schema.prospect.websiteUrl))
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    conds.push(
      or(
        ilike(schema.prospect.name, q),
        ilike(schema.prospect.city, q),
        ilike(schema.prospect.authorizedOfficialName, q),
      ),
    )
  }
  const where = conds.length ? and(...conds) : undefined

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .where(where)

  const rows = await db
    .select({
      id: schema.prospect.id,
      name: schema.prospect.name,
      city: schema.prospect.city,
      state: schema.prospect.state,
      phone: schema.prospect.phone,
      email: schema.prospect.email,
      websiteUrl: schema.prospect.websiteUrl,
      googleRatingTenths: schema.prospect.googleRatingTenths,
      reviewCount: schema.prospect.reviewCount,
      status: schema.prospect.status,
      scoreBand: schema.prospect.scoreBand,
      opportunityScore: schema.prospect.opportunityScore,
      intentSignal: schema.prospect.intentSignal,
      intentAt: schema.prospect.intentAt,
      authorizedOfficialName: schema.prospect.authorizedOfficialName,
      createdAt: schema.prospect.createdAt,
    })
    .from(schema.prospect)
    .where(where)
    .orderBy(
      // Hottest opportunities first, then freshest.
      sql`${schema.prospect.opportunityScore} DESC NULLS LAST`,
      desc(schema.prospect.createdAt),
    )
    .limit(LIST_PAGE_SIZE)
    .offset((Math.max(1, page) - 1) * LIST_PAGE_SIZE)

  return {
    rows: rows as ProspectListRow[],
    total: total ?? 0,
    pageSize: LIST_PAGE_SIZE,
  }
}

export async function getFunnelStats(): Promise<ProspectFunnelStats> {
  const rows = await db
    .select({ status: schema.prospect.status, n: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .groupBy(schema.prospect.status)
  const by = new Map(rows.map((r) => [r.status, r.n]))
  const sum = (statuses: string[]) => statuses.reduce((acc, s) => acc + (by.get(s) ?? 0), 0)
  // Funnel stages are cumulative-forward: a converted prospect still counts
  // as having been discovered/enriched/contacted.
  const converted = sum(['converted'])
  const callList = sum(['call_list']) + converted
  const engaged = sum(['engaged']) + callList
  const contacted = sum(['contacted', 'not_interested', 'suppressed']) + engaged
  const enriched = sum(['enriched', 'queued']) + contacted
  const discovered = sum(['discovered', 'enriching', 'disqualified']) + enriched
  return { discovered, enriched, contacted, engaged, callList, converted }
}

/** Live-pool score-band counts (enriched-and-later prospects) — grounds the
 *  copilot's "how many hot prospects" answers. Excludes discovered/enriching
 *  (unscored) and terminal statuses. */
export async function getBandCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ band: schema.prospect.scoreBand, n: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .where(
      and(
        isNotNull(schema.prospect.scoreBand),
        notInArray(schema.prospect.status, ['discovered', 'enriching', 'disqualified', 'suppressed']),
      ),
    )
    .groupBy(schema.prospect.scoreBand)
  const out: Record<string, number> = { hot: 0, warm: 0, cool: 0, low: 0 }
  for (const r of rows) if (r.band) out[r.band] = r.n
  return out
}

const LOST_STATUSES = ['not_interested', 'suppressed'] as const

/**
 * Win/loss pipeline report over a trailing window — the numbers behind the
 * pipeline panel and the learning loop. "Won" = converted; "lost" =
 * not-interested or suppressed. Segments come from each decided prospect's
 * most-recent enrollment; touches-to-win from the won prospects' send logs.
 * Capped at 5,000 decided prospects (far above beta volume; logged nowhere
 * because the pipeline is operator-facing and the cap can't be silently
 * misleading at this scale).
 */
export async function getWinLossReport(opts?: {
  windowDays?: number
  now?: Date
}): Promise<WinLossReport> {
  const windowDays = opts?.windowDays ?? 90
  const now = opts?.now ?? new Date()
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)

  const decided = await db
    .select({
      id: schema.prospect.id,
      status: schema.prospect.status,
      lostReason: schema.prospect.lostReason,
    })
    .from(schema.prospect)
    .where(
      and(
        inArray(schema.prospect.status, ['converted', ...LOST_STATUSES]),
        isNotNull(schema.prospect.outcomeAt),
        sql`${schema.prospect.outcomeAt} >= ${since}`,
      ),
    )
    .limit(5000)

  const wonRows = decided.filter((r) => r.status === 'converted')
  const lostRows = decided.filter((r) => r.status !== 'converted')
  const won = wonRows.length
  const lost = lostRows.length
  const winRatePct = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null

  // Loss-reason breakdown.
  const reasonCounts = new Map<string, number>()
  for (const r of lostRows) {
    const key = r.lostReason ?? 'other'
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1)
  }
  const validReasons = new Set(Object.keys(LOSS_REASON_LABELS))
  const lossReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => {
      const r = (validReasons.has(reason) ? reason : 'other') as ProspectLossReason
      return { reason: r, label: LOSS_REASON_LABELS[r], count }
    })
    .sort((a, b) => b.count - a.count)

  // Segment attribution: the most-recent enrollment's sequence segment per
  // decided prospect.
  const decidedIds = decided.map((r) => r.id)
  const segmentByProspect = new Map<string, OutreachSegment | 'unsegmented'>()
  if (decidedIds.length > 0) {
    const enrollments = await db
      .select({
        prospectId: schema.outreachEnrollment.prospectId,
        segment: schema.outreachSequence.segment,
        enrolledAt: schema.outreachEnrollment.enrolledAt,
      })
      .from(schema.outreachEnrollment)
      .innerJoin(
        schema.outreachSequence,
        eq(schema.outreachEnrollment.sequenceId, schema.outreachSequence.id),
      )
      .where(inArray(schema.outreachEnrollment.prospectId, decidedIds))
      .orderBy(asc(schema.outreachEnrollment.enrolledAt))
    // asc order → the last write per prospect wins (most recent enrollment).
    for (const e of enrollments) {
      const seg = (e.segment ?? 'unsegmented') as OutreachSegment | 'unsegmented'
      segmentByProspect.set(e.prospectId, seg)
    }
  }
  const segAgg = new Map<string, { won: number; lost: number }>()
  for (const r of decided) {
    const seg = segmentByProspect.get(r.id) ?? 'unsegmented'
    const entry = segAgg.get(seg) ?? { won: 0, lost: 0 }
    if (r.status === 'converted') entry.won++
    else entry.lost++
    segAgg.set(seg, entry)
  }
  const segments = Array.from(segAgg.entries())
    .map(([seg, v]) => {
      const total = v.won + v.lost
      return {
        segment: seg as OutreachSegment | 'unsegmented',
        label: seg === 'unsegmented' ? 'Unsegmented' : SEGMENT_LABELS[seg as OutreachSegment],
        won: v.won,
        lost: v.lost,
        winRatePct: total > 0 ? Math.round((v.won / total) * 100) : null,
      }
    })
    .sort((a, b) => b.won + b.lost - (a.won + a.lost))

  // Average outreach touches before a win.
  let avgTouchesToWin: number | null = null
  if (wonRows.length > 0) {
    const wonIds = wonRows.map((r) => r.id)
    const [touchRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.outreachTouchLog)
      .where(inArray(schema.outreachTouchLog.prospectId, wonIds))
    const totalTouches = touchRow?.n ?? 0
    avgTouchesToWin = totalTouches > 0 ? Math.round((totalTouches / wonRows.length) * 10) / 10 : null
  }

  return { windowDays, won, lost, winRatePct, lossReasons, segments, avgTouchesToWin }
}

export async function getDiscoveryProgress(): Promise<
  Array<{ state: string; pending: number; done: number; error: number; imported: number }>
> {
  const rows = await db
    .select({
      state: schema.prospectDiscoveryTask.state,
      status: schema.prospectDiscoveryTask.status,
      n: sql<number>`count(*)::int`,
      imported: sql<number>`coalesce(sum(${schema.prospectDiscoveryTask.imported}), 0)::int`,
    })
    .from(schema.prospectDiscoveryTask)
    .groupBy(schema.prospectDiscoveryTask.state, schema.prospectDiscoveryTask.status)
  const byState = new Map<
    string,
    { state: string; pending: number; done: number; error: number; imported: number }
  >()
  for (const r of rows) {
    const entry =
      byState.get(r.state) ?? { state: r.state, pending: 0, done: 0, error: 0, imported: 0 }
    if (r.status === 'done') entry.done += r.n
    else if (r.status === 'error') entry.error += r.n
    else entry.pending += r.n
    entry.imported += r.imported
    byState.set(r.state, entry)
  }
  return Array.from(byState.values()).sort((a, b) => a.state.localeCompare(b.state))
}

/**
 * Territory coverage — one row per US state that has any prospect or discovery
 * task, merging prospect status/band counts with discovery-grid progress. The
 * map view + focus mode read this. Pure ranking/gap logic lives in
 * lib/prospect-territory.ts.
 */
export async function getTerritoryCoverage(
  enabledStates: string[],
): Promise<import('@/lib/types/prospecting').TerritoryRow[]> {
  const enabled = new Set(enabledStates)

  const statusRows = await db
    .select({
      state: schema.prospect.state,
      status: schema.prospect.status,
      band: schema.prospect.scoreBand,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.prospect)
    .where(isNotNull(schema.prospect.state))
    .groupBy(schema.prospect.state, schema.prospect.status, schema.prospect.scoreBand)

  const progress = await getDiscoveryProgress()
  const progressByState = new Map(progress.map((p) => [p.state, p]))

  type Acc = {
    total: number
    enriched: number
    contacted: number
    callList: number
    won: number
    hot: number
    warm: number
  }
  const byState = new Map<string, Acc>()
  const ENRICHED_PLUS = new Set([
    'enriched', 'queued', 'contacted', 'engaged', 'call_list', 'converted',
    'not_interested', 'suppressed',
  ])
  const CONTACTED_PLUS = new Set([
    'contacted', 'engaged', 'call_list', 'converted', 'not_interested', 'suppressed',
  ])
  for (const r of statusRows) {
    if (!r.state) continue
    const a =
      byState.get(r.state) ??
      { total: 0, enriched: 0, contacted: 0, callList: 0, won: 0, hot: 0, warm: 0 }
    a.total += r.n
    if (ENRICHED_PLUS.has(r.status)) a.enriched += r.n
    if (CONTACTED_PLUS.has(r.status)) a.contacted += r.n
    if (r.status === 'call_list') a.callList += r.n
    if (r.status === 'converted') a.won += r.n
    if (r.band === 'hot') a.hot += r.n
    if (r.band === 'warm') a.warm += r.n
    byState.set(r.state, a)
  }

  // Union of states with prospects OR discovery tasks.
  const allStates = new Set<string>([
    ...Array.from(byState.keys()),
    ...Array.from(progressByState.keys()),
  ])
  const { US_STATE_NAMES } = await import('@/lib/types/us-geo')
  const rows: import('@/lib/types/prospecting').TerritoryRow[] = []
  for (const state of Array.from(allStates)) {
    const a =
      byState.get(state) ??
      { total: 0, enriched: 0, contacted: 0, callList: 0, won: 0, hot: 0, warm: 0 }
    const prog = progressByState.get(state)
    rows.push({
      state,
      stateName: (US_STATE_NAMES as Record<string, string>)[state] ?? state,
      enabled: enabled.has(state),
      total: a.total,
      enriched: a.enriched,
      contacted: a.contacted,
      callList: a.callList,
      won: a.won,
      hot: a.hot,
      warm: a.warm,
      tasksPending: prog?.pending ?? 0,
      imported: prog?.imported ?? 0,
      workedPct: a.total > 0 ? Math.round((a.enriched / a.total) * 100) : 0,
      convertPct: a.contacted > 0 ? Math.round((a.won / a.contacted) * 100) : null,
    })
  }
  return rows
}

export interface ProspectDetail {
  prospect: typeof schema.prospect.$inferSelect
  contacts: import('./prospect-contacts').ProspectContactRow[]
  touches: Array<{
    id: string
    stepNumber: number
    subject: string
    channel: string
    status: string
    sentAt: Date
  }>
  events: Array<{ type: string; occurredAt: Date }>
  calls: Array<{ outcome: string; note: string | null; createdAt: Date }>
}

/** Everything the drawer shows: the row + outreach history + call log. */
export async function getProspectDetail(prospectId: string): Promise<ProspectDetail | null> {
  const [row] = await db
    .select()
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (!row) return null
  const touches = await db
    .select({
      id: schema.outreachTouchLog.id,
      stepNumber: schema.outreachTouchLog.stepNumber,
      subject: schema.outreachTouchLog.subject,
      channel: schema.outreachTouchLog.channel,
      status: schema.outreachTouchLog.status,
      sentAt: schema.outreachTouchLog.sentAt,
    })
    .from(schema.outreachTouchLog)
    .where(eq(schema.outreachTouchLog.prospectId, prospectId))
    .orderBy(desc(schema.outreachTouchLog.sentAt))
    .limit(20)
  const events = await db
    .select({ type: schema.outreachEvent.type, occurredAt: schema.outreachEvent.occurredAt })
    .from(schema.outreachEvent)
    .where(eq(schema.outreachEvent.prospectId, prospectId))
    .orderBy(desc(schema.outreachEvent.occurredAt))
    .limit(30)
  const calls = await db
    .select({
      outcome: schema.prospectCallLog.outcome,
      note: schema.prospectCallLog.note,
      createdAt: schema.prospectCallLog.createdAt,
    })
    .from(schema.prospectCallLog)
    .where(eq(schema.prospectCallLog.prospectId, prospectId))
    .orderBy(desc(schema.prospectCallLog.createdAt))
    .limit(20)
  const { listProspectContacts } = await import('./prospect-contacts')
  const contacts = await listProspectContacts(prospectId)
  return { prospect: row, contacts, touches, events, calls }
}

// ── Mutations (platform admin actions) ─────────────────────────────────────

export async function suppressProspect(
  prospectId: string,
  reason: string,
): Promise<void> {
  const [row] = await db
    .select({ email: schema.prospect.email })
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  await db
    .update(schema.prospect)
    .set({
      status: 'suppressed',
      suppressedReason: reason,
      suppressedAt: new Date(),
      outcomeAt: new Date(),
      lostReason: lossReasonForSuppression(reason),
      updatedAt: new Date(),
    })
    .where(eq(schema.prospect.id, prospectId))
  if (row?.email) {
    await db
      .insert(schema.prospectSuppression)
      .values({
        id: newId('psup'),
        email: row.email.toLowerCase(),
        domain: row.email.split('@')[1]?.toLowerCase() ?? null,
        reason: 'manual',
        prospectId,
      })
      .onConflictDoNothing()
  }
  // A live enrollment (if any) stops with the prospect.
  await db
    .update(schema.outreachEnrollment)
    .set({ status: 'stopped_manual', stoppedAt: new Date(), stopReason: reason })
    .where(
      and(
        eq(schema.outreachEnrollment.prospectId, prospectId),
        inArray(schema.outreachEnrollment.status, ['active', 'paused_ooo']),
      ),
    )
}

export interface HuntStats {
  sinceIso: string
  sent24h: number
  dryRun24h: number
  opens24h: number
  clicks24h: number
  replies24h: number
  newCallList24h: number
  autoEnrolledToday: number
  hottest: Array<{
    id: string
    name: string
    status: string
    intentSignal: string | null
    intentSummary: string | null
    intentAt: Date | null
  }>
}

/** Last-24h hunt activity for the cockpit panel + the daily digest. */
export async function getHuntStats(opts?: { now?: Date }): Promise<HuntStats> {
  const now = opts?.now ?? new Date()
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const touchRows = await db
    .select({ channel: schema.outreachTouchLog.channel, n: sql<number>`count(*)::int` })
    .from(schema.outreachTouchLog)
    .where(sql`${schema.outreachTouchLog.sentAt} >= ${since}`)
    .groupBy(schema.outreachTouchLog.channel)
  const sent24h = touchRows
    .filter((r) => r.channel === 'resend' || r.channel === 'gmail')
    .reduce((a, r) => a + r.n, 0)
  const dryRun24h = touchRows.filter((r) => r.channel === 'dry_run').reduce((a, r) => a + r.n, 0)

  const eventRows = await db
    .select({ type: schema.outreachEvent.type, n: sql<number>`count(*)::int` })
    .from(schema.outreachEvent)
    .where(sql`${schema.outreachEvent.occurredAt} >= ${since}`)
    .groupBy(schema.outreachEvent.type)
  const ev = (t: string) => eventRows.find((r) => r.type === t)?.n ?? 0

  const [callListRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .where(
      and(
        eq(schema.prospect.status, 'call_list'),
        sql`${schema.prospect.intentAt} >= ${since}`,
      ),
    )

  const autoEnrolledToday = await getProspectingCounter(counterDay(now), 'auto_enroll')

  const hottest = await db
    .select({
      id: schema.prospect.id,
      name: schema.prospect.name,
      status: schema.prospect.status,
      intentSignal: schema.prospect.intentSignal,
      intentSummary: schema.prospect.intentSummary,
      intentAt: schema.prospect.intentAt,
    })
    .from(schema.prospect)
    .where(inArray(schema.prospect.status, ['call_list', 'engaged']))
    // call_list first (a reply beats an open), then freshest intent.
    .orderBy(
      sql`CASE WHEN ${schema.prospect.status} = 'call_list' THEN 0 ELSE 1 END`,
      desc(schema.prospect.intentAt),
    )
    .limit(3)

  return {
    sinceIso: since.toISOString(),
    sent24h,
    dryRun24h,
    opens24h: ev('open'),
    clicks24h: ev('click'),
    replies24h: ev('reply'),
    newCallList24h: callListRow?.n ?? 0,
    autoEnrolledToday,
    hottest,
  }
}

export interface CallListRow {
  id: string
  name: string
  city: string | null
  state: string | null
  phone: string | null
  email: string | null
  authorizedOfficialName: string | null
  intentSignal: string | null
  intentAt: Date | null
  intentSummary: string | null
  talkingPoints: string[]
  replyDraft: string | null
  opportunityScore: number | null
  scoreBand: string | null
  lastCallOutcome: string | null
}

/** The owner's call list — intent-signaled prospects, freshest signal first. */
export async function getCallList(): Promise<CallListRow[]> {
  const rows = await db
    .select()
    .from(schema.prospect)
    .where(eq(schema.prospect.status, 'call_list'))
    .orderBy(desc(schema.prospect.intentAt))
    .limit(200)
  const out: CallListRow[] = []
  for (const p of rows) {
    const [lastCall] = await db
      .select({ outcome: schema.prospectCallLog.outcome })
      .from(schema.prospectCallLog)
      .where(eq(schema.prospectCallLog.prospectId, p.id))
      .orderBy(desc(schema.prospectCallLog.createdAt))
      .limit(1)
    out.push({
      id: p.id,
      name: p.name,
      city: p.city,
      state: p.state,
      phone: p.phone,
      email: p.email,
      authorizedOfficialName: p.authorizedOfficialName,
      intentSignal: p.intentSignal,
      intentAt: p.intentAt,
      intentSummary: p.intentSummary,
      talkingPoints: Array.isArray(p.talkingPoints) ? (p.talkingPoints as string[]) : [],
      replyDraft: p.replyDraft ?? null,
      opportunityScore: p.opportunityScore,
      scoreBand: p.scoreBand,
      lastCallOutcome: lastCall?.outcome ?? null,
    })
  }
  return out
}

export interface PhoneQueueRow {
  id: string
  name: string
  city: string | null
  state: string | null
  phone: string | null
  authorizedOfficialName: string | null
  opportunityScore: number | null
  scoreBand: string | null
  reviewCount: number | null
  googleRatingTenths: number | null
  websiteUrl: string | null
  reasons: string[] // why they're worth the call (scoreReasons)
}

/**
 * The phone queue — enriched, high-value prospects with NO deliverable email
 * (no website, contact form only, or every crawled address failed MX). The
 * hottest segment (no-website practices) is un-emailable by construction, so
 * instead of letting them rot they surface here as a call-first list with the
 * reasons they scored. prospect.email is null precisely because the contact
 * sync found nothing sendable, so that's the gate.
 */
export async function getPhoneQueue(limit = 100): Promise<PhoneQueueRow[]> {
  const rows = await db
    .select()
    .from(schema.prospect)
    .where(
      and(
        eq(schema.prospect.status, 'enriched'),
        isNull(schema.prospect.email),
        isNotNull(schema.prospect.phone),
        inArray(schema.prospect.scoreBand, ['hot', 'warm']),
      ),
    )
    .orderBy(desc(schema.prospect.opportunityScore), desc(schema.prospect.enrichedAt))
    .limit(limit)
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    state: p.state,
    phone: p.phone,
    authorizedOfficialName: p.authorizedOfficialName,
    opportunityScore: p.opportunityScore,
    scoreBand: p.scoreBand,
    reviewCount: p.reviewCount,
    googleRatingTenths: p.googleRatingTenths,
    websiteUrl: p.websiteUrl,
    reasons: Array.isArray(p.scoreReasons) ? (p.scoreReasons as string[]).slice(0, 4) : [],
  }))
}

export interface DueFollowUpRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  reason: string | null
  nextFollowUpAt: Date
  status: string
  intentSummary: string | null
}

/**
 * Prospects whose scheduled follow-up is now due — a callback promised, a
 * voicemail to circle back on. Excludes terminal states so a converted/dead
 * prospect never nags. Freshest-due first (most overdue at the top).
 */
export async function getDueFollowUps(opts?: { now?: Date; limit?: number }): Promise<DueFollowUpRow[]> {
  const now = opts?.now ?? new Date()
  const rows = await db
    .select()
    .from(schema.prospect)
    .where(
      and(
        isNotNull(schema.prospect.nextFollowUpAt),
        sql`${schema.prospect.nextFollowUpAt} <= ${now}`,
        inArray(schema.prospect.status, ['contacted', 'engaged', 'call_list', 'enriched', 'queued']),
      ),
    )
    .orderBy(asc(schema.prospect.nextFollowUpAt))
    .limit(opts?.limit ?? 50)
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    email: p.email,
    reason: p.followUpReason,
    nextFollowUpAt: p.nextFollowUpAt as Date,
    status: p.status,
    intentSummary: p.intentSummary,
  }))
}

// ── Call Mode (the dial-session queue) ──────────────────────────────────────

export type CallQueueSource = 'hand_raiser' | 'follow_up' | 'phone_first'

export interface CallQueueItem {
  id: string
  name: string
  city: string | null
  state: string | null
  /** Digits-only; never null — no phone, no place in the dial queue. */
  phone: string
  timezone: string | null
  authorizedOfficialName: string | null
  scoreBand: string | null
  reviewCount: number | null
  googleRatingTenths: number | null
  websiteUrl: string | null
  intentSignal: string | null
  intentSummary: string | null
  talkingPoints: string[]
  followUpReason: string | null
  lastCallOutcome: string | null
  /** Which bucket put them in the queue (shown as a chip on the call card). */
  source: CallQueueSource
  /** Warm signals — email opens/clicks, the "this isn't really cold" counter. */
  opens: number
  clicks: number
}

/**
 * The Call Mode queue — everyone worth dialing right now, in the order that
 * maximizes momentum for someone who hates cold calls: hand-raisers first
 * (they replied — warmest, easiest), then promised follow-ups now due, then
 * the hot phone-first pool (no deliverable email, so the phone is the only
 * door). Deduped across buckets, phone-required, capped so a session always
 * looks finishable.
 */
export async function getCallQueue(opts?: { now?: Date; limit?: number }): Promise<CallQueueItem[]> {
  const now = opts?.now ?? new Date()
  const limit = opts?.limit ?? 25
  const seen = new Set<string>()
  const picked: Array<{ p: typeof schema.prospect.$inferSelect; source: CallQueueSource }> = []

  // Earlier buckets are warmer; each later bucket fills whatever room is left.
  const take = (rows: Array<typeof schema.prospect.$inferSelect>, source: CallQueueSource) => {
    for (const p of rows) {
      if (picked.length >= limit) return
      if (!p.phone || seen.has(p.id)) continue
      seen.add(p.id)
      picked.push({ p, source })
    }
  }

  // 1. Hand-raisers — replied/asked/booked-intent; freshest signal first.
  take(
    await db
      .select()
      .from(schema.prospect)
      .where(and(eq(schema.prospect.status, 'call_list'), isNotNull(schema.prospect.phone)))
      .orderBy(desc(schema.prospect.intentAt))
      .limit(limit),
    'hand_raiser',
  )
  // 2. Follow-ups now due — a callback you promised; most overdue first.
  take(
    await db
      .select()
      .from(schema.prospect)
      .where(
        and(
          isNotNull(schema.prospect.nextFollowUpAt),
          sql`${schema.prospect.nextFollowUpAt} <= ${now}`,
          isNotNull(schema.prospect.phone),
          inArray(schema.prospect.status, ['contacted', 'engaged', 'call_list', 'enriched', 'queued']),
        ),
      )
      .orderBy(asc(schema.prospect.nextFollowUpAt))
      .limit(limit),
    'follow_up',
  )
  // 3. Phone-first — hot/warm, un-emailable; the phone is the only door.
  take(
    await db
      .select()
      .from(schema.prospect)
      .where(
        and(
          eq(schema.prospect.status, 'enriched'),
          isNull(schema.prospect.email),
          isNotNull(schema.prospect.phone),
          inArray(schema.prospect.scoreBand, ['hot', 'warm']),
        ),
      )
      .orderBy(desc(schema.prospect.opportunityScore), desc(schema.prospect.enrichedAt))
      .limit(limit),
    'phone_first',
  )

  if (picked.length === 0) return []
  const ids = picked.map((x) => x.p.id)

  // Warm signals in one grouped query — opens/clicks on our outreach emails.
  const events = await db
    .select({
      prospectId: schema.outreachEvent.prospectId,
      type: schema.outreachEvent.type,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.outreachEvent)
    .where(and(inArray(schema.outreachEvent.prospectId, ids), inArray(schema.outreachEvent.type, ['open', 'click'])))
    .groupBy(schema.outreachEvent.prospectId, schema.outreachEvent.type)
  const warm = new Map<string, { opens: number; clicks: number }>()
  for (const e of events) {
    const w = warm.get(e.prospectId) ?? { opens: 0, clicks: 0 }
    if (e.type === 'open') w.opens = e.n
    else w.clicks = e.n
    warm.set(e.prospectId, w)
  }

  const out: CallQueueItem[] = []
  for (const { p, source } of picked) {
    const [lastCall] = await db
      .select({ outcome: schema.prospectCallLog.outcome })
      .from(schema.prospectCallLog)
      .where(eq(schema.prospectCallLog.prospectId, p.id))
      .orderBy(desc(schema.prospectCallLog.createdAt))
      .limit(1)
    out.push({
      id: p.id,
      name: p.name,
      city: p.city,
      state: p.state,
      phone: p.phone as string,
      timezone: p.timezone,
      authorizedOfficialName: p.authorizedOfficialName,
      scoreBand: p.scoreBand,
      reviewCount: p.reviewCount,
      googleRatingTenths: p.googleRatingTenths,
      websiteUrl: p.websiteUrl,
      intentSignal: p.intentSignal,
      intentSummary: p.intentSummary,
      talkingPoints: Array.isArray(p.talkingPoints) ? (p.talkingPoints as string[]) : [],
      followUpReason: p.followUpReason,
      lastCallOutcome: lastCall?.outcome ?? null,
      source,
      opens: warm.get(p.id)?.opens ?? 0,
      clicks: warm.get(p.id)?.clicks ?? 0,
    })
  }
  return out
}

/** New hot prospects that got enriched in the trailing window — the
 *  "entered overnight" line in the daily briefing. */
export async function getRecentHotArrivals(
  opts?: { now?: Date; sinceHours?: number; limit?: number },
): Promise<{ count: number; names: string[] }> {
  const now = opts?.now ?? new Date()
  const since = new Date(now.getTime() - (opts?.sinceHours ?? 24) * 60 * 60 * 1000)
  const where = and(
    eq(schema.prospect.scoreBand, 'hot'),
    eq(schema.prospect.status, 'enriched'),
    sql`${schema.prospect.enrichedAt} >= ${since}`,
  )
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .where(where)
  const names = await db
    .select({ name: schema.prospect.name })
    .from(schema.prospect)
    .where(where)
    .orderBy(desc(schema.prospect.opportunityScore))
    .limit(opts?.limit ?? 5)
  return { count: countRow?.n ?? 0, names: names.map((r) => r.name) }
}

/**
 * Record a call outcome. 'not_interested' also retires the prospect (call
 * refusal = same respect as a reply refusal); 'won' leaves status alone —
 * markConverted flips it when the clinic org actually exists.
 */
export async function logCallOutcome(input: {
  prospectId: string
  outcome: string
  note?: string | null
  calledByUserId?: string | null
  /** Coded loss reason — only meaningful with outcome='not_interested'. */
  lostReason?: string | null
}): Promise<void> {
  await db.insert(schema.prospectCallLog).values({
    id: newId('pcall'),
    prospectId: input.prospectId,
    outcome: input.outcome,
    note: input.note ?? null,
    calledByUserId: input.calledByUserId ?? null,
  })
  // A logged call means the owner has handled the thread — the AI reply
  // draft is stale, clear it. Non-terminal outcomes (callback/voicemail/
  // no-answer) also schedule the next follow-up so the lead never drops;
  // terminal ones clear it.
  const plan = followUpForOutcome(input.outcome, new Date())
  await db
    .update(schema.prospect)
    .set({
      replyDraft: null,
      nextFollowUpAt: plan.at,
      followUpReason: plan.reason,
      updatedAt: new Date(),
    })
    .where(eq(schema.prospect.id, input.prospectId))
  if (input.outcome === 'not_interested') {
    await db
      .update(schema.prospect)
      .set({
        status: 'not_interested',
        outcomeAt: new Date(),
        lostReason: input.lostReason ?? 'other',
        updatedAt: new Date(),
      })
      .where(eq(schema.prospect.id, input.prospectId))
    await db
      .update(schema.outreachEnrollment)
      .set({ status: 'stopped_manual', stoppedAt: new Date(), stopReason: 'call_not_interested' })
      .where(
        and(
          eq(schema.outreachEnrollment.prospectId, input.prospectId),
          inArray(schema.outreachEnrollment.status, ['active', 'paused_ooo']),
        ),
      )
  }
}

/** Link a won prospect to its brand-new clinic org. */
export async function markConverted(
  prospectId: string,
  organizationId: string,
): Promise<void> {
  await db
    .update(schema.prospect)
    .set({
      status: 'converted',
      convertedOrganizationId: organizationId,
      outcomeAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.prospect.id, prospectId))
  await db
    .update(schema.outreachEnrollment)
    .set({ status: 'stopped_manual', stoppedAt: new Date(), stopReason: 'converted' })
    .where(
      and(
        eq(schema.outreachEnrollment.prospectId, prospectId),
        inArray(schema.outreachEnrollment.status, ['active', 'paused_ooo']),
      ),
    )
}

/**
 * Fail-closed dedupe gate: is this contact already a customer, a known org,
 * or suppressed? ANY match = never enroll / never send.
 */
export async function isKnownContact(input: {
  email?: string | null
  phone?: string | null
  websiteDomain?: string | null
}): Promise<boolean> {
  const email = input.email?.toLowerCase().trim() || null
  const domain = input.websiteDomain?.toLowerCase().replace(/^www\./, '') || null
  const phone = input.phone?.replace(/\D/g, '') || null

  if (email) {
    const [sup] = await db
      .select({ id: schema.prospectSuppression.id })
      .from(schema.prospectSuppression)
      .where(eq(schema.prospectSuppression.email, email))
      .limit(1)
    if (sup) return true
    const [cust] = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(sql`lower(${schema.customers.email}) = ${email}`)
      .limit(1)
    if (cust) return true
    const [clinic] = await db
      .select({ organizationId: schema.clinicProfile.organizationId })
      .from(schema.clinicProfile)
      .where(sql`lower(${schema.clinicProfile.email}) = ${email}`)
      .limit(1)
    if (clinic) return true
  }
  if (domain) {
    const [sup] = await db
      .select({ id: schema.prospectSuppression.id })
      .from(schema.prospectSuppression)
      .where(eq(schema.prospectSuppression.domain, domain))
      .limit(1)
    if (sup) return true
    const [clinic] = await db
      .select({ organizationId: schema.clinicProfile.organizationId })
      .from(schema.clinicProfile)
      .where(
        sql`lower(replace(coalesce(${schema.clinicProfile.websiteDomain}, ''), 'www.', '')) = ${domain}`,
      )
      .limit(1)
    if (clinic) return true
  }
  if (phone) {
    const [clinic] = await db
      .select({ organizationId: schema.clinicProfile.organizationId })
      .from(schema.clinicProfile)
      .where(sql`regexp_replace(coalesce(${schema.clinicProfile.phone}, ''), '\\D', '', 'g') = ${phone}`)
      .limit(1)
    if (clinic) return true
  }
  return false
}
