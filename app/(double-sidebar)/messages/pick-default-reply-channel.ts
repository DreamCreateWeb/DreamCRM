/**
 * Pick the default reply channel for the composer based on where the
 * patient last wrote in from.
 *
 * Rule: walk the message history backward and use the channel of the
 * most recent INBOUND message. That's where the patient initiated, so
 * the reply should land on the same surface by default (don't make
 * staff drag the picker every thread).
 *
 * SMS edge case: until Phase B lands, the SMS option in the picker is
 * disabled (sendMessageToPatient rejects 'sms' with a clear error). If
 * we auto-selected SMS we'd land staff on a disabled option, so when
 * the last inbound was SMS we fall back to a sendable channel — email
 * if an address is on file, otherwise in-app.
 *
 * No-inbound case: a thread with only outbound messages (proactive
 * reminder / booking confirmation / first ping) keeps the prior default
 * of in-app, since we can't infer patient preference yet.
 */

type Channel = 'in_app' | 'email' | 'sms'

interface MessageLite {
  direction: 'inbound' | 'outbound'
  channel: Channel
}

export function pickDefaultReplyChannel(
  messages: MessageLite[],
  hasEmail: boolean,
): Channel {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.direction === 'inbound') {
      if (m.channel === 'sms') return hasEmail ? 'email' : 'in_app'
      return m.channel
    }
  }
  return 'in_app'
}
