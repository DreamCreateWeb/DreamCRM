// Pure builder for the printable QR share cards (/website/share). Client-safe —
// no server imports — so the card list is unit-testable and the page stays a
// thin QR-rendering shell around it.

import { REVIEW_CARD_BODY, REVIEW_CARD_HEADLINES, REVIEW_CARD_PLACEMENT } from '@/lib/review-card'

export interface ShareCard {
  key: string
  /** Big line on the printed card — what the patient is being invited to do. */
  title: string
  /** One quiet supporting line under the title. */
  subtitle: string
  /** The URL the QR encodes (also printed small, for people who won't scan). */
  url: string
  /** Where this card is best used — shown on screen only, never printed. */
  placement: string
}

/**
 * Assemble the clinic's share cards from what actually exists — a card whose
 * link would dead-end (no Google Place ID → no review link; basic tier → no
 * /book page) simply isn't offered, same gating discipline as the public nav.
 */
export function buildShareCards(opts: {
  clinicName: string
  siteUrl: string
  selfBooking: boolean
  googleReviewUrl: string | null
  portalUrl: string
}): ShareCard[] {
  const cards: ShareCard[] = []
  if (opts.selfBooking) {
    cards.push({
      key: 'book',
      title: 'Book your next visit online',
      subtitle: `Scan to pick a time at ${opts.clinicName} — it takes about a minute.`,
      url: `${opts.siteUrl}/book`,
      placement: 'Front desk · checkout counter · treatment rooms',
    })
  }
  cards.push({
    key: 'site',
    title: 'Visit our website',
    subtitle: `Services, insurance, hours, and more — all at ${opts.clinicName}.`,
    url: opts.siteUrl,
    placement: 'Waiting room · brochures · community boards',
  })
  if (opts.googleReviewUrl) {
    // THE REVIEW CARD'S WORDING IS NOT THIS FILE'S. It read "Loved your visit?
    // Tell Google.", to be handed over "the moment after a great visit" — an
    // ask addressed to the patients who loved it, which is the selective
    // solicitation Google's policy names. `lib/review-card.ts` holds the one
    // wording every printed review card uses, and the tests that keep it an
    // ask a disappointed patient can answer too.
    cards.push({
      key: 'review',
      title: REVIEW_CARD_HEADLINES[0],
      subtitle: REVIEW_CARD_BODY,
      url: opts.googleReviewUrl,
      placement: REVIEW_CARD_PLACEMENT,
    })
  }
  cards.push({
    key: 'portal',
    title: 'Your patient portal',
    subtitle: 'Appointments, forms, billing, and messages — all in one place.',
    url: opts.portalUrl,
    placement: 'New-patient welcome packet · statements',
  })
  return cards
}
