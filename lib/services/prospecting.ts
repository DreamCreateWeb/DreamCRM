import 'server-only'
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import {
  resolveProspectingConfig,
  type ProspectingConfig,
  type ProspectFilters,
  type ProspectFunnelStats,
  type ProspectListRow,
} from '@/lib/types/prospecting'
import { stateZip3Prefixes } from '@/lib/types/us-geo'

/**
 * Prospecting core — Dream Create's own outbound growth engine. Queries,
 * config, and metering for the platform-global prospect tables. Every
 * caller is a requirePlatformAdmin() server action or a CRON_SECRET cron;
 * these tables are platform-operator data, not tenant data (see the schema
 * header for the scoping rationale).
 */

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
}): Promise<void> {
  await db.insert(schema.prospectCallLog).values({
    id: newId('pcall'),
    prospectId: input.prospectId,
    outcome: input.outcome,
    note: input.note ?? null,
    calledByUserId: input.calledByUserId ?? null,
  })
  // A logged call means the owner has handled the thread — the AI reply
  // draft is stale, clear it.
  await db
    .update(schema.prospect)
    .set({ replyDraft: null, updatedAt: new Date() })
    .where(eq(schema.prospect.id, input.prospectId))
  if (input.outcome === 'not_interested') {
    await db
      .update(schema.prospect)
      .set({ status: 'not_interested', updatedAt: new Date() })
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
    .set({ status: 'converted', convertedOrganizationId: organizationId, updatedAt: new Date() })
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
