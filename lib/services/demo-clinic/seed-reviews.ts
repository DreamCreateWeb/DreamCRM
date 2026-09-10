import 'server-only'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { DEMO_REVIEW_TEXTS } from './reviews-data'

// Review requests and their completed/pending mix.

/**
 * Seed Reviews & Reputation demo content. Lays down the clinic review
 * config (Google Place ID + Healthgrades URL) and a curated set of
 * review_request rows covering every funnel state. Idempotent —
 * checks existing config and patient ids before inserting.
 */
export async function seedReviewsForOrg(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
  configExists: boolean,
  existingPatientRequestIds: Set<string>,
): Promise<{ configAdded: boolean; requestsAdded: number }> {
  const dayMs = 24 * 60 * 60 * 1000
  let configAdded = false
  let requestsAdded = 0

  // Seed config (Dream Dental's "Google Place ID" — visibly fake but
  // well-formed, so the public landing page renders the right URL even
  // though the deep link won't resolve in dev). The healthgrades/facebook
  // handles mirror the demo SLUG (acme-dental-demo, deliberately unchanged by
  // the Acme→Dream Dental rename), so they stay slug-consistent.
  if (!configExists) {
    await db.insert(schema.clinicReviewConfig).values({
      organizationId: orgId,
      googlePlaceId: 'ChIJDemo000000000_DreamDental',
      healthgradesUrl: 'https://www.healthgrades.com/dental-practice/acme-dental-demo',
      facebookPageId: 'acme-dental-demo',
      yelpBusinessSlug: null, // opt-in only; the demo keeps it off
      minDaysBetweenRequests: 365,
      // NPS surveys ON in the demo (the pulse section + toggle showcase);
      // demo orgs never actually send.
      npsEnabled: 1,
      // The redesigned Google-first loop: auto-ask immediately on completion,
      // auto-feature 4★+ Google reviews, offer the private-feedback path.
      autoSendEnabled: 1,
      autoSendDelayHours: 0,
      featureMinStars: 4,
      starGateEnabled: 1,
      showPrivateFeedback: 1,
    })
    configAdded = true
  }

  // Curated review_request seeds covering every funnel state, with seven
  // `completed` rows so /reviews/received demos a realistically populated
  // table. The persona/site/timing mix below is index-aligned to demo
  // personas. Five of the seven completed rows are pre-promoted to the
  // public site via DEMO_FEATURED_PATIENT_IDXS (rendering as "✓ Featured");
  // the other two stay unfeatured so the "Feature on website" CTA on
  // /reviews/received has live targets. ALL completed rows carry full
  // review text on review_request.reviewText (sourced from DEMO_REVIEW_TEXTS)
  // so the staff member can read the patient's actual words.
  //
  //   [0] Mia        — completed Google      · 5d ago   (featured)
  //   [7] Noah       — completed Healthgrades · 12d ago (featured)
  //   [2] Charlotte  — completed Google      · 18d ago  (featured)
  //   [6] Emma       — completed Facebook    · 22d ago  (featured)
  //   [11] Mason     — completed Google      · 35d ago  (featured)
  //   [1] Liam       — completed Healthgrades · 8d ago  (NOT featured — demo CTA target)
  //   [12] Ava       — completed Google      · 28d ago  (NOT featured — demo CTA target)
  //   [3] Marcus     — sent + clicked        · 3d ago   (bouncing back)
  //   [4] Sophia     — sent                  · 1d ago   (not opened yet)
  //   [8] Olivia     — skipped (staff opted out)
  //   [9] Ethan      — failed (email bounce)
  interface ReviewSeed {
    patientIdx: number
    status: 'sent' | 'clicked' | 'completed' | 'skipped' | 'failed'
    daysAgo: number
    selectedSite?: 'google' | 'healthgrades' | 'facebook' | 'yelp'
    /** When set, this completed row is a PRIVATE-feedback submission (the patient
     *  chose "tell us privately") — writes privateFeedback, never reviewText, so
     *  it lands in the private inbox and never on the public site. */
    privateFeedback?: string
    rating?: number
  }
  const REVIEW_SEEDS: ReviewSeed[] = [
    // Completed — featured on the public site (review text comes from
    // DEMO_REVIEW_TEXTS keyed by patientIdx — single source of truth)
    { patientIdx: 0, status: 'completed', daysAgo: 5, selectedSite: 'google' },
    { patientIdx: 7, status: 'completed', daysAgo: 12, selectedSite: 'healthgrades' },
    { patientIdx: 2, status: 'completed', daysAgo: 18, selectedSite: 'google' },
    { patientIdx: 6, status: 'completed', daysAgo: 22, selectedSite: 'facebook' },
    { patientIdx: 11, status: 'completed', daysAgo: 35, selectedSite: 'google' },
    // Completed with text — NOT yet featured (demo targets for the
    // "Feature on website" CTA on /reviews/received). Their reviewText still
    // gets seeded so the staff member can read the patient's words before
    // deciding to feature.
    { patientIdx: 1, status: 'completed', daysAgo: 8, selectedSite: 'healthgrades' },
    { patientIdx: 12, status: 'completed', daysAgo: 28, selectedSite: 'google' },
    // Private feedback — the patient chose "tell us privately" (never public).
    // Lands in the /reviews/received private-feedback inbox for follow-up.
    {
      patientIdx: 5,
      status: 'completed',
      daysAgo: 6,
      privateFeedback: 'Front desk wait felt a little long this visit, but the dentist was great and explained everything. Just wanted you to know!',
      rating: 3,
    },
    // Earlier funnel stages
    { patientIdx: 3, status: 'clicked', daysAgo: 3 },
    { patientIdx: 4, status: 'sent', daysAgo: 1 },
    { patientIdx: 8, status: 'skipped', daysAgo: 7 },
    { patientIdx: 9, status: 'failed', daysAgo: 4 },
  ]

  for (const seed of REVIEW_SEEDS) {
    if (seed.patientIdx >= patientIds.length) continue
    const patientId = patientIds[seed.patientIdx]
    if (!patientId) continue // persona missing — never fall back to a real patient
    if (existingPatientRequestIds.has(patientId)) continue

    const sentAt = seed.status === 'failed'
      ? null
      : new Date(now.getTime() - seed.daysAgo * dayMs)
    const clickedAt = seed.status === 'clicked' || seed.status === 'completed'
      ? new Date(now.getTime() - (seed.daysAgo - 0.25) * dayMs)
      : null
    const completedAt = seed.status === 'completed'
      ? new Date(now.getTime() - (seed.daysAgo - 0.5) * dayMs)
      : null

    // Patient's actual review words + rating, when this seed represents a
    // completed-with-text submission. Sourced from DEMO_REVIEW_TEXTS so the
    // /reviews/received UI shows real quote text staff can read (and the
    // featured public-site testimonials use the SAME text after promotion —
    // single source of truth).
    // Private-feedback rows write privateFeedback (never reviewText → never
    // public); regular completed rows carry the patient's public review text.
    const isPrivate = !!seed.privateFeedback
    const reviewEntry =
      seed.status === 'completed' && !isPrivate ? DEMO_REVIEW_TEXTS[seed.patientIdx] : undefined
    await db.insert(schema.reviewRequest).values({
      id: newId('revreq'),
      organizationId: orgId,
      patientId,
      appointmentId: null,
      requestedByUserId: null,
      channel: 'email',
      status: seed.status,
      sentAt,
      clickedAt,
      completedAt,
      selectedSite: isPrivate ? 'private_feedback' : (seed.selectedSite ?? null),
      reviewText: reviewEntry?.text ?? null,
      privateFeedback: seed.privateFeedback ?? null,
      rating: isPrivate ? (seed.rating ?? null) : (reviewEntry?.rating ?? null),
      token: `demo${seed.status.slice(0, 3)}${seed.patientIdx}_${Math.random().toString(36).slice(2, 10)}`,
      errorMessage: seed.status === 'failed' ? 'Email bounced (demo)' : null,
      createdAt: new Date(now.getTime() - seed.daysAgo * dayMs),
      updatedAt: new Date(now.getTime() - seed.daysAgo * dayMs),
    })
    requestsAdded++
  }

  return { configAdded, requestsAdded }
}
