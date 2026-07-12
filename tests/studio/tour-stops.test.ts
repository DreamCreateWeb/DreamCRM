import { describe, it, expect } from 'vitest'
import { tourStops } from '@/app/(default)/website/editor/website-studio'

/**
 * The Follow-along tour reduces the AI's edit list to the ordered, de-duplicated
 * set of canvas stops it visits. A single (or zero) stop means a single jump,
 * never the multi-step tour (which is what fights a manual save). These pure
 * cases pin that reduction so the tour/single-jump branch can't drift.
 */
describe('tourStops', () => {
  it('drops edits with no anchor (nothing to flash)', () => {
    const stops = tourStops([
      { anchor: null, page: '/' }, // e.g. a phone-number change
      { anchor: 'stats', page: '/' },
    ])
    expect(stops).toEqual([{ anchor: 'stats', page: '/' }])
  })

  it('de-dupes repeated (page, anchor) keeping first occurrence order', () => {
    const stops = tourStops([
      { anchor: 'stats', page: '/' },
      { anchor: 'faq', page: '/faq' },
      { anchor: 'stats', page: '/' }, // duplicate — dropped
    ])
    expect(stops).toEqual([
      { anchor: 'stats', page: '/' },
      { anchor: 'faq', page: '/faq' },
    ])
  })

  it('keeps the same anchor on different pages as distinct stops', () => {
    const stops = tourStops([
      { anchor: 'copy:x', page: '/' },
      { anchor: 'copy:x', page: '/about' },
    ])
    expect(stops).toHaveLength(2)
  })

  it('returns ≤1 stop for an empty edit list (single-jump / undo path)', () => {
    expect(tourStops([])).toEqual([])
    expect(tourStops([{ anchor: null, page: '/' }])).toEqual([])
    expect(tourStops([{ anchor: 'tagline', page: '/' }])).toHaveLength(1)
  })
})
