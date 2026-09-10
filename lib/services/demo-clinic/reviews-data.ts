import 'server-only'

// Review quotes, which personas are pre-featured, and testimonial assembly.

/**
 * SINGLE SOURCE OF TRUTH for demo review text. Keyed by patientIdx. Used to
 * populate review_request.reviewText on completed legacy first-party seeds AND
 * to build the legacy patient-linked testimonial array — so the quote matches
 * what was originally featured. Featuring new reviews is Google-first now (see
 * `listFeaturableGoogleReviews`); this only backs historical demo rows.
 */
export const DEMO_REVIEW_TEXTS: Record<number, { text: string; rating: number }> = {
  // Mia Hayes (idx 0) — completed Google · 5d ago
  0: {
    text:
      "I dreaded the dentist for years. Dream Dental treated me like a person, not a tooth. I actually look forward to my cleanings now — I can't believe I'm saying that.",
    rating: 5,
  },
  // Liam Brooks (idx 1) — completed Healthgrades · 8d ago. NOT pre-featured.
  1: {
    text:
      "First visit and they made me feel like a regular. Hygienist explained every step before doing it. No upsells, no pressure to bleach my teeth, no pamphlet about implants. Just good dental care.",
    rating: 5,
  },
  // Charlotte Diaz (idx 2) — completed Google · 18d ago
  2: {
    text:
      "My six-year-old used to cry on the way to her old dentist. After two visits with the hygiene team here she now ASKS when her next cleaning is. Whatever you're doing, please keep doing it.",
    rating: 5,
  },
  // Emma Lopez (idx 6) — completed Facebook · 22d ago
  6: {
    text:
      "I came in scared after a bad experience years ago. Dr. Reyes walked me through every step before doing anything. The crown they placed feels exactly like my real tooth. No exaggeration — best dental visit of my life.",
    rating: 5,
  },
  // Noah Mitchell (idx 7) — completed Healthgrades · 12d ago
  7: {
    text:
      "Booked online at 11pm on a Sunday, sat in the chair Tuesday morning. The team explained every step of my treatment plan before any work — no surprises, no upsells.",
    rating: 5,
  },
  // Mason Garza (idx 11) — completed Google · 35d ago
  11: {
    text:
      "Front desk got my insurance pre-auth back in 48 hours after my old office took three weeks to lose the paperwork twice. They actually do what they say they will. That alone is worth switching.",
    rating: 4,
  },
  // Ava Fischer (idx 12) — completed Google · 28d ago. NOT pre-featured.
  12: {
    text:
      "Came in for what I thought would be a routine cleaning and the hygienist caught a small cavity I had no idea about. Caught it early, painless filling, in and out under an hour. Grateful.",
    rating: 5,
  },
  // Aiden Kim (idx 5) — fallback text for legacy demos that seeded him as a
  // completed review before this PR. Not in current REVIEW_SEEDS as completed
  // (he's the lapsed persona), but the backfill self-heal picks him up if a
  // legacy seed put a completed review on his row.
  5: {
    text:
      "It had been a while since I'd been to the dentist and I was honestly dreading the lecture. There wasn't one. They just cleaned my teeth, answered my questions, and booked me back in. That's exactly what I needed.",
    rating: 5,
  },
}

/** Patient indices whose reviews are pre-featured on the public site. The
 *  rest of the DEMO_REVIEW_TEXTS entries stay as "received but not yet
 *  featured" — legacy first-party rows, kept as historical patient-authored
 *  content. New featuring is Google-first (auto-featured 4★+ reviews); there
 *  is no manual/free-text testimonial path anymore. */
export const DEMO_FEATURED_PATIENT_IDXS: number[] = [0, 2, 6, 7, 11]

/** Build the legacy patient-linked testimonial JSON from DEMO_REVIEW_TEXTS +
 *  the seeded patients, applying the same "First L." + city denormalization
 *  the old first-party feature flow used. Every entry is real, patient-
 *  authored content — no hand-typed/free-text testimonials are seeded. */
export function buildDemoTestimonials(
  patientIds: string[],
  personas: Array<{ firstName: string; lastName: string; city: string | null; state: string | null }>,
) {
  const items: Array<{
    id: string
    quote: string
    authorName: string
    authorLocation: string | null
    authorPhotoUrl: string | null
    patientId: string | null
  }> = []
  let counter = 1
  for (const patientIdx of DEMO_FEATURED_PATIENT_IDXS) {
    if (!patientIds[patientIdx] || !personas[patientIdx]) continue
    const review = DEMO_REVIEW_TEXTS[patientIdx]
    if (!review) continue
    const p = personas[patientIdx]
    const initial = (p.lastName.trim()[0] ?? '').toUpperCase()
    const authorName = initial ? `${p.firstName} ${initial}.` : p.firstName
    const authorLocation =
      p.city && p.state ? `${p.city}, ${p.state}` : p.city || p.state || null
    items.push({
      id: `t${counter++}`,
      quote: review.text,
      authorName,
      authorLocation,
      authorPhotoUrl: null,
      patientId: patientIds[patientIdx],
    })
  }
  return items
}
