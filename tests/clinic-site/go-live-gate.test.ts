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
