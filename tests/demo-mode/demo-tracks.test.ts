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
import { getQuotedPlan } from '@/lib/stripe-config'

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
      // The close always lands on a price. NOTE this is a SHAPE check and it
      // is not evidence the number is right — it stayed green the whole time
      // the premium track's close said "$500 a month" for a plan that costs
      // $200 (DREAMCRM-38). The value assertion is the separate test below.
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

/**
 * WHAT THE PROSPECT ACTUALLY HEARS (DREAMCRM-38).
 *
 * `planPitch` is read out at the end of a live branded demo — it renders in
 * the presenter panel's wrap-up (`components/demo/wrap-up.tsx`), so it is the
 * last number a prospect hears before being asked to sign. The full track,
 * the one that closes on the plan anybody can actually buy, said "$500 a
 * month": the struck-through LIST price, for a plan the owner decided is
 * quoted at $200. The registry check above only asserts the SHAPE `/\$\d+/`,
 * which is why it never went red.
 */
describe('the demo close quotes the plan a prospect can buy', () => {
  it('names the purchasable plan at its stripe-config price', () => {
    const plan = getQuotedPlan()
    const full = DEMO_TRACKS.full
    const spoken = `$${plan.price.toLocaleString('en-US')} a month`

    expect(full.recommendedPlan).toBe('premium')
    expect(full.planPitch).toContain(plan.name)
    expect(full.planPitch).toContain(spoken)
    expect(full.beats[full.beats.length - 1].talkTrack).toContain(spoken)
  })

  it('never quotes the list price as the price', () => {
    const plan = getQuotedPlan()
    expect(plan.listPrice, 'fixture assumption: the quoted plan has a list price').toBe(500)
    const listSpoken = `$${plan.listPrice!.toLocaleString('en-US')} a month`
    expect(DEMO_TRACKS.full.planPitch).not.toContain(listSpoken)
    expect(DEMO_TRACKS.full.beats[DEMO_TRACKS.full.beats.length - 1].talkTrack).not.toContain(listSpoken)
  })
})
