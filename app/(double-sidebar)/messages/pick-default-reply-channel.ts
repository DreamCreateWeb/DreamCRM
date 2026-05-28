/**
 * Two helpers that drive the composer's channel picker:
 *
 *   • detectPreferredChannel(messages) — historical preference from
 *     the inbound message distribution. Returns a channel + the share
 *     it represents (e.g. 4 of 5 inbounds via email → email at 0.8)
 *     when there's a strong majority; null when the patient hasn't
 *     used any one channel enough to count as a "preference."
 *
 *   • pickDefaultReplyChannel(messages, hasEmail) — the channel the
 *     composer auto-selects. Prefers historical preference when one
 *     is identifiable; otherwise falls back to the channel of the
 *     most recent inbound (the patient's latest signal). When the
 *     winning channel isn't currently sendable — SMS is gated on
 *     Phase B — both helpers gracefully fall back so the picker never
 *     lands on a disabled option.
 *
 * Rationale for separating the two: the UI shows the preference label
 * ("Mia prefers email") only when one actually exists, even on threads
 * where the most recent message dictated a different default.
 */

type Channel = 'in_app' | 'email' | 'sms'

interface MessageLite {
  direction: 'inbound' | 'outbound'
  channel: Channel
}

export interface ChannelPreference {
  channel: Channel
  /** Inbound messages on the winning channel. */
  count: number
  /** count / totalInbound — 1.0 means every inbound landed on the
   *  preferred channel; 0.7 means 7 of 10 did. */
  share: number
  /** Total inbound messages across all channels in the input. */
  totalInbound: number
}

/**
 * Minimum number of inbound messages before a "preference" is even
 * meaningful. One inbound is not a preference, it's a single data
 * point; three is the floor where a pattern is worth labeling.
 */
const MIN_INBOUND_FOR_PREFERENCE = 3

/**
 * Share-of-inbound threshold for declaring a preference. 0.7 reads as
 * "the patient used this channel at least 70% of the time" — a real
 * majority, but reachable without requiring perfect consistency.
 * 90%+ is rare in practice once threads accumulate any drift; 70% is
 * the standard UX threshold for "this is the one they prefer."
 */
const PREFERENCE_SHARE_THRESHOLD = 0.7

export function detectPreferredChannel(messages: MessageLite[]): ChannelPreference | null {
  const counts: Record<Channel, number> = { in_app: 0, email: 0, sms: 0 }
  let total = 0
  for (const m of messages) {
    if (m.direction !== 'inbound') continue
    counts[m.channel]++
    total++
  }
  if (total < MIN_INBOUND_FOR_PREFERENCE) return null

  let winner: Channel = 'in_app'
  let max = -1
  for (const ch of ['in_app', 'email', 'sms'] as Channel[]) {
    if (counts[ch] > max) {
      max = counts[ch]
      winner = ch
    }
  }
  const share = max / total
  if (share < PREFERENCE_SHARE_THRESHOLD) return null
  return { channel: winner, count: max, share, totalInbound: total }
}

export function pickDefaultReplyChannel(
  messages: MessageLite[],
  hasEmail: boolean,
): Channel {
  // First preference: historical majority. If the patient has texted
  // 4 of their last 5 inbounds, auto-default to SMS even when the
  // single most recent inbound happened to be email.
  const preferred = detectPreferredChannel(messages)
  if (preferred && isSendable(preferred.channel)) {
    return preferred.channel
  }
  if (preferred && preferred.channel === 'sms') {
    // Preference is SMS but we can't send SMS yet — fall through to
    // the last-inbound logic so we at least respect the channel the
    // patient most recently wrote in on.
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.direction === 'inbound') {
      if (m.channel === 'sms') return hasEmail ? 'email' : 'in_app'
      return m.channel
    }
  }
  return 'in_app'
}

/**
 * Which channels we can currently SEND on. SMS lives in a separate
 * Phase B and `sendMessageToPatient` throws on `'sms'`; until that
 * lands, treating SMS as non-sendable keeps the picker honest and the
 * fallback below routes around it.
 */
function isSendable(channel: Channel): boolean {
  return channel === 'in_app' || channel === 'email'
}
