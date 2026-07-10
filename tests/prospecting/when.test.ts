import { describe, it, expect } from 'vitest'
import { prospectInitials, relativeDayTime, callWindowScore } from '@/lib/prospect-when'

describe('prospectInitials', () => {
  it('takes first + last significant word', () => {
    expect(prospectInitials('Bright Smiles Dental')).toBe('BD')
    expect(prospectInitials('Lakeside Orthodontics')).toBe('LO')
  })
  it('skips filler words', () => {
    expect(prospectInitials('The Art of Dentistry')).toBe('AD')
  })
  it('handles a single word', () => {
    expect(prospectInitials('Dentalworks')).toBe('DE')
  })
  it('falls back gracefully on punctuation-only names', () => {
    expect(prospectInitials('!!!')).toBe('!!')
  })
})

describe('relativeDayTime', () => {
  const tz = 'America/Chicago'
  // A fixed "now" at 9:00 AM Central on Wed 2026-07-08.
  const now = new Date('2026-07-08T14:00:00Z')

  it('labels same-day as Today', () => {
    const d = new Date('2026-07-08T19:00:00Z') // 2:00 PM Central, same day
    expect(relativeDayTime(d, tz, now)).toBe('Today · 2:00 PM')
  })
  it('labels next day as Tomorrow', () => {
    const d = new Date('2026-07-09T19:00:00Z')
    expect(relativeDayTime(d, tz, now)).toBe('Tomorrow · 2:00 PM')
  })
  it('labels the prior day as Yesterday', () => {
    const d = new Date('2026-07-07T18:30:00Z') // 1:30 PM Central
    expect(relativeDayTime(d, tz, now)).toBe('Yesterday · 1:30 PM')
  })
  it('labels a day within the coming week by weekday', () => {
    const d = new Date('2026-07-11T15:00:00Z') // Sat 10:00 AM Central
    expect(relativeDayTime(d, tz, now)).toBe('Sat · 10:00 AM')
  })
  it('labels a far date absolutely', () => {
    const d = new Date('2026-07-20T15:30:00Z') // 10:30 AM Central
    expect(relativeDayTime(d, tz, now)).toBe('Jul 20 · 10:30 AM')
  })
  it('uses host-tz calendar day, not UTC (late-evening Central)', () => {
    // 8:00 PM Central on the 8th is 01:00 UTC on the 9th — still "Today".
    const d = new Date('2026-07-09T01:00:00Z')
    expect(relativeDayTime(d, tz, now)).toBe('Today · 8:00 PM')
  })
})

describe('callWindowScore', () => {
  const tz = 'America/Chicago'
  // Wed 2026-07-08 in Central; build instants from UTC.
  const at = (utcHour: number, utcMin = 0) =>
    new Date(Date.UTC(2026, 6, 8, utcHour, utcMin)) // Central = UTC-5 (CDT)

  it('scores prime mid-morning as 3', () => {
    const w = callWindowScore(tz, at(15)) // 10:00 AM Central
    expect(w.score).toBe(3)
    expect(w.good).toBe(true)
  })
  it('flags lunch', () => {
    const w = callWindowScore(tz, at(17, 30)) // 12:30 PM Central
    expect(w.score).toBe(1)
    expect(w.label).toBe('lunch there')
  })
  it('scores mid-afternoon as 3', () => {
    const w = callWindowScore(tz, at(19)) // 2:00 PM Central
    expect(w.score).toBe(3)
  })
  it('zeroes evenings and early mornings', () => {
    expect(callWindowScore(tz, at(23, 30)).score).toBe(0) // 6:30 PM Central
    expect(callWindowScore(tz, at(11)).score).toBe(0) // 6:00 AM Central
  })
  it('zeroes weekends', () => {
    const sat = new Date(Date.UTC(2026, 6, 11, 15)) // Sat 10 AM Central
    const w = callWindowScore(tz, sat)
    expect(w.score).toBe(0)
    expect(w.label).toBe('weekend there')
  })
  it('unknown timezone stays neutral-good so it never sinks a hot prospect', () => {
    const w = callWindowScore(null, at(15))
    expect(w.score).toBe(2)
    expect(w.good).toBe(true)
    expect(w.label).toBe('')
  })
})
