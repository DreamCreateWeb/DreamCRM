# The Marketing Engine — research foundation + build log

**Status: RESEARCH PHASE (2026-08-26).** This is the research foundation for
Dream Create's own growth program — the "marketing powerhouse" the owner
directed: social campaigns via the existing Zernio key, email marketing,
budget dials, and effectiveness monitors, all aimed at **driving self-serve
signups**. This doc follows the onboarding-overhaul pattern: research first,
owner rulings next, build log appended as slices ship. It runs in the same
owner-directed internal-tooling lane as the Dream Team program (outside the
docs/RELEASE.md product feature freeze; defects still go to the release
ledger).

Research method: five parallel web-research passes (2026-08-26) — buyer
behavior, comparable-company GTM, paid economics, email/outbound,
organic/SEO/AEO — grounded against the prior research in
docs/onboarding-overhaul.md Part 3 and DESIGN.md's positioning ruling
("outbound leads with savings; the website leads with identity"). Source
URLs and well-sourced-vs-inference flags are preserved inline. Numbers are
planning anchors, not gospel — most are vendor-published benchmarks.

---

## Part 0 — The math that governs everything

- **ACV ~$2,400** ($200/mo, one plan, transparent price, no-card 7-day trial).
- **CAC ceiling: ~$1,600–2,000** (8–10 months of revenue — the bootstrapped
  payback bar). **Healthy zone: $600–1,200.** (LTV:CAC ≥3:1, SMB payback
  medians ~11mo; getaleph.com, growthspreeofficial.com, ltvcacbook.com.)
- **Trial→paid is the master variable.** No-card opt-in trials convert
  **~9–18%** (vs 31–49% card-required; 1capture.io, userpilot.com). At 9%,
  almost no paid channel clears the ceiling; at 18%, nearly all of them do.
  **Instrument and improve trial→paid before scaling spend past ~$3k/mo.**
- **The cautionary tale is Weave**: sales-led SMB dental at scale = **~$23k
  CAC on ~$5.9k ACV, ~32-month payback**, NRR fallen to ~92%
  (S-1/10-Q teardowns: alexandre.substack.com, stocktitan.net). That motion
  is structurally unavailable at $200/mo — and its ~11%/yr gross churn means
  dissatisfied switchers exist at scale, which is our pitch.

## Part 1 — The buyer, and where their attention lives

- **The dentist owns the decision; the office manager runs the evaluation
  and can veto.** Buying guides address "owners, office managers, DSO
  operators"; "will my team actually use it" is a top criterion
  (clouddentistry.com, uschamber.com). Marketing that only addresses the
  dentist misses the person doing the research. AADOM (~25k reach) is the
  office-manager institution.
- **Peer recommendation is the default first step**; then review sites
  (Capterra/Software Advice — 285+ dental products listed — skewing PMS).
  Switching resistance is extreme at the PMS layer (~1.8%/mo churn,
  months-long migrations; retentioncheck.com) — but DreamCRM rides
  NexHealth and never asks for a rip-and-replace. Say so early and often.
- **Where attention actually lives:**
  - **Facebook groups**, with formal vendor doors: **Dental Nachos**
    (~20–60k dentists depending on measure; paid sponsor program with
    member discount codes — dentalnachos.com/sponsors) and **Nifty Thrifty
    Dentists** (~17k+; the group's premise IS vendor group-deals —
    arguably the best single community fit for a $200 self-serve offer).
    Organic promo is screened out; these are **paid sponsorship channels**.
  - **DentalTown** (~250k members, forums + magazine + Farran's podcast);
    vendors may participate transparently per its published Vendor's Guide;
    paid media kit exists.
  - **Podcasts** — the entrepreneurial-owner tier: Bulletproof Dental
    Practice, The Dentalpreneur, Shared Practices, Thriving Dentist,
    Dentistry Uncensored. Small absolute audiences, exactly the buyer.
    (Weave and NexHealth both publish "best dental podcasts" listicles —
    the incumbents treat these listeners as their audience.)
  - **Dental Economics** — the business-of-dentistry publication of record
    (~90–100k print, ~170k monthly online, weekly newsletter).
  - **Events**: Chicago Midwinter (20k+, the big buying show), Hinman
    (~13k; ~$15–40k all-in exhibitor estimate), **Voices of Dentistry**
    (~500–1,000 but literally the dental-podcast-audience conference —
    densest room of entrepreneurial owners per dollar). ADA SmileCon is
    **dead after 2025**. Reddit r/Dentistry: listening only, promo removed.
  - **Study clubs** (Seattle Study Club: 250+ clubs / 6k members): a
    referral-partner surface, not an ad surface.
- **Cold-channel receptivity**: cold email lands in gatekept generic
  inboxes (info@/frontdesk@ — the OM reads it; write for HER pains:
  recall, no-shows, phones). Cold calls hit the same gatekeeper; dentists
  are chairside by design (phone works warm — which is what Call Mode
  already is). Direct mail: staff opens everything (practitioner lore,
  consistent); B2B dimensional mail benchmarks 5–15% response.

## Part 2 — What the comparables did (and which playbook is ours)

- **Copy Jane App and Mangomint, not Weave/Podium.**
  - **Jane App** (PT/chiro; bootstrapped, profitable, ~600 people): PLG in
    a clinical vertical works when **the patient-facing surface is the
    viral loop** — other practitioners saw Jane's public booking page and
    asked "what is that?" Transparent published pricing + the switching-
    cost killers: free data migration, free 1-on-1 onboarding, unlimited
    support. ~85% of growth from referral/WOM.
  - **Mangomint** (salon; $25M ARR doubling, 110% NRR, NPS 72): **100%
    PLG — mandatory no-card 21-day trial, no contracts, never cold-called
    anyone.** ~60% of leads organic; "Powered by Mangomint" on booking
    pages seen by 1M+ monthly bookers; bought a niche media site (The
    Salon Business, $2M) as an evergreen content asset that got MORE
    valuable in the LLM-search era (growthunhinged.com — best source).
  - **Weave** started as a productized SERVICE (calling dentists' overdue
    patients at night) before it was software; scaled sales-led into the
    brutal economics above. **NexHealth** ($550/mo sales-led) nearly died
    at $24k MRR; runs a **$500 cash dentist-referral program** (check
    mails after the referred practice launches) — the vertical's referral
    benchmark. **RevenueWell** is the purest channel story: launched
    *through* Patterson Dental's rep network → ~13,000 practices.
    **Flex Dental** is integration-led: built for Open Dental users,
    $299/mo transparent, listed on Open Dental's authorized-vendor page —
    that listing (vendor.relations@opendental.com) + the OD forum/FB user
    group is a free, self-selecting surface of tech-forward independents.
    **Kleer**: free-to-launch, monetize per member. **Dental
    Intelligence**: analytics evangelism on the podcast/speaker circuit.
- **Channel motions available in dental**: distributor reps
  (Schein/Patterson — not day-one accessible), **consultants/coaches at
  ~30% rev-share** (Savvy Agents pays 30%; StreamDent runs a consultant
  affiliate tier — a $200/mo product supports this), PMS ecosystems
  (Open Dental vendor list is free; we already ride NexHealth), review
  sites, referral programs ($500/launched-practice benchmark).
- **What to steal (synthesis):** no-card trial + published price + the AI
  employee AS the concierge onboarding (docs/onboarding-overhaul.md
  already proved this resolution) · patient-facing clinic sites/booking
  pages as the "Powered by" growth loop · own the honest-pricing content
  ground nobody in dental occupies · 3–5 consultant partners + OD vendor
  listing before ad spend · ~$500-or-months-free referral program ·
  documented migration paths off Weave et al.

## Part 3 — Paid channel economics (the dial settings)

| Channel | Verdict | Budget floor | Target / kill bar |
|---|---|---|---|
| Google Search — competitor "alternative/pricing" terms | **Best first dollar** ($3–12 CPC, 2–4× conversion; land on /compare) | $1–2k/mo | CPC <$12; cost/trial <$120 |
| Google Search — category terms ("dental practice management software": incumbent-contested, expect $10–20 CPC) | Viable, watch closely | $3–5k/mo (smart-bidding needs ≥15 conv/30d; below that run manual exact-match) | cost/trial <$150 or pause |
| Meta — custom audiences + lookalikes seeded from the NPPES/Hunter list, + retargeting | **Second channel** (77–83% of dentists on FB vs ~33% LinkedIn) | $1–2k/mo | trial $30–80 (discount lead-form leads ~50%) |
| Capterra/Software Advice PPC (Dental Software category exists) | Test AFTER ~10 reviews (reviews gate conversion) | $500/mo | lead <$60 |
| Podcast / newsletter / community sponsorships (Nachos, Nifty Thrifty, Dental Economics, DentalTown) | Opportunistic, negotiate flat | $200–1,500/spot | ≤$50 CPM equivalent |
| YouTube / GDN | Retargeting only | $500/mo | — |
| LinkedIn ads | **Skip** (thin audience, $94–202 CPL, ACV floor far above ours) | — | — |

- **Legal note on competitor bidding**: bidding the keyword is legal in the
  US; don't use the trademark in ad copy or confusing landing pages.
- **Meta policy watch**: Meta's Jan-2025 health/wellness data restrictions
  auto-classify domains; a "dental"-saturated site can lose lower-funnel
  conversion events. We're B2B software, not care delivery — likely
  appealable — but **check Events Manager classification early**.
- **The master dial rule** (owner-tunable): blended CAC = spend ÷ new
  paying clinics on a 60-day lag. **>$1,600 two consecutive months → dial
  down; <$800 → dial up.** Per-channel bars per the table.

## Part 4 — Email & outbound (one red flag, three winners)

- **🚨 RESEND'S AUP PROHIBITS COLD EMAIL — verified** at
  resend.com/legal/acceptable-use: *"unsolicited messages of any kind,
  including cold outreach, purchased lists, or scraped contact data"* is
  prohibited; all mail must be opted-in. The Hunter's NPPES-crawled list
  is exactly "scraped contact data." Running the prospect drip on Resend —
  even on `send.dreamcreateweb.com` — risks termination of the **whole
  account, which carries all DreamCRM transactional + clinic email.**
  Amazon SES's AUP is equivalent, so the inert fallback isn't an out.
  Current cold-email practice is also many small warmed mailboxes on
  lookalike throwaway domains (10–30 sends/mailbox/day), not one
  subdomain. **Owner decision required** (see Part 7 Q1): either (a) move
  cold sending to cold-native infra (Instantly/Smartlead-style, separate
  domains, firewalled from dreamcreatestudio.com) and treat it as a small
  test, or (b) demote cold email entirely and let the channels below carry
  outbound. Expected cold-email yield is modest either way: healthcare
  replies run 2–4% optimistic, ~0.5% on strict scraped-list measurement —
  roughly **1–3 conversations per 1,000 sends** into gatekept inboxes.
- **Legality map** (unchanged by the above): cold B2B email is CAN-SPAM
  legal (opt-out law; accurate headers, physical address, unsubscribe
  honored ≤10 days; keep subjects boringly literal — WA's CEMA private
  right of action). Cold calls to business landlines: legal, DNC is
  consumer-only — **calling is the legally cleanest outbound**, and Call
  Mode already exists. **Cold SMS: never** (TCPA written-consent, no B2B
  carve-out; 10DLC bans it independently). Ringless voicemail: treat as a
  call needing consent (FCC 2022) — skip.
- **The three outbound winners, ranked:**
  1. **The practice grader lead magnet** — a public "grade my practice's
     online presence" tool (website/GBP/reviews score). Interactive tools
     out-convert static lead magnets ~2.4×; HubSpot's Website Grader is
     the canonical case ("millions in signups"). **The Hunter already
     computes exactly these scores** — this is the enrichment engine
     pointed outward as a front door. Opt-in by construction → runs on
     existing compliant Resend rails, feeds nurture, and warm signals feed
     `promoteProspectByEmail` (built, currently called by nothing).
  2. **Dimensional ("lumpy") direct mail to hot-scored prospects** — B2B
     cold-list response ~4.4%, dimensional 5–15% at $5–25/piece vs cold
     email's ~1–2‰ effective; staff opens every package; NPPES provides
     verified practice mailing addresses free; the deal-room data
     personalizes; the `/d/[token]` self-booking link closes.
  3. **Call Mode** — legally cleanest, already built, phone-first queue
     for un-emailable hot prospects already exists.
- **Opt-in nurture**: benchmark-style reports convert 15–30% on dedicated
  landing pages; newsletter subscriber→trial is low-single-digit percent
  per quarter (plan accordingly). Send window for offices: Tue–Thu
  mid-morning local.

## Part 5 — Organic: SEO, AEO, and what the Zernio key is actually for

- **The AI-answer shift is the headline**: G2's March-2026 survey
  (n=1,076): **51% of B2B software buyers now START research with an AI
  chatbot** (29% in Apr 2025), 71% use them, 69% changed vendor choice on
  AI guidance, **one-third bought from a vendor they'd never heard of**
  (prnewswire.com/G2). LLMs cite extractable facts: transparent pricing
  tables, comparison pages, schema, review-site profiles, Reddit/forum/
  LinkedIn content. **Our posted $200 price vs quote-only incumbents is
  structurally ideal AEO material.**
- **Winnable SEO ground for a new domain (provably — thin-domain
  challengers rank there today: Emitrr, The Molar Report):**
  1. **Competitor pricing/alternatives pages** — Weave ($249/mo + $750
     setup, hidden fine print) and NexHealth (~$450/mo quote-only) hide
     pricing; "weave pricing/alternatives" queries are being won by small
     sites. BOFU comparison pages convert **~5–7.5%** vs 1–2% general
     organic; honest "when they're better" sections + real dated pricing
     tables + FAQ schema; one page per competitor + roundup listicles
     (which double as LLM feed-stock). We already have /compare × 5 —
     extend + add schema + pricing pages.
  2. **Free tools** (the grader; a recall-revenue calculator) — link
     magnets a blog can't match.
  3. **Practice-growth long-tail library** — "dental recall scripts",
     "recall text templates", "dental membership plan pricing", "how to
     get more dental patients": low competition, exactly our buyer, being
     won by small vendor blogs today; each page carries original
     templates/data (helpful-content compliant). Authored via the
     platform blog (DB-backed — an owner/session task, per DESIGN.md).
  4. **The template gallery as content** — "best dental websites /
     examples" listicles with real screenshots of our four templates per
     practice type (original assets = pSEO that survives).
- **What Google now punishes (don't build)**: city-swap programmatic pages
  ("dental software in [city]" — no geo intent anyway) and mass scaled AI
  content (Mar+Aug 2025 updates cut 50–80% of traffic from scaled-AI
  sites). AI-assisted is fine; scaled-thin is not.
- **The Zernio key, calibrated honestly**: dentists use IG/TikTok as
  practice marketers and clinical-content consumers — **automated IG/
  TikTok posting for B2B reach is near-worthless**. The defensible
  automated surfaces: **YouTube long-form** (the one platform with organic
  B2B search intent; feeds Google video results) and **LinkedIn** (now a
  top-5 ChatGPT citation source — AEO value even with thin dentist
  usage). Instagram at low effort as a **portfolio** (beautiful dental
  website before/afters — credibility asset, not acquisition). Skip
  TikTok. Facebook reach happens via paid group sponsorship, not organic
  posting.
- **Review-site presence is AEO infrastructure**: claim G2/Capterra
  listings, then systematically ask happy clinics for reviews (~10 reviews
  unlocks Capterra PPC viability and LLM citations both).

## Part 6 — The ranked channel strategy (synthesis)

**Tier 0 — the sensor layer (prerequisite; the dials are blind without
it):** www pageview + UTM attribution (the beacon exists and mounts only
on clinic sites today — zero marketing-site pageviews recorded) · the
visit→signup→trial→activated→paid funnel with per-channel attribution ·
lead capture on the marketing site (there is currently NONE — every CTA
is a bare /signup link) · wire `promoteProspectByEmail` to real producers.

**Tier 1 — free/cheap, compounding (start immediately):**
1. Comparison/pricing/alternatives content + AEO hygiene (schema,
   G2/Capterra claims + review engine, roundups).
2. The practice grader (front door + lead magnet + link magnet + Hunter
   warm-signal producer).
3. The "Powered by DreamCRM" loop on clinic public sites/booking pages
   (the Jane/Mangomint engine — needs an owner product ruling, Part 7 Q2).
4. Referral program (~$500 or 2–3 months free per launched practice) +
   3–5 dental-consultant partners at ~30% rev-share + Open Dental
   vendor-page listing.
5. Long-tail content library via the platform blog + template-gallery
   listicles; opt-in newsletter on compliant Resend rails.

**Tier 2 — paid, behind the dials (unlock as Tier 0 proves trial→paid):**
Google competitor terms → Meta NPPES-lookalikes + retargeting → category
search terms → Capterra (post-reviews) → community/newsletter/podcast
sponsorships (Nachos, Nifty Thrifty, Dental Economics, DentalTown,
podcast tier) → YouTube retargeting.

**Tier 3 — outbound (the Hunter, re-aimed):** Call Mode + self-booking
(cleanest, built) · dimensional mail to hot prospects · cold email only
per the owner's Part 7 Q1 ruling, on separate infra, as a bounded test.

**The skip list (deliberate):** LinkedIn ads · IG/TikTok automation for
B2B demand · city-page pSEO · mass thin AI content · cold SMS / ringless
voicemail · SmileCon · big-hall booths before revenue supports them
(Voices of Dentistry is the exception worth watching).

## Part 7 — Owner rulings (2026-08-26; all four questions answered)

1. **Cold email: DEMOTED.** The Hunter's email drip stays OFF and does not
   move to separate infra. Outbound = grader + dimensional mail + Call
   Mode. The drip code stays inert (like the SES driver) — revisit only if
   Tiers 1–2 underfill the pipeline, and then only on cold-native
   infrastructure fully firewalled from dreamcreatestudio.com.
2. **"Powered by DreamCRM": APPROVED.** Quiet footer credit on clinic
   public sites, UTM-tagged link back to www (its clicks are a first-class
   attribution channel), per-clinic off switch, suppressed in preview/
   template frames. The Jane/Mangomint loop.
3. **Budget: $1,000/mo initial**, grows only if it produces results (the
   dial philosophy applied from dollar one). Implication from Part 3: at
   $1k, do NOT split channels — concentrate the whole budget on Google
   Search competitor/alternative terms (the one channel whose floor fits),
   manual/exact-match since smart bidding won't get signal at this level,
   and judge on cost-per-trial <$120. Meta unlocks at the next budget
   step, not by splitting this one.
4. **Grader: the full composite** — website + Google Business listing +
   reviews. The stronger hook wins over the faster ship; the Hunter's
   enrichment + the GBP listing-truth machinery already compute all three
   axes.

## Part 8 — The build order (from the rulings)

1. **Slice 1 — the sensor layer + the loop (Tier 0 + ruling #2):**
   marketing-site pageview/UTM capture (the www twin of the clinic-site
   beacon) → first-touch attribution stamped at signup → the funnel read
   (visit → signup → trial → activated → paid, per channel) → the
   Powered-by footer credit as the first attributed channel.
2. **Slice 2 — the grader** (composite website + GBP + reviews; public
   tool page + email-gated full report → opt-in nurture + Hunter warm
   signal via promoteProspectByEmail).
3. **Slice 3 — the dials cockpit**: per-channel spend entry + CAC/
   cost-per-trial computation against the funnel + the master dial rule
   rendered as recommendations (the machine reports; the owner moves
   money).
4. **Slice 4 — content engine**: comparison/pricing pages + schema, review
   engine (G2/Capterra asks), long-tail library via the platform blog,
   Zernio YouTube/LinkedIn surfaces.

## Build log

**Slice 1 — the sensor layer + the loop (SHIPPED 2026-08-26, migration
0154).** The dials now have eyes:

- **Pure core `lib/marketing-attribution.ts`** (client/edge-safe — the
  middleware, the beacon, and the signup stamp all share it so
  classification can never disagree between surfaces): the CLOSED channel
  registry (`powered_by · google_ads · meta_ads · organic_search ·
  ai_assistant · social · email · referral · direct` — closed because the
  dials will hang budgets off these ids; unknowns degrade to
  referral/direct, never a new string; `ai_assistant` is first-class
  because 51% of buyers now start in a chatbot and those referrers would
  vanish into 'referral' exactly when they matter), total deterministic
  `classifyChannel` (explicit markers > paid click ids > UTM intent >
  referrer inference > direct; self-referrals read as direct), the
  first-touch cookie codec (versioned, capped, and PARSE TREATS THE COOKIE
  AS CLIENT INPUT — a tampered payload degrades to "no attribution",
  never a poisoned stamp), and `buildPoweredByUrl`.
- **The sensor**: `marketing_pageview` (0154) — the www twin of
  `site_pageview`, same no-PII daily-rollup ethos plus the channel
  dimension, platform-global by design (no organizationId — the
  prospecting-schema precedent); `MarketingViewBeacon` in the marketing
  layout reports RAW facts (path/query/referrer) and the `/api/site-view`
  marketing branch classifies server-side, so a client can't invent a
  channel. First-touch attribution lives in an httpOnly cookie set by the
  MIDDLEWARE (before any client JS), strict first-touch (never
  overwritten — the dials measure what STARTED the journey), 90-day
  memory, no per-visitor DB rows anywhere.
- **The stamp**: `clinic_profile.signup_attribution` jsonb (0154), written
  ONCE by `submitOnboarding` at profile creation (deliberately not in the
  conflict-update set — a re-submit must never re-stamp), read back only
  through `parseSignupAttribution`. Null = honest "untracked" (pre-sensor,
  blocked cookie, managed provisioning) — reported, never guessed.
- **The loop (owner ruling #2)**: `PoweredBy` credit rendered once in the
  clinic-site layout below every template's footer, palette-var styled so
  it harmonizes with any design, UTM-tagged (`utm_source=powered_by`,
  campaign = the clinic slug) so its clicks are a first-class channel,
  `rel="nofollow"` (widget-link SEO safety — the value is the click, not
  PageRank), suppressed in gallery frames + coming-soon. Off switch:
  `hide_powered_by` (0154), live-instant toggle on Website → Design (NOT
  draft-staged — it's a platform-loop setting, not site content).
- **The read**: `lib/services/acquisition.ts` `getAcquisitionReport` —
  visits per channel from the rollup + signups graded through the SAME
  `lib/trial.ts` rules the billing wall uses (this report and the app can
  never disagree about who is paying), demo orgs excluded, every registry
  channel present zeros-and-all; the Acquisition panel on the platform
  /marketing home (honest empty state; quiet channels stay off the table
  but untracked signups always show with their reason).
- Suite 6,703 green + `pnpm build` clean. Next: slice 2, the composite
  grader.
