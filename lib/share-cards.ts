// Pure builder for the printable QR share cards (/website/share). Client-safe —
// no server imports — so the card list is unit-testable and the page stays a
// thin QR-rendering shell around it.

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
  isPro: boolean
  googleReviewUrl: string | null
  portalUrl: string
}): ShareCard[] {
  const cards: ShareCard[] = []
  if (opts.isPro) {
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
    cards.push({
      key: 'review',
      title: 'Loved your visit? Tell Google.',
      subtitle: 'Scan to leave us a review — it takes less than a minute and means the world.',
      url: opts.googleReviewUrl,
      placement: 'Checkout counter — the moment after a great visit',
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
