import { describe, expect, it } from 'vitest'
import {
  GRADE_AXES,
  gradeOnlinePresence,
  isAxisHidden,
  letterFor,
  parsePracticeGradeResult,
  placeMatchesPractice,
  projectedWithDreamCrm,
  type AxisGrade,
  type GradeInputs,
} from '@/lib/practice-grade'
import { extractDeepSiteSignals, type DeepSiteSignals } from '@/lib/practice-scan'
import { classifyChannel } from '@/lib/marketing-attribution'
import type { ProspectCrawlSignals, ProspectAiVerdict } from '@/lib/types/prospecting'

const NOW = new Date('2026-08-27T12:00:00Z')

/** Flatten an axis's finding texts for substring assertions. */
const ftext = (a: AxisGrade) => a.findings.map((x) => x.text).join(' ')
/** Flatten an axis's "with DreamCRM" remedy lines. */
const aftext = (a: AxisGrade) => a.findings.map((x) => x.after ?? '').join(' ')

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
    for (const axis of ['website', 'listing', 'reviews'] as const) expect(g.axes[axis].score).toBeGreaterThan(80)
    expect(isAxisHidden(g.axes.search)).toBe(true)
    expect(g.axes.listing.wins.join(' ')).toContain('links to your website')
  })

  it('no website at all is the loudest finding, not a crash', () => {
    const g = gradeOnlinePresence(inputs({ enteredUrl: null, signals: null, verdict: null }))
    expect(g.axes.website.score).toBeLessThan(20)
    expect(g.axes.website.findings[0].text).toContain('couldn’t find a website')
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
    expect(g.axes.listing.findings[0].text).toContain('couldn’t confidently find')
    // Composite falls back to the website axis alone.
    expect(g.overall).toBe(g.axes.website.score)
  })

  it('a rejected similar-sounding candidate is disclosed out loud', () => {
    const g = gradeOnlinePresence(inputs({ place: null, rejectedSimilar: true }))
    expect(ftext(g.axes.listing)).toContain('similar-sounding practice')
    expect(ftext(g.axes.listing)).toContain('stranger')
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
    expect(ftext(g.axes.listing)).toContain('no website link')
  })

  it('a listing pointing at a DIFFERENT site is called out', () => {
    const g = gradeOnlinePresence(
      inputs({ place: { ...inputs().place!, websiteUri: 'https://old-agency-site.com' } }),
    )
    expect(ftext(g.axes.listing)).toContain('different site')
  })

  it('thin reviews get the volume finding; a great rating gets its win', () => {
    const g = gradeOnlinePresence(
      inputs({ place: { ...inputs().place!, ratingTenths: 49, reviewCount: 12 } }),
    )
    expect(ftext(g.axes.reviews)).toContain('12 reviews')
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
    expect(ftext(g.axes.website)).toContain('not secure')
  })

  // ── v2: the Before/After story ─────────────────────────────────────────
  it('every fixable finding carries a shipped-feature After; unfixables carry none', () => {
    const g = gradeOnlinePresence(
      inputs({ signals: goodSignals({ bookingWidget: false }), place: null, rejectedSimilar: true }),
    )
    expect(aftext(g.axes.website)).toContain('books patients 24/7')
    expect(aftext(g.axes.listing)).toContain('claim your listing')
    // The stranger-disclosure line has no After — there's nothing to sell there.
    const disclosure = g.axes.listing.findings.find((x) => x.text.includes('similar-sounding'))
    expect(disclosure?.after).toBeNull()
  })

  it('deep-scan gaps become findings with remedies', () => {
    const deep: DeepSiteSignals = {
      h1: false, jsonLd: false, jsonLdDentist: false, ogTags: false,
      phoneVisible: false, canonical: false, robotsTxt: false, sitemap: true, fetchMs: 5000,
    }
    const g = gradeOnlinePresence(inputs({ deep }))
    const t = ftext(g.axes.website)
    expect(t).toContain('phone number a patient can tap')
    expect(t).toContain('structured data')
    expect(t).toContain('sitemap or crawl rules')
    expect(t).toContain('took several seconds')
    expect(g.axes.website.score).toBeLessThan(85)
  })

  it('a clean deep scan earns its wins', () => {
    const deep: DeepSiteSignals = {
      h1: true, jsonLd: true, jsonLdDentist: true, ogTags: true,
      phoneVisible: true, canonical: true, robotsTxt: true, sitemap: true, fetchMs: 400,
    }
    const g = gradeOnlinePresence(inputs({ deep }))
    expect(g.axes.website.findings).toHaveLength(0)
    expect(g.axes.website.wins.join(' ')).toContain('phone number is right there')
  })

  it('the search axis hides when unchecked and grades by position when checked', () => {
    expect(isAxisHidden(gradeOnlinePresence(inputs()).axes.search)).toBe(true)
    const top = gradeOnlinePresence(inputs({ search: { query: 'dentist in Austin, TX', position: 1 } }))
    expect(top.axes.search.score).toBeGreaterThanOrEqual(90)
    expect(top.axes.search.wins.join(' ')).toContain('#1 on Google')
    const missing = gradeOnlinePresence(inputs({ search: { query: 'dentist in Austin, TX', position: null } }))
    expect(missing.axes.search.score).toBeLessThanOrEqual(25)
    expect(ftext(missing.axes.search)).toContain('isn’t on page one')
    const low = gradeOnlinePresence(inputs({ search: { query: 'dentist in Austin, TX', position: 9 } }))
    expect(ftext(low.axes.search)).toContain('below where most patients stop scrolling')
  })

  it('projections are honest by construction — never reviews, never rank', () => {
    const g = gradeOnlinePresence(inputs({ place: null, search: { query: 'q', position: null } }))
    const p = projectedWithDreamCrm(g)
    expect(p.website).toBe(95)
    expect(p.listing).toBe(95)
    expect(p.reviews).toBeNull()
    expect(p.search).toBeNull()
    // An already-excellent listing keeps its own number, not a downgrade.
    const strong = projectedWithDreamCrm(gradeOnlinePresence(inputs()))
    expect(strong.listing).toBe(gradeOnlinePresence(inputs()).axes.listing.score)
  })
})

describe('extractDeepSiteSignals', () => {
  it('reads the signals from real-ish HTML', () => {
    const html = `<html><head>
      <link rel="canonical" href="https://x.com/">
      <meta property="og:title" content="X">
      <script type="application/ld+json">{"@type":"Dentist","name":"X"}</script>
      </head><body><h1>Welcome</h1><a href="tel:+15015551234">Call us</a></body></html>`
    const d = extractDeepSiteSignals(html)
    expect(d).toMatchObject({ h1: true, jsonLd: true, jsonLdDentist: true, ogTags: true, phoneVisible: true, canonical: true })
  })
  it('an empty page reads as all-missing, never a crash', () => {
    const d = extractDeepSiteSignals('<html><body>hi</body></html>')
    expect(d).toMatchObject({ h1: false, jsonLd: false, jsonLdDentist: false, ogTags: false, phoneVisible: false, canonical: false })
  })
  it('a visible formatted phone number counts without a tel: link', () => {
    expect(extractDeepSiteSignals('<p>Call (501) 555-1234 today</p>').phoneVisible).toBe(true)
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
  it('a v1 row (3 axes, string findings) still parses — search defaults to hidden', () => {
    const v1 = {
      overall: 67,
      headline: 'old row',
      computedAt: '2026-08-27T00:00:00.000Z',
      axes: {
        website: { score: 50, findings: ['There’s no online booking.'], wins: ['Works on phones.'] },
        listing: { score: null, findings: ['We couldn’t confidently find…'], wins: [] },
        reviews: { score: null, findings: [], wins: [] },
      },
    }
    const parsed = parsePracticeGradeResult(v1)
    expect(parsed?.axes.website.findings[0]).toEqual({ text: 'There’s no online booking.', after: null })
    expect(parsed?.axes.search).toEqual({ score: null, findings: [], wins: [] })
    expect(parsed?.overall).toBe(67)
  })
})

describe('the grader channel marker', () => {
  it('utm_source=grader classifies to its own channel', () => {
    expect(classifyChannel({ utmSource: 'grader', utmMedium: 'email' })).toBe('grader')
  })
})
