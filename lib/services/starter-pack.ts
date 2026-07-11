import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'
import {
  DEFAULT_FAQ_ITEMS,
  DEFAULT_PAYMENT_METHODS,
  type ClinicService,
  type ClinicStat,
  type ClinicFaqItem,
} from '@/lib/types/clinic-content'

/**
 * Day-0 COMPLETE FLOOR — the deterministic, AI-free starter pack that makes a
 * brand-new clinic's public site read as finished the moment the org exists.
 *
 * Founder goal: "every image field has an appropriate placeholder, every text
 * field has appropriate text, they shouldn't have to add anything anywhere for
 * it to not be empty… even start with a service or two selected." This module
 * fills the TEXT + SERVICE side of that; brand-tinted hero placeholders (in
 * `templates/modern/home.tsx`) cover the imagery side. A later wave layers AI
 * personalization on top of this floor.
 *
 * TRUST BOUNDARY (binding, from the launch audit): we NEVER pre-fill staff,
 * testimonials, accepted-insurance carriers, or financing partners — those
 * would be fake people / reviews / network claims. They stay hidden behind
 * strong Studio edit prompts. Numeric stats stay QUALITATIVE only (no invented
 * counts). Everything below is generic-but-genuinely-good content a real
 * clinic can ship verbatim or lightly edit.
 *
 * IDEMPOTENT BY CONTRACT: `applyStarterFloor` only writes a field that is still
 * null/empty, so re-running onboarding (or running the floor on a clinic that
 * already edited its copy) never clobbers human work. The STARTER_* constants
 * are exported so later code can detect "still untouched starter" vs
 * "human-edited" by equality.
 *
 * BEST-EFFORT BY CONTRACT: callers MUST wrap this in try/catch (mirrors
 * `seedClinicDay0Defaults`) so a seeding hiccup can never block checkout or
 * provisioning.
 */

/** Hero tagline. Reused verbatim as the template's H1 starter so render +
 *  stored data agree. Warm, anti-shame, value-prop-forward. */
export const STARTER_TAGLINE = 'Dental care that finally feels human.'

/** Warm 2-3 sentence About usable verbatim. `{city}` is substituted when the
 *  clinic's city is known; otherwise the sentence drops cleanly. */
export const STARTER_ABOUT_BASE =
  'We believe going to the dentist should feel like going to any other thoughtful, modern place — calm rooms, plain-English explanations, and no judgment about how long it has been. Whether it is your first cleaning in years or a routine check-up, you will be in good hands and out the door knowing exactly what happened and why.'

/** With-city variant tail. Kept separate so STARTER_ABOUT_BASE stays the
 *  equality anchor for the no-city case. */
export function starterAbout(city?: string | null): string {
  const trimmed = city?.trim()
  if (!trimmed) return STARTER_ABOUT_BASE
  return `${STARTER_ABOUT_BASE} We are proud to care for smiles across ${trimmed}.`
}

/**
 * Three QUALITATIVE trust chips — never invented numbers. Same shape + spirit
 * as the demo's `DEMO_STATS`, so a starter site and the showcase demo read
 * coherently. The "review_count" dynamic stat shows the live completed-review
 * count (0 on a fresh clinic renders as a clean "0", not a fake "8,000+").
 */
export const STARTER_STATS: ClinicStat[] = [
  { id: 'starter-stat-reviews', value: '0', label: 'happy reviews', dynamic: 'review_count' },
  { id: 'starter-stat-samweek', value: 'Same-week', label: 'appointments available' },
  { id: 'starter-stat-insurance', value: 'Most', label: 'insurance accepted' },
]

/**
 * The 6 best universal dental FAQ entries, persisted as real editable rows (so
 * they show up in the Studio FAQ editor, not just as render-time fallbacks).
 * Chosen across categories for breadth: how to book, anti-shame reassurance,
 * what to bring, dental anxiety, insurance, no-insurance. Sourced from the
 * shared `DEFAULT_FAQ_ITEMS` so copy never drifts; stable ids so a re-run can
 * detect "still starter".
 */
const STARTER_FAQ_IDS = [
  'faq-book-1', // How do I book my first visit?
  'faq-book-3', // It's been a while — is that okay?
  'faq-visit-1', // What should I bring?
  'faq-visit-3', // I'm nervous about the dentist
  'faq-ins-1', // Do you take my insurance?
  'faq-ins-2', // What if I don't have insurance?
] as const

export const STARTER_FAQ_ITEMS: ClinicFaqItem[] = STARTER_FAQ_IDS.map((id) => {
  const item = DEFAULT_FAQ_ITEMS.find((f) => f.id === id)
  if (!item) {
    // Defensive: a curated id drifting out of DEFAULT_FAQ_ITEMS should never
    // crash the floor. Fall back to a benign placeholder row (still editable).
    return { id, category: 'Booking', question: '', answer: '' }
  }
  return { ...item }
}).filter((f) => f.question)

/** Universal accepted-payment list. Reuses the shared DEFAULT_PAYMENT_METHODS
 *  (every US dental practice can honestly claim all five). */
export const STARTER_PAYMENT_METHODS: string[] = [...DEFAULT_PAYMENT_METHODS]

/** Warm, universal cancellation policy — NO dollar figures (we never invent a
 *  fee the clinic doesn't actually charge). Two sentences, ship-as-is. */
export const STARTER_CANCELLATION_POLICY =
  'Life happens — if you need to reschedule, just give us a call or send a message and we will find you a new time. We simply ask for 24 hours notice when you can, so we can offer the slot to another patient who needs it.'

/**
 * 4 canonical CORE services seeded instantly via the library 1A path (link by
 * `librarySlug`, NO `customized` blob — they render via token-substitution
 * immediately; a later AI wave can upgrade them). Slugs match the demo's core
 * set + are validated against SERVICE_LIBRARY_SEED so a slug rename can never
 * ship a dead link. Order is deliberate: the everyday dental home first.
 */
const STARTER_SERVICE_SLUGS = [
  'family-dental-care',
  'dental-exams',
  'dental-hygiene',
  'teeth-whitening',
] as const

/** Build the starter `ClinicService` rows from the canonical library. Pure —
 *  no DB. Exported so tests can assert the 4-service floor + resolver render. */
export function buildStarterServices(): ClinicService[] {
  const bySlug = new Map(SERVICE_LIBRARY_SEED.map((e) => [e.slug, e]))
  return STARTER_SERVICE_SLUGS.map((slug) => bySlug.get(slug))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .map((e) => ({
      // Stable, deterministic id so a re-run is recognizably "still starter".
      id: `starter-svc-${e.slug}`,
      librarySlug: e.slug,
      name: e.name,
      category: e.category,
      icon: e.icon ?? null,
    }))
}

export interface StarterFloorInput {
  displayName: string
  city?: string | null
  state?: string | null
}

/**
 * Fill the deterministic complete-site floor onto a clinic profile,
 * idempotently. Only writes a field that is still null / empty, so:
 *  - re-running onboarding never clobbers a clinic that already wrote copy,
 *  - a clinic that explicitly cleared a field won't have it re-seeded mid-edit
 *    (the only write path is the initial onboarding/provisioning, before the
 *    clinic touches the Studio).
 *
 * Returns a small summary for logging/tests. Never throws on "profile missing"
 * — it just no-ops (the caller's profile upsert must have run first).
 */
export async function applyStarterFloor(
  organizationId: string,
  input: StarterFloorInput,
): Promise<{ applied: boolean; fields: string[] }> {
  const [profile] = await db
    .select({
      tagline: clinicProfile.tagline,
      about: clinicProfile.about,
      stats: clinicProfile.stats,
      faq: clinicProfile.faq,
      paymentMethods: clinicProfile.paymentMethods,
      cancellationPolicy: clinicProfile.cancellationPolicy,
      services: clinicProfile.services,
    })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!profile) return { applied: false, fields: [] }

  const patch: Record<string, unknown> = {}
  const fields: string[] = []

  const isBlankString = (v: unknown): boolean =>
    v == null || (typeof v === 'string' && v.trim() === '')
  const isEmptyArray = (v: unknown): boolean =>
    v == null || (Array.isArray(v) && v.length === 0)

  if (isBlankString(profile.tagline)) {
    patch.tagline = STARTER_TAGLINE
    fields.push('tagline')
  }
  if (isBlankString(profile.about)) {
    patch.about = starterAbout(input.city)
    fields.push('about')
  }
  if (isEmptyArray(profile.stats)) {
    patch.stats = STARTER_STATS
    fields.push('stats')
  }
  if (isEmptyArray(profile.faq)) {
    patch.faq = STARTER_FAQ_ITEMS
    fields.push('faq')
  }
  if (isEmptyArray(profile.paymentMethods)) {
    patch.paymentMethods = STARTER_PAYMENT_METHODS
    fields.push('paymentMethods')
  }
  if (isBlankString(profile.cancellationPolicy)) {
    patch.cancellationPolicy = STARTER_CANCELLATION_POLICY
    fields.push('cancellationPolicy')
  }
  // Start with a service or two selected — only when the clinic has none yet.
  if (isEmptyArray(profile.services)) {
    const services = buildStarterServices()
    if (services.length > 0) {
      patch.services = services
      fields.push('services')
    }
  }

  if (fields.length === 0) return { applied: false, fields: [] }
  patch.updatedAt = new Date()
  await db.update(clinicProfile).set(patch).where(eq(clinicProfile.organizationId, organizationId))
  return { applied: true, fields }
}

// ─────────────────────────────────────────────────────────────────────────────
// "Still-starter" detection — the non-destructive-apply + needs-personalization
// contract. With the day-0 floor in place, a brand-new clinic's site is never
// EMPTY, so the legacy "no tagline AND no about AND 0 services" heuristic is
// always false. These helpers instead detect "untouched starter" by equality
// against the exported STARTER_* constants, so the AI interview can:
//   • overwrite a field only when it's still null/empty OR still the starter
//     value (preserving any human edit), and
//   • know whether the site still needs personalization at all.
// All pure — no DB — so they're trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

function blank(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

/** True when the tagline is still null/empty or still the starter sentence. */
export function isTaglineStillStarter(tagline: unknown): boolean {
  return blank(tagline) || (typeof tagline === 'string' && tagline.trim() === STARTER_TAGLINE)
}

/** True when the about is still null/empty or still one of the starter variants
 *  (with-city or base). */
export function isAboutStillStarter(about: unknown): boolean {
  if (blank(about)) return true
  if (typeof about !== 'string') return false
  const trimmed = about.trim()
  if (trimmed === STARTER_ABOUT_BASE) return true
  // The with-city variant is STARTER_ABOUT_BASE + a trailing sentence. Detect
  // by prefix so any city value counts as still-starter.
  return trimmed.startsWith(STARTER_ABOUT_BASE)
}

/** True when stats are still empty or still exactly the starter trio (by ids).
 *  The AI's qualitative stats overwrite these; a clinic that edited even one
 *  stat (different ids/content) is preserved. */
export function areStatsStillStarter(stats: unknown): boolean {
  if (stats == null || (Array.isArray(stats) && stats.length === 0)) return true
  if (!Array.isArray(stats)) return false
  const starterIds = new Set(STARTER_STATS.map((s) => s.id))
  if (stats.length !== STARTER_STATS.length) return false
  return stats.every((s) => {
    const id = (s as { id?: unknown })?.id
    return typeof id === 'string' && starterIds.has(id)
  })
}

/** True when the FAQ list is still empty or still exactly the starter set
 *  (by ids). */
export function isFaqStillStarter(faq: unknown): boolean {
  if (faq == null || (Array.isArray(faq) && faq.length === 0)) return true
  if (!Array.isArray(faq)) return false
  const starterIds = new Set(STARTER_FAQ_ITEMS.map((f) => f.id))
  if (faq.length !== STARTER_FAQ_ITEMS.length) return false
  return faq.every((f) => {
    const id = (f as { id?: unknown })?.id
    return typeof id === 'string' && starterIds.has(id)
  })
}

/** True when the clinic's services list is still empty or still exactly the
 *  4 starter rows (by their deterministic `starter-svc-*` ids). A clinic that
 *  added/removed/AI-customized a service has at least one non-starter id (or a
 *  different count) → preserved. */
export function areServicesStillStarter(services: unknown): boolean {
  if (services == null || (Array.isArray(services) && services.length === 0)) return true
  if (!Array.isArray(services)) return false
  const starter = buildStarterServices()
  const starterIds = new Set(starter.map((s) => s.id))
  if (services.length !== starter.length) return false
  return services.every((s) => {
    const id = (s as { id?: unknown })?.id
    return typeof id === 'string' && starterIds.has(id)
  })
}

/**
 * Whether the clinic's site still needs the AI personalization pass — drives
 * the /welcome re-entry banner + every-cohort routing. True when:
 *   • the interview was never completed (no completed_at), OR
 *   • the tagline is still the starter sentence (a strong "untouched" signal).
 * A clinic that finished the interview OR hand-wrote a real tagline reads as
 * personalized and stops being routed/nagged.
 *
 * Pure — pass the two clinic_profile fields the caller already loaded.
 */
export function siteNeedsPersonalization(input: {
  onboardingInterviewCompletedAt: Date | string | null | undefined
  tagline: string | null | undefined
}): boolean {
  if (!input.onboardingInterviewCompletedAt) return true
  return isTaglineStillStarter(input.tagline)
}
