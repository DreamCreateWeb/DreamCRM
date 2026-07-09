import { clinicDayKey } from '@/lib/format-datetime'

/**
 * Shared presentation helpers for the Sales Pipeline surface — one visual
 * language across the board, the demos page, and the communications feed.
 * Pure + client-safe (Intl only, no server-only imports).
 */

/** Two-letter monogram from a clinic name (skips filler words). */
export function prospectInitials(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['the', 'of', 'and', 'a'].includes(w.toLowerCase()))
  if (words.length === 0) return name.slice(0, 2).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function dayOrdinal(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/**
 * A demo time humanized relative to the host's today, in the host timezone:
 * "Today · 2:00 PM", "Tomorrow · 2:00 PM", a weekday within the coming week
 * ("Wed · 2:00 PM"), "Yesterday · …", else an absolute "Jul 17 · 10:30 AM".
 * Day math runs on host-tz calendar keys so a late-evening Central demo isn't
 * already "tomorrow" in UTC.
 */
export function relativeDayTime(d: Date, timeZone: string, now: Date = new Date()): string {
  const diff = dayOrdinal(clinicDayKey(d, timeZone)) - dayOrdinal(clinicDayKey(now, timeZone))
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(d)
  let prefix: string
  if (diff === 0) prefix = 'Today'
  else if (diff === 1) prefix = 'Tomorrow'
  else if (diff === -1) prefix = 'Yesterday'
  else if (diff > 1 && diff <= 6)
    prefix = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d)
  else prefix = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(d)
  return `${prefix} · ${time}`
}
