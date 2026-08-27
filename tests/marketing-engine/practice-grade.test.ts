import { describe, expect, it } from 'vitest'
import {
  GRADE_AXES,
  gradeOnlinePresence,
  letterFor,
  parsePracticeGradeResult,
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

  it('a missing Google listing scores the listing and reviews axes honestly low', () => {
    const g = gradeOnlinePresence(inputs({ place: null }))
    expect(g.axes.listing.score).toBeLessThanOrEqual(15)
    expect(g.axes.reviews.score).toBeLessThanOrEqual(15)
    expect(g.axes.listing.findings[0]).toContain('couldn’t find your Google Business listing')
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

  it('missing HTTPS caps the website score hard', () => {
    const g = gradeOnlinePresence(
      inputs({ signals: goodSignals({ ssl: false }), verdict: verdict(85) }),
    )
    expect(g.axes.website.score).toBeLessThanOrEqual(40)
    expect(g.axes.website.findings.join(' ')).toContain('not secure')
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
