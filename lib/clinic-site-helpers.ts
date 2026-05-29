// Shared helpers for the clinic public-site surfaces (homepage, /about,
// /services, /faq). Pure formatting / string utilities — no DB calls, safe to
// import from both server components and client-renderable demos.

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export const DAY_LABEL: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

export interface HourEntry { open?: string; close?: string; closed?: boolean }
export type HoursMap = Record<string, HourEntry>

export function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/** First sentence of a longer about paragraph — used as the hero subhead so
 *  the H1 stays a clean value-prop statement and the warm context lives one
 *  beat below it. Falls back to the whole string when no terminator is
 *  found. */
export function firstSentence(text: string): string {
  const m = text.trim().match(/^[\s\S]+?[.!?](?=\s|$)/)
  return m ? m[0] : text.trim()
}

/** "Open today · 8:00 AM – 5:00 PM" or "Closed today" — the footer's
 *  at-a-glance availability blurb. */
export function todaysHoursLabel(
  hours: Record<string, { open?: string; close?: string; closed?: boolean }>,
): string {
  const KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const todayKey = KEY[new Date().getDay()]
  const entry = hours[todayKey]
  if (!entry || entry.closed) return 'Closed today'
  if (!entry.open || !entry.close) return 'Hours by appointment'
  return `Open today · ${fmt12(entry.open)} – ${fmt12(entry.close)}`
}

const HONORIFICS = new Set(['dr.', 'dr', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms'])
const POST_NOMINALS = /(,\s*)?(rdh|dds|dmd|md|np|rn|phd)\.?$/i

/** Initials chip for staff who haven't uploaded a photo yet. Strips common
 *  honorifics ("Dr. Jane Lee" → "JL", not "DJ") + post-nominals
 *  ("Maria Vega, RDH" → "MV", not "MR"). */
export function staffInitials(fullName: string): string {
  const cleaned = fullName.trim().replace(POST_NOMINALS, '').trim()
  const words = cleaned
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.has(w.toLowerCase()))
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}
