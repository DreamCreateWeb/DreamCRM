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

// ── 4. Activity markers interleaved with messages ───────────────────────
//
// The thread's automation context (reminders, campaigns, bookings…) rides
// BETWEEN message groups as thin gray lines. The law lives in the service
// (markers never touch unread/ordering); here we only merge chronology:
// messages keep their sender grouping, and runs of consecutive markers
// collapse into ONE activity item so an automation-heavy stretch renders
// as a compact block the UI can fold, not a wall of gray.

/** Serialized activity marker (dates as ISO — this module is client-safe). */
export interface ActivityMarkerLite {
  id: string
  /** ISO timestamp string. */
  occurredAt: string
  icon: string
  label: string
  detail: string | null
  href: string | null
}

/**
 * Trim deep pre-conversation history: markers are context for the
 * CONVERSATION, and a decade-long patient would otherwise open with a wall
 * of gray marker-days before the first human message (that full history
 * belongs to the patient page timeline). Keeps every marker from
 * `preWindowDays` before the first message onward — everything between and
 * after messages always survives. With no messages at all, keeps the last
 * `noConversationDays` so a fresh thread still shows recent touches.
 */
export function trimPreConversationMarkers<K extends { occurredAt: string }>(
  markers: K[],
  firstMessageAtIso: string | null,
  opts: { preWindowDays?: number; noConversationDays?: number; now?: Date } = {},
): K[] {
  const { preWindowDays = 14, noConversationDays = 30, now = new Date() } = opts
  const cutoff = firstMessageAtIso
    ? new Date(firstMessageAtIso).getTime() - preWindowDays * 86_400_000
    : now.getTime() - noConversationDays * 86_400_000
  return markers.filter((m) => new Date(m.occurredAt).getTime() >= cutoff)
}

export type ThreadDayItem<M extends GroupableMessage> =
  | { type: 'messages'; group: MessageGroup<M> }
  | { type: 'activity'; key: string; markers: ActivityMarkerLite[] }

export interface ThreadDayGroup<M extends GroupableMessage> {
  dayKey: string
  label: string
  items: ThreadDayItem<M>[]
}

/**
 * Merge chronological messages + activity markers into day buckets of
 * interleaved items. Both inputs must already be sorted oldest→newest.
 * Message grouping matches groupMessagesByDay exactly; an activity run
 * breaks a message group the same way a channel switch does.
 */
export function groupThreadByDay<M extends GroupableMessage>(
  messages: M[],
  markers: ActivityMarkerLite[],
  now: Date = new Date(),
): ThreadDayGroup<M>[] {
  type Entry = { at: number; msg?: M; marker?: ActivityMarkerLite }
  const entries: Entry[] = [
    ...messages.map((m) => ({ at: new Date(m.sentAt).getTime(), msg: m })),
    ...markers.map((k) => ({ at: new Date(k.occurredAt).getTime(), marker: k })),
  ].sort((a, b) => a.at - b.at)

  const days: ThreadDayGroup<M>[] = []
  for (const e of entries) {
    const when = new Date(e.at)
    const dayKey = localDayKey(when)
    let day = days[days.length - 1]
    if (!day || day.dayKey !== dayKey) {
      day = { dayKey, label: daySeparatorLabel(when, now), items: [] }
      days.push(day)
    }
    const lastItem = day.items[day.items.length - 1]

    if (e.marker) {
      if (lastItem?.type === 'activity') {
        lastItem.markers.push(e.marker)
      } else {
        day.items.push({ type: 'activity', key: e.marker.id, markers: [e.marker] })
      }
      continue
    }

    const m = e.msg as M
    const lastGroup = lastItem?.type === 'messages' ? lastItem.group : null
    const lastMsg = lastGroup?.messages[lastGroup.messages.length - 1]
    if (lastGroup && lastMsg && sameGroup(lastMsg, m)) {
      lastGroup.messages.push(m)
    } else {
      day.items.push({
        type: 'messages',
        group: {
          key: m.id,
          direction: m.direction,
          channel: m.channel,
          senderName: m.direction === 'outbound' ? (m.sentByUserName ?? null) : null,
          messages: [m],
        },
      })
    }
  }
  return days
}
