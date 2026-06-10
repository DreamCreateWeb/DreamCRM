// Vendor comparison content for /compare/[vendor]. Written to a strict
// honesty bar: every claim about a competitor is either from their own
// public materials, their documented pricing/tiering, or independent
// review aggregations — hedged with "reported" where it's third-party.
// Each page leads with what the competitor genuinely does well (we sell
// against five strong incumbents; pretending otherwise reads as spin),
// carries a verify-with-vendor disclaimer, and never invents numbers.

export type MatrixValue = 'yes' | 'no' | 'partial'

export interface MatrixRow {
  feature: string
  /** Us. */
  dreamcrm: MatrixValue
  dreamcrmNote?: string
  /** Them. */
  vendor: MatrixValue
  vendorNote?: string
}

export interface VendorComparison {
  slug: string
  name: string
  /** One-line category description of the vendor. */
  category: string
  /** Reported pricing band with sourcing hedge. */
  reportedPricing: string
  summary: string
  /** What they genuinely do better — 3 honest bullets. */
  theirStrengths: Array<{ title: string; body: string }>
  /** Where we win — concrete, verifiable in our product. */
  ourStrengths: Array<{ title: string; body: string }>
  matrix: MatrixRow[]
  bottomLine: string
}

/** Rows shared by every comparison — what WE are; per-vendor values vary. */
function baseMatrix(vendor: {
  website: [MatrixValue, string?]
  booking: [MatrixValue, string?]
  portal: [MatrixValue, string?]
  inbox: [MatrixValue, string?]
  reviews: [MatrixValue, string?]
  recall: [MatrixValue, string?]
  shop: [MatrixValue, string?]
  careers: [MatrixValue, string?]
  pms: [MatrixValue, string?]
  phones: [MatrixValue, string?]
  sms: [MatrixValue, string?]
  contract: [MatrixValue, string?]
}): MatrixRow[] {
  return [
    { feature: 'Practice website included, edit-in-place editor', dreamcrm: 'yes', dreamcrmNote: 'Click any section of your live site to change it', vendor: vendor.website[0], vendorNote: vendor.website[1] },
    { feature: 'Online booking from live availability', dreamcrm: 'yes', dreamcrmNote: 'Visit-type rules prevent wrong-length bookings', vendor: vendor.booking[0], vendorNote: vendor.booking[1] },
    { feature: 'Patient portal in the clinic’s own branding', dreamcrm: 'yes', dreamcrmNote: 'Per-feature toggles + preview-as-patient', vendor: vendor.portal[0], vendorNote: vendor.portal[1] },
    { feature: 'Unified patient inbox (portal + email threads)', dreamcrm: 'yes', vendor: vendor.inbox[0], vendorNote: vendor.inbox[1] },
    { feature: 'Review collection & website testimonials', dreamcrm: 'yes', dreamcrmNote: 'Patient-written reviews feed your site', vendor: vendor.reviews[0], vendorNote: vendor.reviews[1] },
    { feature: 'Recall & reactivation campaigns', dreamcrm: 'yes', dreamcrmNote: 'Email today; SMS on the roadmap', vendor: vendor.recall[0], vendorNote: vendor.recall[1] },
    { feature: 'Online store + membership plans', dreamcrm: 'yes', dreamcrmNote: 'Stripe payouts to the clinic’s own bank', vendor: vendor.shop[0], vendorNote: vendor.shop[1] },
    { feature: 'Careers page + applicant tracking', dreamcrm: 'yes', vendor: vendor.careers[0], vendorNote: vendor.careers[1] },
    { feature: 'PMS sync', dreamcrm: 'yes', dreamcrmNote: 'Open Dental two-way via the official API only', vendor: vendor.pms[0], vendorNote: vendor.pms[1] },
    { feature: 'VoIP phones', dreamcrm: 'no', dreamcrmNote: 'Keep your existing phone system', vendor: vendor.phones[0], vendorNote: vendor.phones[1] },
    { feature: 'Two-way SMS texting', dreamcrm: 'no', dreamcrmNote: 'On the roadmap — not available yet', vendor: vendor.sms[0], vendorNote: vendor.sms[1] },
    { feature: 'Month-to-month, no contract', dreamcrm: 'yes', dreamcrmNote: '$99–199/mo flat', vendor: vendor.contract[0], vendorNote: vendor.contract[1] },
  ]
}

export const COMPARISONS: VendorComparison[] = [
  {
    slug: 'weave',
    name: 'Weave',
    category: 'Phones-first patient communication platform',
    reportedPricing: 'Reported ~$249–$449/mo per location depending on tier, plus phone hardware (third-party pricing reviews, 2026)',
    summary:
      'Weave is the category leader in dental phone systems — VoIP with caller-context screen pops, texting, and payments. It is genuinely excellent at the phone. But it has no practice website, no patient portal, and its online scheduling and digital forms are gated to its higher tiers. DreamCRM starts where the phone call ends: the website that wins the patient, the portal they come back to, and one inbox for everything they send you.',
    theirStrengths: [
      { title: 'The phone experience', body: 'VoIP with patient context on screen when the phone rings is Weave’s signature, and nothing in DreamCRM replaces your phone system.' },
      { title: 'Two-way texting today', body: 'Mature SMS with missed-call auto-text. Our SMS channel is still on the roadmap — if texting is your #1 need today, Weave is ahead.' },
      { title: 'Payment terminals', body: 'Card-present terminals and text-to-pay tied into the comms stack.' },
    ],
    ourStrengths: [
      { title: 'The website is included', body: 'Weave assumes you already have a website vendor. DreamCRM ships one — with an edit-in-place studio, SEO plumbing, and AI copy help — replacing that retainer entirely.' },
      { title: 'A real patient portal', body: 'Confirm, self-reschedule, forms, balances, online payment — in your branding, with per-feature toggles. Weave has no patient portal.' },
      { title: 'Everything in the base price', body: 'Weave gates online scheduling and digital forms to its Elite tier per its published pricing. In DreamCRM, booking and forms arrive at Pro ($149/mo) with no per-location phone hardware.' },
      { title: 'Shop & memberships', body: 'Whitening kits and in-house membership plans sold from your own site — no equivalent in Weave.' },
    ],
    matrix: baseMatrix({
      website: ['no', 'Assumes an existing site'],
      booking: ['partial', 'Gated to Elite tier per published pricing'],
      portal: ['no'],
      inbox: ['partial', 'Calls + SMS unified; no portal/email patient threads'],
      reviews: ['yes'],
      recall: ['yes', 'Via texting tiers'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes', 'Broad PMS coverage via its sync app'],
      phones: ['yes', 'Their core product'],
      sms: ['yes'],
      contract: ['partial', 'Reported annual agreements + hardware'],
    }),
    bottomLine:
      'Keep your phones — Weave’s or anyone’s. If what you’re missing is the patient-facing layer (website, booking, portal, reviews, shop) at a flat monthly price, that is exactly the layer DreamCRM is.',
  },
  {
    slug: 'nexhealth',
    name: 'NexHealth',
    category: 'Patient booking & sync platform',
    reportedPricing: 'Custom quotes; reported ~$300+/mo per location in third-party reviews (2025–2026)',
    summary:
      'NexHealth built an impressive real-time synchronizer across many PMSs and sells booking, forms, reminders, and payments on top of it. Its breadth of PMS coverage is real. The trade-offs: no website, no clinic-branded portal, custom pricing, and a sync approach that writes into PMS databases directly on server-based systems — something Open Dental has publicly cautioned its customers about. DreamCRM syncs Open Dental exclusively through the official API, so every write lands in your audit trail.',
    theirStrengths: [
      { title: 'PMS breadth', body: 'NexHealth syncs many PMSs today — Dentrix, Eaglesoft, and more. DreamCRM ships Open Dental now, with Dentrix Ascend in approval; if you run another PMS, NexHealth covers it sooner.' },
      { title: 'Real-time sync', body: 'Their synchronizer pushes changes near-instantly. Our Open Dental sync is scheduled polling plus instant write-backs — honest minutes, not seconds.' },
      { title: 'Developer API', body: 'A public API product lets DSOs build custom tooling on the sync layer.' },
    ],
    ourStrengths: [
      { title: 'Official-API sync only', body: 'Open Dental publicly warns customers about third parties inserting data directly into its database. Every DreamCRM write goes through OD’s sanctioned API and shows up in your audit trail — nothing touches the database behind its back.' },
      { title: 'The storefront comes with it', body: 'Website, blog, SEO dashboard, careers page, shop — NexHealth assumes you have vendors for all of that. We replace them.' },
      { title: 'A portal patients recognize', body: 'NexHealth’s patient pages run under its own brand. DreamCRM’s portal wears your logo, your colors, your voice — with clinic-controlled feature toggles.' },
      { title: 'Published flat pricing', body: '$99–199/mo on the pricing page, month-to-month. No discovery call required to learn the number.' },
    ],
    matrix: baseMatrix({
      website: ['no'],
      booking: ['yes', 'Their core strength'],
      portal: ['partial', 'NexHealth-branded patient pages, not clinic-branded'],
      inbox: ['partial', 'Messaging tied to reminders'],
      reviews: ['yes'],
      recall: ['yes'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes', 'Many PMSs; direct-DB writes on server installs'],
      phones: ['no'],
      sms: ['yes'],
      contract: ['partial', 'Custom quotes; terms vary'],
    }),
    bottomLine:
      'If you run a PMS we don’t sync yet and need real-time today, NexHealth is the pragmatic pick. If you run Open Dental and want the whole patient-facing stack — site, booking, portal, reviews, shop — synced through the official API at a flat price, that’s DreamCRM.',
  },
  {
    slug: 'revenuewell',
    name: 'RevenueWell',
    category: 'Dental marketing & communication suite',
    reportedPricing: 'Reported ~$349/mo single location for the marketing platform; add-ons priced separately (third-party reviews, 2025–2026)',
    summary:
      'RevenueWell is a mature dental marketing suite — campaigns, reminders, and a patient portal (PatientConnect365) with configurable features. It earned its install base. But its portal settings are vendor-branded and coarse (its own docs describe toggles that disable a function while leaving the link visible), the website is an add-on service, and the stack is priced as a platform plus add-ons. DreamCRM ships the same jobs as one product with toggles that fully remove what you turn off.',
    theirStrengths: [
      { title: 'Marketing automation depth', body: 'Years of dental campaign tooling — postcards, email sequences, social posting — broader than our email-first recall engine today.' },
      { title: 'Phone & add-on ecosystem', body: 'Optional phone, virtual visits, and forms add-ons let practices assemble a bigger bundle from one vendor.' },
      { title: 'PMS coverage', body: 'Long-standing sync with the major server PMSs.' },
    ],
    ourStrengths: [
      { title: 'Toggles that actually hide', body: 'RevenueWell’s own help docs note disabling portal payments leaves the payments link visible to patients. In DreamCRM, off means gone — no dead links in front of patients.' },
      { title: 'Preview as a patient', body: 'One click shows you the portal exactly as a patient sees it with your saved settings. No competitor we surveyed documents this.' },
      { title: 'The website is the product, not an add-on', body: 'Edit-in-place studio, blog, SEO dashboard, careers, and shop are in the subscription — not a separately-sold service.' },
      { title: 'One flat price', body: '$99–199/mo total versus a platform fee plus per-feature add-ons.' },
    ],
    matrix: baseMatrix({
      website: ['partial', 'Offered as an add-on service'],
      booking: ['yes'],
      portal: ['partial', 'PatientConnect365 — vendor-branded; coarse toggles'],
      inbox: ['partial'],
      reviews: ['yes'],
      recall: ['yes', 'Deeper channel mix today (incl. postcards)'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes'],
      phones: ['partial', 'Add-on'],
      sms: ['yes'],
      contract: ['partial', 'Reported annual terms common'],
    }),
    bottomLine:
      'If postcard-and-SMS marketing depth is the deciding factor today, RevenueWell has more channels. If you want the patient-facing system — site, booking, a portal patients actually like, reviews, shop — as one honest product, DreamCRM does that for less.',
  },
  {
    slug: 'solutionreach',
    name: 'Solutionreach',
    category: 'Patient reminders & engagement (the category veteran)',
    reportedPricing: 'Reported ~$329/mo per location; setup fees reported by reviewers (2025–2026)',
    summary:
      'Solutionreach effectively invented automated patient reminders and still runs reliable SMS at serious scale. Twenty years in, the product is deep on messaging and surveys but dated around it: no website product, a legacy portal, and reviewer complaints about contracts and sync misfires. DreamCRM is the modern stack around the same jobs — with the website and portal included and month-to-month terms.',
    theirStrengths: [
      { title: 'Reminder reliability at scale', body: 'Battle-tested SMS/email reminder infrastructure with two decades of dental cadence built in.' },
      { title: 'Surveys & NPS tooling', body: 'Built-in patient satisfaction surveys are more developed than anything we ship today.' },
      { title: 'Broad PMS sync', body: 'Mature sync agents across the major server PMSs.' },
    ],
    ourStrengths: [
      { title: 'The modern patient surface', body: 'A warm, mobile-first portal with self-reschedule, forms, and online payments — versus a legacy portal experience.' },
      { title: 'Website + SEO + careers + shop included', body: 'Solutionreach is comms-only; we replace the website vendor, the job board, and the storefront too.' },
      { title: 'No contract', body: 'Reviewers consistently cite Solutionreach’s term contracts. DreamCRM is month-to-month; leave whenever, your content exports with you.' },
      { title: 'One inbox', body: 'Portal messages and patient email merge per patient; reminders are one thread of a relationship, not the product.' },
    ],
    matrix: baseMatrix({
      website: ['no'],
      booking: ['partial', 'Request-based scheduling in places'],
      portal: ['partial', 'Legacy portal'],
      inbox: ['partial', 'SMS-centric'],
      reviews: ['yes'],
      recall: ['yes', 'Their heritage'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes'],
      phones: ['partial', 'Add-on offerings'],
      sms: ['yes', 'Best-in-class depth'],
      contract: ['no', 'Term contracts reported by reviewers'],
    }),
    bottomLine:
      'For pure reminder volume over SMS today, the veteran still delivers. For everything a patient actually touches — your website, booking, portal, reviews — and a price you can cancel monthly, DreamCRM is the modern answer.',
  },
  {
    slug: 'adit',
    name: 'Adit',
    category: 'All-in-one practice communications & analytics',
    reportedPricing: 'Reported ~$399/mo bundles per location (vendor materials & third-party reviews, 2025–2026)',
    summary:
      'Adit pitches the same consolidation story we do — replace your stack, save thousands a year — and bundles VoIP, texting, forms, analytics, and call tracking. The difference is which half of the practice each of us consolidates. Adit consolidates the phone room: calls, call tracking, internal chat. DreamCRM consolidates the patient-facing storefront: website, booking, portal, reviews, shop. Adit has no patient portal and treats websites as an agency service.',
    theirStrengths: [
      { title: 'Phones + call tracking', body: 'VoIP with marketing call attribution is Adit’s core; we deliberately don’t do phones.' },
      { title: 'Practice analytics depth', body: 'Adit Pulse digs into PMS production metrics; our analytics intentionally stop where the PMS’s clinical numbers begin.' },
      { title: 'Aggressive bundling', body: 'A lot of modules per dollar if you adopt the full Adit stack including phones.' },
    ],
    ourStrengths: [
      { title: 'The patient-facing half', body: 'A real website product with edit-in-place studio, a clinic-branded portal, online store, memberships, careers — none of which Adit ships as product.' },
      { title: 'Self-serve everything', body: 'Sign up, your site and dashboard exist in minutes, and every word of your site is yours to edit — no agency queue.' },
      { title: 'Official-API Open Dental sync', body: 'Two-way through OD’s sanctioned API with every write in your audit trail.' },
      { title: 'Lower flat price', body: '$99–199/mo versus reported ~$399 bundles — because we don’t carry a phone network.' },
    ],
    matrix: baseMatrix({
      website: ['partial', 'Agency-built sites as a service'],
      booking: ['yes'],
      portal: ['no'],
      inbox: ['partial', 'Calls + SMS centric'],
      reviews: ['yes'],
      recall: ['yes'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes'],
      phones: ['yes', 'Core product'],
      sms: ['yes'],
      contract: ['partial', 'Bundle terms vary'],
    }),
    bottomLine:
      'If the phone room is your bottleneck, Adit consolidates it well. If the patient-facing storefront is what needs fixing — the website, the booking, the portal patients keep using — that’s the half DreamCRM owns, at half the reported price.',
  },
]

export function getComparison(slug: string): VendorComparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug)
}

export const COMPARISON_DISCLAIMER =
  'Competitor details reflect public vendor materials and independent reviews as of June 2026 and may change — verify specifics with each vendor. We aim to be scrupulously fair: every vendor on this page is good at something, and we say so.'
