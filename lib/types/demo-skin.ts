// Client-safe demo-skin type — the prospect-branded presenter overlay.
// Purely cosmetic: chrome surfaces render the prospect's name/brand over
// the seeded Dream Dental demo org. ZERO database writes; the cookie is the
// entire state (the demo org contains real patients + hand-tuned seed data
// that must never churn per demo).

export interface DemoSkin {
  prospectId: string
  clinicName: string // ≤80
  brandColor?: string // #hex6 only
  city?: string // ≤60
  logoUrl?: string // https only, ≤300
  /** Their current site — the "↗ their current site" button + compare left pane. */
  websiteUrl?: string // https only, ≤200
  /** Top verified gaps (≤4 × ≤80 chars) — the panel's per-beat ammunition. */
  weaknesses?: string[]
  /** "Dr. Maria Garza" → "Maria" — {firstName} talk-track substitution. */
  officialFirstName?: string // ≤40
  /** Which demo story to lead with (lib/types/demo-script.ts) — the panel
   *  falls back to the full tour when absent/unknown. */
  track?: string
}

export const DEMO_SKIN_COOKIE = 'demo_skin'

/** Hard ceiling on the serialized cookie — browsers cap ~4KB per cookie and
 *  we share the header with the session; the builder drops optional fields
 *  (weaknesses → logoUrl → websiteUrl) until it fits. */
export const DEMO_SKIN_MAX_BYTES = 2000
