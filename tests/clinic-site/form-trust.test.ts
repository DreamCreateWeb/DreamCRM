/**
 * Form-trust spam filter — `looksLikeBot` powers the silent honeypot + time-trap
 * drop on every public form (contact, insurance, booking, careers, review,
 * membership). A bot hit returns `true` (caller silently no-ops with a success
 * shape); a plausible human returns `false`.
 */
import { describe, it, expect } from 'vitest'
import {
  looksLikeBot,
  HONEYPOT_FIELD,
  TIMETRAP_FIELD,
  MIN_ELAPSED_MS,
} from '@/lib/form-trust'

// A fixed "now" so the time-trap math is deterministic.
const NOW = 1_700_000_000_000

function fd(entries: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.set(k, v)
  return f
}

describe('looksLikeBot', () => {
  it('flags a filled honeypot (FormData)', () => {
    expect(looksLikeBot(fd({ [HONEYPOT_FIELD]: 'http://spam.example' }), NOW)).toBe(true)
  })

  it('flags a filled honeypot (plain object)', () => {
    expect(looksLikeBot({ [HONEYPOT_FIELD]: 'anything' }, NOW)).toBe(true)
  })

  it('ignores a whitespace-only honeypot (treats as empty)', () => {
    expect(looksLikeBot(fd({ [HONEYPOT_FIELD]: '   ', [TIMETRAP_FIELD]: String(NOW - MIN_ELAPSED_MS - 1000) }), NOW)).toBe(false)
  })

  it('flags an instant submit (faster than MIN_ELAPSED_MS)', () => {
    const justNow = String(NOW - 100)
    expect(looksLikeBot(fd({ [TIMETRAP_FIELD]: justNow }), NOW)).toBe(true)
  })

  it('allows a plausible human submit (a few seconds after mount)', () => {
    const fiveSecAgo = String(NOW - 5000)
    expect(looksLikeBot(fd({ [TIMETRAP_FIELD]: fiveSecAgo }), NOW)).toBe(false)
  })

  it('flags a future-dated timestamp (tampered/replayed)', () => {
    const future = String(NOW + 10_000)
    expect(looksLikeBot(fd({ [TIMETRAP_FIELD]: future }), NOW)).toBe(true)
  })

  it('flags a stale timestamp older than 24h', () => {
    const old = String(NOW - 25 * 60 * 60 * 1000)
    expect(looksLikeBot(fd({ [TIMETRAP_FIELD]: old }), NOW)).toBe(true)
  })

  it('treats a MISSING time-trap as human (forms predating the field / JS off)', () => {
    expect(looksLikeBot(fd({}), NOW)).toBe(false)
    expect(looksLikeBot(fd({ name: 'Jane' }), NOW)).toBe(false)
  })

  it('treats a non-numeric / empty time-trap as human (honeypot still covers bots)', () => {
    expect(looksLikeBot(fd({ [TIMETRAP_FIELD]: '' }), NOW)).toBe(false)
    expect(looksLikeBot(fd({ [TIMETRAP_FIELD]: 'abc' }), NOW)).toBe(false)
  })

  it('honeypot wins even with a valid human-looking timestamp', () => {
    expect(
      looksLikeBot(fd({ [HONEYPOT_FIELD]: 'x', [TIMETRAP_FIELD]: String(NOW - 5000) }), NOW),
    ).toBe(true)
  })
})
