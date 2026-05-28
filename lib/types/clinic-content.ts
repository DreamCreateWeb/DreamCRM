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
 */
export interface ClinicStat {
  id: string
  value: string
  label: string
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

export const DEFAULT_SERVICES: ClinicService[] = [
  { id: 'cleanings', name: 'Cleanings & Exams', icon: '🦷' },
  { id: 'cosmetic', name: 'Cosmetic Dentistry', icon: '✨' },
  { id: 'restorations', name: 'Restorations', icon: '🔧' },
  { id: 'emergency', name: 'Emergency Care', icon: '😌' },
]
