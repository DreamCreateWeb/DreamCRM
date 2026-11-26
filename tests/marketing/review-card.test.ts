import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GOOGLE_LINK_HOSTS,
  PRACTICE_NAME_MAX,
  REVIEW_CARD_BODY,
  REVIEW_CARD_FORMATS,
  REVIEW_CARD_HEADLINES,
  REVIEW_CARD_PLACEMENT,
  cardPracticeName,
  checkReviewLink,
  reviewCodeFileName,
} from '@/lib/review-card'
import { buildShareCards } from '@/lib/share-cards'

/**
 * THE REVIEW CARD (queue item 10, `docs/organic-go-live.md` Part 10).
 *
 * A card that sends a patient to the practice's Google reviews is printed by
 * three surfaces: the public card maker, the review-request guide's counter
 * card, and the practice's own share cards in the app. The wording has ONE
 * home (`lib/review-card.ts`) and three rules, each from a sentence of
 * Google's policy the guide quotes:
 *
 *   1. it asks every patient the same thing — nothing conditional on a good
 *      visit (the app's card said "Loved your visit? Tell Google.");
 *   2. it offers nothing in return;
 *   3. it names no number of stars.
 *
 * And the maker prints a card for a Google link and for nothing else: a card
 * that says "Google" over a code that opens another site is a lie handed to
 * a patient.
 */

const EVERY_STRING = [...REVIEW_CARD_HEADLINES, REVIEW_CARD_BODY, REVIEW_CARD_PLACEMENT]

describe('the wording obeys the rules the guide quotes', () => {
  it('asks nobody for a GOOD review: no condition on how the visit went', () => {
    for (const s of EVERY_STRING) {
      expect(s, s).not.toMatch(/\b(loved?|enjoy(ed)?|happy|great|amazing|wonderful|pleased|satisfied|5[- ]star|five[- ]star)\b/i)
      expect(s, s).not.toMatch(/\bif you\b/i)
    }
  })

  it('offers nothing in return', () => {
    for (const s of EVERY_STRING) {
      expect(s, s).not.toMatch(/\b(free|discount|gift|win|prize|raffle|entered|reward|thank[- ]you gift|\$\d|% off)\b/i)
    }
  })

  it('names no number of stars, and asks for an honest take in so many words', () => {
    for (const s of EVERY_STRING) expect(s, s).not.toMatch(/\bstars?\b/i)
    expect(REVIEW_CARD_BODY).toMatch(/honest/)
  })

  it('says where the code goes: every headline or the body names Google', () => {
    expect(REVIEW_CARD_BODY).toMatch(/Google/)
    expect(REVIEW_CARD_HEADLINES.length).toBeGreaterThanOrEqual(2)
    expect(new Set(REVIEW_CARD_HEADLINES).size).toBe(REVIEW_CARD_HEADLINES.length)
  })

  it('the placement tells the desk to give it to everyone', () => {
    expect(REVIEW_CARD_PLACEMENT).toMatch(/every patient/)
    expect(REVIEW_CARD_PLACEMENT).not.toMatch(/after a great visit/i)
  })
})

describe('the app’s own share card uses the same wording', () => {
  const review = buildShareCards({
    clinicName: 'Acme Dental',
    siteUrl: 'https://acme.dreamcreatestudio.com',
    selfBooking: true,
    googleReviewUrl: 'https://search.google.com/local/writereview?placeid=abc123',
    portalUrl: 'https://www.dreamcreatestudio.com/signin/patient?clinic=acme',
  }).find((c) => c.key === 'review')!

  it('its title, its line and its placement are this file’s, word for word', () => {
    expect(review.title).toBe(REVIEW_CARD_HEADLINES[0])
    expect(review.subtitle).toBe(REVIEW_CARD_BODY)
    expect(review.placement).toBe(REVIEW_CARD_PLACEMENT)
  })

  it('the card that asked only the patients who loved it is gone', () => {
    expect(JSON.stringify(review)).not.toMatch(/Loved your visit|after a great visit|means the world/i)
  })
})

describe('checkReviewLink — a Google link is printed, anything else is refused in words', () => {
  it('accepts the links Google hands a practice, on any of its hosts', () => {
    for (const link of [
      'https://g.page/r/CabcDEF123/review',
      'https://search.google.com/local/writereview?placeid=ChIJabc123',
      'https://www.google.com/maps/place/?q=place_id:ChIJabc123',
      'https://maps.app.goo.gl/AbCdEf123',
      'https://g.co/kgs/abc123',
    ]) {
      const r = checkReviewLink(link)
      expect(r, link).toEqual({ ok: true, url: link })
    }
  })

  it('every listed host is accepted bare and as a subdomain, and nothing that merely ends like one', () => {
    for (const h of GOOGLE_LINK_HOSTS) {
      expect(checkReviewLink(`https://${h}/x`).ok, h).toBe(true)
      expect(checkReviewLink(`https://sub.${h}/x`).ok, `sub.${h}`).toBe(true)
      // "evilgoogle.com" ends with "google.com" and is not Google's.
      expect(checkReviewLink(`https://evil${h}/x`).ok, `evil${h}`).toBe(false)
      expect(checkReviewLink(`https://${h}.example.com/x`).ok, `${h}.example.com`).toBe(false)
    }
  })

  it('gives a pasted link with no scheme its https, and raises http to https', () => {
    expect(checkReviewLink('g.page/r/CabcDEF123/review')).toEqual({ ok: true, url: 'https://g.page/r/CabcDEF123/review' })
    expect(checkReviewLink('http://g.page/r/CabcDEF123/review')).toEqual({ ok: true, url: 'https://g.page/r/CabcDEF123/review' })
    expect(checkReviewLink('  https://g.page/r/CabcDEF123/review \n')).toEqual({ ok: true, url: 'https://g.page/r/CabcDEF123/review' })
  })

  it('changes nothing else about the link: the path and the query are the practice’s own', () => {
    const link = 'https://search.google.com/local/writereview?placeid=ChIJ_a-b%20c&hl=en'
    const r = checkReviewLink(link)
    expect(r.ok && r.url).toBe(link)
  })

  it('refuses nothing silently: each refusal has a reason and a sentence that names the fix', () => {
    const cases: Array<[string, string]> = [
      ['', 'empty'],
      ['   ', 'empty'],
      ['our google reviews', 'not-a-link'],
      ['javascript:alert(1)', 'not-a-link'],
      ['mailto:desk@example.com', 'not-a-link'],
      ['https://user:pass@g.page/r/x/review', 'not-a-link'],
      ['https://localhost/review', 'not-a-link'],
      ['https://www.yelp.com/writeareview/biz/acme', 'not-google'],
      ['https://www.facebook.com/acme/reviews', 'not-google'],
      ['https://bit.ly/3abcdef', 'not-google'],
      ['https://google.com.evil.example/review', 'not-google'],
      [`https://g.page/${'x'.repeat(600)}`, 'not-a-link'],
    ]
    for (const [input, reason] of cases) {
      const r = checkReviewLink(input)
      expect(r.ok, input).toBe(false)
      if (!r.ok) {
        expect(r.reason, input).toBe(reason)
        expect(r.message.length, input).toBeGreaterThan(20)
        expect(r.message, input).toMatch(/Google/)
      }
    }
  })

  it('survives junk: never throws on a public page', () => {
    for (const junk of ['https://', '://', 'https://[', '%%%', '\u0000', 'https://g.page/‮']) {
      expect(() => checkReviewLink(junk), junk).not.toThrow()
    }
    // @ts-expect-error — a form can hand over anything
    expect(checkReviewLink(undefined).ok).toBe(false)
  })
})

describe('the practice name and the file name', () => {
  it('the name is trimmed, single-spaced and capped, never shrunk to fit', () => {
    expect(cardPracticeName('  Maple   Street\nDental  ')).toBe('Maple Street Dental')
    expect(cardPracticeName('x'.repeat(200))).toHaveLength(PRACTICE_NAME_MAX)
    expect(cardPracticeName('')).toBe('')
  })

  it('the downloaded code is named for the practice', () => {
    expect(reviewCodeFileName('Maple Street Dental, PLLC', 'svg')).toBe('maple-street-dental-pllc-google-review-qr.svg')
    expect(reviewCodeFileName('', 'png')).toBe('practice-google-review-qr.png')
    expect(reviewCodeFileName('Дентал', 'svg')).toBe('practice-google-review-qr.svg')
  })
})

/**
 * THE ASK IS DESCRIBED ONE WAY, WHEREVER THE PRODUCT DESCRIBES IT.
 *
 * Building the card turned up the same selection in eight other sentences:
 * the app called its review request "asking happy patients" in five places
 * (the email settings, the Dream Team roster, the onboarding step, the
 * readiness fact and the autonomy label), the Guardian said it "can't ask
 * happy patients", the free grader promised that "unhappy patients get caught
 * privately before they post … not to Google", and a prospecting email said
 * "happy patients land on Google" after "one friendly text or email".
 *
 * None of that is what the sender does. By default every patient is sent the
 * same request after a completed visit (`auto_send_enabled` on,
 * `star_gate_enabled` off), and the product sends no text messages today.
 *
 * These are NAMED FILES, read one by one: the places where the product
 * describes its review ask. It is not a walk of the tree. A new surface that
 * describes the ask belongs on this list in the change that adds it.
 */
describe('the product describes its review ask one way: to every patient', () => {
  const SURFACES = [
    'lib/share-cards.ts',
    'lib/practice-grade.ts',
    'lib/readiness.ts',
    'lib/autonomy.ts',
    'lib/guardian.ts',
    'lib/types/dream-team.ts',
    'lib/types/onboarding.ts',
    'lib/services/prospect-outreach.ts',
    'app/(default)/settings/automations/emails/emails-hub.tsx',
  ] as const

  /** A file's lines with its comment lines taken out: a comment may quote what the code used to say. */
  const codeLines = (path: string) =>
    readFileSync(join(process.cwd(), path), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))

  it('no line about reviews is addressed to the happy ones', () => {
    for (const path of SURFACES) {
      for (const line of codeLines(path)) {
        if (!/review/i.test(line)) continue
        // "unhappy" is a different word: the private note exists for them. And
        // "happy to send you…" is a sender being polite, not a patient chosen.
        expect(line.replace(/unhappy/gi, ''), `${path}: ${line.trim().slice(0, 120)}`).not.toMatch(
          /\bhappy (?:patients?|customers?|ones?|visit)\b|\bloved (?:it|your|their)\b|\bgreat visit\b/i,
        )
      }
    }
  })

  it('nothing promises to keep a complaint off Google', () => {
    for (const path of SURFACES) {
      const code = codeLines(path).join('\n')
      expect(code, path).not.toMatch(/before they post|not to Google|caught privately|land on Google/i)
    }
  })

  it('each says, in so many words, that every patient is asked', () => {
    const text = (path: string) => codeLines(path).join('\n')
    expect(text('lib/readiness.ts')).toContain('Every patient is asked for a review after their visit.')
    expect(text('lib/readiness.ts')).toContain('every patient is asked for a review from then on.')
    expect(text('lib/types/onboarding.ts')).toContain('every patient is asked for a review from then on.')
    expect(text('lib/autonomy.ts')).toContain("label: 'Ask every patient for a review'")
    expect(text('lib/types/dream-team.ts')).toContain('Asks every patient for a review')
    expect(text('app/(default)/settings/automations/emails/emails-hub.tsx')).toContain(
      'Asking every patient for a review after their visit.',
    )
    expect(text('lib/practice-grade.ts')).toContain('Every patient is asked the same way after every completed visit')
  })

  it('the prospecting email about reviews promises an email, and no text', () => {
    const outreach = codeLines('lib/services/prospect-outreach.ts').join('\n')
    expect(outreach).toContain('gets one friendly email asking how it went, with a button to your Google reviews')
    // The product sends no text messages today, and no sequence may say it does.
    expect(outreach).not.toMatch(/friendly text|text or email|\ba text\b|\bby text\b|\bSMS\b/i)
  })
})

describe('the formats', () => {
  it('a counter sign and handout cards, each saying how many print to a page', () => {
    expect(REVIEW_CARD_FORMATS.map((f) => [f.id, f.perPage])).toEqual([
      ['sign', 1],
      ['handouts', 4],
    ])
  })
})
