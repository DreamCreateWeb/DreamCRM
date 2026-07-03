// Client-safe demo-skin type — the prospect-branded presenter overlay.
// Purely cosmetic: chrome surfaces render the prospect's name/brand over
// the seeded Dream Dental demo org. ZERO database writes; the cookie is the
// entire state (the demo org contains real patients + hand-tuned seed data
// that must never churn per demo).

export interface DemoSkin {
  prospectId: string
  clinicName: string
  brandColor?: string
  city?: string
  logoUrl?: string
}

export const DEMO_SKIN_COOKIE = 'demo_skin'
