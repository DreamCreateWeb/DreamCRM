import { describe, it, expect } from 'vitest'
import {
  PMS_DOOR,
  balanceSourceCopy,
  pmsConnected,
  scheduleSourceCopy,
  todayCountLabel,
  type PmsLink,
} from '@/lib/pms-link'

/**
 * lib/pms-link.ts — the one answer to "is a PMS feeding this clinic?" that
 * the Overview, My Day, the agenda, the Payments hub and Collections ask
 * before stating a fact only the PMS knows (docs/ACTIVATION.md law 3). The
 * copy lives here so the five surfaces cannot disagree.
 */

const none: PmsLink = { kind: 'none' }
const connected: PmsLink = { kind: 'connected' }
const pending: PmsLink = {
  kind: 'pending',
  vendorLabel: 'Dentrix',
  pill: 'We’re connecting it',
  sentence: 'We have your request for Dentrix.',
}

describe('pmsConnected', () => {
  it('is true only for a bound connection — a pending request is not a PMS', () => {
    expect(pmsConnected(connected)).toBe(true)
    expect(pmsConnected(pending)).toBe(false)
    expect(pmsConnected(none)).toBe(false)
  })
})

describe('balanceSourceCopy — where "nothing owed" would otherwise stand', () => {
  it('is null once a PMS is connected: the all-clear is then earned', () => {
    expect(balanceSourceCopy(connected)).toBeNull()
  })
  it('with no PMS, names the source and opens the S4 front door', () => {
    const c = balanceSourceCopy(none)!
    expect(c.sub).toBe('needs your practice software')
    expect(c.body).toMatch(/Balances come from your practice software/)
    expect(c.cta).toBe('Connect it')
    expect(c.href).toBe(PMS_DOOR)
    expect(PMS_DOOR).toBe('/integrations/pms')
  })
  it('a pending request speaks in the request’s own words (law 3: honest while pending)', () => {
    const c = balanceSourceCopy(pending)!
    expect(c.sub).toBe('we’re connecting Dentrix')
    expect(c.body).toContain('We have your request for Dentrix.')
    expect(c.cta).toBe('See the request')
    expect(c.href).toBe(PMS_DOOR)
  })
  it('never says "paid up" in any no-PMS state', () => {
    for (const link of [none, pending]) {
      const c = balanceSourceCopy(link)!
      expect(`${c.sub} ${c.body}`).not.toMatch(/paid up/i)
    }
  })
})

describe('scheduleSourceCopy — where "nothing booked today" would otherwise stand', () => {
  it('is null once a PMS is connected: an empty day is then a real quiet morning', () => {
    expect(scheduleSourceCopy(connected)).toBeNull()
  })
  it('with no PMS, says only website bookings show and offers the connect door', () => {
    const c = scheduleSourceCopy(none)!
    expect(c.title).toBe('Only visits booked through your website show here.')
    expect(c.body).toMatch(/connect it or import a CSV/)
    expect(c.href).toBe(PMS_DOOR)
    expect(`${c.title} ${c.body}`).not.toMatch(/quiet morning/i)
  })
  it('a pending request names the vendor being connected', () => {
    const c = scheduleSourceCopy(pending)!
    expect(c.body).toMatch(/We’re connecting Dentrix/)
    expect(c.cta).toBe('See the request')
  })
})

describe('todayCountLabel', () => {
  it('counts "appointments" with a PMS and "booked online" without', () => {
    expect(todayCountLabel(connected, 1)).toBe('1 appointment')
    expect(todayCountLabel(connected, 4)).toBe('4 appointments')
    expect(todayCountLabel(none, 0)).toBe('0 booked online')
    expect(todayCountLabel(pending, 2)).toBe('2 booked online')
  })
})
