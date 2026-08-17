import { describe, it, expect } from 'vitest'
import { shouldShowComingSoon } from '@/lib/clinic-site-helpers'

/**
 * THE GO-LIVE GATE rule (onboarding overhaul). One rule, one home — the
 * site layout calls it for every public page. These tests pin the three
 * exemptions and the default.
 */
describe('shouldShowComingSoon', () => {
  it('gates a visitor on a not-live site', () => {
    expect(shouldShowComingSoon({ siteLiveAt: null, canEdit: false, isFrame: false })).toBe(true)
    expect(
      shouldShowComingSoon({ siteLiveAt: undefined, canEdit: false, isFrame: false }),
    ).toBe(true)
  })

  it('never gates a live site', () => {
    expect(
      shouldShowComingSoon({ siteLiveAt: new Date(), canEdit: false, isFrame: false }),
    ).toBe(false)
    expect(
      shouldShowComingSoon({ siteLiveAt: '2026-08-07T00:00:00Z', canEdit: false, isFrame: false }),
    ).toBe(false)
  })

  it('editors always see the real site (how they inspect before the pull)', () => {
    expect(shouldShowComingSoon({ siteLiveAt: null, canEdit: true, isFrame: false })).toBe(false)
  })

  it('gallery/template frames render the real site (editor-only surfaces)', () => {
    expect(shouldShowComingSoon({ siteLiveAt: null, canEdit: false, isFrame: true })).toBe(false)
  })
})

describe('the kill (owner ruling: an expired trial gates the site for EVERYONE)', () => {
  it('shutDown gates a live site, an editor, and a frame alike', () => {
    const live = new Date('2026-08-01')
    expect(shouldShowComingSoon({ siteLiveAt: live, canEdit: false, isFrame: false, shutDown: true })).toBe(true)
    expect(shouldShowComingSoon({ siteLiveAt: live, canEdit: true, isFrame: false, shutDown: true })).toBe(true)
    expect(shouldShowComingSoon({ siteLiveAt: live, canEdit: false, isFrame: true, shutDown: true })).toBe(true)
  })

  it('shutDown false/absent changes nothing about the go-live rules', () => {
    expect(shouldShowComingSoon({ siteLiveAt: new Date(), canEdit: false, isFrame: false, shutDown: false })).toBe(false)
    expect(shouldShowComingSoon({ siteLiveAt: null, canEdit: false, isFrame: false })).toBe(true)
  })
})

describe('access routes — the doors are not the marketing site', () => {
  it('the portal sign-in / intake gate stay open before the site goes live', () => {
    // A practice can be fully operating (patients synced, portal in use) before
    // it publishes a marketing site. The link/QR it hands patients must work.
    expect(
      shouldShowComingSoon({ siteLiveAt: null, canEdit: false, isFrame: false, isAccessRoute: true }),
    ).toBe(false)
  })

  it('but an expired trial STILL closes them — the kill outranks the exemption', () => {
    expect(
      shouldShowComingSoon({
        siteLiveAt: null,
        canEdit: false,
        isFrame: false,
        shutDown: true,
        isAccessRoute: true,
      }),
    ).toBe(true)
  })

  it('marketing pages are unaffected — they still gate until go-live', () => {
    expect(
      shouldShowComingSoon({ siteLiveAt: null, canEdit: false, isFrame: false, isAccessRoute: false }),
    ).toBe(true)
  })
})
