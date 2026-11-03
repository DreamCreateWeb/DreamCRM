/**
 * "Waiting" conversations — open threads whose LAST word is the patient's,
 * older than N hours. Pure, so the My Day cockpit, the patient-reply
 * generator, the Overview count and the digest can all ask the SAME question
 * instead of each re-deriving it (ML-10 / G1-5).
 */

export interface WaitingThreadLike {
  status: string
  lastMessageDirection: 'inbound' | 'outbound' | string | null
  lastMessageAt: Date | null
  unreadCount?: number
}

/** Is the ball in OUR court on this thread, and has it sat at least `olderThanHours`? */
export function isWaitingThread(t: WaitingThreadLike, now: Date, olderThanHours = 0): boolean {
  if (t.status !== 'open') return false
  if (t.lastMessageDirection !== 'inbound') return false
  if (!t.lastMessageAt) return false
  return now.getTime() - t.lastMessageAt.getTime() >= olderThanHours * 3_600_000
}

export function filterWaitingThreads<T extends WaitingThreadLike>(
  threads: T[],
  now: Date,
  olderThanHours = 0,
): T[] {
  return threads.filter((t) => isWaitingThread(t, now, olderThanHours))
}

/** Newest first (a thread with no timestamp sinks). */
export function newestFirst<T extends { lastMessageAt: Date | null }>(threads: T[]): T[] {
  return [...threads].sort(
    (a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0),
  )
}

export const MY_DAY_CONVERSATION_CAP = 8

/**
 * Mine (as given), then the unclaimed-unread ones nobody has picked up. The
 * two sets are disjoint by construction (assigned to me vs unassigned); the
 * id guard is belt and braces. Unclaimed come newest-unread first; capped.
 */
export function mergeMineAndUnclaimed<T extends { id: string; lastMessageAt: Date | null }>(
  mine: T[],
  unclaimed: T[],
  cap = MY_DAY_CONVERSATION_CAP,
): Array<T & { unclaimed: boolean }> {
  const seen = new Set(mine.map((t) => t.id))
  const extra = newestFirst(unclaimed.filter((t) => !seen.has(t.id)))
  return [
    ...mine.map((t) => ({ ...t, unclaimed: false })),
    ...extra.map((t) => ({ ...t, unclaimed: true })),
  ].slice(0, cap)
}
