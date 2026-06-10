import type { MessageChannel } from '@/lib/services/patient-messaging'
import { TONE_PILL, type Tone } from '@/lib/ui/encodings'

/**
 * Channel presentation for the unified Patient Communications inbox.
 *
 * A channel is the *medium* a message travelled over (in-app · email · SMS),
 * not a status. We borrow the semantic-tone palette so the hues stay on-system
 * and the <EncodingLegend> can document them through its `pills` slot (same
 * tone → same swatch, so the key can't drift from the UI). The design-system
 * rule "color never carries meaning alone" is honoured by always rendering
 * `label` as text and passing `title` on the chip.
 */
export interface ChannelMeta {
  /** Visible text label — load-bearing, satisfies the no-color-alone rule. */
  label: string
  /** Borrowed semantic tone (drives the legend swatch + the chip hue). */
  tone: Tone
  /** Pill recipe (≥ text-xs, dark-mode paired). */
  pill: string
  /** Hover explanation. */
  title: string
}

const META: Record<Exclude<MessageChannel, null>, ChannelMeta> = {
  in_app: { label: 'In-app', tone: 'info', pill: TONE_PILL.info, title: 'Sent through the patient portal' },
  email: { label: 'Email', tone: 'warn', pill: TONE_PILL.warn, title: 'Sent by email' },
  sms: { label: 'SMS', tone: 'special', pill: TONE_PILL.special, title: 'Sent by text message' },
}

const NONE_META: ChannelMeta = {
  label: '—',
  tone: 'neutral',
  pill: TONE_PILL.neutral,
  title: 'No messages yet',
}

export const CHANNEL_META = META

/** Channel meta with a safe fallback for the no-messages-yet case. */
export function channelMeta(channel: MessageChannel | null): ChannelMeta {
  return channel ? META[channel] : NONE_META
}

/** Rows for the EncodingLegend `pills` slot — documents the channel hues. */
export const CHANNEL_LEGEND: Array<{ tone: Tone; label: string; meaning: string }> = [
  { tone: META.in_app.tone, label: 'In-app', meaning: 'Message sent through the patient portal' },
  { tone: META.email.tone, label: 'Email', meaning: 'Message sent by email' },
  { tone: META.sms.tone, label: 'SMS', meaning: 'Message sent by text (coming soon)' },
]
