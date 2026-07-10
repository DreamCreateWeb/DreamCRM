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

// ── Best-time-to-call (prospect-local call windows) ─────────────────────────

export interface CallWindow {
  /** 0 = don't bother · 1 = iffy · 2 = fine · 3 = prime front-desk time. */
  score: 0 | 1 | 2 | 3
  /** Short human label for the dial card ("good time", "lunch there", …). */
  label: string
  /** score >= 2 — safe to lead the queue with. */
  good: boolean
}

/**
 * How callable a dental front desk is RIGHT NOW in the prospect's timezone.
 * Prime windows are mid-morning and mid-afternoon on weekdays; lunch, early,
 * late, and weekends are deprioritized (still callable — just not first).
 * Unknown timezone scores a neutral 2 so it never sinks a hot prospect.
 */
export function callWindowScore(timezone: string | null, now: Date = new Date()): CallWindow {
  if (!timezone) return { score: 2, label: '', good: true }
  let weekday: string
  let minutes: number
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    weekday = get('weekday')
    minutes = Number(get('hour')) * 60 + Number(get('minute'))
  } catch {
    return { score: 2, label: '', good: true }
  }
  if (weekday === 'Sat' || weekday === 'Sun') return { score: 0, label: 'weekend there', good: false }
  const t = (h: number, m = 0) => h * 60 + m
  if (minutes < t(8)) return { score: 0, label: 'too early there', good: false }
  if (minutes < t(9)) return { score: 1, label: 'just opening', good: false }
  if (minutes < t(12)) return { score: 3, label: 'good time to call', good: true }
  if (minutes < t(13, 30)) return { score: 1, label: 'lunch there', good: false }
  if (minutes < t(16, 30)) return { score: 3, label: 'good time to call', good: true }
  if (minutes < t(17, 30)) return { score: 2, label: 'late afternoon there', good: true }
  return { score: 0, label: 'closed there', good: false }
}
