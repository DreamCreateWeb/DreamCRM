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
import { getQuotedPlan, PLANS, PURCHASABLE_PLANS } from '@/lib/stripe-config'

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
      // $200 (DREAMCRM-38), and the whole time the other four closed on tiers
      // nobody can buy (DREAMCRM-124). The value assertions are below.
      expect(track.planPitch).toMatch(/\$\d+/)
      expect(last.talkTrack).toMatch(/\$\d+/)
      expect(PLANS.map((p) => p.id)).toContain(track.recommendedPlan)
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
 * WHAT THE PROSPECT ACTUALLY HEARS (DREAMCRM-38, widened by DREAMCRM-124).
 *
 * `planPitch` is read out at the end of a live branded demo — it renders in
 * the presenter panel's wrap-up (`components/demo/wrap-up.tsx`), so it is the
 * last number a prospect hears before being asked to sign. The registry check
 * above only asserts the SHAPE `/\$\d+/`, which is why it never went red while
 * the numbers were wrong.
 *
 * DREAMCRM-38 fixed and pinned ONE track. `full` said "$500 a month" — the
 * struck-through LIST price — and the assertion written for it names `full`
 * explicitly, so the other four went on closing on "Basic — $150 a month",
 * "Pro — $250 a month" and "a $30 add-on" for another two months. That is
 * §2d's overclaiming-name family seen from the assertion side: a test that
 * pins one member of a population reads, from the outside, exactly like a test
 * that pins the population.
 *
 * So both checks below iterate DEMO_TRACK_LIST. The first is positive (every
 * close names the purchasable plan at its stripe-config price); the second
 * holds a population at ZERO (no close quotes a plan nobody can buy), and per
 * §2d a zero-holding rule ships an assertion about what it can SEE — that is
 * the fourth test, which replays the detector over a constructed offender and
 * fails if the detector, the plan set or the corpus has quietly emptied.
 *
 * WHAT THIS GRADES, and what it does not: the registry's VALUES, at runtime.
 * It says nothing about the source file, so a retired price surviving in a
 * comment (there are three, explaining this defect) is correctly invisible
 * here — and a price assembled from a variable is correctly visible, which a
 * source scan would have the other way round.
 */

/** The plans that exist for legacy lookups but cannot be bought. */
const RETIRED_PLANS = PLANS.filter((p) => !PURCHASABLE_PLANS.some((q) => q.id === p.id))

/** The money sentences — the two a presenter reads out loud at the close. */
function moneySentences(): string[] {
  return DEMO_TRACK_LIST.flatMap((t) => [t.planPitch, t.beats[t.beats.length - 1].talkTrack])
}

/** Every string in the registry a prospect can hear, pitches and beats alike. */
function spokenCorpus(): string[] {
  return DEMO_TRACK_LIST.flatMap((t) => [t.planPitch, ...t.beats.map((b) => b.talkTrack)])
}

/**
 * The detector, as a pure function over ONE string, so the field-of-view test
 * can point it at an offender this tree does not contain. Returns the retired
 * prices and retired plan names it found.
 */
function retiredTierMentions(sentence: string): string[] {
  const hits: string[] = []
  for (const plan of RETIRED_PLANS) {
    for (const n of [plan.price, plan.annualPrice]) {
      const spelled = `$${n.toLocaleString('en-US')}`
      if (sentence.includes(spelled)) hits.push(spelled)
    }
    // Word-bounded: "Pro" must not match "Proof", "profile" or "provider".
    if (new RegExp(`\\b${plan.name}\\b`).test(sentence)) hits.push(plan.name)
  }
  return hits
}

describe('every demo close quotes the plan a prospect can buy', () => {
  it('names the purchasable plan at its stripe-config price, on all five tracks', () => {
    const plan = getQuotedPlan()
    const spoken = `$${plan.price.toLocaleString('en-US')} a month`

    for (const track of DEMO_TRACK_LIST) {
      expect(track.recommendedPlan, `${track.id} closes on a plan nobody can buy`).toBe(plan.id)
      expect(track.planPitch, `${track.id}.planPitch does not name ${plan.name}`).toContain(plan.name)
      expect(track.planPitch, `${track.id}.planPitch does not say ${spoken}`).toContain(spoken)
      const last = track.beats[track.beats.length - 1]
      expect(last.talkTrack, `${track.id}'s closing beat does not say ${spoken}`).toContain(spoken)
    }
  })

  it('never quotes the list price as the price, on any track', () => {
    const plan = getQuotedPlan()
    expect(plan.listPrice, 'fixture assumption: the quoted plan has a list price').toBe(500)
    const listSpoken = `$${plan.listPrice!.toLocaleString('en-US')} a month`
    for (const sentence of moneySentences()) {
      expect(sentence, `a close quotes the LIST price: ${sentence}`).not.toContain(listSpoken)
    }
  })

  it('quotes no retired tier — not its name in a close, not its price anywhere', () => {
    expect(
      RETIRED_PLANS.map((p) => p.id).sort(),
      'fixture assumption: Basic and Pro are the plans that exist and cannot be bought',
    ).toEqual(['basic', 'pro'])

    for (const sentence of moneySentences()) {
      expect(retiredTierMentions(sentence), `a close quotes a retired tier: ${sentence}`).toEqual([])
    }

    // A PRICE is unambiguous, so it is graded over every spoken string rather
    // than only the closes — a beat that slips "$150 a month" into the middle
    // of a story is the same lie, one sentence earlier. The NAME half stays on
    // the closes, because "Basic" and "Pro" are ordinary English words and a
    // tree-wide name ban is how a guard earns a false positive (§2).
    const retiredPrices = RETIRED_PLANS.flatMap((p) => [p.price, p.annualPrice]).map(
      (n) => `$${n.toLocaleString('en-US')}`,
    )
    for (const sentence of spokenCorpus()) {
      for (const price of retiredPrices) {
        expect(sentence, `a beat quotes the retired price ${price}: ${sentence}`).not.toContain(price)
      }
    }
  })

  /**
   * THE FIELD-OF-VIEW HALF (§2d). The test above holds a population at zero,
   * so it goes GREENER every time its eyes narrow: an empty RETIRED_PLANS, a
   * regex that stopped matching, a corpus collector that stopped at the first
   * track. No absence assertion can fail on any of those. This one measures
   * all three, by replaying the detector over a constructed offender and by
   * counting what the corpus actually collected.
   */
  it('the retired-tier detector still sees an offender, and still reads the whole registry', () => {
    expect(RETIRED_PLANS.length, 'the detector has nothing to look for').toBeGreaterThan(0)

    // The sentence this defect actually shipped as, reconstructed FROM THE
    // CONFIG rather than pasted, so it follows a retired plan's price if it
    // ever moves.
    const basic = RETIRED_PLANS.find((p) => p.id === 'basic')!
    const offender = `The website story is the ${basic.name} plan — $${basic.price} a month for the site, booking, reviews, and SEO.`
    expect(retiredTierMentions(offender)).toEqual(
      expect.arrayContaining([`$${basic.price}`, basic.name]),
    )

    // ...and it does NOT fire on the plan we actually sell, nor on ordinary
    // words that merely start with a retired plan's name.
    const quoted = getQuotedPlan()
    expect(
      retiredTierMentions(
        `Everything you just saw is the ${quoted.name} plan — $${quoted.price} a month.`,
      ),
    ).toEqual([])
    expect(retiredTierMentions('Proof it works: profiles, providers, progress.')).toEqual([])

    // The corpus is the WHOLE registry, counted rather than assumed: one pitch
    // per track plus every beat of every track.
    const expectedBeats = DEMO_TRACK_LIST.reduce((n, t) => n + t.beats.length, 0)
    expect(spokenCorpus().length).toBe(DEMO_TRACK_LIST.length + expectedBeats)
    expect(moneySentences().length).toBe(DEMO_TRACK_LIST.length * 2)
  })
})
