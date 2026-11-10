import 'server-only'

import { randomBytes } from 'crypto'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, notExists, notInArray, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { normalizeEmail } from '@/lib/contact-normalize'
import { authEmailShell, deliver, escapeHtml } from '@/lib/email'
import { clinicDayStart } from '@/lib/clinic-timezone'
import { callWindowScore, zonedWallClockToInstant, type CallWindow } from '@/lib/prospect-when'
import { googleCalendarLink } from '@/lib/prospect-booking'
import { BAD_PHONE_STATUSES, type ProspectCaller, type ProspectCallerStatus } from '@/lib/db/schema/prospecting'
import {
  CALLER_INVITE_TTL_DAYS,
  CALLER_SKIP_COOLDOWN_DAYS,
  CALLER_SKIP_OUTCOME,
  CALLER_SKIP_REASON_LABELS,
  CALLER_STALE_ASSIGNMENT_DAYS,
  CALLER_TERMINAL_OUTCOMES,
  HAND_RAISER_SIGNALS,
  REACHED_CALL_OUTCOMES,
  type CallerSkipReason,
  type ProspectCallOutcome,
  type ProspectPhoneLineType,
  type ProspectPhoneStatus,
  type ProspectQualityBand,
} from '@/lib/types/prospecting'
import { US_STATES } from '@/lib/types/us-geo'
import { getProspectingConfig, logCallOutcome } from './prospecting'

/**
 * THE COLD-CALLER PORTAL (P-02) — the service behind the fifth persona.
 *
 * A caller is a person the owner hires to work the phone-first pool. They
 * are NOT an org member (the referral-partner pattern: a row here + a
 * `user_id` linkage set on accept) and their whole world is the set of
 * `prospect` rows where `assigned_caller_id` is THEIR id. Three laws:
 *
 *   1. OWNERSHIP IS IN THE WHERE. Every caller-facing read filters by
 *      `assigned_caller_id = caller.id`; every caller-facing write asserts
 *      it on the row first ({@link assertAssignedToCaller}) and repeats it
 *      in the UPDATE's own predicate. A caller never touches a prospect
 *      that is not theirs, never reads another caller's rows, never sees
 *      an email address, a sequence, a contact, a clinic or a patient.
 *   2. THE POOL IS THE OWNER'S BEST LEFTOVERS. Assignment draws from the
 *      quality floor up (P-01), phone-first, never a hand-raiser (those stay
 *      on the owner's own call list), never a practice the owner is already
 *      following up, never a row some other caller holds. The claim is one
 *      atomic `UPDATE … WHERE assigned_caller_id IS NULL`, so two callers
 *      topping up at the same moment cannot share a practice.
 *   3. THE SAME SPINE. A caller's outcome goes through `logCallOutcome`
 *      exactly like the owner's — P-01's phone-status and quality effects
 *      apply, the follow-up cadence applies, a demo lands in the same
 *      meetings table and rings the same owner bell.
 *
 * Platform-global (no organization_id): prospects are businesses.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const CALLER_INVITE_TTL_MS = CALLER_INVITE_TTL_DAYS * DAY_MS

const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://www.dreamcreatestudio.com'

/** The jsonb `states` column, read defensively: only real state codes. */
export function parseCallerStates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const code = v.trim().toUpperCase()
    if ((US_STATES as readonly string[]).includes(code) && !out.includes(code)) out.push(code)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Callers — CRUD + the invite (platform admin side)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCallerInput {
  name: string
  email: string
  dailyTarget?: number
  states?: string[] | null
  notes?: string | null
  createdByUserId?: string | null
}

export async function createCaller(input: CreateCallerInput): Promise<{ id: string; email: string }> {
  const name = input.name.trim()
  if (!name) throw new Error('Add their name')
  const email = normalizeEmail(input.email) ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email')
  const dailyTarget = input.dailyTarget ?? 40
  if (!Number.isInteger(dailyTarget) || dailyTarget < 1 || dailyTarget > 500) {
    throw new Error('Daily target must be between 1 and 500')
  }

  const [dupe] = await db
    .select({ id: schema.prospectCaller.id, status: schema.prospectCaller.status })
    .from(schema.prospectCaller)
    .where(eq(schema.prospectCaller.email, email))
    .limit(1)
  if (dupe) {
    if (dupe.status === 'archived') {
      throw new Error('That email belongs to an archived caller — reactivate them, or use another email')
    }
    throw new Error('A caller with this email already exists')
  }

  const id = newId('pcal')
  const token = randomBytes(24).toString('hex')
  const now = new Date()
  const states = parseCallerStates(input.states)
  await db.insert(schema.prospectCaller).values({
    id,
    name,
    email,
    status: 'invited',
    inviteToken: token,
    inviteSentAt: now,
    inviteExpiresAt: new Date(now.getTime() + CALLER_INVITE_TTL_MS),
    dailyTarget,
    states: states.length > 0 ? states : null,
    notes: input.notes?.trim() || null,
    createdByUserId: input.createdByUserId ?? null,
  })

  await sendCallerInviteEmail({ to: email, name, token })
  return { id, email }
}

/** Re-arm + re-send a caller's invite (new token, a fresh 7-day clock). */
export async function resendCallerInvite(callerId: string): Promise<{ email: string }> {
  const c = await getCallerById(callerId)
  if (!c) throw new Error('Caller not found')
  if (c.userId) throw new Error('This caller has already set up their account')
  if (c.status === 'archived') throw new Error('This caller is archived')

  const token = randomBytes(24).toString('hex')
  const now = new Date()
  await db
    .update(schema.prospectCaller)
    .set({
      inviteToken: token,
      inviteSentAt: now,
      inviteExpiresAt: new Date(now.getTime() + CALLER_INVITE_TTL_MS),
      status: 'invited',
      updatedAt: now,
    })
    .where(eq(schema.prospectCaller.id, callerId))
  await sendCallerInviteEmail({ to: c.email, name: c.name, token })
  return { email: c.email }
}

export interface UpdateCallerSettingsInput {
  dailyTarget?: number
  states?: string[] | null
  notes?: string | null
}

export async function updateCallerSettings(callerId: string, input: UpdateCallerSettingsInput): Promise<void> {
  const patch: Partial<typeof schema.prospectCaller.$inferInsert> = { updatedAt: new Date() }
  if (input.dailyTarget != null) {
    if (!Number.isInteger(input.dailyTarget) || input.dailyTarget < 1 || input.dailyTarget > 500) {
      throw new Error('Daily target must be between 1 and 500')
    }
    patch.dailyTarget = input.dailyTarget
  }
  if (input.states !== undefined) {
    const states = parseCallerStates(input.states)
    patch.states = states.length > 0 ? states : null
  }
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null
  await db.update(schema.prospectCaller).set(patch).where(eq(schema.prospectCaller.id, callerId))
}

/** Pause (keeps their queue, blocks every action) or resume. */
export async function setCallerStatus(callerId: string, status: 'active' | 'paused'): Promise<void> {
  const c = await getCallerById(callerId)
  if (!c) throw new Error('Caller not found')
  if (c.status === 'archived') throw new Error('This caller is archived')
  if (status === 'active' && !c.userId) throw new Error('This caller has not accepted their invite yet')
  await db
    .update(schema.prospectCaller)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.prospectCaller.id, callerId))
}

/** Archive: the account closes and EVERY prospect they held goes back to
 *  the pool (the owner's queues see them again on the next read). */
export async function archiveCaller(callerId: string): Promise<{ released: number }> {
  const now = new Date()
  await db
    .update(schema.prospectCaller)
    .set({ status: 'archived', inviteToken: null, updatedAt: now })
    .where(eq(schema.prospectCaller.id, callerId))
  const released = await releaseCallerAssignments(callerId, now)
  return { released }
}

/** Hand everything a caller holds back to the pool. */
export async function releaseCallerAssignments(callerId: string, now = new Date()): Promise<number> {
  const rows = await db
    .update(schema.prospect)
    .set({ assignedCallerId: null, assignedAt: null, updatedAt: now })
    .where(eq(schema.prospect.assignedCallerId, callerId))
    .returning({ id: schema.prospect.id })
  return rows.length
}

export async function getCallerById(callerId: string): Promise<ProspectCaller | null> {
  const [c] = await db.select().from(schema.prospectCaller).where(eq(schema.prospectCaller.id, callerId)).limit(1)
  return c ?? null
}

/** THE direct lookup requireCaller authorizes by — never by tenantType. */
export async function getCallerByUserId(userId: string): Promise<ProspectCaller | null> {
  const [c] = await db
    .select()
    .from(schema.prospectCaller)
    .where(eq(schema.prospectCaller.userId, userId))
    .limit(1)
  return c ?? null
}

/** Active callers, for the admin's Reassign picker. */
export async function listActiveCallers(): Promise<Array<{ id: string; name: string }>> {
  return db
    .select({ id: schema.prospectCaller.id, name: schema.prospectCaller.name })
    .from(schema.prospectCaller)
    .where(eq(schema.prospectCaller.status, 'active'))
    .orderBy(asc(schema.prospectCaller.name))
}

/** id → name for every caller (any status) — the table's "→ name" pill. */
export async function callerNameMap(): Promise<Map<string, string>> {
  const rows = await db.select({ id: schema.prospectCaller.id, name: schema.prospectCaller.name }).from(schema.prospectCaller)
  return new Map(rows.map((r) => [r.id, r.name]))
}

// ── The invite accept flow ─────────────────────────────────────────────────

export interface CallerInviteDetails {
  callerId: string
  name: string
  email: string
  alreadyLinked: boolean
  expired: boolean
  accountState: import('@/lib/auth/account-state').AccountState
}

export async function getCallerInviteByToken(token: string): Promise<CallerInviteDetails | null> {
  if (!token) return null
  const [c] = await db
    .select()
    .from(schema.prospectCaller)
    .where(eq(schema.prospectCaller.inviteToken, token))
    .limit(1)
  if (!c) return null
  const { resolveAccountState } = await import('@/lib/auth/account-state')
  const { state: accountState } = await resolveAccountState(c.email)
  const expired = Boolean(c.inviteExpiresAt && new Date() > c.inviteExpiresAt)
  return {
    callerId: c.id,
    name: c.name,
    email: c.email,
    alreadyLinked: Boolean(c.userId),
    expired,
    accountState,
  }
}

/** The accept completion: link the user, go active, burn the token. The
 *  caller must have verified the session email matches the invite. */
export async function linkCallerUser(callerId: string, userId: string): Promise<void> {
  await db
    .update(schema.prospectCaller)
    .set({ userId, status: 'active', inviteToken: null, updatedAt: new Date() })
    .where(eq(schema.prospectCaller.id, callerId))
}

async function sendCallerInviteEmail(args: { to: string; name: string; token: string }): Promise<void> {
  const url = `${appUrl()}/caller/accept?token=${encodeURIComponent(args.token)}`
  const firstName = args.name.split(' ')[0] || args.name
  // Every user-supplied value in the HTML goes through escapeHtml: the
  // shell escapes `heading` itself; the intro's name is escaped here.
  await deliver({
    to: args.to,
    subject: 'Dream Create invited you to call for them',
    html: authEmailShell({
      heading: `Hi ${firstName},`,
      introHtml: `Dream Create set you up as a caller, <strong>${escapeHtml(args.name)}</strong>. Your own page
        lists the dental practices to call, one at a time, with the number, the script and the outcome
        buttons — nothing else to learn. The link below is good for ${CALLER_INVITE_TTL_DAYS} days.`,
      buttonUrl: url,
      buttonLabel: 'Set up my calling account',
      accent: '#1F6E7E',
      footnoteHtml: "If you weren't expecting this, you can safely ignore this email.",
    }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Assignment — the pool, the claim, the sweeps
// ─────────────────────────────────────────────────────────────────────────────

/** Statuses a prospect can be handed to a caller from. */
const ASSIGNABLE_STATUSES = ['enriched', 'queued', 'contacted', 'call_list'] as const

/**
 * The pool a caller's queue tops up from — the owner's best leftovers:
 *   - unassigned, with a number nobody has marked bad;
 *   - at or above THE QUALITY FLOOR (P-01; unverified NULLs never pass);
 *   - a live status, never converted / suppressed / disqualified / a no;
 *   - never a hand-raiser (they stay on the owner's own call list);
 *   - never a practice the owner is mid-follow-up with;
 *   - not inside a skip's cooldown;
 *   - in the caller's states when they have any.
 */
export function callerPoolWhere(floor: number, states: string[], now: Date) {
  return and(
    isNull(schema.prospect.assignedCallerId),
    isNotNull(schema.prospect.phone),
    or(isNull(schema.prospect.phoneStatus), notInArray(schema.prospect.phoneStatus, [...BAD_PHONE_STATUSES])),
    gte(schema.prospect.qualityScore, floor),
    inArray(schema.prospect.status, [...ASSIGNABLE_STATUSES]),
    or(isNull(schema.prospect.intentSignal), notInArray(schema.prospect.intentSignal, [...HAND_RAISER_SIGNALS])),
    isNull(schema.prospect.nextFollowUpAt),
    or(isNull(schema.prospect.callerCooldownUntil), lte(schema.prospect.callerCooldownUntil, now)),
    states.length > 0 ? inArray(schema.prospect.state, states) : undefined,
  )
}

/**
 * THE CLAIM — one atomic statement. Two callers topping up in the same
 * second both select the same best candidate; only the first UPDATE whose
 * predicate still reads `assigned_caller_id IS NULL` touches a row.
 */
export async function claimProspectForCaller(prospectId: string, callerId: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(schema.prospect)
    .set({ assignedCallerId: callerId, assignedAt: now, updatedAt: now })
    .where(and(eq(schema.prospect.id, prospectId), isNull(schema.prospect.assignedCallerId)))
    .returning({ id: schema.prospect.id })
  return rows.length > 0
}

export interface FillResult {
  claimed: number
  /** How many they hold after the fill. */
  holding: number
  target: number
}

/** Top ONE caller's queue up to their daily target. */
export async function fillCallerQueue(
  caller: Pick<ProspectCaller, 'id' | 'dailyTarget' | 'states' | 'status'>,
  opts?: { now?: Date; floor?: number },
): Promise<FillResult> {
  const now = opts?.now ?? new Date()
  const target = caller.dailyTarget
  const [holdingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .where(eq(schema.prospect.assignedCallerId, caller.id))
  const holding = holdingRow?.n ?? 0
  const need = target - holding
  if (caller.status !== 'active' || need <= 0) return { claimed: 0, holding, target }

  const floor = opts?.floor ?? (await getProspectingConfig()).qualityFloor
  const states = parseCallerStates(caller.states)
  const candidates = await db
    .select({ id: schema.prospect.id })
    .from(schema.prospect)
    .where(callerPoolWhere(floor, states, now))
    .orderBy(
      sql`${schema.prospect.qualityScore} DESC NULLS LAST`,
      sql`${schema.prospect.opportunityScore} DESC NULLS LAST`,
      asc(schema.prospect.createdAt),
    )
    // Over-fetch: a race with another caller costs a candidate, not a slot.
    .limit(need * 2)

  let claimed = 0
  for (const c of candidates) {
    if (claimed >= need) break
    if (await claimProspectForCaller(c.id, caller.id, now)) claimed++
  }
  return { claimed, holding: holding + claimed, target }
}

/** Every active caller, topped up — the prospect-outreach cron tick's job. */
export async function fillCallerQueues(opts?: { now?: Date }): Promise<{ callers: number; claimed: number; released: number }> {
  const now = opts?.now ?? new Date()
  const released = await releaseStaleAssignments(now)
  const callers = await db.select().from(schema.prospectCaller).where(eq(schema.prospectCaller.status, 'active'))
  if (callers.length === 0) return { callers: 0, claimed: 0, released }
  const floor = (await getProspectingConfig()).qualityFloor
  let claimed = 0
  for (const c of callers) {
    const r = await fillCallerQueue(c, { now, floor })
    claimed += r.claimed
  }
  return { callers: callers.length, claimed, released }
}

/**
 * The 7-day sweep: a claimed prospect with NO call logged in the last seven
 * days goes back to the pool — unless a callback is still promised for a
 * later date (the practice asked for a time; that is a live promise, not
 * neglect). The owner's queues see the released rows on their next read.
 */
export async function releaseStaleAssignments(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CALLER_STALE_ASSIGNMENT_DAYS * DAY_MS)
  const rows = await db
    .update(schema.prospect)
    .set({ assignedCallerId: null, assignedAt: null, updatedAt: now })
    .where(
      and(
        isNotNull(schema.prospect.assignedCallerId),
        lte(schema.prospect.assignedAt, cutoff),
        or(isNull(schema.prospect.nextFollowUpAt), lte(schema.prospect.nextFollowUpAt, now)),
        notExists(
          db
            .select({ one: sql`1` })
            .from(schema.prospectCallLog)
            .where(
              and(
                eq(schema.prospectCallLog.prospectId, schema.prospect.id),
                gte(schema.prospectCallLog.createdAt, cutoff),
              ),
            ),
        ),
      ),
    )
    .returning({ id: schema.prospect.id })
  return rows.length
}

/** Platform admin: hand a prospect to a caller (or to nobody). */
export async function reassignProspect(prospectId: string, callerId: string | null): Promise<void> {
  const now = new Date()
  if (callerId) {
    const c = await getCallerById(callerId)
    if (!c || c.status !== 'active') throw new Error('Pick an active caller')
  }
  await db
    .update(schema.prospect)
    .set({
      assignedCallerId: callerId,
      assignedAt: callerId ? now : null,
      callerCooldownUntil: null,
      updatedAt: now,
    })
    .where(eq(schema.prospect.id, prospectId))
}

// ─────────────────────────────────────────────────────────────────────────────
// The caller's own reads — every one filtered by assigned_caller_id
// ─────────────────────────────────────────────────────────────────────────────

export interface CallerAttempt {
  outcome: string
  note: string | null
  at: Date
  /** This caller's own row; otherwise it was Dream Create's (never another caller named). */
  mine: boolean
}

export interface CallerQueueItem {
  id: string
  name: string
  phone: string
  city: string | null
  state: string | null
  timezone: string | null
  websiteUrl: string | null
  googleRatingTenths: number | null
  reviewCount: number | null
  authorizedOfficialName: string | null
  phoneStatus: ProspectPhoneStatus | null
  phoneLineType: ProspectPhoneLineType | null
  qualityScore: number | null
  qualityBand: ProspectQualityBand | null
  talkingPoints: string[]
  callWindow: CallWindow
  /** Set when this card is a callback that is now due. */
  callbackAt: Date | null
  followUpReason: string | null
  attempts: CallerAttempt[]
}

/**
 * The caller's queue, ready-to-dial order: callbacks now due first (most
 * overdue at the top), then the fresh ones best quality first. A prospect
 * with a callback promised for LATER is not here (see {@link getCallerLater});
 * a number marked bad since the claim is not here either.
 */
export async function getCallerQueue(callerId: string, opts?: { now?: Date; limit?: number }): Promise<CallerQueueItem[]> {
  const now = opts?.now ?? new Date()
  const rows = await db
    .select()
    .from(schema.prospect)
    .where(
      and(
        eq(schema.prospect.assignedCallerId, callerId),
        isNotNull(schema.prospect.phone),
        or(isNull(schema.prospect.phoneStatus), notInArray(schema.prospect.phoneStatus, [...BAD_PHONE_STATUSES])),
        or(isNull(schema.prospect.nextFollowUpAt), lte(schema.prospect.nextFollowUpAt, now)),
      ),
    )
    .orderBy(
      sql`${schema.prospect.nextFollowUpAt} ASC NULLS LAST`,
      sql`${schema.prospect.qualityScore} DESC NULLS LAST`,
      sql`${schema.prospect.opportunityScore} DESC NULLS LAST`,
      asc(schema.prospect.assignedAt),
    )
    .limit(opts?.limit ?? 60)
  if (rows.length === 0) return []
  const attempts = await attemptsFor(
    rows.map((r) => r.id),
    callerId,
  )
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone as string,
    city: p.city,
    state: p.state,
    timezone: p.timezone,
    websiteUrl: p.websiteUrl,
    googleRatingTenths: p.googleRatingTenths,
    reviewCount: p.reviewCount,
    authorizedOfficialName: p.authorizedOfficialName,
    phoneStatus: (p.phoneStatus as ProspectPhoneStatus | null) ?? null,
    phoneLineType: (p.phoneLineType as ProspectPhoneLineType | null) ?? null,
    qualityScore: p.qualityScore,
    qualityBand: (p.qualityBand as ProspectQualityBand | null) ?? null,
    talkingPoints: Array.isArray(p.talkingPoints) ? (p.talkingPoints as string[]).slice(0, 4) : [],
    callWindow: callWindowScore(p.timezone, now),
    callbackAt: p.nextFollowUpAt ?? null,
    followUpReason: p.followUpReason ?? null,
    attempts: attempts.get(p.id) ?? [],
  }))
}

/** The last few attempts on each prospect — the caller's own + Dream
 *  Create's. Another caller's row reads as Dream Create's: nobody is named. */
async function attemptsFor(prospectIds: string[], callerId: string): Promise<Map<string, CallerAttempt[]>> {
  const out = new Map<string, CallerAttempt[]>()
  if (prospectIds.length === 0) return out
  const rows = await db
    .select({
      prospectId: schema.prospectCallLog.prospectId,
      outcome: schema.prospectCallLog.outcome,
      note: schema.prospectCallLog.note,
      createdAt: schema.prospectCallLog.createdAt,
      callerId: schema.prospectCallLog.callerId,
    })
    .from(schema.prospectCallLog)
    .where(inArray(schema.prospectCallLog.prospectId, prospectIds))
    .orderBy(desc(schema.prospectCallLog.createdAt))
    .limit(prospectIds.length * 5)
  for (const r of rows) {
    const list = out.get(r.prospectId) ?? []
    if (list.length >= 5) continue
    list.push({ outcome: r.outcome, note: r.note, at: r.createdAt, mine: r.callerId === callerId })
    out.set(r.prospectId, list)
  }
  return out
}

export interface CallerLaterItem {
  id: string
  name: string
  phone: string | null
  timezone: string | null
  callbackAt: Date
  reason: string | null
}

/** Callbacks promised for later than now — shown under the queue, dialled
 *  when their time comes (they resurface at the top of the queue). */
export async function getCallerLater(callerId: string, opts?: { now?: Date }): Promise<CallerLaterItem[]> {
  const now = opts?.now ?? new Date()
  const rows = await db
    .select({
      id: schema.prospect.id,
      name: schema.prospect.name,
      phone: schema.prospect.phone,
      timezone: schema.prospect.timezone,
      nextFollowUpAt: schema.prospect.nextFollowUpAt,
      followUpReason: schema.prospect.followUpReason,
    })
    .from(schema.prospect)
    .where(and(eq(schema.prospect.assignedCallerId, callerId), sql`${schema.prospect.nextFollowUpAt} > ${now}`))
    .orderBy(asc(schema.prospect.nextFollowUpAt))
    .limit(50)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    timezone: r.timezone,
    callbackAt: r.nextFollowUpAt as Date,
    reason: r.followUpReason,
  }))
}

export interface CallerBookedItem {
  meetingId: string
  prospectId: string
  name: string
  scheduledAt: Date
  hostTimeZone: string
  attendeeEmail: string | null
}

/** Demos THIS caller booked — kept visible after the hand-off so a booking
 *  never vanishes from the person who earned it. */
export async function getCallerBooked(
  caller: Pick<ProspectCaller, 'id' | 'userId'>,
  opts?: { now?: Date },
): Promise<CallerBookedItem[]> {
  if (!caller.userId) return []
  const now = opts?.now ?? new Date()
  const since = new Date(now.getTime() - DAY_MS)
  const rows = await db
    .select({
      meetingId: schema.prospectMeeting.id,
      prospectId: schema.prospectMeeting.prospectId,
      name: schema.prospect.name,
      scheduledAt: schema.prospectMeeting.scheduledAt,
      hostTimeZone: schema.prospectMeeting.hostTimeZone,
      attendeeEmail: schema.prospectMeeting.attendeeEmail,
    })
    .from(schema.prospectMeeting)
    .innerJoin(schema.prospect, eq(schema.prospect.id, schema.prospectMeeting.prospectId))
    .where(
      and(
        eq(schema.prospectMeeting.createdByUserId, caller.userId),
        eq(schema.prospectMeeting.status, 'booked'),
        gte(schema.prospectMeeting.scheduledAt, since),
      ),
    )
    .orderBy(asc(schema.prospectMeeting.scheduledAt))
    .limit(20)
  return rows.map((r) => ({ ...r, scheduledAt: r.scheduledAt as Date }))
}

export interface CallerToday {
  /** Ready to dial right now. */
  queue: number
  /** Holding in all (queue + callbacks for later). */
  holding: number
  target: number
  dials: number
  reached: number
  callbacksDue: number
  meetings: number
}

/** The caller's own numbers for today — "today" on the owner's clock
 *  (the booking host timezone), the day the callers work. */
export async function getCallerToday(
  caller: Pick<ProspectCaller, 'id' | 'dailyTarget'>,
  opts?: { now?: Date; timeZone?: string },
): Promise<CallerToday> {
  const now = opts?.now ?? new Date()
  const tz = opts?.timeZone ?? (await getProspectingConfig()).booking.hostTimeZone
  const dayStart = clinicDayStart(now, tz)
  const [holdRow] = await db
    .select({
      holding: sql<number>`count(*)::int`,
      queue: sql<number>`count(*) filter (where ${schema.prospect.nextFollowUpAt} is null or ${schema.prospect.nextFollowUpAt} <= ${now})::int`,
      callbacksDue: sql<number>`count(*) filter (where ${schema.prospect.nextFollowUpAt} <= ${now})::int`,
    })
    .from(schema.prospect)
    .where(eq(schema.prospect.assignedCallerId, caller.id))
  const logRows = await db
    .select({ outcome: schema.prospectCallLog.outcome, n: sql<number>`count(*)::int` })
    .from(schema.prospectCallLog)
    .where(and(eq(schema.prospectCallLog.callerId, caller.id), gte(schema.prospectCallLog.createdAt, dayStart)))
    .groupBy(schema.prospectCallLog.outcome)
  const w = windowFromOutcomes(logRows)
  return {
    queue: holdRow?.queue ?? 0,
    holding: holdRow?.holding ?? 0,
    target: caller.dailyTarget,
    dials: w.dials,
    reached: w.reached,
    callbacksDue: holdRow?.callbacksDue ?? 0,
    meetings: w.meetings,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The caller's writes — ownership asserted on the row AND in the predicate
// ─────────────────────────────────────────────────────────────────────────────

/** The one ownership read: the row exists AND is assigned to this caller. */
export async function assertAssignedToCaller(
  prospectId: string,
  callerId: string,
): Promise<{ id: string; name: string; timezone: string | null; phone: string | null }> {
  const [row] = await db
    .select({
      id: schema.prospect.id,
      name: schema.prospect.name,
      timezone: schema.prospect.timezone,
      phone: schema.prospect.phone,
    })
    .from(schema.prospect)
    .where(and(eq(schema.prospect.id, prospectId), eq(schema.prospect.assignedCallerId, callerId)))
    .limit(1)
  if (!row) throw new Error('Forbidden: that practice is not in your queue')
  return row
}

/** Release ONE row, only if this caller still holds it. */
async function releaseFromCaller(prospectId: string, callerId: string, now: Date, cooldownUntil: Date | null = null) {
  await db
    .update(schema.prospect)
    .set({ assignedCallerId: null, assignedAt: null, callerCooldownUntil: cooldownUntil, updatedAt: now })
    .where(and(eq(schema.prospect.id, prospectId), eq(schema.prospect.assignedCallerId, callerId)))
}

async function touchCaller(callerId: string, now: Date) {
  await db
    .update(schema.prospectCaller)
    .set({ lastActiveAt: now, updatedAt: now })
    .where(eq(schema.prospectCaller.id, callerId))
}

export interface CallerOutcomeInput {
  caller: Pick<ProspectCaller, 'id'>
  prospectId: string
  outcome: ProspectCallOutcome
  note?: string | null
  lostReason?: string | null
  /** A callback at the time the practice asked for (already an instant). */
  followUpAt?: Date | null
  /** …or as the wall-clock they said it — resolved in THE PRACTICE'S zone
   *  from the asserted row (never the server's UTC, never the caller's). */
  callbackLocal?: { day: string; hour: number; minute: number } | null
}

export type CallerOutcomeResult = { ok: true; released: boolean } | { ok: false; error: string }

/**
 * A caller's outcome — THE SAME SPINE as the owner's (`logCallOutcome`:
 * P-01's phone/quality effects, the follow-up cadence, the loss reason), with
 * the caller stamped on the log row. A terminal outcome ends the assignment.
 * Ownership is asserted here, on the row, before anything is written; a
 * prospect that is not theirs throws.
 */
export async function logCallerOutcome(input: CallerOutcomeInput): Promise<CallerOutcomeResult> {
  const now = new Date()
  const row = await assertAssignedToCaller(input.prospectId, input.caller.id)
  let followUpAt = input.followUpAt ?? null
  if (input.outcome === 'callback' && input.callbackLocal) {
    const { day, hour, minute } = input.callbackLocal
    followUpAt = zonedWallClockToInstant(day, hour, minute, row.timezone ?? 'America/New_York')
    if (!followUpAt || followUpAt.getTime() <= now.getTime()) {
      return { ok: false, error: 'Pick a callback time that is still ahead of now.' }
    }
  }
  await logCallOutcome({
    prospectId: input.prospectId,
    outcome: input.outcome,
    note: input.note ?? null,
    lostReason: input.lostReason ?? null,
    callerId: input.caller.id,
    followUpAt,
  })
  const terminal = (CALLER_TERMINAL_OUTCOMES as readonly string[]).includes(input.outcome)
  if (terminal) await releaseFromCaller(input.prospectId, input.caller.id, now)
  await touchCaller(input.caller.id, now)
  return { ok: true, released: terminal }
}

/** Skip: back to the pool with a 3-day breather, the reason on the log. */
export async function skipProspectForCaller(input: {
  caller: Pick<ProspectCaller, 'id'>
  prospectId: string
  reason: CallerSkipReason
  note?: string | null
}): Promise<void> {
  const now = new Date()
  await assertAssignedToCaller(input.prospectId, input.caller.id)
  const label = CALLER_SKIP_REASON_LABELS[input.reason] ?? input.reason
  await db.insert(schema.prospectCallLog).values({
    id: newId('pcall'),
    prospectId: input.prospectId,
    outcome: CALLER_SKIP_OUTCOME,
    note: input.note?.trim() ? `${label} — ${input.note.trim()}` : label,
    callerId: input.caller.id,
  })
  await releaseFromCaller(
    input.prospectId,
    input.caller.id,
    now,
    new Date(now.getTime() + CALLER_SKIP_COOLDOWN_DAYS * DAY_MS),
  )
  await touchCaller(input.caller.id, now)
}

/**
 * A demo booked on the call: the meeting lands in the same table as the
 * owner's (so reminders, the demos page and the bell all see it), the
 * outcome rides the same spine, the assignment ends, and the platform owner
 * is told who booked it — exactly the self-booked path's alert, naming the
 * caller.
 */
export async function bookDemoForCaller(input: {
  caller: Pick<ProspectCaller, 'id' | 'name' | 'userId'>
  prospectId: string
  /** The instant — or the wall-clock on DREAM CREATE's clock (the booking
   *  host zone), resolved here so the caller's own zone never leaks in. */
  scheduledAt?: Date
  demoLocal?: { day: string; hour: number; minute: number }
  attendeeName?: string | null
  attendeeEmail?: string | null
  note?: string | null
}): Promise<{ ok: true; meetingId: string } | { ok: false; error: string }> {
  const now = new Date()
  const row = await assertAssignedToCaller(input.prospectId, input.caller.id)
  const config = await getProspectingConfig()
  const scheduledAt =
    input.scheduledAt ??
    (input.demoLocal
      ? zonedWallClockToInstant(input.demoLocal.day, input.demoLocal.hour, input.demoLocal.minute, config.booking.hostTimeZone)
      : null)
  if (!scheduledAt || scheduledAt.getTime() <= now.getTime()) {
    return { ok: false, error: 'Pick a demo time that is still ahead of now.' }
  }
  const { logBookedDemo, formatMeetingTime } = await import('./prospect-meetings')
  const { id: meetingId } = await logBookedDemo({
    prospectId: input.prospectId,
    scheduledAt,
    attendeeName: input.attendeeName ?? null,
    attendeeEmail: input.attendeeEmail ?? null,
    note: [input.note?.trim(), `Booked by ${input.caller.name} (caller)`].filter(Boolean).join(' — '),
    createdByUserId: input.caller.userId ?? null,
  })
  await logCallOutcome({
    prospectId: input.prospectId,
    outcome: 'demo_booked',
    note: input.note?.trim() || `Demo booked by ${input.caller.name}`,
    callerId: input.caller.id,
  })
  await releaseFromCaller(input.prospectId, input.caller.id, now)
  await touchCaller(input.caller.id, now)

  // Owner alert (bell + forced email), the self-booked shape, naming the caller.
  try {
    const { getPlatformOrgId } = await import('./gsc')
    const { notifyOrgMembers } = await import('./notifications')
    const orgId = await getPlatformOrgId()
    if (orgId) {
      const whenForHost = formatMeetingTime(scheduledAt, config.booking.hostTimeZone)
      const cal = googleCalendarLink({
        title: `Dream Create demo — ${row.name}`,
        start: scheduledAt,
        durationMin: config.booking.durationMin,
        details: `Booked by ${input.caller.name} on a call.`,
      })
      await notifyOrgMembers(
        orgId,
        {
          bucket: 'comments',
          type: 'prospect_demo_booked',
          title: `${row.name} booked a demo — ${input.caller.name} closed the call`,
          body: `${whenForHost}${input.attendeeEmail ? ` · ${input.attendeeEmail}` : ''}\nAdd to your calendar: ${cal}`,
          linkPath: '/platform/prospecting/call-list',
          forceEmail: true,
        },
        { roles: ['owner', 'admin'] },
      )
    }
  } catch (err) {
    console.warn('[prospect-callers] owner alert failed', err instanceof Error ? err.message : err)
  }
  return { ok: true, meetingId }
}

// ─────────────────────────────────────────────────────────────────────────────
// The platform admin's reads
// ─────────────────────────────────────────────────────────────────────────────

export interface CallerStatWindow {
  dials: number
  reached: number
  /** 0–100, null until there is a dial to divide by. */
  reachedPct: number | null
  callbacks: number
  meetings: number
  /** Dead numbers found (disconnected + wrong number) — verification the caller produced. */
  disconnected: number
}

export interface CallerListRow {
  id: string
  name: string
  email: string
  status: ProspectCallerStatus
  dailyTarget: number
  states: string[]
  notes: string | null
  linked: boolean
  inviteExpiresAt: Date | null
  lastActiveAt: Date | null
  createdAt: Date
  assignedNow: number
  today: CallerStatWindow
  week: CallerStatWindow
}

function emptyWindow(): CallerStatWindow {
  return { dials: 0, reached: 0, reachedPct: null, callbacks: 0, meetings: 0, disconnected: 0 }
}

/** Fold grouped (outcome, n) rows into a stat window. A skip is not a dial. */
export function windowFromOutcomes(rows: Array<{ outcome: string; n: number }>): CallerStatWindow {
  const w = emptyWindow()
  for (const r of rows) {
    if (r.outcome === CALLER_SKIP_OUTCOME) continue
    w.dials += r.n
    if ((REACHED_CALL_OUTCOMES as readonly string[]).includes(r.outcome)) w.reached += r.n
    if (r.outcome === 'callback') w.callbacks += r.n
    if (r.outcome === 'demo_booked') w.meetings += r.n
    if (r.outcome === 'disconnected' || r.outcome === 'wrong_number') w.disconnected += r.n
  }
  w.reachedPct = w.dials > 0 ? Math.round((w.reached / w.dials) * 100) : null
  return w
}

/** Every caller with their numbers for today and the trailing 7 days. */
export async function listCallers(opts?: { now?: Date; timeZone?: string }): Promise<CallerListRow[]> {
  const now = opts?.now ?? new Date()
  const callers = await db.select().from(schema.prospectCaller).orderBy(asc(schema.prospectCaller.createdAt))
  if (callers.length === 0) return []
  const tz = opts?.timeZone ?? (await getProspectingConfig()).booking.hostTimeZone
  const dayStart = clinicDayStart(now, tz)
  const weekStart = clinicDayStart(now, tz, -6)

  const assigned = await db
    .select({ callerId: schema.prospect.assignedCallerId, n: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .where(isNotNull(schema.prospect.assignedCallerId))
    .groupBy(schema.prospect.assignedCallerId)
  const assignedBy = new Map(assigned.map((r) => [r.callerId, r.n]))

  const logs = await db
    .select({
      callerId: schema.prospectCallLog.callerId,
      outcome: schema.prospectCallLog.outcome,
      week: sql<number>`count(*)::int`,
      today: sql<number>`count(*) filter (where ${schema.prospectCallLog.createdAt} >= ${dayStart})::int`,
    })
    .from(schema.prospectCallLog)
    .where(and(isNotNull(schema.prospectCallLog.callerId), gte(schema.prospectCallLog.createdAt, weekStart)))
    .groupBy(schema.prospectCallLog.callerId, schema.prospectCallLog.outcome)
  const todayBy = new Map<string, Array<{ outcome: string; n: number }>>()
  const weekBy = new Map<string, Array<{ outcome: string; n: number }>>()
  for (const r of logs) {
    if (!r.callerId) continue
    todayBy.set(r.callerId, [...(todayBy.get(r.callerId) ?? []), { outcome: r.outcome, n: r.today }])
    weekBy.set(r.callerId, [...(weekBy.get(r.callerId) ?? []), { outcome: r.outcome, n: r.week }])
  }

  return callers.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    status: c.status as ProspectCallerStatus,
    dailyTarget: c.dailyTarget,
    states: parseCallerStates(c.states),
    notes: c.notes,
    linked: Boolean(c.userId),
    inviteExpiresAt: c.inviteExpiresAt,
    lastActiveAt: c.lastActiveAt,
    createdAt: c.createdAt,
    assignedNow: assignedBy.get(c.id) ?? 0,
    today: windowFromOutcomes(todayBy.get(c.id) ?? []),
    week: windowFromOutcomes(weekBy.get(c.id) ?? []),
  }))
}

export interface CallerLogRow {
  id: string
  prospectId: string
  prospectName: string
  outcome: string
  note: string | null
  createdAt: Date
}

/** One caller's log, newest first — the per-caller page. */
export async function getCallerLog(callerId: string, limit = 100): Promise<CallerLogRow[]> {
  const rows = await db
    .select({
      id: schema.prospectCallLog.id,
      prospectId: schema.prospectCallLog.prospectId,
      prospectName: schema.prospect.name,
      outcome: schema.prospectCallLog.outcome,
      note: schema.prospectCallLog.note,
      createdAt: schema.prospectCallLog.createdAt,
    })
    .from(schema.prospectCallLog)
    .innerJoin(schema.prospect, eq(schema.prospect.id, schema.prospectCallLog.prospectId))
    .where(eq(schema.prospectCallLog.callerId, callerId))
    .orderBy(desc(schema.prospectCallLog.createdAt))
    .limit(limit)
  return rows
}
