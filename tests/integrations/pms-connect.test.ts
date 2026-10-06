import { describe, it, expect } from 'vitest'
import {
  BEST_TIMES,
  PMS_CONNECT_INTRO,
  PMS_VENDORS,
  describePmsConnectStatus,
  isPmsVendor,
  pmsConnectRequestMessage,
  pmsVendorLabel,
  validatePmsConnectRequest,
} from '@/lib/pms-connect'

/**
 * THE PMS CONNECT REQUEST's pure half (docs/ACTIVATION.md S4). Pins: the
 * validator trims, bounds and names what is missing; the vendor list
 * carries every system the bridge reaches plus "other"; the status copy
 * names the next step and who is on it, never "coming soon"; and the
 * support-thread line carries what the platform needs to act.
 */

describe('validatePmsConnectRequest', () => {
  it('accepts a complete request, trims, lowercases the email, and nulls blanks', () => {
    const r = validatePmsConnectRequest({
      vendor: 'open_dental',
      practiceNameInPms: '  All About Smiles PLLC ',
      contactName: ' Ada Reyes ',
      contactEmail: 'ADA@Example.com ',
      contactPhone: '',
      bestTime: 'morning',
      notes: '',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual({
      vendor: 'open_dental',
      vendorName: null,
      practiceNameInPms: 'All About Smiles PLLC',
      contactName: 'Ada Reyes',
      contactEmail: 'ada@example.com',
      contactPhone: null,
      bestTime: 'morning',
      notes: null,
    })
  })

  it('names every missing or wrong field at once', () => {
    const r = validatePmsConnectRequest({ vendor: 'windows', contactName: '', contactEmail: 'nope', bestTime: 'dawn' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.issues.map((i) => i.field).sort()).toEqual(['bestTime', 'contactEmail', 'contactName', 'vendor'])
  })

  it('"other" needs a name; a named vendor drops any stray vendorName', () => {
    const missing = validatePmsConnectRequest({ vendor: 'other', contactName: 'A', contactEmail: 'a@b.co' })
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.issues[0].field).toBe('vendorName')
    const named = validatePmsConnectRequest({ vendor: 'other', vendorName: 'Carestack', contactName: 'A', contactEmail: 'a@b.co' })
    expect(named.ok && named.value.vendorName).toBe('Carestack')
    const stray = validatePmsConnectRequest({ vendor: 'curve', vendorName: 'junk', contactName: 'A', contactEmail: 'a@b.co' })
    expect(stray.ok && stray.value.vendorName).toBeNull()
  })

  it('bounds every field (wire input is untrusted)', () => {
    const r = validatePmsConnectRequest({ vendor: 'dentrix', contactName: 'x'.repeat(500), contactEmail: 'a@b.co', notes: 'n'.repeat(5000) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.contactName.length).toBe(120)
    expect(r.value.notes!.length).toBe(1000)
  })
})

describe('the vendor list + labels', () => {
  it('carries every system the bridge reaches plus "other"', () => {
    const ids = PMS_VENDORS.map((v) => v.id)
    for (const id of ['open_dental', 'dentrix', 'dentrix_ascend', 'eaglesoft', 'curve', 'other']) expect(ids).toContain(id)
    expect(isPmsVendor('curve')).toBe(true)
    expect(isPmsVendor('nexhealth')).toBe(false)
    expect(BEST_TIMES.some((b) => b.id === 'any')).toBe(true)
  })

  it('pmsVendorLabel names the system, or the typed name for "other"', () => {
    expect(pmsVendorLabel('eaglesoft')).toBe('Eaglesoft')
    expect(pmsVendorLabel('other', 'Carestack')).toBe('Carestack')
    expect(pmsVendorLabel('other', '  ')).toBe('your practice software')
  })
})

describe('describePmsConnectStatus + the intro', () => {
  it('every status names the next step in the feature’s own words, never "coming soon"', () => {
    for (const status of ['requested', 'scheduled', 'connected', 'closed'] as const) {
      const d = describePmsConnectStatus(status, 'Open Dental')
      expect(d.pill).toBeTruthy()
      expect(d.sentence).toContain('Open Dental')
      expect(d.sentence.toLowerCase()).not.toContain('coming soon')
    }
    expect(describePmsConnectStatus('requested', 'Open Dental').sentence).toMatch(/hear from Dustin within a day/)
    expect(describePmsConnectStatus('requested', 'Open Dental').pill).toBe('We’re connecting it')
  })

  it('the intro has three lines it does, three to know, and one button', () => {
    expect(PMS_CONNECT_INTRO.does).toHaveLength(3)
    expect(PMS_CONNECT_INTRO.know).toHaveLength(3)
    expect(PMS_CONNECT_INTRO.button).toBe('Request the connection')
    for (const line of [PMS_CONNECT_INTRO.lede, ...PMS_CONNECT_INTRO.does, ...PMS_CONNECT_INTRO.know]) {
      expect(line.toLowerCase()).not.toContain('coming soon')
    }
  })
})

describe('pmsConnectRequestMessage', () => {
  it('carries the clinic, the system, the practice name, the contact and the best time', () => {
    const body = pmsConnectRequestMessage(
      { vendor: 'eaglesoft', practiceNameInPms: 'Smiles PC', contactName: 'Ada', contactEmail: 'ada@example.com', contactPhone: '555-0100', bestTime: 'afternoon', notes: 'IT is Bob.' },
      'All About Smiles',
    )
    expect(body).toContain('PMS connect request from All About Smiles: Eaglesoft.')
    expect(body).toContain('Practice name in Eaglesoft: Smiles PC.')
    expect(body).toContain('Contact: Ada · ada@example.com · 555-0100.')
    expect(body).toContain('Best time: Afternoons.')
    expect(body).toContain('Notes: IT is Bob.')
  })
})
