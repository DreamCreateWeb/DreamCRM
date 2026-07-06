import { describe, it, expect } from 'vitest'
import {
  resolvePortalSettings,
  DEFAULT_PORTAL_SETTINGS,
  PORTAL_BOOKABLE_TYPES,
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
