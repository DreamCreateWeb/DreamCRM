import 'server-only'

import { randomBytes } from 'crypto'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, notExists, or, sql } from 'drizzle-orm'
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
  CALLER_SKIP_FINAL_REASONS,
  CALLER_SKIP_LONG_COOLDOWN_DAYS,
  CALLER_SKIP_OUTCOME,
  CALLER_SKIP_REASON_LABELS,
  CALLER_SERVABLE_STATUSES,
  CALLER_STALE_ASSIGNMENT_DAYS,
  CALLER_TERMINAL_OUTCOMES,
  HAND_RAISER_SIGNALS,
  PROSPECT_STATUS_LABELS,
  REACHED_CALL_OUTCOMES,
  type CallerSkipReason,
  type ProspectCallOutcome,
  type ProspectPhoneLineType,
  type ProspectPhoneStatus,
  type ProspectQualityBand,
} from '@/lib/types/prospecting'
import { US_STATES } from '@/lib/types/us-geo'
import { getProspectingConfig, logCallOutcome } from './prospecting'
import { callerServableWhere, releaseCooldownUntil, releaseUnservableAssignments } from './prospect-caller-release'

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

/**
 * Invite a caller: the row, then the email — and the row says whether the
 * email went. `invite_sent_at` is stamped ONLY on a successful send, so a
 * Resend outage leaves a visible "invite not sent · Resend" row instead of
 * a ghost that answers the next attempt with "already exists".
 */
export async function createCaller(input: CreateCallerInput): Promise<{ id: string; email: string; sent: boolean }> {
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
      throw new Error('That email belongs to an archived caller — reactivate them from their row, or use another email')
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
    inviteSentAt: null,
    inviteExpiresAt: new Date(now.getTime() + CALLER_INVITE_TTL_MS),
    dailyTarget,
    states: states.length > 0 ? states : null,
    notes: input.notes?.trim() || null,
    createdByUserId: input.createdByUserId ?? null,
  })

  const sent = await sendCallerInviteAndStamp({ callerId: id, to: email, name, token })
  return { id, email, sent }
}

/** The send + the stamp: `invite_sent_at` is written only when the mail
 *  left. A failed send is reported, never thrown — the row is the truth. */
async function sendCallerInviteAndStamp(args: { callerId: string; to: string; name: string; token: string }): Promise<boolean> {
  try {
    await sendCallerInviteEmail({ to: args.to, name: args.name, token: args.token })
  } catch (err) {
    console.warn('[prospect-callers] invite email failed', args.callerId, err instanceof Error ? err.message : err)
    return false
  }
  await db
    .update(schema.prospectCaller)
    .set({ inviteSentAt: new Date() })
    .where(eq(schema.prospectCaller.id, args.callerId))
  return true
}

/** Re-arm + re-send a caller's invite (new token, a fresh 7-day clock).
 *  Throws when the mail does not leave, so the admin presses again. */
export async function resendCallerInvite(callerId: string): Promise<{ email: string }> {
  const c = await getCallerById(callerId)
  if (!c) throw new Error('Caller not found')
  if (c.userId) throw new Error('This caller has already set up their account')
  if (c.status === 'archived') throw new Error('This caller is archived — reactivate them first')

  const token = randomBytes(24).toString('hex')
  const now = new Date()
  await db
    .update(schema.prospectCaller)
    .set({
      inviteToken: token,
      inviteSentAt: null,
      inviteExpiresAt: new Date(now.getTime() + CALLER_INVITE_TTL_MS),
      status: 'invited',
      updatedAt: now,
    })
    .where(eq(schema.prospectCaller.id, callerId))
  const sent = await sendCallerInviteAndStamp({ callerId, to: c.email, name: c.name, token })
  if (!sent) throw new Error('The invite email did not send — try again in a moment')
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

/**
 * Pause or resume. A paused caller is not calling, so a pause hands every
 * practice they held back to the pool at once (with the release cooldown,
 * so the next tick's refill does not park them on another caller before the
 * owner's queues have seen them); their page says so. Resume lets them
 * fill again. Neither touches the session — the portal reads the status.
 */
export async function setCallerStatus(callerId: string, status: 'active' | 'paused'): Promise<{ released: number }> {
  const c = await getCallerById(callerId)
  if (!c) throw new Error('Caller not found')
  if (c.status === 'archived') throw new Error('This caller is archived — reactivate them first')
  if (status === 'active' && !c.userId) throw new Error('This caller has not accepted their invite yet')
  const now = new Date()
  await db
    .update(schema.prospectCaller)
    .set({ status, updatedAt: now })
    .where(eq(schema.prospectCaller.id, callerId))
  const released =
    status === 'paused'
      ? await releaseCallerAssignments(callerId, now, releaseCooldownUntil(now))
      : 0
  return { released }
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

/**
 * Reactivate an archived caller — the door the archive copy promises. A
 * caller who had set up their account goes straight back to active; one who
 * never accepted gets a fresh invite (a new token, a new 7-day clock).
 */
export async function reactivateCaller(callerId: string): Promise<{ status: 'active' | 'invited'; sent: boolean | null }> {
  const c = await getCallerById(callerId)
  if (!c) throw new Error('Caller not found')
  if (c.status !== 'archived') throw new Error('This caller is not archived')
  const now = new Date()
  if (c.userId) {
    await db
      .update(schema.prospectCaller)
      .set({ status: 'active', updatedAt: now })
      .where(eq(schema.prospectCaller.id, callerId))
    return { status: 'active', sent: null }
  }
  const token = randomBytes(24).toString('hex')
  await db
    .update(schema.prospectCaller)
    .set({
      status: 'invited',
      inviteToken: token,
      inviteSentAt: null,
      inviteExpiresAt: new Date(now.getTime() + CALLER_INVITE_TTL_MS),
      updatedAt: now,
    })
    .where(eq(schema.prospectCaller.id, callerId))
  const sent = await sendCallerInviteAndStamp({ callerId, to: c.email, name: c.name, token })
  return { status: 'invited', sent }
}

/** Hand everything a caller holds back to the pool — with a cooldown when
 *  the release is a pause or a sweep (never straight back on the same tick). */
export async function releaseCallerAssignments(
  callerId: string,
  now = new Date(),
  cooldownUntil: Date | null = null,
): Promise<number> {
  const rows = await db
    .update(schema.prospect)
    .set({ assignedCallerId: null, assignedAt: null, callerCooldownUntil: cooldownUntil, updatedAt: now })
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

/**
 * The accept completion: link the user, go active, burn the token. The
 * caller must have verified the session email matches the invite. The
 * UPDATE's own predicate re-reads the token, the status and the clock, so an
 * archive, a resend (a rotated token) or an expiry that landed between the
 * page's read and this write cannot be overwritten — the link simply misses
 * and the caller sees the invite is no longer valid.
 */
export async function linkCallerUser(callerId: string, userId: string, token: string): Promise<boolean> {
  const now = new Date()
  const rows = await db
    .update(schema.prospectCaller)
    .set({ userId, status: 'active', inviteToken: null, updatedAt: now })
    .where(
      and(
        eq(schema.prospectCaller.id, callerId),
        eq(schema.prospectCaller.inviteToken, token),
        inArray(schema.prospectCaller.status, ['invited', 'active']),
        sql`${schema.prospectCaller.inviteExpiresAt} > ${now}`,
      ),
    )
    .returning({ id: schema.prospectCaller.id })
  return rows.length > 0
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
 *   - unassigned, and SERVABLE ({@link callerServableWhere}: a number nobody
 *     has marked bad, a live status, never a hand-raiser, no demo booked);
 *   - at or above THE QUALITY FLOOR (P-01; unverified NULLs never pass);
 *   - from the assignable statuses (`engaged` is servable while held but is
 *     the owner's warm lead to claim — not a caller's);
 *   - never a practice the owner is mid-follow-up with;
 *   - not inside a skip's or a release's cooldown;
 *   - in the caller's states when they have any.
 */
export function callerPoolWhere(floor: number, states: string[], now: Date) {
  return and(
    isNull(schema.prospect.assignedCallerId),
    callerServableWhere(now),
    gte(schema.prospect.qualityScore, floor),
    inArray(schema.prospect.status, [...ASSIGNABLE_STATUSES]),
    isNull(schema.prospect.nextFollowUpAt),
    or(isNull(schema.prospect.callerCooldownUntil), lte(schema.prospect.callerCooldownUntil, now)),
    states.length > 0 ? inArray(schema.prospect.state, states) : undefined,
  )
}

/** What the caller's queue serves RIGHT NOW: theirs, servable, and not a
 *  callback parked for later. The queue read, the KPI and the top-up's
 *  "how many do they really have" all count exactly this. */
function callerDialableNowWhere(callerId: string, now: Date) {
  return and(
    eq(schema.prospect.assignedCallerId, callerId),
    callerServableWhere(now),
    or(isNull(schema.prospect.nextFollowUpAt), lte(schema.prospect.nextFollowUpAt, now)),
  )
}

/** The executor a fill runs on — the db, or the transaction it opened. */
type Exec = Pick<typeof db, 'select' | 'update'>

/**
 * THE CLAIM — one atomic statement. Two callers topping up in the same
 * second both select the same best candidate; only the first UPDATE whose
 * predicate still reads `assigned_caller_id IS NULL` touches a row.
 */
export async function claimProspectForCaller(
  prospectId: string,
  callerId: string,
  now = new Date(),
  exec: Exec = db,
): Promise<boolean> {
  const rows = await exec
    .update(schema.prospect)
    .set({ assignedCallerId: callerId, assignedAt: now, updatedAt: now })
    .where(and(eq(schema.prospect.id, prospectId), isNull(schema.prospect.assignedCallerId)))
    .returning({ id: schema.prospect.id })
  return rows.length > 0
}

export interface FillResult {
  claimed: number
  /** How many they can dial right now after the fill — what counts toward
   *  the target (a callback parked for later does not hold a slot). */
  ready: number
  target: number
}

/**
 * Top ONE caller's queue up to their daily target — INSIDE a transaction
 * that first locks the caller's own row (`SELECT … FOR UPDATE`). Two fills
 * for the same caller (the cron tick and "Fill my queue", two tabs) then
 * run one after the other: the second re-reads the count after the first
 * committed and finds nothing to add. The cap is per CALLER, not per call.
 * The per-ROW guard (`assigned_caller_id IS NULL`) still keeps two
 * different callers from sharing a practice.
 */
export async function fillCallerQueue(
  caller: Pick<ProspectCaller, 'id' | 'dailyTarget' | 'states' | 'status'>,
  opts?: { now?: Date; floor?: number },
): Promise<FillResult> {
  if (caller.status !== 'active') return { claimed: 0, ready: 0, target: caller.dailyTarget }
  const floor = opts?.floor ?? (await getProspectingConfig()).qualityFloor
  return db.transaction((tx) => fillCallerQueueIn(tx, caller, { now: opts?.now, floor }))
}

/** The fill's body on a given executor — exported so the boundary test can
 *  render every statement through drizzle's dialect without a transaction. */
export async function fillCallerQueueIn(
  exec: Exec,
  caller: Pick<ProspectCaller, 'id' | 'dailyTarget' | 'states' | 'status'>,
  opts: { now?: Date; floor: number },
): Promise<FillResult> {
  const now = opts.now ?? new Date()
  const target = caller.dailyTarget
  // The lock: one fill per caller at a time.
  await exec.select({ id: schema.prospectCaller.id }).from(schema.prospectCaller).where(eq(schema.prospectCaller.id, caller.id)).for('update')
  const [readyRow] = await exec
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.prospect)
    .where(callerDialableNowWhere(caller.id, now))
  const ready = readyRow?.n ?? 0
  const need = target - ready
  if (caller.status !== 'active' || need <= 0) return { claimed: 0, ready, target }

  const states = parseCallerStates(caller.states)
  const candidates = await exec
    .select({ id: schema.prospect.id })
    .from(schema.prospect)
    .where(callerPoolWhere(opts.floor, states, now))
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
    if (await claimProspectForCaller(c.id, caller.id, now, exec)) claimed++
  }
  return { claimed, ready: ready + claimed, target }
}

/** Every active caller, topped up — the prospect-outreach cron tick's job.
 *  First the stragglers (rows that stopped being servable by any path),
 *  then the 7-day sweep, then the fills; every release carries a cooldown
 *  so this same tick cannot hand a row straight back. */
export async function fillCallerQueues(
  opts?: { now?: Date },
): Promise<{ callers: number; claimed: number; released: number; releasedUnservable: number }> {
  const now = opts?.now ?? new Date()
  const releasedUnservable = await releaseUnservableAssignments(now)
  const released = await releaseStaleAssignments(now)
  const callers = await db.select().from(schema.prospectCaller).where(eq(schema.prospectCaller.status, 'active'))
  if (callers.length === 0) return { callers: 0, claimed: 0, released, releasedUnservable }
  const floor = (await getProspectingConfig()).qualityFloor
  let claimed = 0
  for (const c of callers) {
    const r = await fillCallerQueue(c, { now, floor })
    claimed += r.claimed
  }
  return { callers: callers.length, claimed, released, releasedUnservable }
}

/**
 * The 7-day sweep: a claimed prospect with NO call logged in the last seven
 * days goes back to the pool — unless a callback is still a live promise.
 * A callback the caller set is live while it is AHEAD and for seven days
 * after it comes due (the practice asked for a time; the caller has a week
 * to keep it — the first tick after the minute it comes due is not
 * neglect). A booked demo still ahead keeps the row with the caller who
 * earned it. Every release carries the cooldown so the same tick's refill
 * cannot hand the row straight back; the owner's queues see it meanwhile.
 */
export async function releaseStaleAssignments(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CALLER_STALE_ASSIGNMENT_DAYS * DAY_MS)
  const cooldownUntil = releaseCooldownUntil(now)
  const rows = await db
    .update(schema.prospect)
    .set({ assignedCallerId: null, assignedAt: null, callerCooldownUntil: cooldownUntil, updatedAt: now })
    .where(
      and(
        isNotNull(schema.prospect.assignedCallerId),
        lte(schema.prospect.assignedAt, cutoff),
        or(isNull(schema.prospect.nextFollowUpAt), lte(schema.prospect.nextFollowUpAt, cutoff)),
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
        notExists(
          db
            .select({ one: sql`1` })
            .from(schema.prospectMeeting)
            .where(
              and(
                eq(schema.prospectMeeting.prospectId, schema.prospect.id),
                eq(schema.prospectMeeting.status, 'booked'),
                sql`${schema.prospectMeeting.scheduledAt} > ${now}`,
              ),
            ),
        ),
      ),
    )
    .returning({ id: schema.prospect.id })
  return rows.length
}

/**
 * Platform admin: hand a prospect to a caller (or to nobody). A hand-over is
 * refused, with the reason, when the row is not servable (a no, an
 * unsubscribe, a conversion, a closed practice, a bad or missing number, a
 * hand-raiser — those stay with the owner, or a demo already booked) or
 * when the OWNER has a follow-up scheduled with them (log that call first —
 * the caller's queue would otherwise hide a promise the owner made).
 */
export async function reassignProspect(prospectId: string, callerId: string | null): Promise<void> {
  const now = new Date()
  if (callerId) {
    const c = await getCallerById(callerId)
    if (!c || c.status !== 'active') throw new Error('Pick an active caller')
    const [row] = await db
      .select({
        id: schema.prospect.id,
        status: schema.prospect.status,
        phone: schema.prospect.phone,
        phoneStatus: schema.prospect.phoneStatus,
        intentSignal: schema.prospect.intentSignal,
        nextFollowUpAt: schema.prospect.nextFollowUpAt,
        assignedCallerId: schema.prospect.assignedCallerId,
        demoAhead: sql<boolean>`exists (select 1 from ${schema.prospectMeeting} where ${schema.prospectMeeting.prospectId} = ${schema.prospect.id} and ${schema.prospectMeeting.status} = 'booked' and ${schema.prospectMeeting.scheduledAt} > ${now})`,
      })
      .from(schema.prospect)
      .where(eq(schema.prospect.id, prospectId))
      .limit(1)
    if (!row) throw new Error('Prospect not found')
    const why = unservableReason(row)
    if (why) throw new Error(why)
    if (row.nextFollowUpAt && !row.assignedCallerId) {
      throw new Error('You have a follow-up scheduled with them — log that call first, then hand them over')
    }
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

/** Why a row cannot go to a caller — null when it can. The JS twin of
 *  {@link callerServableWhere}, for a refusal that says the reason. */
export function unservableReason(row: {
  status: string
  phone: string | null
  phoneStatus: string | null
  intentSignal: string | null
  demoAhead?: boolean | null
}): string | null {
  if (!(CALLER_SERVABLE_STATUSES as readonly string[]).includes(row.status)) {
    const label = PROSPECT_STATUS_LABELS[row.status as keyof typeof PROSPECT_STATUS_LABELS] ?? row.status
    return `They are "${label.toLowerCase()}" — a caller cannot work that record`
  }
  if (!row.phone) return 'They have no phone number on file — nothing for a caller to dial'
  if (row.phoneStatus && (BAD_PHONE_STATUSES as readonly string[]).includes(row.phoneStatus)) {
    return 'Their number is marked bad — nothing for a caller to dial'
  }
  if (row.intentSignal && (HAND_RAISER_SIGNALS as readonly string[]).includes(row.intentSignal)) {
    return 'They raised their hand — hand-raisers stay on your own call list'
  }
  if (row.demoAhead) return 'They already have a demo booked — nothing left to cold-call'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// The caller's own reads — every one filtered by assigned_caller_id
// ─────────────────────────────────────────────────────────────────────────────

export interface CallerAttempt {
  outcome: string
  /** The caller's OWN note only — never the owner's internal note, never
   *  another caller's (a note can carry a cell number, a vendor dispute…). */
  note: string | null
  at: Date
  /** This caller's own row. */
  mine: boolean
  /** The owner's own call (no caller on the row) — reads as "Dream Create";
   *  another caller's reads as "another caller", nobody named. */
  byOwner: boolean
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
 * neither is anything that stopped being servable since the claim — a
 * number marked bad, a reply that said no or unsubscribed, a hand-raiser, a
 * converted practice, a demo already booked (the same predicate the pool,
 * the KPI and the release hook read).
 */
export async function getCallerQueue(callerId: string, opts?: { now?: Date; limit?: number }): Promise<CallerQueueItem[]> {
  const now = opts?.now ?? new Date()
  const rows = await db
    .select()
    .from(schema.prospect)
    .where(callerDialableNowWhere(callerId, now))
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

/** The last few attempts on each prospect — outcomes from everyone (the
 *  context a dialer needs), but a NOTE only from this caller's own rows:
 *  the owner's internal notes and another caller's free text never cross
 *  to a card. The owner's row reads as Dream Create's, another caller's as
 *  "another caller": nobody is named. */
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
    const mine = r.callerId === callerId
    list.push({ outcome: r.outcome, note: mine ? r.note : null, at: r.createdAt, mine, byOwner: r.callerId == null })
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
  /** Ready to dial right now — exactly the rows the queue serves. */
  queue: number
  /** Holding in all (the queue + callbacks parked for later + a demo
   *  booked and still ahead). */
  holding: number
  /** Callbacks promised for later than now. */
  later: number
  target: number
  dials: number
  reached: number
  callbacksDue: number
  meetings: number
}

/** The caller's own numbers for today — "today" on the owner's clock
 *  (the booking host timezone), the day the callers work. The queue count
 *  reads the same predicate as the queue itself, so the KPI never says "1
 *  in your queue" over an empty card. */
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
      later: sql<number>`count(*) filter (where ${schema.prospect.nextFollowUpAt} > ${now})::int`,
    })
    .from(schema.prospect)
    .where(eq(schema.prospect.assignedCallerId, caller.id))
  const [queueRow] = await db
    .select({
      queue: sql<number>`count(*)::int`,
      callbacksDue: sql<number>`count(*) filter (where ${schema.prospect.nextFollowUpAt} <= ${now})::int`,
    })
    .from(schema.prospect)
    .where(callerDialableNowWhere(caller.id, now))
  const logRows = await db
    .select({ outcome: schema.prospectCallLog.outcome, n: sql<number>`count(*)::int` })
    .from(schema.prospectCallLog)
    .where(and(eq(schema.prospectCallLog.callerId, caller.id), gte(schema.prospectCallLog.createdAt, dayStart)))
    .groupBy(schema.prospectCallLog.outcome)
  const w = windowFromOutcomes(logRows)
  return {
    queue: queueRow?.queue ?? 0,
    holding: holdRow?.holding ?? 0,
    later: holdRow?.later ?? 0,
    target: caller.dailyTarget,
    dials: w.dials,
    reached: w.reached,
    callbacksDue: queueRow?.callbacksDue ?? 0,
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
 * the caller stamped on the log row. A terminal outcome ends the assignment
 * (every one of them also flips the row unservable, so the pool never hands
 * it back). A win is the owner's call (the conversion), never a caller's
 * key; a demo goes through {@link bookDemoForCaller}. Ownership is asserted
 * here, on the row, before anything is written; a prospect that is not
 * theirs throws.
 */
export async function logCallerOutcome(input: CallerOutcomeInput): Promise<CallerOutcomeResult> {
  const now = new Date()
  if (input.outcome === 'won' || input.outcome === 'demo_booked') {
    return {
      ok: false,
      error:
        input.outcome === 'won'
          ? 'A win is logged by Dream Create when the practice signs — book the demo and they take it from there.'
          : 'Book the demo with a time.',
    }
  }
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

/** Skip: back to the pool, the reason on the log. "Come back to it later"
 *  and "other" are a 3-day breather; "not a fit" and "already spoke" END the
 *  callers' relationship with the row — a long cooldown, so the pool cannot
 *  recycle it to the same person every three days (the owner's drawer keeps
 *  the reason). */
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
  const days = (CALLER_SKIP_FINAL_REASONS as readonly string[]).includes(input.reason)
    ? CALLER_SKIP_LONG_COOLDOWN_DAYS
    : CALLER_SKIP_COOLDOWN_DAYS
  await releaseFromCaller(input.prospectId, input.caller.id, now, new Date(now.getTime() + days * DAY_MS))
  await touchCaller(input.caller.id, now)
}

/**
 * A demo booked on the call: the meeting lands in the same table as the
 * owner's (so reminders, the demos page and the bell all see it), the
 * outcome rides the same spine, the demo brief is pre-warmed exactly as the
 * owner's own booking does it, and the platform owner is told who booked it
 * — the self-booked path's alert, naming the caller. The row STAYS with the
 * caller who earned it (the booked meeting takes it off every dial card and
 * out of the pool); the sweep hands it back once the meeting has passed.
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
  await touchCaller(input.caller.id, now)
  // Pre-warm the demo prep brief so the owner opens a ready meeting — the
  // same fire-and-forget the owner's own booking path performs.
  import('./demo-brief')
    .then((m) => m.generateDemoBrief(input.prospectId))
    .catch(() => {})

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
  /** Null on an invited row = the email never left (Resend is the door). */
  inviteSentAt: Date | null
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
    inviteSentAt: c.inviteSentAt,
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
