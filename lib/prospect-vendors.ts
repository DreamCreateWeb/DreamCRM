// Pure competitor/vendor detection for the deal room — fingerprint the
// orbital-layer tools a practice already runs from their site HTML, so a call
// can name exactly who we'd displace and roughly what they'd save by
// consolidating into DreamCRM. Grounded in the real dental vendor landscape
// (DESIGN.md: Weave, NexHealth, RevenueWell, Solutionreach, LocalMed,
// Podium, Birdeye, PBHS, ProSites…). No deps — unit-testable with fixtures.

export type VendorCategory =
  | 'booking'
  | 'reviews'
  | 'messaging'
  | 'forms'
  | 'marketing'
  | 'site'

export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  booking: 'Online booking',
  reviews: 'Reviews / reputation',
  messaging: 'Patient messaging',
  forms: 'Digital forms',
  marketing: 'Recall / marketing',
  site: 'Website / host',
}

interface VendorDef {
  name: string
  category: VendorCategory
  /** Typical practice monthly cost (USD) — rounded industry figure, not a quote. */
  estMonthly: number
  pattern: RegExp
}

// Fingerprints are matched against the raw site HTML. Costs are conservative
// mid-range monthly figures a solo/small practice typically pays.
const VENDORS: VendorDef[] = [
  // Booking
  { name: 'NexHealth', category: 'booking', estMonthly: 300, pattern: /nexhealth/i },
  { name: 'LocalMed', category: 'booking', estMonthly: 250, pattern: /localmed/i },
  { name: 'Zocdoc', category: 'booking', estMonthly: 300, pattern: /zocdoc/i },
  { name: 'Modento', category: 'booking', estMonthly: 300, pattern: /modento/i },
  { name: 'Yapi', category: 'booking', estMonthly: 250, pattern: /yapi(app)?/i },
  { name: 'Flex / Dental Intelligence', category: 'booking', estMonthly: 350, pattern: /dentalintel|dental-intelligence|getflex/i },
  { name: 'CareStack', category: 'booking', estMonthly: 300, pattern: /carestack/i },
  // Reviews / reputation
  { name: 'Birdeye', category: 'reviews', estMonthly: 300, pattern: /birdeye/i },
  { name: 'Podium', category: 'reviews', estMonthly: 400, pattern: /podium\.com|podium\.js|widget\.podium/i },
  { name: 'Swell', category: 'reviews', estMonthly: 250, pattern: /swellcx|getswell/i },
  { name: 'Grade.us', category: 'reviews', estMonthly: 110, pattern: /grade\.us/i },
  // Messaging / webchat
  { name: 'Weave', category: 'messaging', estMonthly: 400, pattern: /getweave|weavehelp|weave\.com/i },
  { name: 'tawk.to', category: 'messaging', estMonthly: 20, pattern: /tawk\.to/i },
  { name: 'Intercom', category: 'messaging', estMonthly: 75, pattern: /intercom(cdn|\.io)/i },
  { name: 'Drift', category: 'messaging', estMonthly: 80, pattern: /drift\.com|js\.driftt/i },
  { name: 'LiveChat', category: 'messaging', estMonthly: 40, pattern: /livechatinc|livechat\.com/i },
  // Forms
  { name: 'JotForm', category: 'forms', estMonthly: 40, pattern: /jotform/i },
  { name: 'Formstack', category: 'forms', estMonthly: 80, pattern: /formstack/i },
  { name: 'mConsent', category: 'forms', estMonthly: 150, pattern: /mconsent/i },
  // Marketing / recall
  { name: 'RevenueWell', category: 'marketing', estMonthly: 350, pattern: /revenuewell/i },
  { name: 'Solutionreach', category: 'marketing', estMonthly: 350, pattern: /solutionreach/i },
  { name: 'Lighthouse 360', category: 'marketing', estMonthly: 350, pattern: /lighthouse\s*360|lh360/i },
  { name: 'Demandforce', category: 'marketing', estMonthly: 350, pattern: /demandforce/i },
  { name: 'PatientPop / Tebra', category: 'marketing', estMonthly: 500, pattern: /patientpop|tebra/i },
  // Website / host (dental web vendors + generic builders)
  { name: 'PBHS', category: 'site', estMonthly: 300, pattern: /pbhs/i },
  { name: 'ProSites', category: 'site', estMonthly: 250, pattern: /prosites/i },
  { name: 'Officite', category: 'site', estMonthly: 250, pattern: /officite/i },
  { name: 'TNT Dental', category: 'site', estMonthly: 400, pattern: /tntdental/i },
  { name: 'Wix', category: 'site', estMonthly: 30, pattern: /wixstatic|wix\.com\/website/i },
  { name: 'Squarespace', category: 'site', estMonthly: 30, pattern: /squarespace/i },
]

export interface DetectedVendor {
  name: string
  category: VendorCategory
  estMonthly: number
}

/** Fingerprint the vendors a practice runs from their site HTML (deduped). */
export function detectVendors(html: string): DetectedVendor[] {
  const out: DetectedVendor[] = []
  const seen = new Set<string>()
  for (const v of VENDORS) {
    if (seen.has(v.name)) continue
    if (v.pattern.test(html)) {
      seen.add(v.name)
      out.push({ name: v.name, category: v.category, estMonthly: v.estMonthly })
    }
  }
  return out
}

export interface ConsolidationEstimate {
  vendors: DetectedVendor[]
  /** Sum of detected vendors' typical monthly cost. */
  detectedMonthly: number
  /** How many distinct orbital-layer categories they're paying across. */
  categoryCount: number
  /** DreamCRM plan we'd compare against (the tier that covers what they run). */
  ourPlanName: string
  ourPlanPrice: number
  /** Estimated monthly savings from consolidating (never negative). */
  monthlySavings: number
}

// DreamCRM plans (mirrors stripe-config PLANS pricing — kept minimal + pure).
const PLAN_PRICE = { basic: 150, pro: 250, premium: 500 } as const

/**
 * Turn detected vendors into the consolidation story: what they likely pay
 * across separate tools vs. one DreamCRM plan. Picks the plan tier by what
 * they run (any marketing/recall or 3+ categories → Premium; any booking/
 * reviews/messaging/forms → Pro; site only → Basic).
 */
export function consolidationEstimate(vendors: DetectedVendor[]): ConsolidationEstimate {
  const detectedMonthly = vendors.reduce((sum, v) => sum + v.estMonthly, 0)
  const categories = new Set(vendors.map((v) => v.category))
  const hasMarketing = categories.has('marketing')
  const nonSite = Array.from(categories).filter((c) => c !== 'site')

  let plan: keyof typeof PLAN_PRICE = 'basic'
  if (hasMarketing || categories.size >= 3) plan = 'premium'
  else if (nonSite.length > 0) plan = 'pro'

  const ourPlanPrice = PLAN_PRICE[plan]
  return {
    vendors,
    detectedMonthly,
    categoryCount: categories.size,
    ourPlanName: plan === 'basic' ? 'Basic' : plan === 'pro' ? 'Pro' : 'Premium',
    ourPlanPrice,
    monthlySavings: Math.max(0, detectedMonthly - ourPlanPrice),
  }
}
