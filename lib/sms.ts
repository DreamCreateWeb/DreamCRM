import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { toE164 } from '@/lib/phone'
import { smsSegments } from '@/lib/sms-segments'
import { smsDriver } from '@/lib/services/sms-registration'

/**
 * SMS TRANSPORT (Phase 5 limb 3, slice 3) — deliverSms(), the sibling of
 * lib/email.ts's deliver(). A sibling, not a branch inside it: deliver()
 * has no driver seam (its SES/Resend split is inline), and an SMS is not an
 * email with a different address — it has its own identity rules, its own
 * cost model (segments), and its own compliance posture.
 *
 * THE ONE RULE EVERYTHING ELSE HANGS ON: there is NO platform fallback.
 * Email has Tier 1 — any clinic can send from the platform's verified
 * domain on day one. SMS has no such tier BY LAW, not by omission: sending
 * a clinic's texts from anything but that clinic's own registered number is
 * the shared-originator traffic the carriers prohibit. So an unapproved
 * clinic doesn't degrade to a shared number — it simply cannot send, and
 * every caller must treat { ok: false, reason: 'not_approved' } as a normal
 * state, not an error.
 */

export type SmsIdentityResult =
  | { ok: true; fromNumber: string }
  | { ok: false; reason: 'driver_off' | 'not_approved' }

/**
 * The clinic's sending identity: its own registered number, and nothing
 * else. Unlocks on a2p_status === 'approved' EXACTLY — number_pending has a
 * number in the row, but a send from a number still associating with its
 * campaign is unregistered traffic the carriers block outright.
 */
export async function getClinicSmsIdentity(organizationId: string): Promise<SmsIdentityResult> {
  if (smsDriver() !== 'aws') return { ok: false, reason: 'driver_off' }
  const [row] = await db
    .select({
      a2pStatus: schema.clinicSmsConfig.a2pStatus,
      smsPhoneNumber: schema.clinicSmsConfig.smsPhoneNumber,
    })
    .from(schema.clinicSmsConfig)
    .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
    .limit(1)
  if (row?.a2pStatus !== 'approved' || !row.smsPhoneNumber) {
    return { ok: false, reason: 'not_approved' }
  }
  return { ok: true, fromNumber: row.smsPhoneNumber }
}

export interface DeliverSmsInput {
  to: string
  body: string
  /** Routes AWS's MessageType honestly: a recall invitation is PROMOTIONAL
   *  traffic and miscategorising it as transactional is the kind of small
   *  lie carriers punish with filtering. Reminders are 'transactional'. */
  kind: 'transactional' | 'marketing'
}

export type DeliverSmsResult =
  | { ok: true; messageId: string | null; segments: number }
  | { ok: false; reason: 'driver_off' | 'not_approved' | 'bad_number' | 'empty' | 'failed'; error: string }

/**
 * Send one text from the clinic's own number. Never throws — callers get a
 * typed refusal they can record honestly. The monthly segment counter is
 * bumped on every successful send (the budget column is a SOFT cap by its
 * own schema comment — a UI banner, not a send blocker).
 */
export async function deliverSms(
  organizationId: string,
  input: DeliverSmsInput,
): Promise<DeliverSmsResult> {
  const identity = await getClinicSmsIdentity(organizationId)
  if (!identity.ok) {
    return identity.reason === 'driver_off'
      ? { ok: false, reason: 'driver_off', error: 'Texting isn’t switched on for this platform yet.' }
      : { ok: false, reason: 'not_approved', error: 'This practice’s texting isn’t live yet — registration is still with the carriers.' }
  }
  const to = toE164(input.to)
  if (!to) {
    // The honest-null law: a number we can't parse is never sent to a
    // carrier and reported as delivered.
    return { ok: false, reason: 'bad_number', error: 'That phone number doesn’t look textable.' }
  }
  const body = input.body.trim()
  if (!body) return { ok: false, reason: 'empty', error: 'There’s no message to send.' }

  try {
    const { PinpointSMSVoiceV2Client, SendTextMessageCommand } = await import(
      '@aws-sdk/client-pinpoint-sms-voice-v2'
    )
    const client = new PinpointSMSVoiceV2Client({ region: process.env.AWS_REGION || 'us-east-1' })
    const res = await client.send(
      new SendTextMessageCommand({
        DestinationPhoneNumber: to,
        OriginationIdentity: identity.fromNumber,
        MessageBody: body,
        MessageType: input.kind === 'marketing' ? 'PROMOTIONAL' : 'TRANSACTIONAL',
      }),
    )
    const segments = smsSegments(body)
    await bumpMonthlyCounter(organizationId, segments)
    return { ok: true, messageId: res.MessageId ?? null, segments }
  } catch (e) {
    console.error('[sms] send failed', e)
    return { ok: false, reason: 'failed', error: friendlySmsError(e) }
  }
}

/**
 * The rolling ~30-day segment counter behind the budget banner. The window
 * rolls forward when it expires; the increment itself is a SQL-side add so
 * two concurrent sends can't lose each other's count. The counter is
 * advisory (it feeds a UI banner), so the tiny race between the window
 * check and the add is acceptable — a miscount of one send at a month
 * boundary, never a lost message.
 */
async function bumpMonthlyCounter(organizationId: string, segments: number): Promise<void> {
  try {
    const WINDOW_MS = 30 * 24 * 60 * 60 * 1000
    const [row] = await db
      .select({ resetAt: schema.clinicSmsConfig.monthlySendCountResetAt })
      .from(schema.clinicSmsConfig)
      .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
      .limit(1)
    const expired = !row?.resetAt || Date.now() - row.resetAt.getTime() > WINDOW_MS
    if (expired) {
      await db
        .update(schema.clinicSmsConfig)
        .set({ monthlySendCount: segments, monthlySendCountResetAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
    } else {
      await db
        .update(schema.clinicSmsConfig)
        .set({
          monthlySendCount: sql`${schema.clinicSmsConfig.monthlySendCount} + ${segments}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
    }
  } catch (e) {
    // Bookkeeping must never fail a send that already happened.
    console.error('[sms] counter not bumped', e)
  }
}

/** Provider errors → the voice. Raw AWS text never reaches staff. */
function friendlySmsError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? ''
  if (name === 'ThrottlingException') {
    return 'The carriers are rate-limiting sends right now — this one will need another try.'
  }
  if (name === 'ConflictException' || name === 'ValidationException') {
    return 'The carrier refused this message — nothing was sent.'
  }
  if (name === 'AccessDeniedException') {
    return 'Texting isn’t fully set up on our side yet — nothing was sent.'
  }
  return 'The text didn’t go out — nothing was sent.'
}
