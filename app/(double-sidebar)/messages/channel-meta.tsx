import type { MessageChannel } from '@/lib/services/patient-messaging'

/**
 * Channel presentation for the unified Patient Communications inbox.
 *
 * A channel is the *medium* a message travelled over (in-app · email · SMS),
 * NOT a status — so it deliberately does NOT use the semantic-tone palette.
 * (It used to borrow tones, which put amber="Email" on the same page as
 * amber="aging" — a two-meanings-of-amber collision.) Channels render as a
 * NEUTRAL chip distinguished by an icon, documented in the EncodingLegend's own
 * `channels` slot. The "color never carries meaning alone" rule is doubly
 * honoured: the hue is neutral and the `label` text + `title` always render.
 */
const NEUTRAL_PILL = 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300'

export interface ChannelMeta {
  /** Visible text label — load-bearing, satisfies the no-color-alone rule. */
  label: string
  /** A small icon that distinguishes the channel without relying on a tone. */
  icon: string
  /** Neutral pill recipe (≥ text-xs, dark-mode paired). */
  pill: string
  /** Hover explanation. */
  title: string
}

const META: Record<Exclude<MessageChannel, null>, ChannelMeta> = {
  in_app: { label: 'In-app', icon: '💬', pill: NEUTRAL_PILL, title: 'Sent through the patient portal' },
  email: { label: 'Email', icon: '✉️', pill: NEUTRAL_PILL, title: 'Sent by email' },
  sms: { label: 'SMS', icon: '📱', pill: NEUTRAL_PILL, title: 'Sent by text message' },
}

const NONE_META: ChannelMeta = {
  label: '—',
  icon: '·',
  pill: NEUTRAL_PILL,
  title: 'No messages yet',
}

export const CHANNEL_META = META

/** Channel meta with a safe fallback for the no-messages-yet case. */
export function channelMeta(channel: MessageChannel | null): ChannelMeta {
  return channel ? META[channel] : NONE_META
}

/** Rows for the EncodingLegend `channels` slot — documents each channel by icon. */
export const CHANNEL_LEGEND: Array<{ icon: string; label: string; meaning: string }> = [
  { icon: META.in_app.icon, label: 'In-app', meaning: 'Message sent through the patient portal' },
  { icon: META.email.icon, label: 'Email', meaning: 'Message sent by email' },
  { icon: META.sms.icon, label: 'SMS', meaning: 'Message sent by text (coming soon)' },
]
