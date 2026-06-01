// Public, client-safe content types stored as JSON on clinic_profile.
// Used by the clinic site editor and consumed by the public-facing template.

export interface ClinicService {
  id: string
  name: string
  description?: string | null
  icon?: string | null
}

export interface ClinicStaff {
  id: string
  name: string
  title?: string | null
  bio?: string | null
  photoUrl?: string | null
}

/**
 * Long-form patient testimonial card. Tend pattern — quote + first name +
 * neighborhood + optional photo. Long quotes (2–4 sentences) beat star
 * counts; first-name + city beats "Mary B., happy patient."
 *
 * `patientId` is the optional link back to a real CRM patient — set when a
 * testimonial was promoted from a completed `review_request`. `authorName`
 * and `authorLocation` are denormalized at promotion time (privacy-first
 * format `"First L."` + city), so the public site doesn't query patient on
 * every render and a renamed patient doesn't silently change their public
 * label. If the clinic wants the testimonial to track patient-record edits,
 * they can re-link from the editor; if they want a freeform display name
 * (e.g. they have permission to use a full name), they can edit it after
 * linking.
 */
export interface ClinicTestimonial {
  id: string
  quote: string
  authorName: string
  authorLocation?: string | null
  authorPhotoUrl?: string | null
  /** FK to `patient.id`. Optional — legacy / handcrafted testimonials live
   *  as free-text only. When set, the Reviews module's "received" surface
   *  shows this testimonial as "Featured ✓" and avoids double-promotion. */
  patientId?: string | null
}

/**
 * "Stat anchor" — a short, scannable trust signal pair. `value` is the
 * big-text headline ("8,000+", "Same-week", "Most"), `label` is the
 * follow-on phrase ("five-star reviews", "appointments", "insurance accepted").
 *
 * `dynamic` opts the stat into runtime substitution. v1 supports only
 * `'review_count'` — the public template replaces `value` with the live
 * count of completed `review_request` rows (formatted for display), so the
 * trust signal is honest instead of hardcoded. Static stats (no `dynamic`)
 * render their `value` as-is.
 */
export interface ClinicStat {
  id: string
  value: string
  label: string
  /** When set, the public template substitutes `value` with a runtime
   *  value. v1: only `'review_count'` is supported. */
  dynamic?: 'review_count' | null
}

/**
 * Office tour / interior photo. One row in the magazine-style gallery.
 * Caption optional.
 */
export interface ClinicOfficePhoto {
  id: string
  url: string
  alt?: string | null
  caption?: string | null
}

/** A blog post FAQ entry — rendered on the post + emitted as FAQPage JSON-LD. */
export interface BlogFaqItem {
  q: string
  a: string
}

/** A clinic-level FAQ entry — rendered on /faq and emitted as FAQPage JSON-LD.
 *  Distinct from BlogFaqItem (which is per-post). Universal dental defaults
 *  seeded by DEFAULT_FAQ_ITEMS; clinics edit in v1.1 via the settings UI. */
export interface ClinicFaqItem {
  id: string
  category: string
  question: string
  answer: string
}

export const FAQ_CATEGORIES = [
  'Booking',
  'Your Visit',
  'Insurance',
  'Office',
  'Billing',
] as const
export type ClinicFaqCategory = (typeof FAQ_CATEGORIES)[number]

export const DEFAULT_SERVICES: ClinicService[] = [
  { id: 'cleanings', name: 'Cleanings & Exams', icon: '🦷' },
  { id: 'cosmetic', name: 'Cosmetic Dentistry', icon: '✨' },
  { id: 'restorations', name: 'Restorations', icon: '🔧' },
  { id: 'emergency', name: 'Emergency Care', icon: '😌' },
]

/** Universal dental FAQ defaults — seeded by demo + used as fallback on
 *  /faq when a clinic hasn't customized. Written in the anti-shame,
 *  warm voice per DESIGN.md. */
export const DEFAULT_FAQ_ITEMS: ClinicFaqItem[] = [
  // Booking
  { id: 'faq-book-1', category: 'Booking', question: 'How do I book my first visit?',
    answer: 'You can book online any time, or give us a call during office hours. New patients usually find a time within the same week.' },
  { id: 'faq-book-2', category: 'Booking', question: 'What if I need to reschedule?',
    answer: 'No problem — just call or email us. We ask for 24 hours notice when you can, but we understand life happens.' },
  { id: 'faq-book-3', category: 'Booking', question: "It's been a while since I've seen a dentist — is that okay?",
    answer: "Absolutely. Whether it's been six months or six years, you'll be met without judgment. We meet you where you are." },
  // Your Visit
  { id: 'faq-visit-1', category: 'Your Visit', question: 'What should I bring to my first appointment?',
    answer: "A photo ID and your insurance card if you have one. We'll send any intake forms ahead of time so you can fill them out at home." },
  { id: 'faq-visit-2', category: 'Your Visit', question: 'How long will my visit take?',
    answer: 'A new-patient exam and cleaning usually runs about an hour. Routine cleanings after that take 45 minutes.' },
  { id: 'faq-visit-3', category: 'Your Visit', question: "I'm nervous about the dentist. Can you help?",
    answer: "You're not alone — dental anxiety is very common. Tell us when you book and at check-in; we'll go slowly, explain what's happening, and pause whenever you need." },
  // Insurance
  { id: 'faq-ins-1', category: 'Insurance', question: 'Do you take my insurance?',
    answer: 'We accept most major PPO plans. Call or message us with your carrier and plan name and we can verify before you come in.' },
  { id: 'faq-ins-2', category: 'Insurance', question: "What if I don't have insurance?",
    answer: "No insurance? No problem. We offer affordable self-pay options and can talk through what makes sense before treatment begins." },
  // Office
  { id: 'faq-off-1', category: 'Office', question: 'Where are you located and where do I park?',
    answer: 'You can find our address and directions in the footer of this page, along with parking details.' },
  { id: 'faq-off-2', category: 'Office', question: 'Is your office wheelchair accessible?',
    answer: 'Yes — our office is fully accessible. If there is anything we can do to make your visit easier, let us know when you book.' },
  // Billing
  { id: 'faq-bill-1', category: 'Billing', question: 'When do I pay?',
    answer: 'Payment is due at the time of your visit. If your insurance covers a portion, we will bill them directly and let you know your patient responsibility before we start.' },
  { id: 'faq-bill-2', category: 'Billing', question: 'Do you offer payment plans?',
    answer: "For larger treatment plans we can work with you on payment options — including third-party financing like CareCredit. Just ask, we don't bite." },
]
