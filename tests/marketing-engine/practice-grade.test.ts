import { describe, expect, it } from 'vitest'
import {
  GRADE_AXES,
  gradeOnlinePresence,
  letterFor,
  parsePracticeGradeResult,
  placeMatchesPractice,
  type GradeInputs,
} from '@/lib/practice-grade'
import { classifyChannel } from '@/lib/marketing-attribution'
import type { ProspectCrawlSignals, ProspectAiVerdict } from '@/lib/types/prospecting'

const NOW = new Date('2026-08-27T12:00:00Z')

function goodSignals(over: Partial<ProspectCrawlSignals> = {}): ProspectCrawlSignals {
  return {
    ssl: true,
    mobileViewport: true,
    copyrightYear: 2026,
    titleTag: 'Smile Bright Dental — Family Dentistry',
    metaDescription: 'A friendly practice.',
    bookingWidget: true,
    socialLinks: { facebook: 'https://facebook.com/x' },
    builder: null,
    pageWeightKb: 900,
    emails: [],
    fetchedAt: NOW.toISOString(),
    ...over,
  }
}

function verdict(q: number, over: Partial<ProspectAiVerdict> = {}): ProspectAiVerdict {
  return {
    hasWebsite: true,
    websiteQuality: q,
    websiteReasons: [],
    socialPresence: 40,
    onlineBooking: true,
    weaknesses: [],
    summary: '',
    ...over,
  }
}

function inputs(over: Partial<GradeInputs> = {}): GradeInputs {
  return {
    enteredUrl: 'https://www.smilebright.com',
    signals: goodSignals(),
    verdict: verdict(85),
    place: {
      placeId: 'p1',
      displayName: 'Smile Bright Dental',
      formattedAddress: '100 Main St, Austin, TX 78701, USA',
      websiteUri: 'https://smilebright.com/',
      ratingTenths: 48,
      reviewCount: 180,
      businessStatus: 'OPERATIONAL',
      googleMapsUri: 'https://maps.google.com/x',
    },
    placesChecked: true,
    now: NOW,
    ...over,
  }
}

describe('gradeOnlinePresence', () => {
  it('a strong presence grades A with wins on every axis', () => {
    const g = gradeOnlinePresence(inputs())
    expect(g.letter).toBe('A')
    expect(g.overall).toBeGreaterThanOrEqual(90)
    for (const axis of GRADE_AXES) expect(g.axes[axis].score).toBeGreaterThan(80)
    expect(g.axes.listing.wins.join(' ')).toContain('links to your website')
  })

  it('no website at all is the loudest finding, not a crash', () => {
    const g = gradeOnlinePresence(inputs({ enteredUrl: null, signals: null, verdict: null }))
    expect(g.axes.website.score).toBeLessThan(20)
    expect(g.axes.website.findings[0]).toContain('couldn’t find a website')
    expect(g.letter).not.toBeNull()
  })

  it('an unreachable site leaves the axis UNGRADED, never a fake zero', () => {
    const g = gradeOnlinePresence(
      inputs({ signals: { ...goodSignals(), error: 'fetch_failed' }, verdict: null }),
    )
    expect(g.axes.website.score).toBeNull()
    // Composite re-weights over the axes that WERE checkable.
    expect(g.overall).not.toBeNull()
  })

  it('no confident listing match leaves BOTH Google axes ungraded — never a fake zero, never a stranger', () => {
    const g = gradeOnlinePresence(inputs({ place: null }))
    expect(g.axes.listing.score).toBeNull()
    expect(g.axes.reviews.score).toBeNull()
    expect(g.axes.listing.findings[0]).toContain('couldn’t confidently find')
    // Composite falls back to the website axis alone.
    expect(g.overall).toBe(g.axes.website.score)
  })

  it('a rejected similar-sounding candidate is disclosed out loud', () => {
    const g = gradeOnlinePresence(inputs({ place: null, rejectedSimilar: true }))
    expect(g.axes.listing.findings.join(' ')).toContain('similar-sounding practice')
    expect(g.axes.listing.findings.join(' ')).toContain('stranger')
  })

  it('a verified match names the listing it matched — transparency is the last guard', () => {
    const g = gradeOnlinePresence(inputs())
    expect(g.axes.listing.wins.join(' ')).toContain('Matched your listing: Smile Bright Dental — 100 Main St, Austin, TX')
  })

  it('places-not-configured leaves both Google axes null — unknown is never scored', () => {
    const g = gradeOnlinePresence(inputs({ place: null, placesChecked: false }))
    expect(g.axes.listing.score).toBeNull()
    expect(g.axes.reviews.score).toBeNull()
    expect(g.overall).toBe(g.axes.website.score)
  })

  it('a listing without a website link is called out', () => {
    const g = gradeOnlinePresence(inputs({ place: { ...inputs().place!, websiteUri: null } }))
    expect(g.axes.listing.findings.join(' ')).toContain('no website link')
  })

  it('a listing pointing at a DIFFERENT site is called out', () => {
    const g = gradeOnlinePresence(
      inputs({ place: { ...inputs().place!, websiteUri: 'https://old-agency-site.com' } }),
    )
    expect(g.axes.listing.findings.join(' ')).toContain('different site')
  })

  it('thin reviews get the volume finding; a great rating gets its win', () => {
    const g = gradeOnlinePresence(
      inputs({ place: { ...inputs().place!, ratingTenths: 49, reviewCount: 12 } }),
    )
    expect(g.axes.reviews.findings.join(' ')).toContain('12 reviews')
    expect(g.axes.reviews.wins.join(' ')).toContain('4.9')
  })

  it('a page with NO nameable findings floors at a solid score — the report never implies a gap it cannot name', () => {
    // Live-run finding: heuristicVerdict scored a clean template page 50
    // while the report listed only wins. Clean findings ⇒ floor at 80.
    const g = gradeOnlinePresence(inputs({ verdict: verdict(50) }))
    expect(g.axes.website.findings).toHaveLength(0)
    expect(g.axes.website.score).toBeGreaterThanOrEqual(80)
  })

  it('missing HTTPS caps the website score hard', () => {
    const g = gradeOnlinePresence(
      inputs({ signals: goodSignals({ ssl: false }), verdict: verdict(85) }),
    )
    expect(g.axes.website.score).toBeLessThanOrEqual(40)
    expect(g.axes.website.findings.join(' ')).toContain('not secure')
  })
})

describe('placeMatchesPractice (the stranger guard)', () => {
  // The real incident, verbatim: the owner graded "Dream Dental" in Ward,
  // AR (which has no listing), and searchText returned a real Dream Dental
  // in another state — 385 reviews the report presented as "Your reviews".
  it('rejects a similar-sounding practice in the wrong state — the Ward, AR incident', () => {
    expect(
      placeMatchesPractice(
        { practiceName: 'Dream Dental', city: 'Ward', state: 'AR', enteredUrl: 'https://dreamcreateweb.com' },
        {
          displayName: 'Dream Dental',
          formattedAddress: '4801 Frankford Rd, Dallas, TX 75287, USA',
          websiteUri: 'https://dreamdentaltx.com',
        },
      ),
    ).toBe(false)
  })

  it('a website match is proof of ownership, even with thin geo', () => {
    expect(
      placeMatchesPractice(
        { practiceName: 'Smile Bright Dental', enteredUrl: 'https://www.smilebright.com' },
        { displayName: 'Smile Bright', formattedAddress: null, websiteUri: 'https://smilebright.com/' },
      ),
    ).toBe(true)
  })

  it('explicit website disagreement rejects even when name and geo agree', () => {
    expect(
      placeMatchesPractice(
        { practiceName: 'Smile Bright Dental', city: 'Austin', state: 'TX', enteredUrl: 'https://smilebright.com' },
        {
          displayName: 'Smile Bright Dental',
          formattedAddress: '100 Main St, Austin, TX 78701, USA',
          websiteUri: 'https://totally-different-practice.com',
        },
      ),
    ).toBe(false)
  })

  it('city and state given must both appear in the address', () => {
    const place = {
      displayName: 'Smile Bright Dental',
      formattedAddress: '100 Main St, Austin, TX 78701, USA',
      websiteUri: null,
    }
    expect(placeMatchesPractice({ practiceName: 'Smile Bright Dental', city: 'Austin', state: 'TX' }, place)).toBe(true)
    expect(placeMatchesPractice({ practiceName: 'Smile Bright Dental', city: 'Dallas', state: 'TX' }, place)).toBe(false)
    expect(placeMatchesPractice({ practiceName: 'Smile Bright Dental', state: 'AR' }, place)).toBe(false)
  })

  it('geo given but the address unreadable = reject (cannot verify ≠ verified)', () => {
    expect(
      placeMatchesPractice(
        { practiceName: 'Smile Bright Dental', state: 'TX' },
        { displayName: 'Smile Bright Dental', formattedAddress: null, websiteUri: null },
      ),
    ).toBe(false)
  })

  it('the name must resemble theirs — generic-word overlap is not a match', () => {
    expect(
      placeMatchesPractice(
        { practiceName: 'Smile Bright Dental', city: 'Austin', state: 'TX' },
        { displayName: 'Lakeside Family Dentistry', formattedAddress: '5 Oak St, Austin, TX, USA', websiteUri: null },
      ),
    ).toBe(false)
  })
})

describe('letterFor', () => {
  it('maps the scale', () => {
    expect(letterFor(95)).toBe('A')
    expect(letterFor(82)).toBe('B')
    expect(letterFor(70)).toBe('C')
    expect(letterFor(60)).toBe('D')
    expect(letterFor(30)).toBe('F')
  })
})

describe('parsePracticeGradeResult', () => {
  it('round-trips a computed grade', () => {
    const g = gradeOnlinePresence(inputs())
    const parsed = parsePracticeGradeResult(JSON.parse(JSON.stringify(g)))
    expect(parsed).toEqual(g)
  })
  it('malformed rows degrade to null', () => {
    expect(parsePracticeGradeResult(null)).toBeNull()
    expect(parsePracticeGradeResult({ overall: 90 })).toBeNull()
    expect(parsePracticeGradeResult({ axes: { website: {} } })).toBeNull()
  })
})

describe('the grader channel marker', () => {
  it('utm_source=grader classifies to its own channel', () => {
    expect(classifyChannel({ utmSource: 'grader', utmMedium: 'email' })).toBe('grader')
  })
})
