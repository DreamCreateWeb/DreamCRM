// SMS delivery receipts (DLRs) — pure parse + classify (Phase 5 limb 3).
//
// AWS End User Messaging publishes message events through a CONFIGURATION
// SET's event destination: every send that names the set (deliverSms passes
// SMS_CONFIGURATION_SET when it's configured) emits TEXT_* events to an SNS
// topic, whose HTTPS subscription is the same /api/webhooks/sms endpoint
// the inbound channel uses. An inbound text and a DLR are distinguishable
// by shape: inbound carries originationNumber/messageBody/inboundMessageId,
// a DLR carries eventType/messageId/messageStatus.
//
// The truth lives in messageStatus, not eventType — a TEXT_ALL destination
// forwards every lifecycle event, and the interim ones (PENDING, QUEUED,
// SENT, SUCCESSFUL) are progress, not receipts. Only DELIVERED means the
// handset confirmed, and only the terminal failure statuses mean the text
// is not arriving. Everything else is acknowledged and dropped.

export interface SmsDlrPayload {
  /** e.g. 'TEXT_DELIVERED' — always TEXT_*-prefixed for SMS events. */
  eventType: string
  /** The SendTextMessage MessageId — the correlation key back to the send. */
  messageId: string
  /** e.g. 'DELIVERED', 'CARRIER_BLOCKED'. */
  messageStatus: string
  /** The provider's human-readable status line, carried into the ledger. */
  messageStatusDescription: string | null
}

/** Parse an SNS Notification's Message JSON as a DLR. Null = not a message
 *  event we recognise (an inbound text, or an unrecognised shape) — the
 *  caller acknowledges and moves on rather than retrying forever. */
export function parseSmsDlr(raw: unknown): SmsDlrPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const eventType = typeof o.eventType === 'string' ? o.eventType : null
  const messageId = typeof o.messageId === 'string' ? o.messageId : null
  const messageStatus = typeof o.messageStatus === 'string' ? o.messageStatus : null
  if (!eventType || !eventType.startsWith('TEXT_') || !messageId || !messageStatus) return null
  // An inbound text also has no eventType, but be explicit: a payload that
  // carries an inbound body is never a receipt.
  if (typeof o.inboundMessageId === 'string') return null
  return {
    eventType,
    messageId,
    messageStatus: messageStatus.toUpperCase(),
    messageStatusDescription:
      typeof o.messageStatusDescription === 'string' ? o.messageStatusDescription : null,
  }
}

export type SmsDlrVerdict = 'delivered' | 'failed' | 'interim'

/** Terminal failure statuses — the text is not arriving, ever. */
const FAILURE_STATUSES = new Set([
  'INVALID',
  'INVALID_MESSAGE',
  'UNREACHABLE',
  'CARRIER_UNREACHABLE',
  'BLOCKED',
  'CARRIER_BLOCKED',
  'SPAM',
  'TTL_EXPIRED',
])

/**
 * DELIVERED is the only status that earns the word "delivered" — SUCCESSFUL
 * merely means a carrier accepted the message, and reporting that as
 * delivery is the small dishonesty the email side already refuses (Resend's
 * Delivered receipt means delivered). Unknown statuses are interim: a new
 * provider status must never be guessed into a receipt.
 */
export function classifySmsDlr(p: SmsDlrPayload): SmsDlrVerdict {
  if (p.messageStatus === 'DELIVERED') return 'delivered'
  if (FAILURE_STATUSES.has(p.messageStatus)) return 'failed'
  return 'interim'
}
