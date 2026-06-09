/**
 * Client-safe formatting helpers for the patient portal. All appointment
 * times render in the CLINIC's timezone (visits happen at the clinic — and
 * this matches the times in confirmation/reminder emails), never the
 * server's UTC clock.
 */

export function fmtVisitDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

export function fmtVisitDayShort(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

export function fmtVisitTime(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

/** "Friday, June 12 · 9:30 AM" */
export function fmtVisitDayTime(d: Date, timeZone: string): string {
  return `${fmtVisitDay(d, timeZone)} · ${fmtVisitTime(d, timeZone)}`
}

/** Calendar-day distance label: "Today" / "Tomorrow" / "In 5 days" / null (past or far). */
export function visitProximityLabel(d: Date, timeZone: string, now: Date = new Date()): string | null {
  const dayKey = (x: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x)
  const target = dayKey(d)
  const today = dayKey(now)
  if (target === today) return 'Today'
  // Compare by UTC-noon day arithmetic on the formatted keys (DST-safe).
  const toUtcNoon = (key: string) => Date.parse(`${key}T12:00:00Z`)
  const diffDays = Math.round((toUtcNoon(target) - toUtcNoon(today)) / 86_400_000)
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > 1 && diffDays <= 14) return `In ${diffDays} days`
  return null
}

export function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)
}

/** Warm, time-of-day greeting (in the clinic's zone). */
export function greetingFor(firstName: string | null, timeZone: string, now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now),
  )
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return firstName ? `${part}, ${firstName}` : part
}
