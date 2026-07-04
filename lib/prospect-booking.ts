// Pure demo-booking helpers — availability generation and the add-to-calendar
// link. No server-only deps (the slot grid is the same math on server + in the
// picker), so the whole surface is unit-testable.

import { clinicDayStart } from '@/lib/clinic-timezone'

export interface DemoSlotConfig {
  hostTimeZone: string
  days: number
  startHour: number
  endHour: number
  slotMinutes: number
  leadHours: number
  durationMin: number
}

const MS_PER_MIN = 60_000

/** Short weekday token ('Sun'…'Sat') for an instant, in a timezone. */
function weekdayInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant)
}

/**
 * Generate bookable demo slots as absolute instants: weekday business hours in
 * the host's timezone, `days` out, at `slotMinutes` cadence, excluding any
 * slot sooner than `leadHours` from now or already booked. DST-correct — each
 * day's wall-clock hours are anchored to that day's local midnight
 * (clinicDayStart), so 9:00 AM stays 9:00 AM across a time change.
 */
export function generateDemoSlots(now: Date, cfg: DemoSlotConfig, booked: Date[] = []): Date[] {
  const earliest = now.getTime() + cfg.leadHours * 60 * MS_PER_MIN
  const bookedMs = new Set(booked.map((b) => b.getTime()))
  const out: Date[] = []

  for (let dayOffset = 0; dayOffset < cfg.days; dayOffset++) {
    const midnight = clinicDayStart(now, cfg.hostTimeZone, dayOffset)
    // Weekday at local noon (avoids any midnight-DST edge).
    const wd = weekdayInZone(new Date(midnight.getTime() + 12 * 60 * MS_PER_MIN), cfg.hostTimeZone)
    if (wd === 'Sat' || wd === 'Sun') continue

    const lastStart = cfg.endHour * 60 - cfg.durationMin // last slot must fit before close
    for (let mins = cfg.startHour * 60; mins <= lastStart; mins += cfg.slotMinutes) {
      const slot = new Date(midnight.getTime() + mins * MS_PER_MIN)
      if (slot.getTime() < earliest) continue
      if (bookedMs.has(slot.getTime())) continue
      out.push(slot)
    }
  }
  return out
}

/** Is `slot` a currently-offered, unbooked time? (server-side booking guard). */
export function isSlotAvailable(slot: Date, now: Date, cfg: DemoSlotConfig, booked: Date[] = []): boolean {
  const target = slot.getTime()
  return generateDemoSlots(now, cfg, booked).some((s) => s.getTime() === target)
}

/** YYYYMMDDTHHMMSSZ (UTC basic format) for calendar links. */
function toCalStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * A universal "add to calendar" link (Google Calendar template URL — opens in
 * any Google account and carries all the details; works without OAuth). The
 * confirmation email links this so both sides get it on their calendar.
 */
export function googleCalendarLink(input: {
  title: string
  start: Date
  durationMin: number
  details?: string
  location?: string
}): string {
  const end = new Date(input.start.getTime() + input.durationMin * MS_PER_MIN)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${toCalStamp(input.start)}/${toCalStamp(end)}`,
  })
  if (input.details) params.set('details', input.details)
  if (input.location) params.set('location', input.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Group slots by their host-local calendar day for the picker. */
export function groupSlotsByDay(
  slots: Date[],
  timeZone: string,
): Array<{ dayKey: string; label: string; slots: Date[] }> {
  const fmtKey = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const fmtLabel = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
  const map = new Map<string, { label: string; slots: Date[] }>()
  for (const s of slots) {
    const key = fmtKey.format(s)
    if (!map.has(key)) map.set(key, { label: fmtLabel.format(s), slots: [] })
    map.get(key)!.slots.push(s)
  }
  return Array.from(map.entries()).map(([dayKey, v]) => ({ dayKey, ...v }))
}
