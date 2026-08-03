import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { toE164 } from '@/lib/phone'
import {
  classifyInboundKeyword,
  smsStopConfirmation,
  smsHelpReply,
} from '@/lib/sms-consent'

/**
 * INBOUND SMS (Phase 5 limb 3, slice 3b). A patient texts the clinic's
 * number → AWS End User Messaging's two-way channel publishes to an SNS
 * topic → /api/webhooks/sms → here.
 *
 * THE OPS CONTRACT THIS ASSUMES (documented in .env.example): pointing the
 * SNS topic at the webhook happens TOGETHER with flipping the number to
 * SelfManagedOptOutsEnabled — from that moment the STOP/HELP replies are
 * OURS to send (this module sends them), and the consent columns become the
 * single truth. Until both are flipped, AWS answers keywords itself and
 * this handler simply never runs.
 *
 * Keyword handling is legally load-bearing: a STOP must stop every patient
 * on the number (the carrier's view is the number, not our chart) and must
 * be confirmed. An ordinary message threads into /messages through the same
 * recordInboundMessage the portal uses — SMS is just another channel there.
 */

export interface InboundSmsPayload {
  /** The patient's number (who texted us). */
  originationNumber: string
  /** The clinic's own number (which practice they texted). */
  destinationNumber: string
  messageBody: string
  /** Provider message id — the dedupe key across SNS redeliveries. */
  inboundMessageId: string
}

/** Parse the SNS Notification's Message JSON defensively — the payload is
 *  external input however much we trust the topic. Null = not an inbound
 *  text we can act on (a DLR or an unrecognised shape), which the caller
 *  acknowledges and drops rather than retrying forever. */
export function parseInboundSms(raw: unknown): InboundSmsPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const origination = typeof o.originationNumber === 'string' ? o.originationNumber : null
  const destination = typeof o.destinationNumber === 'string' ? o.destinationNumber : null
  const body = typeof o.messageBody === 'string' ? o.messageBody : null
  const id = typeof o.inboundMessageId === 'string' ? o.inboundMessageId : null
  if (!origination || !destination || body == null || !id) return null
  return { originationNumber: origination, destinationNumber: destination, messageBody: body, inboundMessageId: id }
}

export interface InboundSmsResult {
  outcome:
    | 'stop_recorded'
    | 'start_recorded'
    | 'help_answered'
    | 'threaded'
    | 'duplicate'
    | 'unknown_clinic'
    | 'unknown_sender'
    | 'ignored'
  organizationId?: string
  patientId?: string
}

/**
 * Handle one inbound text. Never throws — the webhook must 200 whatever
 * happens, because SNS retries on failure and a poison message would retry
 * forever.
 */
export async function handleInboundSms(payload: InboundSmsPayload): Promise<InboundSmsResult> {
  try {
    // Which practice was texted? The clinic's number is its identity.
    const destination = toE164(payload.destinationNumber)
    if (!destination) return { outcome: 'ignored' }
    const configs = await db
      .select({
        organizationId: schema.clinicSmsConfig.organizationId,
        smsPhoneNumber: schema.clinicSmsConfig.smsPhoneNumber,
      })
      .from(schema.clinicSmsConfig)
      .where(eq(schema.clinicSmsConfig.smsPhoneNumber, destination))
      .limit(1)
    const organizationId = configs[0]?.organizationId
    if (!organizationId) {
      // A text to a number we don't hold (a released number still in DNS-like
      // caches, a mistyped destination). Log-and-drop — there is no clinic to
      // thread it to, and retrying will not grow one.
      console.warn('[inbound-sms] no clinic holds', destination)
      return { outcome: 'unknown_clinic' }
    }

    const from = toE164(payload.originationNumber)
    if (!from) return { outcome: 'ignored', organizationId }

    // The clinic's display name, for the keyword replies.
    const [profile] = await db
      .select({ displayName: schema.clinicProfile.displayName, phone: schema.clinicProfile.phone })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    const clinicName = profile?.displayName ?? 'Your dental practice'

    const keyword = classifyInboundKeyword(payload.messageBody)

    if (keyword === 'stop') {
      // Every patient on the number: the carrier's view is the number.
      const { recordSmsOptOut } = await import('@/lib/services/sms-consent')
      await recordSmsOptOut(organizationId, { phone: from })
      await replyBestEffort(organizationId, from, smsStopConfirmation(clinicName))
      return { outcome: 'stop_recorded', organizationId }
    }

    if (keyword === 'help') {
      await replyBestEffort(organizationId, from, smsHelpReply(clinicName, profile?.phone))
      return { outcome: 'help_answered', organizationId }
    }

    if (keyword === 'start') {
      // A deliberate re-subscribe — the ONLY path that clears a standing
      // opt-out. Applied to every matched patient on the number, mirroring
      // the STOP that took them all out.
      const { clearSmsOptOut } = await import('@/lib/services/sms-consent')
      const matches = await patientsOnNumber(organizationId, from)
      for (const p of matches) await clearSmsOptOut(organizationId, p.id, 'keyword')
      return { outcome: 'start_recorded', organizationId }
    }

    // An ordinary message → /messages, like any other patient reply.
    // Dedupe FIRST: SNS redelivers on any earlier non-200, and a patient's
    // one text must not become three thread rows.
    const [existing] = await db
      .select({ id: schema.patientMessage.id })
      .from(schema.patientMessage)
      .where(eq(schema.patientMessage.externalId, payload.inboundMessageId))
      .limit(1)
    if (existing) return { outcome: 'duplicate', organizationId }

    const patient = await resolveSender(organizationId, from)
    if (!patient) {
      // A number no patient record carries. There is no name to family-match
      // against (the Maria/John law needs a name), so minting a chart from a
      // bare number would create exactly the misattribution that law exists
      // to prevent. Log-and-drop; the front desk still has the number in
      // their phone system if the person calls.
      console.warn('[inbound-sms] no patient on', from.slice(-4), 'for org', organizationId)
      return { outcome: 'unknown_sender', organizationId }
    }

    const { recordInboundMessage } = await import('@/lib/services/patient-messaging')
    await recordInboundMessage({
      organizationId,
      patientId: patient.id,
      body: payload.messageBody,
      channel: 'sms',
      externalId: payload.inboundMessageId,
    })
    return { outcome: 'threaded', organizationId, patientId: patient.id }
  } catch (e) {
    console.error('[inbound-sms] handler failed', e)
    return { outcome: 'ignored' }
  }
}

/** Every patient in the org whose stored phone normalises to this number.
 *  Normalised in application code — the column stores whatever the front
 *  desk typed, so SQL equality would miss the same number spelled
 *  differently (the sms-consent service's own lesson). */
async function patientsOnNumber(
  organizationId: string,
  e164: string,
): Promise<Array<{ id: string; phone: string | null; createdAt: Date | null }>> {
  const rows = await db
    .select({
      id: schema.patient.id,
      phone: schema.patient.phone,
      createdAt: schema.patient.createdAt,
    })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))
  return rows.filter((r) => toE164(r.phone) === e164)
}

/**
 * Who is texting? One match is the easy, common case. A SHARED number (a
 * family on one mobile — a shape this codebase models deliberately) has no
 * name attached to an SMS to match against, so the honest tiebreak is the
 * liveliest existing conversation: the patient on this number whose thread
 * spoke most recently, else the most recently created record. The front
 * desk sees the thread and can re-attach a message the way they already do
 * for shared-email families.
 */
async function resolveSender(
  organizationId: string,
  from: string,
): Promise<{ id: string } | null> {
  const matches = await patientsOnNumber(organizationId, from)
  if (matches.length === 0) return null
  if (matches.length === 1) return { id: matches[0].id }

  const ids = new Set(matches.map((m) => m.id))
  const threads = await db
    .select({ patientId: schema.patientThread.patientId, lastMessageAt: schema.patientThread.lastMessageAt })
    .from(schema.patientThread)
    .where(eq(schema.patientThread.organizationId, organizationId))
  const liveliest = threads
    .filter((t) => ids.has(t.patientId) && t.lastMessageAt)
    .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0))[0]
  if (liveliest) return { id: liveliest.patientId }

  const newest = [...matches].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )[0]
  return { id: newest.id }
}

/** The keyword replies are compliance copy, but a failed reply must not
 *  fail the CONSENT WRITE that already happened — the record is the law's
 *  half; the courtesy text retries on the patient's next message. */
async function replyBestEffort(organizationId: string, to: string, body: string): Promise<void> {
  try {
    const { deliverSms } = await import('@/lib/sms')
    await deliverSms(organizationId, { to, body, kind: 'transactional' })
  } catch (e) {
    console.error('[inbound-sms] keyword reply not sent', e)
  }
}
