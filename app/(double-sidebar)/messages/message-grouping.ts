/**
 * Pure presentation helpers for the clinic Patient-Communications surface
 * (the unified inbox thread list + detail panel). Kept dependency-free and
 * client-safe so both the RSC thread list and the client detail panel can
 * import them, and so the grouping logic is unit-testable in isolation.
 *
 * Three concerns live here:
 *   1. Avatars  — initials + a STABLE per-patient tint (Gmail/Linear style:
 *      the same name always lands on the same colour).
 *   2. Day separators — "Today" / "Yesterday" / "Thu, Jun 12" between date
 *      groups in the message stream.
 *   3. Message grouping — collapse runs of consecutive same-sender messages
 *      into one group so we render ONE avatar + sender label per group
 *      (iMessage/Front quality) instead of a loud label over every bubble.
 */

type Direction = 'inbound' | 'outbound'
type Channel = 'in_app' | 'email' | 'sms'

// ── 1. Avatars ──────────────────────────────────────────────────────────

const HONORIFICS = new Set([
  'dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss', 'prof', 'prof.',
])

/**
 * Up to two-letter initials from a first + last name. Strips a leading
 * honorific on the first name ("Dr. Jane" → "J", not "D") and falls back
 * gracefully: a single name yields one letter; nothing yields "?".
 */
export function messageInitials(first?: string | null, last?: string | null): string {
  const clean = (s?: string | null) =>
    (s ?? '')
      .trim()
      .split(/\s+/)
      .filter((w) => w && !HONORIFICS.has(w.toLowerCase()))
  const fw = clean(first)
  const lw = clean(last)
  const a = fw[0]?.[0] ?? lw[0]?.[0] ?? ''
  // Prefer the last name's first letter; if there's no last name, use a
  // second word of the first-name field ("Mary Jane" → "MJ").
  const b = lw[0]?.[0] ?? fw[1]?.[0] ?? ''
  const out = (a + b).toUpperCase()
  return out || '?'
}

/** Avatar tint = a paired bg + text class. On-system, dark-mode paired. */
export interface AvatarTint {
  bg: string
  text: string
}

/**
 * A curated ramp of calm, legible tints drawn from the v2 cool palette —
 * deliberately NOT teal (teal is identity/selection, never a per-row tag)
 * and NOT a semantic-tone hue used for status. Each is a soft fill + a
 * darker ink so initials stay ≥ contrast in both themes.
 */
const AVATAR_TINTS: AvatarTint[] = [
  { bg: 'bg-indigo-500/15 dark:bg-indigo-400/20', text: 'text-indigo-700 dark:text-indigo-200' },
  { bg: 'bg-sky-500/15 dark:bg-sky-400/20', text: 'text-sky-700 dark:text-sky-200' },
  { bg: 'bg-violet-500/15 dark:bg-violet-400/20', text: 'text-violet-700 dark:text-violet-200' },
  { bg: 'bg-fuchsia-500/15 dark:bg-fuchsia-400/20', text: 'text-fuchsia-700 dark:text-fuchsia-200' },
  { bg: 'bg-rose-500/15 dark:bg-rose-400/20', text: 'text-rose-700 dark:text-rose-200' },
  { bg: 'bg-amber-500/15 dark:bg-amber-400/20', text: 'text-amber-700 dark:text-amber-200' },
  { bg: 'bg-emerald-500/15 dark:bg-emerald-400/20', text: 'text-emerald-700 dark:text-emerald-200' },
  { bg: 'bg-cyan-500/15 dark:bg-cyan-400/20', text: 'text-cyan-700 dark:text-cyan-200' },
  { bg: 'bg-blue-500/15 dark:bg-blue-400/20', text: 'text-blue-700 dark:text-blue-200' },
  { bg: 'bg-purple-500/15 dark:bg-purple-400/20', text: 'text-purple-700 dark:text-purple-200' },
]

/** Deterministic 32-bit string hash (FNV-1a-ish) — stable across renders. */
function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Pick a stable tint for a patient from a seed (usually their id, falling
 * back to their name). The same seed always maps to the same colour, so a
 * patient is visually consistent everywhere they appear.
 */
export function avatarTint(seed: string): AvatarTint {
  return AVATAR_TINTS[hashSeed(seed || '?') % AVATAR_TINTS.length]
}

// ── 2. Day separators ───────────────────────────────────────────────────

/** YYYY-MM-DD in the viewer's local zone — the bucketing key for a day. */
function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Human label for a day separator: "Today" / "Yesterday" / otherwise a
 * short weekday + date ("Thu, Jun 12"), with the year appended only when
 * the message is from a different calendar year than `now`.
 */
export function daySeparatorLabel(date: Date, now: Date = new Date()): string {
  const key = localDayKey(date)
  if (key === localDayKey(now)) return 'Today'
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (key === localDayKey(y)) return 'Yesterday'
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// ── 3. Message grouping ─────────────────────────────────────────────────

/** The minimal message shape the grouping logic needs. */
export interface GroupableMessage {
  id: string
  direction: Direction
  channel: Channel
  /** ISO timestamp string. */
  sentAt: string
  sentByUserName?: string | null
}

export interface MessageGroup<M extends GroupableMessage> {
  /** Stable key for React — the first message's id. */
  key: string
  direction: Direction
  /** Channel of the group (the first message's channel). */
  channel: Channel
  /** Display name of the sender (clinic user name for outbound; null lets
   *  the renderer fall back to the patient name for inbound). */
  senderName: string | null
  messages: M[]
}

export interface MessageDayGroup<M extends GroupableMessage> {
  /** YYYY-MM-DD key, stable for React. */
  dayKey: string
  /** The separator label ("Today" / "Yesterday" / "Thu, Jun 12"). */
  label: string
  /** Consecutive-sender groups within this day, in order. */
  groups: MessageGroup<M>[]
}

/**
 * Two messages belong to the same group when they share a direction AND,
 * for outbound, the same staff sender. Inbound messages from the same
 * patient always group together (one patient per thread). A channel change
 * also breaks the group so the channel chip can mark the switch.
 */
function sameGroup(a: GroupableMessage, b: GroupableMessage): boolean {
  if (a.direction !== b.direction) return false
  if (a.channel !== b.channel) return false
  if (a.direction === 'outbound') {
    return (a.sentByUserName ?? null) === (b.sentByUserName ?? null)
  }
  return true
}

/**
 * Group a flat, chronological message list into day buckets, each holding
 * runs of consecutive same-sender (+ same-channel) messages. Assumes the
 * input is already sorted oldest→newest (as the service returns it); does
 * not re-sort.
 */
export function groupMessagesByDay<M extends GroupableMessage>(
  messages: M[],
  now: Date = new Date(),
): MessageDayGroup<M>[] {
  const days: MessageDayGroup<M>[] = []
  for (const m of messages) {
    const when = new Date(m.sentAt)
    const dayKey = localDayKey(when)
    let day = days[days.length - 1]
    if (!day || day.dayKey !== dayKey) {
      day = { dayKey, label: daySeparatorLabel(when, now), groups: [] }
      days.push(day)
    }
    const lastGroup = day.groups[day.groups.length - 1]
    const lastMsg = lastGroup?.messages[lastGroup.messages.length - 1]
    if (lastGroup && lastMsg && sameGroup(lastMsg, m)) {
      lastGroup.messages.push(m)
    } else {
      day.groups.push({
        key: m.id,
        direction: m.direction,
        channel: m.channel,
        senderName: m.direction === 'outbound' ? (m.sentByUserName ?? null) : null,
        messages: [m],
      })
    }
  }
  return days
}
