import { describe, it, expect } from 'vitest'
import {
  resolvePortalSettings,
  DEFAULT_PORTAL_SETTINGS,
  PORTAL_BOOKABLE_TYPES,
  externalPortalUrl,
  sanitizeExternalPortalUrl,
  EXTERNAL_PORTAL_URL_MAX_LEN,
} from '@/lib/types/portal'

/**
 * resolvePortalSettings is the single read path between the stored jsonb
 * and every portal page — partial/legacy/junk values must always resolve
 * to a complete, safe PortalSettings.
 */

describe('resolvePortalSettings', () => {
  it('returns full defaults for null/undefined/non-object', () => {
    for (const v of [null, undefined, 'junk', 42, []]) {
      const s = resolvePortalSettings(v)
      expect(s).toEqual(DEFAULT_PORTAL_SETTINGS)
    }
  })

  it('defaults: payments OFF, core features ON', () => {
    const s = resolvePortalSettings(null)
    expect(s.features.payments).toBe(false)
    expect(s.features.booking).toBe(true)
    expect(s.features.reschedule).toBe(true)
    expect(s.features.messages).toBe(true)
    expect(s.features.billing).toBe(true)
    expect(s.features.records).toBe(true)
    expect(s.features.forms).toBe(true)
    expect(s.features.family).toBe(true)
  })

  it('defaults restrict online booking to hygiene/diagnostic types', () => {
    const s = resolvePortalSettings(null)
    expect(s.booking.allowedTypes).toEqual(['cleaning', 'checkup', 'consultation'])
    expect(s.booking.allowedTypes).not.toContain('root_canal')
  })

  it('merges a partial blob over defaults (new settings never need a backfill)', () => {
    const s = resolvePortalSettings({ features: { payments: true } })
    expect(s.features.payments).toBe(true)
    expect(s.features.booking).toBe(true) // untouched default
    expect(s.reschedule.minNoticeHours).toBe(24)
  })

  it('drops unknown feature keys and non-boolean values', () => {
    const s = resolvePortalSettings({
      features: { booking: 'yes', evilFlag: true, messages: false },
    })
    expect(s.features.booking).toBe(true) // 'yes' is not a boolean → default kept
    expect(s.features.messages).toBe(false)
    expect('evilFlag' in s.features).toBe(false)
  })

  it('filters allowedTypes to known appointment types and keeps at least the default on empty', () => {
    const s = resolvePortalSettings({
      booking: { allowedTypes: ['cleaning', 'teleportation', 'root_canal'] },
    })
    expect(s.booking.allowedTypes).toEqual(['cleaning', 'root_canal'])

    const empty = resolvePortalSettings({ booking: { allowedTypes: ['nonsense'] } })
    expect(empty.booking.allowedTypes).toEqual(DEFAULT_PORTAL_SETTINGS.booking.allowedTypes)
  })

  it('every PORTAL_BOOKABLE_TYPES value round-trips through the resolver', () => {
    const all = PORTAL_BOOKABLE_TYPES.map((t) => t.value)
    const s = resolvePortalSettings({ booking: { allowedTypes: all } })
    expect(s.booking.allowedTypes).toEqual(all)
  })

  it('rejects negative / non-finite notice hours', () => {
    const s = resolvePortalSettings({
      booking: { minNoticeHours: -5 },
      reschedule: { minNoticeHours: Infinity },
    })
    expect(s.booking.minNoticeHours).toBe(DEFAULT_PORTAL_SETTINGS.booking.minNoticeHours)
    expect(s.reschedule.minNoticeHours).toBe(DEFAULT_PORTAL_SETTINGS.reschedule.minNoticeHours)
  })

  it('copy: empty strings collapse to null (hidden), real strings pass through', () => {
    const s = resolvePortalSettings({
      copy: { announcement: '   ', welcomeMessage: 'Hi there', aftercareNote: null },
    })
    expect(s.copy.announcement).toBeNull()
    expect(s.copy.welcomeMessage).toBe('Hi there')
    expect(s.copy.aftercareNote).toBeNull()
    expect(s.copy.welcomeHeadline).toBeNull()
  })

  it('display.showTeamPhotos accepts only booleans', () => {
    expect(resolvePortalSettings({ display: { showTeamPhotos: false } }).display.showTeamPhotos).toBe(false)
    expect(resolvePortalSettings({ display: { showTeamPhotos: 'nope' } }).display.showTeamPhotos).toBe(true)
  })

  it('waitlist + referrals flags default ON and resolve stored overrides', () => {
    const d = resolvePortalSettings(null)
    expect(d.features.waitlist).toBe(true)
    expect(d.features.referrals).toBe(true)
    const off = resolvePortalSettings({ features: { waitlist: false, referrals: false } })
    expect(off.features.waitlist).toBe(false)
    expect(off.features.referrals).toBe(false)
    // Junk never poisons the flags.
    const junk = resolvePortalSettings({ features: { waitlist: 'nah', referrals: 0 } })
    expect(junk.features.waitlist).toBe(true)
    expect(junk.features.referrals).toBe(true)
  })

  it('does not share mutable state with DEFAULT_PORTAL_SETTINGS', () => {
    const s = resolvePortalSettings(null)
    s.booking.allowedTypes.push('other')
    s.features.payments = true
    expect(DEFAULT_PORTAL_SETTINGS.booking.allowedTypes).toEqual(['cleaning', 'checkup', 'consultation'])
    expect(DEFAULT_PORTAL_SETTINGS.features.payments).toBe(false)
  })
})

/**
 * The sign-in destination — a clinic that keeps its PMS vendor's portal
 * (Modento, Weave…) points the public "Patient login" there. The law is
 * "never a dead link": 'external' only resolves when a usable URL exists.
 */
describe('resolvePortalSettings — login destination', () => {
  it('defaults to the DreamCRM portal with no external address', () => {
    const s = resolvePortalSettings(null)
    expect(s.login).toEqual({ destination: 'dreamcrm', externalUrl: null })
  })

  it('keeps an external destination when the URL is a real https address', () => {
    const s = resolvePortalSettings({
      login: { destination: 'external', externalUrl: ' https://portal.modento.io/acme-dental ' },
    })
    expect(s.login.destination).toBe('external')
    expect(s.login.externalUrl).toBe('https://portal.modento.io/acme-dental')
  })

  it('falls back to the DreamCRM portal when the external choice has no usable URL', () => {
    for (const bad of [null, '', 'portal.modento.io', 'javascript:alert(1)', 'mailto:x@y.com', 'https://localhost', 42]) {
      const s = resolvePortalSettings({ login: { destination: 'external', externalUrl: bad } })
      expect(s.login.destination, String(bad)).toBe('dreamcrm')
      expect(s.login.externalUrl, String(bad)).toBeNull()
    }
  })

  it('remembers a typed address while the DreamCRM portal is the door', () => {
    const s = resolvePortalSettings({ login: { destination: 'dreamcrm', externalUrl: 'https://portal.example.com' } })
    expect(s.login.destination).toBe('dreamcrm')
    expect(s.login.externalUrl).toBe('https://portal.example.com/')
  })

  it('drops an unknown destination', () => {
    const s = resolvePortalSettings({ login: { destination: 'somewhere', externalUrl: 'https://portal.example.com' } })
    expect(s.login.destination).toBe('dreamcrm')
  })
})

describe('externalPortalUrl (the raw-blob read the public site uses)', () => {
  it('returns the address only for a usable external choice', () => {
    expect(externalPortalUrl(null)).toBeNull()
    expect(externalPortalUrl({})).toBeNull()
    expect(externalPortalUrl({ login: { destination: 'dreamcrm', externalUrl: 'https://portal.example.com' } })).toBeNull()
    expect(externalPortalUrl({ login: { destination: 'external', externalUrl: 'not a url' } })).toBeNull()
    expect(externalPortalUrl({ login: { destination: 'external', externalUrl: 'https://portal.example.com/login' } })).toBe(
      'https://portal.example.com/login',
    )
  })

  it('caps the address length', () => {
    const long = 'https://portal.example.com/' + 'a'.repeat(EXTERNAL_PORTAL_URL_MAX_LEN)
    expect(sanitizeExternalPortalUrl(long)).toBeNull()
  })
})
