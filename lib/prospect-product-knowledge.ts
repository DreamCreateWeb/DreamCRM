// The single source of product truth fed into EVERY prospecting AI surface —
// the cold email, the reply draft, the pre-demo brief, the call talking
// points. Before this existed, each prompt knew only a one-line description
// ("a dental website + patient-communication platform") and was then asked to
// handle objections and sell — so it stayed generic or invented facts. This
// grounds all of them in the real platform: what it is, what it costs, how it
// wins, and — critically — its honest limits, so the AI never overpromises.
//
// UPDATE THIS FILE when the platform, pricing, or positioning changes; it is
// the ONE place the whole outbound engine's product knowledge lives. Pure
// (no server-only) so the pure prompt builders can import it.

/** Full product knowledge — for the high-value sonnet demo brief. */
export const PRODUCT_KNOWLEDGE = `ABOUT THE PRODUCT YOU ARE SELLING — know this cold; use it as the source of truth and never contradict or exceed it.

WHAT IT IS
DreamCRM (built by Dream Create) is an all-in-one, dental-only patient-relationship platform: a modern clinic website + online booking + patient CRM + automated Google reviews + recall & marketing + digital intake forms + a clinic-branded patient portal + online shop & membership plans + practice analytics. It WRAPS the practice's existing practice-management system (PMS) — it does not replace it.

THE WEDGE (why a practice switches)
A typical dental practice juggles 5-10 separate tools (website host, booking widget, review tool, forms vendor, patient messaging, marketing/recall) costing $800-2,000/mo. DreamCRM consolidates that whole "orbital layer" into ONE product for $200/mo (founding practice rate; regularly $500) — usually saving ~$1,000/mo — while the practice keeps the PMS its team already knows. It is dental-only: every default, template, and integration is built for dental, not a generic CRM (generic tools get dismissed by dentists).

PRICING (7-day free trial, no credit card; annual billing = 2 months free)
- ONE plan, everything included — $200/mo at the founding practice rate (regularly $500; the rate stays locked for as long as they subscribe; annual $2,000 = 2 months free): clinic website on their own domain with the edit-in-place Website Studio + AI copy assistant, online booking with live availability, patient records/appointments/reminders, website-leads queue + unified patient messages, digital intake forms, clinic-branded patient portal, reviews collection + website testimonials, blog + SEO dashboard, recall & outreach campaigns, practice analytics, online shop + membership plans (payouts to the clinic's bank), careers page + applicant tracking, two-way Open Dental PMS integration, priority support.
- Never frame the founding rate as a pre-release or early-access discount, and never imply the platform is unfinished — it's finished software that keeps growing; founding practices lock the rate and new modules land free.

DIFFERENTIATORS
- Dental-only specialization — not a generic website/CRM tool.
- Wrap, don't replace — keep your PMS; we're the relationship layer on top, with two-way Open Dental sync and embed slots for tools you won't switch.
- The website is the trunk — booking, forms, shop, portal, and reviews all live on the clinic's OWN branded site, not a third-party destination.
- Google-first reviews auto-loop — a completed visit auto-sends a review request and new Google reviews auto-feature on the site.
- Done-for-you — we build the site and stand up the system; it stays editable in place any time.

WHO IT'S FOR
Independent and small-group dental practices — especially ones with no website, a dated/non-mobile site with no online booking, or a fine site but few Google reviews / quiet social.

HONEST LIMITS (state these plainly — NEVER imply otherwise)
- It is NOT a PMS: no charting/odontogram, treatment plans, procedure or insurance-claim handling, or clinical notes. It sits on top of the PMS.
- Text/SMS is not live yet — patient communication today is email + the patient portal (SMS is on the roadmap).
- Two-way PMS sync is Open Dental today; other PMSs (Dentrix, Eaglesoft, etc.) are on the roadmap, not shipped.

OBJECTIONS → HONEST RESPONSES
- "We already have a website" → We replace the host and add booking, reviews, patient portal, forms, and marketing on top — editable yourself in minutes. Most practices are paying 5-6 vendors we fold into one.
- "We already use [a PMS]" → Perfect, keep it. We wrap it (two-way with Open Dental) and never touch your charts or claims.
- "We're too busy to switch" → The orbital layer switches in weeks, not months (no insurance claims to rebuild), and we build the website for you.
- "How much / is it worth it?" → You're likely paying $800-2,000/mo across separate tools; we consolidate for $200/mo (founding rate, regularly $500) and typically save ~$1,000/mo.
- "Do you do texting?" → Not yet — email + patient portal today, SMS on the roadmap. Say it honestly.`

/** Condensed knowledge — for the token-conscious haiku cold email + reply draft. */
export const PRODUCT_KNOWLEDGE_SHORT = `ABOUT THE PRODUCT (source of truth — never exceed or contradict): DreamCRM (by Dream Create) is a dental-only, all-in-one patient-relationship platform — clinic website + online booking + patient CRM + automated Google reviews + recall/marketing + intake forms + branded patient portal + online shop/memberships + analytics — that WRAPS a practice's existing PMS (two-way Open Dental), it does NOT replace it. It consolidates the 5-6 separate tools a practice pays $800-2,000/mo for into one plan with everything included at $200/mo — the founding practice rate, regularly $500, locked for as long as they stay (7-day free trial, no card; annual $2,000 = 2 months free; never framed as a pre-release discount) — typically saving ~$1,000/mo. Edge: dental-only; the website is the trunk (booking/forms/portal live on their own branded site); Google-first reviews auto-loop; we build the site for them. HONEST LIMITS — never overpromise: it's NOT a PMS (no charts, claims, or clinical notes); SMS texting is NOT live yet (email + portal today).`

/** The owner-editable "brain": a product-knowledge override + battle cards.
 *  Mirrors ProspectingConfig['brain'] but declared here so this pure module
 *  stays import-free of the config types. */
export interface ProspectBrain {
  productOverride: string
  battleCards: Array<{ competitor: string; angle: string }>
}

/** Render battle cards as a promptable block (empty string when none). */
function battleCardBlock(cards: ProspectBrain['battleCards']): string {
  const clean = cards.filter((c) => c.competitor.trim() && c.angle.trim())
  if (clean.length === 0) return ''
  const lines = clean.map((c) => `- vs ${c.competitor.trim()}: ${c.angle.trim()}`).join('\n')
  return `\n\nCOMPETITIVE BATTLE CARDS (how we win against specific rivals — use the matching one only when that competitor comes up; never name a rival unprompted):\n${lines}`
}

/**
 * The product knowledge to actually feed a prompt: the owner's override when
 * they've written one (else the canonical default), with their battle cards
 * appended. This is THE accessor every prospecting AI surface should call so a
 * single Settings edit reshapes the whole outbound engine's pitch.
 */
export function effectiveProductKnowledge(
  brain: ProspectBrain | null | undefined,
  opts: { short?: boolean } = {},
): string {
  const override = brain?.productOverride?.trim() ?? ''
  const base = override || (opts.short ? PRODUCT_KNOWLEDGE_SHORT : PRODUCT_KNOWLEDGE)
  return base + battleCardBlock(brain?.battleCards ?? [])
}

export type OutreachSegmentKey = 'no_website' | 'weak_website' | 'weak_presence'

/** The angle to lead with for a given prospect segment. */
export function segmentAngle(segment: OutreachSegmentKey | null | undefined): string {
  switch (segment) {
    case 'no_website':
      return 'This practice has NO website — patients literally cannot find or book them online. Lead with: we build the site AND run booking, reviews, and patient communication on it.'
    case 'weak_website':
      return "This practice's site is dated / not mobile-friendly / has no online booking. Lead with: a modern site they can edit themselves, plus online booking and reviews on autopilot."
    case 'weak_presence':
      return 'The site is fine but reviews and social are thin. Lead with: reviews on autopilot, recall campaigns, and social — filling the top of their funnel.'
    default:
      return ''
  }
}
