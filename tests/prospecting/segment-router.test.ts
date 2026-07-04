import { describe, it, expect } from 'vitest'

/**
 * Segment router — which pitch a prospect gets. No website → no_website;
 * bad website → weak_website; decent site → weak_presence.
 */

import { segmentForProspect } from '@/lib/prospect-segment'
import type { ProspectAiVerdict } from '@/lib/types/prospecting'

const verdict = (over: Partial<ProspectAiVerdict>): ProspectAiVerdict => ({
  hasWebsite: true,
  websiteQuality: 50,
  websiteReasons: [],
  socialPresence: 50,
  onlineBooking: true,
  weaknesses: [],
  summary: '',
  ...over,
})

describe('segmentForProspect', () => {
  it('null verdict or no website → no_website', () => {
    expect(segmentForProspect(null)).toBe('no_website')
    expect(segmentForProspect(verdict({ hasWebsite: false, websiteQuality: 0 }))).toBe('no_website')
  })

  it('quality below 40 → weak_website (boundary at 40)', () => {
    expect(segmentForProspect(verdict({ websiteQuality: 0 }))).toBe('weak_website')
    expect(segmentForProspect(verdict({ websiteQuality: 39 }))).toBe('weak_website')
    expect(segmentForProspect(verdict({ websiteQuality: 40 }))).toBe('weak_presence')
  })

  it('decent-or-better site → weak_presence', () => {
    expect(segmentForProspect(verdict({ websiteQuality: 55 }))).toBe('weak_presence')
    expect(segmentForProspect(verdict({ websiteQuality: 95 }))).toBe('weak_presence')
  })
})
