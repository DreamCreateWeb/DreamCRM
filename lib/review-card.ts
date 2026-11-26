/**
 * THE REVIEW CARD — the one home of the printed review ask.
 *
 * Three surfaces print a card that sends a patient to the practice's Google
 * reviews: the public card maker (`/google-review-card`), the counter card in
 * the review-request guide, and the practice's own share cards inside the app
 * (`/website/share`). Each used to carry its own wording, and the app's said
 * "Loved your visit? Tell Google." — an ask addressed only to the patients
 * who loved it. Google's policy, quoted in `lib/marketing/guide-sources.ts`,
 * forbids a business to "selectively solicit positive reviews from
 * customers", and the guide one page over tells practices exactly that.
 *
 * So the wording lives here, once, and it obeys the three rules the guide
 * quotes: it asks EVERY patient the same thing, it offers nothing in return,
 * and it names no number of stars. `tests/marketing/review-card.test.tsx`
 * holds all three on every string in this file.
 *
 * Client-safe: plain data and pure functions, no imports. The card maker
 * runs in the visitor's browser and sends nothing anywhere, so this file must
 * never grow a server import.
 */

/** The headline choices. Every one is an ask a disappointed patient can answer too. */
export const REVIEW_CARD_HEADLINES = [
  'How did we do?',
  'Tell people about your visit',
  'Leave us a Google review',
] as const

export type ReviewCardHeadline = (typeof REVIEW_CARD_HEADLINES)[number]

/** The line under the headline — the review-request guide's own counter card. */
export const REVIEW_CARD_BODY =
  'Scan to tell people about your visit on Google. Your honest take helps other patients choose a dentist.'

/** Where a practice puts it. Shown on screen, never printed. */
export const REVIEW_CARD_PLACEMENT = 'Checkout counter · waiting room — the same card for every patient'

/** What the printed card may be laid out as. */
export const REVIEW_CARD_FORMATS = [
  { id: 'sign', label: 'Counter sign', detail: 'One to a page, for a stand or a frame', perPage: 1 },
  { id: 'handouts', label: 'Handout cards', detail: 'Four to a page, to cut and hand over', perPage: 4 },
] as const

export type ReviewCardFormat = (typeof REVIEW_CARD_FORMATS)[number]['id']

/** A practice name longer than this does not fit a card; it is cut, not shrunk. */
export const PRACTICE_NAME_MAX = 60

/**
 * The hosts a Google review link lives on. A card that says "Google" over a
 * code that opens somewhere else is a lie printed and handed to a patient, so
 * the maker makes a card for nothing else. Subdomains count
 * (`search.google.com`, `maps.app.goo.gl`).
 */
export const GOOGLE_LINK_HOSTS = ['google.com', 'g.page', 'goo.gl', 'g.co'] as const

export type ReviewLinkCheck =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' | 'not-a-link' | 'not-google'; message: string }

const MESSAGES = {
  empty: 'Paste the review link from your Google Business Profile.',
  'not-a-link': 'That does not look like a link. Copy it again from your Google Business Profile and paste the whole thing.',
  'not-google':
    'That link does not go to Google. This makes a card for your Google reviews only: copy the link under “Get more reviews” in your Business Profile.',
} as const

const fail = (reason: keyof typeof MESSAGES): ReviewLinkCheck => ({ ok: false, reason, message: MESSAGES[reason] })

/**
 * Is this the practice's Google review link? Returns the address to encode,
 * or the reason it will not be encoded, in words that name the fix.
 *
 * It BUILDS nothing. The link is the one Google hands the practice; this
 * only decides whether to print it. A pasted `g.page/r/…` with no scheme is
 * given `https://`, and `http://` is raised to `https://`, because the code
 * is scanned by a patient's phone and nothing else about the link changes.
 */
export function checkReviewLink(raw: string): ReviewLinkCheck {
  const text = (raw ?? '').trim()
  if (!text) return fail('empty')
  if (/\s/.test(text) || text.length > 500) return fail('not-a-link')

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return fail('not-a-link')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return fail('not-a-link')
  // An address with a name and password in it is not a link anybody was given.
  if (url.username || url.password) return fail('not-a-link')
  if (!url.hostname.includes('.')) return fail('not-a-link')

  const host = url.hostname.toLowerCase()
  const isGoogle = GOOGLE_LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  if (!isGoogle) return fail('not-google')

  url.protocol = 'https:'
  return { ok: true, url: url.toString() }
}

/** The practice's name as the card prints it: trimmed, single-spaced, capped. */
export function cardPracticeName(raw: string): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, PRACTICE_NAME_MAX)
}

/** A file name for the downloaded code, from the practice's own name. */
export function reviewCodeFileName(practiceName: string, extension: 'svg' | 'png'): string {
  const slug = cardPracticeName(practiceName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'practice'}-google-review-qr.${extension}`
}
