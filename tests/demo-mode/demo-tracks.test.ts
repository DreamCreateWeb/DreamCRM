import { describe, it, expect } from 'vitest'
import {
  DEMO_TRACKS,
  DEMO_TRACK_LIST,
  DEMO_TRACK_IDS,
  DEMO_BEATS,
  resolveTrack,
  suggestDemoTrack,
} from '@/lib/types/demo-script'
import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'

/**
 * Demo tracks — the interest-driven stories. Registry integrity (every
 * story is walkable and closes on a priced pitch) + the suggestion router
 * (lead with what their verified gaps say they care about).
 */

const NO_SOCIAL = {} as Record<string, string | undefined>

function verdict(over: Partial<ProspectAiVerdict> = {}): ProspectAiVerdict {
  return {
    hasWebsite: true,
    websiteQuality: 80,
    weaknesses: [],
    summary: '',
    ...over,
  } as ProspectAiVerdict
}

function signals(over: Partial<ProspectCrawlSignals> = {}): ProspectCrawlSignals {
  return {
    socialLinks: { ...NO_SOCIAL, facebook: 'https://fb.com/x', instagram: 'https://ig.com/x' },
    ...over,
  } as ProspectCrawlSignals
}

describe('track registry integrity', () => {
  it('every track is a walkable story that closes on a priced pitch', () => {
    expect(DEMO_TRACK_LIST.map((t) => t.id)).toEqual(DEMO_TRACK_IDS)
    for (const track of DEMO_TRACK_LIST) {
      expect(track.label.length).toBeGreaterThan(2)
      expect(track.story.length).toBeGreaterThan(10)
      expect(track.beats.length).toBeGreaterThanOrEqual(4)
      // The user's ask verbatim: every story ends on "And so much more".
      const last = track.beats[track.beats.length - 1]
      expect(last.id).toBe('more')
      expect(last.title).toBe('And so much more')
      expect(last.href).toBe('/integrations')
      // The close always lands on a price.
      expect(track.planPitch).toMatch(/\$\d+/)
      expect(last.talkTrack).toMatch(/\$\d+/)
      expect(['basic', 'pro', 'premium']).toContain(track.recommendedPlan)
      // Beats are unique within a track and every href is a dashboard path.
      const ids = track.beats.map((b) => b.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const beat of track.beats) {
        expect(beat.href.startsWith('/')).toBe(true)
        expect(beat.talkTrack.length).toBeGreaterThan(20)
      }
    }
  })

  it('gap ammunition still lands: shared beat ids appear across tracks', () => {
    // demo-gaps.ts maps weaknesses onto these ids; each track must carry the
    // ones its story covers so ⚠ callouts show up outside the full tour.
    expect(DEMO_TRACKS.website.beats.some((b) => b.id === 'website')).toBe(true)
    expect(DEMO_TRACKS.website.beats.some((b) => b.id === 'appointments')).toBe(true)
    expect(DEMO_TRACKS.presence.beats.some((b) => b.id === 'reviews')).toBe(true)
    expect(DEMO_TRACKS.social.beats.some((b) => b.id === 'reviews')).toBe(true)
    expect(DEMO_TRACKS.frontdesk.beats.some((b) => b.id === 'messages')).toBe(true)
  })

  it('DEMO_BEATS stays the full tour (historical export)', () => {
    expect(DEMO_BEATS).toBe(DEMO_TRACKS.full.beats)
  })

  it('resolveTrack: junk in → the full tour out', () => {
    expect(resolveTrack('website').id).toBe('website')
    expect(resolveTrack('nonsense').id).toBe('full')
    expect(resolveTrack(null).id).toBe('full')
    expect(resolveTrack(undefined).id).toBe('full')
  })
})

describe('suggestDemoTrack', () => {
  it('no website (or no verdict at all) → lead with the website story', () => {
    expect(suggestDemoTrack(null, null)).toBe('website')
    expect(suggestDemoTrack(verdict({ hasWebsite: false }), signals())).toBe('website')
  })

  it('a weak website → still the website story', () => {
    expect(suggestDemoTrack(verdict({ websiteQuality: 30 }), signals())).toBe('website')
  })

  it('healthy site but zero social presence → found-everywhere', () => {
    expect(suggestDemoTrack(verdict(), signals({ socialLinks: NO_SOCIAL }))).toBe('presence')
  })

  it('healthy site but weak reputation → found-everywhere', () => {
    expect(suggestDemoTrack(verdict(), signals(), { ratingTenths: 38, reviewCount: 200 })).toBe('presence')
    expect(suggestDemoTrack(verdict(), signals(), { ratingTenths: 47, reviewCount: 12 })).toBe('presence')
  })

  it('healthy everything → the full tour', () => {
    expect(suggestDemoTrack(verdict(), signals(), { ratingTenths: 47, reviewCount: 220 })).toBe('full')
  })
})
