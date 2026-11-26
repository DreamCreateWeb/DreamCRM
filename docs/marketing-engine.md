# The Marketing Engine — research foundation + build log

**Status: THE POWERHOUSE PROGRAM (Part 10, 2026-09-09) — foundation slices 1–4 shipped; Part 10 is the program of record.** **Part 11 (2026-11-23) is research pass 3: it CORRECTS several facts in Parts 0–10 (11.0) and carries the site audit — read 11.0 before quoting an earlier part.** This is the research foundation for
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

## Part 9 — The idea engine (the first backlog, 2026-09-09 — SUBSUMED by Part 10's master catalog; kept as the record of the first pulls)

Slices 1–4 were the FOUNDATION, not the program. The owner's framing:
"the best SaaS in the world doesn't stop at one or two funnels — we're
building a mega marketing engine." This part is the durable backlog every
session pulls from and adds to: each idea one line + mechanism, grouped by
engine role, ranked within its group (①=next, ②=soon, ③=when its gate
clears). Rules of the road: every new surface plugs into the EXISTING
spine (channel registry / attribution / dials — never a parallel sensor),
honesty laws apply to tools exactly as they do to the grader (no invented
numbers, hedged scenarios, unknown never scored), and anything
outbound-shaped respects the cold-email demotion.

**A. Attraction tools (free, grader-class link magnets)**
- ① **Recall-revenue calculator** (/roi) — patients × recall gaps × visit
  value = dollars left on the table; three honest win-back scenarios; the
  research's named next tool. → SHIPPED 2026-09-09 (build log).
- ② **Membership-plan price calculator** — companion to the 4b guide; your
  fees in, suggested price band + revenue projection out.
- ② **Software-spend consolidation calculator** — the /compare "math"
  table as an interactive: check the vendors you pay, see the annual
  delta vs $200/mo.
- ③ **Front-desk time calculator** — hours/week on confirmations, forms
  chasing, review asks → what the employee-not-tool does with them.
- ③ **Website speed/mobile mini-test** — a one-input teaser that upsells
  into the full grader (reuses the crawl stack; watch for abuse).
- ③ **"Best dental websites" template showcase** — the four site
  templates as an examples listicle with real screenshots (original
  assets = pSEO that survives); needs a screenshot pipeline.

**B. Grader deepening (the flagship magnet keeps earning)**
- ① **The delta re-grade** — "re-run your grade in 30 days" email with a
  before/after diff report; turns one visit into a relationship.
- ② **Email-me-my-report + forwardable report** — the report is already
  tokenized; add "send this to my office manager" (a second contact
  captured, honestly).
- ② **Competitor peek** — "the practice at #1 for your search scored X"
  (their PUBLIC signals only, framed as aspiration, never shaming a named
  practice on our site).
- ③ **Grader → Hunter enrichment backfill** — a grader run on a practice
  already in the Hunter enriches its record (partially shipped as the
  win-loop; deepen with the facts block).

**C. Sensors & attribution depth**
- ① **Grader-lead nurture** (the warm loop, NOT cold email): 2–3
  follow-ups to grader opt-ins — day 3 "your report's still here + the
  one fix that moves it most", day 14 "re-grade and see the delta";
  unsubscribe honored, sends through the platform identity.
- ② **Marketing-site conversion events** — signup-started vs
  signup-completed as funnel stages, so the dials can see form abandons.
- ② **Pricing-page capture** — "email me this comparison" soft-capture
  for not-ready-yet visitors (feeds nurture, channel-stamped).
- ③ **Self-reported "how did you hear about us"** at onboarding — the
  attribution cross-check for dark channels (podcasts, word of mouth);
  writes a *claimed* channel beside the *observed* one, never overwrites.

**D. Funnels & virality**
- ① **Partner-program marketing page** (/partners on www) — the referral
  partner machinery is BUILT (Stripe Express payouts, commission ledger)
  but has no public door; consultants/bookkeepers/dental CPAs are a
  standing referral channel begging for a page + application form.
- ② **Powered-by v2** — per-template placement polish + "website by
  DreamCRM" on portfolio-worthy client sites w/ opt-in showcase page.
- ② **The public template gallery as a funnel** — /templates on www
  showing the four designs (feeds A's showcase; each "use this design"
  lands in signup with the template preselected).
- ③ **Demo-practice guided tour** — the acme demo is public; a "tour
  mode" overlay (numbered beats, no login) turns it into a self-serve
  demo funnel with its own channel stamp.
- ③ **Founding-practice referral credit** — customer-refers-customer
  ($100 credit both sides class); needs >1 customer to matter, cheap to
  ship when it does.

**E. Content & AEO (compounding)**
- ① **More guides on the 4b rails** — next queries: "dental appointment
  reminder templates", "how to respond to negative dental reviews"
  (w/ real reply scripts), "dental website checklist", "dental practice
  KPIs that matter". Two per session keeps the library compounding.
- ② **Comparison roundups** — "Weave alternatives (2026)" listicle pages
  (one query family per page, links the per-vendor pages; LLM feedstock).
- ② **/docs deepening** — setup guides double as long-tail landing pages;
  audit titles/schema on the existing DOCS registry.
- ③ **Platform blog cadence** — in-app authoring (owner/session task);
  the Dream Team content-calendar generator could serve the PLATFORM org
  too (the machine writes its own marketing plan — needs the tenant-voice
  pass).

**F. Paid & channels (dials-gated — grow only on results)**
- ① **Launch the $1k Google competitor campaign** (owner action; land on
  /compare/*, judge cost/trial <$120 in the dials).
- ② **Meta custom audiences from the NPPES/Hunter list** — unlocks at the
  NEXT budget step per ruling #3, not by splitting the first $1k.
- ③ **Capterra/G2 PPC** — gated on ~10 reviews (which gates on having
  customers to ask; the review-ask engine ships at ~5 paying clinics).
- ③ **Podcast/newsletter sponsorships** (Nachos, Nifty Thrifty, Dental
  Economics) — owner-negotiated flat spots; the dials get a 'referral'
  spend row + a landing UTM per spot.

**G. Retention-as-marketing (the moat feeds the funnel)**
- ② **Public case-study engine** — once real clinics consent: the
  before/after DreamCRM story (grader delta + booked-visit lift) as
  landing pages; the honesty laws make these unusually credible.
- ③ **A "wall of love"** — G2/Google review embeds on /why once they
  exist.

## Part 10 — THE POWERHOUSE: the complete vision (research pass 2, 2026-09-09)

**Owner directive:** "the best SaaS in the world doesn't stop at one or two
funnels — we're building a mega marketing engine that will generate new
subscriptions." The four foundation slices (sensors, grader, dials,
content) and the first Part 9 pulls (ROI calculator, delta re-grade,
partner door, grader nurture) are the chassis. This part is the whole
machine, designed from a second research pass — five parallel deep
passes on 2026-09-09 (competitor GTM at scale · vertical-SaaS PLG
playbooks · the 2026 tool stack + compliance · the sized dental channel
map · AI-run growth engines + free tools); full reports with inline
sources live in `docs/research/marketing-engine-2026-09/` (`research-1…5-*.md`), and every
number below carries its flag (FACT / VENDOR CLAIM / EST / INFERENCE).

### 10.0 What the research settled — the ten facts the vision stands on

1. **"Large scale" in dental costs what Weave pays, and we must never
   pay it.** FY2025: $239M revenue, 39,625 locations, +4,628 net new,
   S&M $102.7M (43% of revenue), gross retention 89%, NRR 93% (SEC
   filings, FACT). That is ~$22k of S&M per NET-NEW location for a
   ~$540/mo ticket (arithmetic, INFERENCE) — a demo-gated inside-sales
   machine. At $200/mo the arithmetic forbids inside sales; only
   self-serve + partner + product-led pencil.
2. **Not one of 24 dental patient-engagement vendors is self-serve.**
   Every "Try for free" led to a consultation; only Podium, Flex, PbN
   (one tier), Emitrr and the marketplaces publish a price; real prices
   run 2–3× headline (Weave $348–497+ bundled, NexHealth ~$350/module,
   Solutionreach $400–800, DI ~$500 + $500 setup + 12 months). A public
   $200 with a card-free trial is the single largest open lane (FACT for
   the gates; VENDOR/3P for the prices).
3. **Referral is THE channel in clinic SaaS, and the winners engineer
   it.** Jane App: ~85% of new customers from existing-customer
   referrals (co-founder, FACT); Toast ~20%; Mangomint ~60% "organic";
   built on peer community + support so good it's the thing people
   mention + free migration/no contract + an ambassador layer. The
   market's bounty is standardized at **$500 per closed practice**
   (Weave $50+$500, NexHealth $25+$500, Swell $300), paid slowly and
   only to current customers (FACT).
4. **The consultant is the highest-leverage human in dentistry.**
   Fortune Management (150+ coaches, 15,000+ dentists, 400+ events/yr),
   Levin Group (30,000 practices, a 25k daily-tip list), ACT Dental,
   Dental A Team (1,000+ practices), Sandy Pardue, Teresa Duncan — in
   the building at every trigger, trusted by dentist AND office manager,
   and paid recurring referral fees by NexHealth/Podium/Birdeye/DI
   already (VENDOR CLAIMS on reach; FACT on the programs).
5. **Buying happens at trigger moments, and they are sized.** Owner
   changes ~5,000–8,000 locations/yr; scratch startups ~800–1,500/yr
   (each budgeting $2–3k/mo for software with no incumbent); PMS
   switches a few thousand/yr; front-desk/OM turnover touching 20,000+
   practices/yr; plus the continuous bad-review/Google-listing incident
   (INFERENCE from ADA HPI + BLS + lender data). Brokers (ADS: 42,000
   cumulative sales), lenders (BofA Practice Solutions, Provide) and
   dental IT/MSPs (Darkhorse 1,000+ dentists, Pact-One 3,000+ pros) are
   standing at every one of them.
6. **The reachable communities are few, dense, and bookable.** Nifty
   Thrifty Dentists (~40k; the group's premise IS vendor deals), Dental
   Nachos (~35k+; 20 tech + 12 marketing sponsors listed), DOMC (20,000+
   office managers, a new vendor-perk program), AADOM (1,100+ OMs at the
   conference, chapters), Dentaltown (~120k readers), Voices of Dentistry
   (7 owner-podcasts bundled: $6k/$10k/$17.5k), the top-5 owner podcasts
   (10–50k monthly each, ~$1.5–3.5k/host-read INFERENCE), DentistryIQ's
   Morning Briefing (45k daily). The big halls (Midwinter, Hinman,
   GNYDM: $15–40k booths) and DSO events are the wrong buyer for now.
7. **Free tools are wide open in dental.** Every incumbent "free audit"
   is a sales-appointment request answered by a human in 48h; nobody has
   a HubSpot-grade instant, ungated, shareable grader built from a
   practice's real public data (HubSpot Website Grader: 4M grades,
   ~40k backlinks — FACT), and nobody renders a practice's own content
   into a better site. We already own the crawler, brand capture,
   Places, SERP, four templates, and the grader.
8. **AEO/GEO is real, and it rewards exactly what incumbents refuse to
   do.** 30–50% of B2B evaluation queries now hit AI engines; 76% of
   AI-Overview citations come from top-10 organic; comparison pages,
   dated pricing tables, FAQs, review-site category pages, Reddit and
   YouTube are what gets cited; freshness drives ~83% of commercial
   citations; llms.txt is a confirmed dud (3P/FACT). Mangomint paid $2M
   for an "independent" software-comparison site and calls it their
   evergreen, AI-cited lead source (FACT).
9. **Autonomous marketing converged on "drafts, not sends."** Fully
   autonomous outbound failed in 2026 (11x ~70–80% churn past the break
   clause; Artisan's LinkedIn ban; "20k messages, zero meetings"), while
   hybrid propose-then-approve produced ~2.3× the revenue of AI-only at
   half the cost per opportunity; HubSpot Breeze, Agentforce, Intempt,
   Brand Brain all converged on approval gates + spend caps + audit
   trails (3P). That is, verbatim, the Dream Team's model — we already
   own the spine.
10. **The compliance lines are bright.** Cold email is CAN-SPAM-legal but
    banned by Resend/SES/SendGrid/Postmark AUPs (FACT); cold TEXTING a
    prospect is never legal without consent ($500–1,500/message, and our
    10DLC registration forbids it); calls must be human-dialed,
    DNC-scrubbed, no AI voice; California's B2B data exemption expired
    (2023) so the prospect DB needs a privacy notice; the FTC Consumer
    Reviews rule (16 CFR 465, active enforcement) bans sentiment-
    conditioned incentives AND review suppression — which reaches into
    the product's own star-gate (see 10.3); LinkedIn is suspension-first
    against automation; Google's 2026 core updates penalize scaled
    template content site-wide.

### 10.1 The thesis

> **DreamCRM is the only self-serve door in dentistry, and its marketing
> is run by the same AI staff it sells.**

Every incumbent is demo-gated, quote-priced, contract-bound and sold by
reps who need a $6k/yr ticket to care. Our product is already the thing
none of them has; the powerhouse's job is to make that visible at every
trigger moment, through every trusted human, on every surface a dentist
or office manager looks at — and to run itself under the owner's veto so
the whole machine costs one founder ~30 minutes on Monday and ~5 minutes
a day. The four positioning laws every surface obeys:

- **Say the price. Say "no contract, cancel from Settings, prorated to
  the day, your data exports." Above the fold, every time.** Every named
  complaint against a named incumbent (auto-renew, ETFs, non-prorated
  exits, mid-term hikes, percentage fees) is our headline by contrast.
- **Bribe for going live, never for a demo.** The market pays $50 gift
  cards for attention; we pay the front desk $50 when the first review
  request goes out (activation, not attention).
- **The consumer surface is the billboard.** More patient-facing surface
  per clinic than any incumbent (site, booking, portal, reminders,
  review landing, membership page) — every one carries a credit with a
  real offer.
- **Honesty is the moat.** Unknown never scored, no projected reviews or
  rank, scenarios not promises, cite BBB/Capterra not adjectives. The
  research says the incumbents' NPS is being spent on contracts; ours is
  the asset we compound.

### 10.2 The architecture — seven engines

**Engine 1 · THE DOORS (attraction surfaces).** Dozens of attributed
entrances, all feeding the one channel registry.
- *The Practice Scan — the spine.* The grader evolves into one canonical
  object: from a URL or Google listing, in <10s, an ungated 0–100 across
  Site / Google profile / Reviews / Booking / Reachability, a public,
  indexable, brand-safe report URL with an OG grade card (the 40k-
  backlink lesson), the "fix list" and the deeper facets gated on email.
  Facets bolted onto the same object over time: **"See your practice on
  DreamCRM"** (their services/team/hours rendered into the best-fit
  template with their logo and color — the Jane/Shopify viral moment,
  and "claim this site" boots the trial WITH the mockup as the website
  draft); **"You vs the 5 dentists nearest you"** (the Patient Prism
  cohort magnet, instant); the **GBP audit** (reuses the gbp_website_fix
  detector); the **reputation score with AI reply drafts on their actual
  unanswered reviews** (reuses review-reply-ai); the **"Does ChatGPT
  recommend you?" AEO check** (novel, screenshot-able); the **local rank
  tracker** with a weekly email (the capture); the **new-patient leak
  calculator** (phone + web + reviews into one number); the booking-
  readiness test; the dental-cohort speed grade ("faster than 62% of
  practices in Texas" — cohort framing is the moat); the kind **"roast
  my website"**; the brand-kit extractor; the delta re-grade (shipped).
  Design rules: ungated score / gated depth; the output IS the
  onboarding; every result has its next step inside the page; cost-cap
  and cache every Serper/LLM/Places call.
- *The content family.* The comparison layer done completely:
  `/compare/[x]` for 12 vendors incl. the website agencies (ProSites,
  PBHS), `/alternatives/[x]` roundups, "X pricing (2026)" pages citing
  BBB/Capterra with visible "last verified" dates and a monthly refresh
  law, the consolidation cost calculator; the guides library growing two
  per session; docs as landing pages; the public template gallery
  ("pediatric dental website template" is an unowned query family);
  **programmatic state/city pages backed by REAL Scan cohort stats**
  (the only programmatic pages that survive 2026 enforcement); the
  annual **"State of the Independent Practice Online"** report from the
  Scan corpus (trade press republishes; the DentalPost pattern); the
  **separate, software-agnostic "honest dental software guide" brand**
  (Mangomint's $2M lesson, built not bought); contributed articles to
  Dental Economics (free; their calendar primes Google-reviews in May
  and recall in Aug–Sep); founder YouTube walkthroughs per comparison
  page (cited by AI engines; 4–6× the demo yield of brand content);
  honest, disclosed founder participation in r/Dentistry and Dentaltown
  (human-only, never automated).
- *The loops.* Powered-by v2 on every patient surface with a real offer
  and a dentist-facing landing page (default on, opt-out on request); a
  `/showcase` of live client sites; "Are you a dental team member?" in
  the portal footer; the weekly standup email as a forwardable
  proof-of-work with a "send to a colleague" footer.
- *The bookable communities.* Deal listings on Nifty Thrifty and Dental
  Nachos ("first month free + no contract, ever" beats Weave's $50
  card); DOMC/DOMA vendor perks; AADOM chapters via office managers who
  already use us; podcast guesting then host-reads on the trigger-dense
  shows (Making of a Dental Startup, Shared Practices); Voices of
  Dentistry once references exist; DentistryIQ Morning Briefing eblasts
  for launches; state meetings ($1.5–4k booths) in 2027.

**Engine 2 · THE PROSPECT BRAIN (identity, capture, nurture, radar).**
- One identity per email across grader runs, tool uses, pages visited,
  pipeline stage, partner touches — with ONE suppression list (already
  true) and one consent ledger.
- Capture moments at every door: the grader's email, "email me my
  numbers" on calculators, "send me this comparison" on pricing,
  "watch my rank weekly", the partner application, the newsletter.
- Intent-specific WARM sequences only: grader → one-fix/delta (shipped);
  rank-tracker → monthly movement; pricing viewer → comparison; calculator
  → matching guide; partner applicant → onboarding; all with cadence
  dials and a working unsubscribe.
- **The trigger radar**: NPPES change detection (new NPI-2 orgs = startups;
  ownership/name changes = transitions), Google-listing change signals
  (new owner names, closed→open), review-incident detection on scanned
  practices, PMS-switch signals from the MSP/OD community — each trigger
  routes to the right partner kit or the right free tool, never to a cold
  blast.
- The monthly **practice-growth letter** (opt-in only): Scan cohort
  insights + what won page one this month — the one newsletter a dentist
  keeps.

**Engine 3 · THE OUTBOUND THAT IS ALLOWED.**
- **Direct-mail grade cards** to the top decile of scored prospects (Lob
  ~$1/piece, Handwrytten $3.75 handwritten via API; NPPES-verified
  addresses; no consent regime; ~3–4% B2B response benchmarks; Mangomint's
  only outbound and their one regret is not doing more). The card IS the
  printed Practice Scan with the mockup on the back.
- Human-dialed Call Mode (exists): DNC-scrubbed, 8am–9pm local, no
  autodialer, no AI voice, consent + opt-outs logged.
- 3–5 dental micro-KOLs on affiliate codes; the Hunter's drip stays
  demoted (cold email never on the product domain; if ever un-demoted, a
  separate domain + separate infra + suppression sync).
- Never: cold texts, LinkedIn automation, scraped lists, person-level
  visitor de-anonymization.

**Engine 4 · THE PARTNER ENGINE (the trust-transfer layer).**
- **The $500 referral, paid faster and to anyone**: match the market's
  number, pay at day 30 by Stripe/ACH, open to non-customers (consultants,
  hygienists, OMs) — the incumbents cap theirs at their own base.
- **Customer-refers-customer**: Jobber's 2026 design — referrer 3 months
  credit, referee 1 month, staff gift cards, milestone bonuses at 3/5/10,
  payout only after the referee activates (2 logins + setup complete).
- **Ambassadors** (invite-only, non-monetary: badge, code, roadmap
  access, a feature slot on www — Jane's 3-person program) and, later, a
  referral-gated VIP community and a "Dream Practice" consumer-facing
  badge tied to the readiness resolver.
- **Consultant/coach track** on NexHealth's shape: self-signed agreement,
  co-branded kit, portal (exists), recurring commission (20% for 12
  months beats Podium's 30%-for-one-year in practice because our price is
  public and the practice keeps it); recruit via ADMC corporate
  membership, Fortune/Levin/ACT/Dental A Team, AADOM chapter leaders.
- **Trigger partners with kits**: brokers (ADS, Henry Schein DPT) get a
  co-branded new-owner kit + preferred-vendor status; lenders' startup
  teams (BofA PS, Provide, Panacea) get the "90 days before you open"
  package; MSPs (Darkhorse, Pact-One) get a stack-recommendation deal;
  dental CPAs get the Q4 subscription-consolidation one-pager.
- **Ecosystem listings**: Open Dental Authorized Vendor via the OD API
  (the research's most consequential finding — Open Dental's vendor page
  lists NexHealth under "Dangerous/Unknown" with warnings dated 2024 and
  2026; an OD-API-based listing is both a channel and the mitigation),
  NexHealth's partner directory, Dentrix Ascend API Exchange (needs SOC 2),
  G2/Capterra/GetApp/Software Advice (one program since the Feb-2026
  merger), the dental affiliate comparison sites (they list anyone with a
  public price and a commission).
- **State-level "ADA move"**: a member rate ($150) with rev-share back to
  a state association or study club — the same mechanic as Weave's ADA
  exclusive at our scale, 2027.

**Engine 5 · THE CONVERSION ENGINE (trial→paid is the master variable).**
- The headline everywhere: self-serve, $200 published, 7-day no-card
  trial, no contract, free migration, full export, cancel from Settings.
- **The Scan → signup handoff**: name, city, website, brand color, logo,
  and the mockup pre-fill the trial — "your site is already half built."
- Template preselect from the gallery/mockup into onboarding.
- **An ungated live sandbox** (the resyncing demo clinic) placed on
  product pages — the 2026 interactive-demo report: ungated beats gated,
  multi-flow completes 48% more, only 18% of SaaS sites have one.
- **Light product-led sales**: a founder 15-minute walkthrough offered
  when a trial connects a PMS or publishes a site (Calendly's routing
  logic at toy scale, +50% leads at lower spend); "book a setup call" for
  stalled trials.
- The go-live bribe ($50 to the front desk at first review request).
- **An experiments framework**: one experiment a week (copy, CTA, gating
  position, reverse-trial vs no-card) with hypothesis, sample size and a
  stop rule, measured in the dials. Benchmarks: no-card trials convert
  8–22%, card-required 35–55%, reverse trials 18–32% — but every clinic-
  SaaS winner chose removing switching fear over squeezing trial
  mechanics; test, don't assume.
- Founding-cohort framing with a public counter, and a **"founding
  practices of {metro}"** launch (Zocdoc's 10 NYC dentists, Podium's 10
  Utah shops, Toast's Boston: ten local logos unlock proof and referral
  density at once).

**Engine 6 · THE PROOF ENGINE (retention as marketing).**
- **Review velocity**: in-product G2/Capterra asks at real milestones
  (first booking, first review reply approved), FTC-clean (pay for a
  review never a positive one, ≤$100, labeled, no employees); 300 dental
  reviews puts us above every dental-only incumbent except Adit.
- Case studies with the owner's numbers (recall booked back, no-shows
  cut, review count, grader delta) as landing pages once clinics consent;
  a wall of love on /why; Townie Choice Awards campaign; the annual
  report; contributed trade-press articles; customer-story podcast later.
- Support-as-CAC: founder-speed replies in `/messages/support` during
  beta — referrers cite support first (Jane, Mangomint, Cliniko).

**Engine 7 · THE COCKPIT + THE MARKETING DREAM TEAM (the brain).**
- **Dials v2**: the funnel with signup-abandon, per-channel CAC/LTV on
  the 60-day lag, experiment results, content citation share (a fixed
  panel of ~40 prompts weekly across ChatGPT/Perplexity/Gemini/AIO —
  "measure citations, not rankings"), nurture performance, partner
  ledger, per-capability spend caps like `pms_api_usage`, and a **weekly
  growth standup** to the owner (the Narrator, pointed at the business).
- **The Marketing Dream Team**: the platform org gets its own
  `/dream-team` on the EXISTING proposal spine, autonomy ladder, ledger,
  Cycles, Guardian and standup — new CAPABILITIES, not pages. The roster:
  the Scout (weekly demand brief from SERPs/Reddit/G2 reviews of
  incumbents + our own pageview/grader data), the Writer (drafts,
  comparison pages, quarterly refreshes), the Editor/Critic (fact-check
  against the product-knowledge brain + policy check; a redline, never a
  rewrite), the Social Operator (repurposes day-0 auto via official APIs;
  original takes ask-first), the AEO Watcher (citation share → content
  requests to the Writer), the Grader Concierge (nurture + personal
  follow-ups on hot scans), the Hunter (exists; every first touch
  human-approved), the Mail Clerk (grade cards, budget-capped), the Ad
  Manager (weekly budget moves + copy variants, ask-first, hard caps,
  never auto-raises), the CRO Experimenter (one experiment/week), the
  Newsletter Editor, the Reviewer/Responder (review-ask proposals +
  replies), the Video Presenter (scripts; avatar video bought, founder on
  camera for anything trust-bearing), the Partner Desk (kits, applicant
  triage, commission statements), the Marketing Guardian (silent/blocked/
  stalled/spend anomalies), the Narrator.
- **Lanes** (the owner's day-0 rulings, mirrored): AUTO — attribution,
  AEO monitoring, changelog→drafts, templated nurture touches, mail cards
  within budget, review-ask triggers, freshness refreshes after N unedited
  approvals. ASK-FIRST — any spend change, competitor ad copy, any public
  claim naming HIPAA/ROI/a customer, partner deals, comparison-page
  publishes, anything under the founder's name. HUMAN-ONLY — Reddit and
  Facebook groups, calls, demos, podcasts, pricing, signatures, and
  choosing which stories to tell.
- **The story is the machine**: every proposal card is a screenshot,
  every Monday standup is a LinkedIn post — "our marketing is run by the
  Dream Team we sell."

### 10.3 The Laws (non-negotiable, from the compliance pass)

1. Cold email never leaves the product domain or Resend (AUP). If ever
   un-demoted: separate domain, separate infra, suppression synced, and
   Gmail's 0.3% complaint ceiling respected.
2. Never cold-text a prospect. Calls: human-dialed, DNC-scrubbed,
   8am–9pm local, no AI voice, consent and opt-outs logged.
3. California B2B contact data is personal information: publish a
   privacy notice for the prospect DB (source: NPPES public data + our
   crawl), honor deletion, consent-gate pixels for CA visitors, never
   de-anonymize visitors.
4. FTC 16 CFR 465 + G2/Capterra rules: pay for a review, never for a
   positive one; ≤$100; labeled; no employees; disclose partner/customer
   incentives in testimonials. **Product action:** the review loop's
   optional star-gate must offer private feedback IN ADDITION to the
   Google link, never as a filter that withholds it — legal review of the
   flow before the engine promotes "FTC-clean reviews" harder than the
   product backs it (docs/COMPLIANCE.md).
5. Ads: competitor keyword bidding is legal, their trademark in our copy
   is not; pixels and copy stay off patient-facing routes; no HIPAA
   claims beyond COMPLIANCE.md; Meta's healthcare classification checked
   early.
6. No scaled-thin pages (every programmatic page carries real local
   data), no AI listicles that rank us first, no "X sucks" copy, no
   bought reviews, no LinkedIn automation, no Wikipedia attempts, llms.txt
   shipped but never relied on.

### 10.4 The master catalog (the hundred ideas — by engine; ★ shipped, H/M/L fit)

*Engine 1 — Doors.* ★grader · ★ROI calculator · ★delta re-grade · ★compare
FAQ/schema · ★guides (3) · ★powered-by v1 · H Practice Scan public report
URL + OG grade card · H "See your practice on DreamCRM" mockup · H "You
vs the 5 nearest" · H GBP audit · H reputation score + AI reply drafts · H
AEO "does ChatGPT recommend you" · H local rank tracker (weekly email) · H
new-patient leak calculator · M booking-readiness test · M cohort speed
grade · M "roast my site" (kind) · M brand-kit extractor · H public
template gallery · H `/alternatives/[x]` roundups · H "X pricing (2026)"
pages for 12 vendors incl. ProSites/PBHS · H consolidation cost calculator
· H comparison refresh law (monthly, dated) · H programmatic state/city
pages on real Scan stats · M annual State-of report · H the agnostic
"honest dental software guide" brand · H DE contributed articles · H
founder YouTube walkthroughs per comparison · H two guides per session
(reminder templates, negative-review replies, website checklist, KPIs) ·
H docs-as-landing-pages · H powered-by v2 (offer + landing + all patient
surfaces) · H `/showcase` · M portal "dental team member?" footer · H
standup forward-a-colleague footer · H Nachos/Nifty deal listings · H
DOMC/DOMA perks · M AADOM via OM customers · H podcast guesting (trigger
shows first) · M Voices of Dentistry · M DIQ Morning Briefing eblast · L
big-hall booths · L DSO events · M state meetings (2027) · H membership
price calculator · M front-desk time calculator · M 30-days-of-posts pack
· M intake-form templates (COMPLIANCE check first) · M review QR cards.

*Engine 2 — Prospect brain.* H unified identity per email · H capture
moments on every tool · ★grader nurture · H rank-tracker sequence · H
pricing-viewer sequence · H calculator→guide sequence · H partner
onboarding sequence · H trigger radar (NPPES new-org, ownership/name
change, listing change, review incident) · M "how did you hear about us"
claimed-vs-observed · H signup-abandon funnel stage · H the monthly
practice-growth letter · H one consent ledger.

*Engine 3 — Allowed outbound.* H direct-mail grade cards (Lob) · H
handwritten notes for hot scans (Handwrytten) · ★Call Mode · H micro-KOL
affiliate codes (3–5) · M gifting for activation, never demos.

*Engine 4 — Partners.* ★partner program door · H $500-at-day-30-to-anyone
referral · H customer 2-sided credit (Jobber design) · H ambassador tier ·
M referral-gated VIP community · M "Dream Practice" badge · H consultant
track (recurring 20%/12mo) + ADMC membership · H broker new-owner kit
(ADS, HS DPT) · H lender startup package (BofA PS, Provide) · H MSP stack
deal (Darkhorse, Pact-One) · H dental-CPA Q4 one-pager · H Open Dental
Authorized Vendor listing via OD API · H NexHealth partner directory · M
Dentrix Ascend API Exchange (SOC 2) · H G2/Capterra/GetApp/SA listings ·
H affiliate comparison sites · M state-association member rate + rev-share
· M study-club partner (Seattle Study Club form) · M agency co-sell (they
keep SEO, we supply booking/portal).

*Engine 5 — Conversion.* H the headline law on every page · H Scan→signup
handoff w/ mockup as draft · H template preselect · H ungated live sandbox
on product pages · H founder walkthrough at PMS-connect/site-publish · H
setup-call offer for stalled trials · H go-live bribe · H experiments
framework (variant table + one/week) · M reverse-trial A/B · H
founding-cohort counter · H "founding practices of {metro}" launch · H
"we cancel your old vendor for you" concierge + buyout credit for
contract-locked practices.

*Engine 6 — Proof.* H G2/Capterra asks at milestones · M case-study
engine (consent-gated) · M wall of love · M Townie Choice campaign · M
customer-story podcast · H support-as-CAC during beta · M customer
advisory sessions.

*Engine 7 — Cockpit + Dream Team.* ★dials v1 · H dials v2 (abandon stage,
CAC/LTV, experiments, citation share, partner ledger, spend caps) · H
weekly growth standup · H platform `/dream-team` on the proposal spine · H
Scout · H Writer · H Editor/Critic · H Social Operator · H AEO Watcher · H
Grader Concierge · ★Hunter (first-touch human) · H Mail Clerk · H Ad
Manager · H CRO Experimenter · H Newsletter Editor · H Reviewer/Responder
· M Video Presenter · H Partner Desk · H Marketing Guardian · H Narrator ·
H the brand brain (voice, claims registry, banned phrases, battlecards,
policy checklist) · H per-capability budgets.

*Owner-only (not code).* Launch the $1k Google campaign · claim
G2/Capterra listings · rotate the Serper + AWS keys · legal review of the
star-gate · OD vendor-relations email · ADMC membership · first three
consultant conversations · the first podcast guest spots · founder on
camera for the "vs" walkthroughs.

### 10.5 The roadmap (phases, what each unlocks, the metric that says it worked)

- **M1 · The Arkansas engine + the Scan spine (now; the conference date is the deadline).** The Headshot Funnel, the statewide pre-scan + keynote report, the member benefit + association site pages (10.8), then the Practice Scan as a public
  object (report URL, OG card, mockup facet, nearest-5, GBP audit,
  reputation+replies, AEO check, rank tracker), powered-by v2, the
  complete comparison/alternatives/pricing family with the refresh law,
  the public template gallery, review-site listings, two guides per
  session. *Metric:* qualified scans/week and citation share on the
  40-prompt panel.
- **M2 · The partner engine.** Referral terms shipped ($500-at-30-to-
  anyone + customer credit + ambassadors), the four trigger kits (broker,
  lender, MSP, CPA), consultant track + ADMC, deal listings on
  Nachos/Nifty/DOMA, OD Authorized listing, NexHealth directory, the
  direct-mail step for the top decile. *Metric:* partner-sourced trials
  and referral share of signups (Jane's bar is 85%; year one, aim for a
  measured 30%).
- **M3 · The conversion engine.** Scan→signup handoff, sandbox, PLS
  triggers, go-live bribe, the experiments framework, the metro cohort
  launch. *Metric:* trial→paid (the master variable) and activation
  (only a third of PLG companies even measure it).
- **M4 · The prospect brain + radar + letter.** Unified identity, capture
  moments, the sequences, the trigger radar, the monthly letter.
  *Metric:* trigger-sourced trials and nurture→trial rate.
- **M5 · Cockpit v2 + the Marketing Dream Team.** Dials v2, the weekly
  standup, the roster as capabilities on the proposal spine with lanes,
  budgets, the Guardian. *Metric:* founder minutes per week (target: 30
  on Monday + 5/day) and cards approved without edits.
- **M6 · The proof engine at scale.** Case studies, the annual report,
  state-association rates, Voices of Dentistry, the customer-story
  podcast. *Metric:* review count on G2/Capterra (300 = top of the
  dental category) and inbound share of signups.

The rhythm inside every phase stays the Part 9 rhythm: pull → ship →
verify live → next pull, with the honesty laws and the compliance laws as
the CI of the program.

### 10.6 Owner rulings needed to start M1/M2

1. **The Practice Scan as a PUBLIC, indexable object** (report pages
   discoverable by practice name; owners can request noindex) — yes/no.
2. **Referral terms**: $500 at day 30 to anyone (partners) + customer
   credit (3 months / 1 month, Jobber-shaped) — confirm the numbers.
3. **The consultant track rate**: recurring 20% for 12 months (vs the
   current 10%-forever default) — pick one shape; both can coexist per
   partner.
4. **Direct mail budget** for the top-decile grade cards (~$1–4/piece;
   start at ~200/month?).
5. **The agnostic "honest dental software guide" as a separate brand**
   (domain + editorial voice independent of DreamCRM) — build it, or
   keep the comparison layer first-party only.
6. **The metro for the founding-practices cohort.**
7. **Video**: founder on camera for the "vs" walkthroughs (trust-bearing)
   vs avatar video for the rest.
8. **The star-gate**: authorize the legal review / the product change to
   an additional private-feedback branch.

### 10.7 Open questions the research could not verify (next pass)

Nachos/Nifty exact sponsorship prices and current member counts; Dentaltown
sponsorship pricing; NexHealth's actual partner commission % and whether
Synchronizer developers qualify; ADA Member Advantage royalty structure;
AADOM exhibit tiers (Cloudflare-gated); whether Adit's "free trial" is
real; Capterra's own dental-category CPC; observed paid-search coverage
by incumbents on "Weave alternative"-class terms.

### 10.8 THE ARKANSAS BEACHHEAD (owner disclosure, 2026-09-09 — the asset that re-sequences the program)

The owner holds an exclusive, no-fee relationship with the **Arkansas
State Dental Association** (arkansasdentistry.org): he rebuilt and
manages their entire custom website for $200/mo (any agency would charge
~$600/mo plus a $30k+ build); in return the association refers ONLY his
agency, gives him a **free keynote slot at their conferences**, and lets
him run digital marketing on the conference floor — walking the halls
with a camera offering **free professional headshots to thousands of
dentists and staff**, which builds trust and brand awareness and earns an
elevator pitch with every single attendee in a way no booth vendor can.
He pays no referral fees; they pay him.

Why this is the single most valuable asset in the program, in the
research's own terms:
- Weave's March-2026 ADA exclusive is a PAID affiliate program that
  became its #2 affiliate channel in five months; state associations
  relay it. We hold the state-level version for free, with the floor and
  the podium — the "ADA move" the research scheduled for 2027 is
  available NOW.
- The research's strongest sequencing finding was **local density first**
  (Zocdoc's ten NYC dentists, Podium's ten Utah shops, Toast's Boston).
  Arkansas IS the founding metro — and the Hunter's territory focus mode
  (`config.focus.state`) already exists.
- "Peer recommendation in a room they trust" is the #1 trust signal
  dentists cite; a keynote from the association's own web partner is the
  purest form of it.
- A `.org` state-association domain that the owner controls is an
  authoritative third-party citation source for AEO/SEO — the
  "independent source the models cite" Mangomint paid $2M for, obtained
  as a side effect of goodwill.

**The Arkansas Engine — what to build around it (M1 jumps here):**
1. **The Headshot Funnel (the conference kit).** A phone-first capture
   flow for the floor: name + practice + email typed by the attendee on
   the owner's device (or badge photo), photo taken, and the headshot
   DELIVERED by email from the platform identity — transactional (they
   asked for it), with their **Practice Scan pre-run from the practice
   name** riding along as a gift, and a clearly-labeled opt-in checkbox
   for the follow-ups (the grader nurture + the member benefit). Photo
   release + consent captured at the moment; photos to S3; a per-event
   token-gated capture page; attribution channel `association` with
   campaign `asda-{year}`. Every headshot is a warm, attributed lead with
   a grade already attached — the elevator pitch has a report card in it.
2. **The keynote as a product: "The State of Arkansas Dentistry
   Online."** Pre-scan EVERY Arkansas practice (the Hunter already has the
   NPPES roster; the Scan stack does the rest) and open the keynote with
   the state's real numbers — % with online booking, % answering reviews,
   average grade, the county map — then a QR code to "find yours." The
   annual report the research put in year two becomes the first keynote's
   opening slide, sourced from real cohort data, republishable by the
   association.
3. **The member benefit.** An ASDA member rate (owner ruling: e.g. $150/mo
   or first two months free) delivered as a self-serve promotion code at
   checkout (the managed-provisioning coupon machinery already exists;
   Stripe Checkout accepts promotion codes) and a "Member benefit" page ON
   arkansasdentistry.org linking to a DreamCRM landing page with the
   association's UTM — the association's own site becomes the endorsement
   door, and its backlink the authority signal.
4. **The association site as a distribution surface.** A Technology /
   Member Resources section featuring the free tools (grader, ROI
   calculator, the guides), the endorsement badge, and the conference
   report; the association newsletter carries the grader and the keynote
   recap; contributed articles in the association's voice.
5. **Founding Practices of Arkansas.** The metro cohort with a public
   counter; Hunter focus = AR; direct-mail grade cards to every Arkansas
   practice framed as the association's web partner; the first ten logos
   become the proof engine's first case studies; Arkansas consultants,
   CPAs, brokers and the state's MSPs get the partner kits first.
6. **The playbook, generalized.** Every artifact above is built as a
   reusable ASSOCIATION KIT (event capture, member-benefit page, state
   report, member rate, partner outreach) so the second state association
   is a configuration, not a build — the research's state-level ADA move
   as a repeatable program.

Rulings needed for this engine: the next conference date (it sets M1's
deadline), the Arkansas practice count to pre-scan, the member rate,
whether the association site can host the benefit + tools pages, the
photo-consent wording, and whether the association should receive a
goodwill commission from the partner rails even though none is owed.


## Part 11 — Research pass 3 (2026-11-23): what changed since September, and the site audit

**Owner directive (2026-11-23):** "focus entirely on marketing — research the
app, then research 2026 marketing trends for my app, then … everything
possible digitally from perfecting the SEO to setting up ad campaigns on
various platforms." This part is the research half and the first build slice.
Method: an outside-in audit of the live site (crawl of all 57 sitemap URLs,
mobile Lighthouse, header and redirect probes, the internal link graph) plus
fourteen web-research threads in two rounds. Full report:
`docs/research/marketing-engine-2026-11/report.md`; the thread notes and the
site audit sit beside it. Flags as before (FACT / VENDOR CLAIM / EST); a line
marked **VERIFIED** was re-read by this session on the vendor's or
organizer's own page on 2026-11-23.

### 11.0 Corrections to Parts 0–10 (read these before quoting the earlier parts)

1. **"Not one of 24 dental vendors publishes a real price or is self-serve"
   (10.0 #2) is not true as written — and for Weave it was not true in
   September either.** Pass 2's own research file recorded a "$199/mo
   advertised" base and both $149 bundles from third-party pages; the 10.0
   summary dropped it. Weave's own pages publish a base plan at $199/mo, a
   $149/mo Coordinate bundle (online scheduling, forms, reminders, recall)
   and a $149/mo Attract bundle (reviews, email marketing, bulk texting), and
   answer "Do I have to commit to a long-term contract?" with "No"
   (**VERIFIED**, getweave.com/plans). Weave still offers no free trial of the
   full platform and the purchase path is "Checkout and demo". Solutionreach
   publishes "Pricing starts at $199" with every package by quote
   (**VERIFIED**, solutionreach.com/pricing). Flex Dental sells a self-serve
   checkout at $299/mo + a $15 pass-through, Open Dental only (FACT,
   flexdental.com/pricing, per the research thread). The claim that survives:
   **self-serve, published price, free trial, and works across PMSs —
   together.** Never "the only self-serve door".
2. **The like-for-like Weave number is public and it is $497/mo** for the
   base plus both bundles (arithmetic on Weave's published prices) against our
   $200 flat — stronger than the old third-party band, and checkable.
3. **Weave is private.** Francisco Partners closed the ~$650M take-private on
   2026-10-26 (FACT, Weave newsroom, per the research thread). No pricing or
   packaging change announced since. The ADA endorsement stands as far as
   anything published shows.
4. **Customer Match and list-based audiences are not a day-one tool.** Google
   requires 90 days of account history and >$50k lifetime spend before a list
   can be TARGETED, and limits uploads to data collected first-party (FACT,
   Google Ads help, per the research thread). Part 3's "Meta custom audiences
   seeded from the NPPES list" was not confirmed permitted — Meta's
   custom-audience terms could not be retrieved; treat as unverified.
5. **No-card trial conversion is lower than Part 0 assumed.** ChartMogul's
   2026 conversion report (200 B2B products) puts the median free-to-paid at
   8% and a card-required trial at 30%, "more than 5x" a no-card one, and
   counts 4–6% as GOOD for a no-card trial; the old 9–18% planning range is
   optimistic throughout (survey, published 2026-03-18). At 8%, a $120 trial
   is a $1,500 customer — inside the ceiling, with no margin; at 5% it is
   $2,400. And at $1,000/mo the test buys about eight trials a month, so it
   can measure cost per trial and click-to-trial but NOT trial-to-paid, which
   has to be read on trials pooled from every source.
6. **FAQ rich results are gone** (ended 2026-05-07 per secondary sources); the
   FAQPage markup on /compare and /pricing is still valid and now earns no
   SERP feature. **SoftwareApplication rich results require a rating or a
   review** (Google's docs) — ours has neither and should not invent one.
7. **Schema does not buy AI citations.** Ahrefs' May-2026 controlled test
   (1,885 pages that added JSON-LD vs 4,000 controls) found no meaningful
   lift in AI Overviews, AI Mode or ChatGPT. What correlates is third-party
   brand mentions (Spearman 0.664 with AI Overview visibility across 75,000
   brands — Ahrefs, read through a secondary summary) and referring domains. Part 5's "schema" line item is hygiene, not a lever.

### 11.1 What is new in the market

- **AI answers sit on top of nearly every comparison query.** Seer (Apr 2026,
  53 brands, 5.47M queries): AI Overviews on 95% of comparison queries;
  organic click-through on those queries ~1.3–2.4% against 3.8% without one.
  G2 (n=1,076): 51% of software buyers start in an AI chatbot more often than
  Google; ChatGPT is used by 62%. AI assistants are still under 2% of B2B
  referral sessions (VENDOR). The assistants' fetchers read raw HTML and do
  not run JavaScript (Resoneo, Jan 2026) — our pages are server-rendered.
- **Self-promotional "best X" listicles are a liability.** Lily Ray (100 B2B
  queries, Apr–Jun 2026): 69% of cited self-promo listicles came from brands
  the AI did not recommend. Law 6 already forbids them; keep it.
- **Google Ads changed under small advertisers.** AI Max is ON by default for
  new Search campaigns (FACT, Google help); broad-match campaigns were
  auto-upgraded to it on 2026-09-01; offline conversions and enhanced
  conversions for leads moved to the Data Manager API on 2026-06-15. Consent
  Mode is an EEA/UK requirement, not a US one. Competitor names are legal as
  KEYWORDS and restricted in AD TEXT.
- **New inventory:** ChatGPT self-serve ads (opened to US businesses
  2026-05-05; CPC bidding; healthcare is a restricted category in OpenAI's ad
  policy of 2026-11-20, with no line for B2B software); Google ads inside AI
  Mode run from the normal auction; Microsoft offers LinkedIn-profile
  targeting on Search. G2 now owns Capterra, Software Advice and GetApp
  (closed 2026-02-05); G2 caps review incentives at $100, disclosed, never
  conditioned on sentiment.
- **What competitors actually advertise** (Google Ads Transparency Center,
  loaded 2026-11-23): Weave leads with "$150 Amazon gift card with Weave
  demo"; NexHealth with "NexHealth For Eaglesoft — Writes Back To Your
  Schedule … See pricing". Rough active-ad counts: getweave.com ~800,
  nexhealth.com ~700, revenuewell.com ~200, dentalintel.com 91, adit.com 75.
  None of the sampled ads named a rival.
- **The buyer is more cautious.** ADA HPI Q3 2026, as reported by Becker's:
  dentist confidence at 26%, the lowest in several years; practice expenses outpacing revenue for
  general-dentist owners; 21% with a hygienist role open six months or more.
  43% of dentists use AI for at least one task, 10% at the front desk (ADA
  HPI, Jul 2026). The savings argument is the stronger door-opener again.
- **AI receptionists are the loudest new category** and none is ours to
  chase: Viva AI from $350/mo (FACT, own page), others $299–$1,500 per
  location (THIRD-PARTY). "AI employee" is used loosely by several small
  vendors and is not ownable; the FTC's AI cases turn on unsubstantiated
  results claims, so ours stays "drafts the work, your team approves it".
- **Open Dental's vendor page names our bridge.** 2026-06-05 entry: "NexHealth
  is not partnered with or associated with Open Dental in any way"; the
  2024-08-08 entry advises against NexHealth products that claim to integrate
  (FACT, opendental.com, per the research thread). An Open Dental practice
  that checks will find it. The mitigation Part 10 named — an OD-API-based
  listing — is unchanged and still unbuilt.

### 11.2 The calendar (verified where marked)

| When | What | Note |
|---|---|---|
| 2027-02-12 | NW Arkansas District Dental Society annual meeting | **VERIFIED** arkansasdentistry.org |
| 2027-02-25–27 | Chicago Midwinter | aggregator listing |
| **2027-03-11–13** | **Arkansas State Dental Association Annual Session, North Little Rock Convention Center** | **VERIFIED** — the Headshot Funnel's deadline (10.8) |
| 2027-03-18–20 | Hinman, Atlanta | booth $4,400 inline (published) |
| 2027-04-08–10 | Arkansas Mission of Mercy, Conway | **VERIFIED** |
| 2027-04-29–05-01 | Tennessee Music City Dental Conference | organizer site |
| 2027-04-30–05-01 | Oklahoma Dental Association, Tulsa | organizer site |
| 2027-06-03–06 | Mississippi Dental Association | organizer site |
| 2027-09-09–11 | AADOM, Scottsdale | organizer site |

### 11.3 What the audit found on our own site

The full list with measurements is in `site-audit.md`. In one paragraph: the
site is technically sound — server-rendered, fast enough, 100 on Lighthouse
SEO — and has almost no footprint. In the research threads' field checks no
page of ours surfaced for any of ten buyer queries, and the brand name
returned unrelated products (an iOS app and a SugarCRM-based product are
also called DreamCRM). That is a search TOOL's view and not Google's index —
Search Console is the instrument, and it is not connected. The site has
three blog posts, no legal pages, no review-marketplace profiles, and no way
to tell an ad platform that a click became a trial.

### 11.4 What could not be established

Keyword volumes and click costs for every target term (the keyword tools
refuse automated access — pull them from Keyword Planner inside the Ads
account); how many of our pages Google and Bing have indexed, and the
domain's authority (read them from Search Console and Bing Webmaster Tools);
Meta's rules on uploaded prospect lists and how it classifies a dental-
software domain; sponsorship prices for every community and podcast (none is
published); whether a longer trial would convert better for this buyer (no
controlled study exists for a busy owner-operator — our own cohorts are the
only source).

### 11.5 Rulings needed (owner-only, per the rulebook's §8 list)

1. **"Regularly $500."** No practice has been charged $500, and the FTC's
   former-price guide defines a former price as one actually offered "on a
   regular basis for a reasonably substantial period of time". Options: keep
   it; or "founding rate $200/mo, locked while you subscribe" with no former
   price; or a dated future list price if one is actually decided.
2. **Privacy Policy + Terms on www** — required before ads, lead forms or a
   review-marketplace listing. Needs the legal entity name, address and
   contact, then a legal read.
3. **BAAs.** Marketing to practices at any volume surfaces "do you sign a
   BAA?" on the first call; COMPLIANCE.md's posture is unchanged.
4. **Clinic-site addresses**: flip to the subdomain canonical
   (`NEXT_PUBLIC_SITE_USE_SUBDOMAIN`) and stop serving them under `www/site/…`?
5. **The demo practice**: `noindex`?
6. **Spend**: the $1,000/mo Google test needs an Ads account, a card, and the
   advertiser-verification documents.
7. **Two sentences of site copy**: `/product`'s "a shop and membership plans
   nobody else ships" (membership-plan software is a category of its own), and
   the help article that says integrations go through "the vendor's sanctioned
   path … not a database scraper" beside Open Dental's published statement
   about the bridge we ride. Both are in `site-audit.md`; neither was changed.

**Ruled on 2026-11-23 (the owner, in the session that produced this part):**
the trial is **14 days with a card required to sign up**, replacing the
7-day no-card trial — built as "Part 11 slice 3" in the build log below. The
same message supplied the operator details item 2 was waiting on, and the two
pages are published as "Part 11 slice 4"; the legal read item 2 asks for has
NOT happened. Items 1 and 3–7 are still open.

**Ruled on 2026-11-24 (the owner, same session): organic first.** Paid ads
wait until every organic tactic has been exhausted — Part 12. That DEFERS item
6 (no ad account, no card, no spend until the gate in
`docs/organic-go-live.md` Part 7 is met). **Item 5 was decided in the session,
not ruled:** the demo practice is `noindex` now. It was listed here as an
owner ruling in error — it is not pricing, a message to customers, spend or
anything destructive, and it is one line to reverse (`withDemoNoindex` in
`middleware.ts`). Items 1, 3, 4 and 7 are still open.


## Part 12 — Organic first (owner ruling, 2026-11-24)

> "I don't even want to do paid ads — I mean I do, but only after we've
> exhausted every single perfected marketing tactic, then we can start paying
> money to add fuel to that fire. If there's an SEO hack, if there's a search
> ranking tip, if there's a method of getting ChatGPT to recommend us, I want
> to exhaust those and then start pouring the cash into it."

**What it changes.** Part 6's ranking and Part 11's plan both opened a
$1,000-a-month Google test in December. That test is on the shelf. The
campaign stays in the tree as data (`lib/marketing/ad-campaigns.ts`,
`docs/ads-go-live.md`) and keeps itself current; nothing is spent.

**What the evidence says about "a hack" — there isn't one.** Part 11.0 already
corrected the September plan on this, and the ruling makes it the whole
program: schema, `llms.txt` and FAQ markup show no measurable effect on being
cited by an assistant; a self-ranked "best" list is cited and then passed
over; what correlates is other sites naming the product (0.664 against 0.218
for backlinks), review-marketplace profiles, and being in the indexes the
assistants read. The measured baseline on 2026-11-24: **no appearance for any
of ten buyer queries.** Whether Bing's index holds the site is unknown: the
query first read here as "no page of ours" was answered with unrelated pages,
which is what Bing gives an automated visitor (corrected the same day;
`docs/organic-go-live.md` Part 1).

**So the program is three things, in this order.**

1. *Make the site impossible to misread or miss* — code, done in slice 1
   below: one list of public pages, honest dates, a notice to Bing's family of
   engines whenever a page changes, every competitor quoted from its own site
   with the day it was read, the demo practice out of the index.
2. *Get into the indexes and get measured* — the owner's steps: Search
   Console (the platform's shared Domain property), Bing Webmaster Tools by
   import, the sitemap in both.
3. *Be named by other sites* — a free G2 profile (which now feeds Capterra,
   Software Advice and GetApp), reviews from real practices, the other
   profiles, and a small number of earned mentions where dentists read. This
   is the lever with the strongest evidence and the one no code can pull.

`docs/organic-go-live.md` is the runbook: the evidence table with sources, the
owner's steps in order with the wording of Google's and Bing's own pages, the
paste-ready listing copy (generated, so it cannot quote an old price), the
monthly check, the content order, and a PROPOSED definition of "exhausted" so
the ruling has an end. That definition is the owner's to change.

**What this part does not claim.** Nobody can state when organic produces the
first signup, or whether it reaches two a month by itself. Google's own
documentation puts a crawl at "a few days to a few weeks", and the lever that
matters most — reviews — cannot start until practices are live. The honest
commitment is the monthly log.


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
- **Post-deploy live check found + fixed a double credit**: the templates'
  shared footer (and the intake page) carried a hardcoded "Powered by
  DreamCreate" link — agency domain, no UTM, immune to the off switch.
  Single-homed: the layout strip is THE credit; the old links removed;
  pinned by tests both ways.

**Slice 1b — the sensor layer, deepened (SHIPPED 2026-08-27, migration
0155).** Owner directive: "go deeper on slice 1 before slice 2."

- **The campaign dimension**: `marketing_pageview.campaign` (0155) — the
  normalized `campaignKeyOf(utm_campaign)` slug ('' = none, NOT NULL so the
  unique index holds on every Postgres version; charset-bounded so a
  hostile query string can't mint junk rows). This is what lets the dials
  tell competitor-weave from competitor-nexhealth inside one channel. The
  report's Campaigns table keys signups on the FIRST-touch campaign.
- **Sessions**: `marketing_pageview.sessions` (0155) — the beacon marks
  its first report per browser session (sessionStorage marker; an
  unreadable store UNDERCOUNTS rather than inflating), giving conversion
  rates a visitor-shaped denominator: a 5-page browse is one session, not
  five prospects.
- **The two-touch memory**: the attribution cookie is v2 — the FIRST touch
  still never moves (owner ruling: the dials measure what started the
  journey), and a LAST half updates on any later TAGGED touch (ad click,
  sponsorship link, external referrer — a bare direct re-visit never
  writes). v1 cookies parse as first-only, so pre-1b memories survive the
  upgrade. The signup stamp carries `last` alongside; the report stays
  keyed on first touch, and `last` waits for the dials' assisted-CAC math.
- **Panel v2** on the platform Marketing home: 7/30/90 window chips
  (?win=), the daily-visits TrendChart (house chart kit — and the
  legibility-floor guard caught + fixed a sub-12px label in review),
  session-based conversion rates per channel, the Campaigns table, and
  Powered-by sources resolved to clinic names (unmatched slugs stay
  visible — a stale slug is still a fact about where clicks came from).
- Suite 6,724 green + `pnpm build` clean.

**Slice 1c — the self-serve win loop (SHIPPED 2026-08-27, no migration).**
The last dangling Tier-0 wire: `markConverted` had ONE caller (managed
provisioning), so a Hunter prospect who signed up SELF-SERVE — the whole
point of the program — stayed open in the pipeline: the win never fed the
win/loss learning loop, and the call list / future outreach would keep
targeting a practice that already signed up. Now `submitOnboarding`
(new-org path, best-effort, once per clinic) calls
`convertProspectForSignup` (lib/services/prospecting.ts): exact-email
match (prospect.email, then any crawled prospect_contact) → else the
signup email's DOMAIN against prospect websites via the pure
`domainMatchesWebsite` (lib/prospect-email.ts — host or subdomain, never a
substring, so mysmilebright.com can't claim smilebright.com's win), only
for non-freemail/non-disposable domains and only when exactly ONE prospect
matches (ambiguity = no match, never a guess). Idempotent for the same
org; a prospect converted to a DIFFERENT org is never moved. Conversion
rides the existing `markConverted` (status + linked org + outcomeAt +
enrollment stop), so the win/loss report picks it up with no new code.
Suite 6,733 green. Slice 1 (a+b+c) is COMPLETE — slice 2 (the grader) next.

**Slice 2 — THE PRACTICE GRADER (SHIPPED 2026-08-27, migration 0156).**
The marketing site's first interactive door (and first form of any kind):
a public "grade my practice's online presence" tool — the HubSpot-grader
play the research ranked as Tier 1, composite website + Google listing +
reviews per the owner's ruling.

- **Pure core `lib/practice-grade.ts`**: `gradeOnlinePresence` — three
  axes (website 0.4 · listing 0.3 · reviews 0.3), composite letter A–F,
  findings in the anti-shame voice BY LAW (they name what a PATIENT
  experiences: "patients searching after hours can't grab a time", never
  "no booking widget detected"). Unknown axes stay NULL and the composite
  re-weights — an unchecked thing is never scored. The mirror of
  computeOpportunityScore's polarity (that scores the sales opportunity;
  this grades the presence for its owner), and the curves are anchored so
  a genuinely excellent practice clears an A — a grader that can't hand a
  clean A reads as rigged. `parsePracticeGradeResult` treats the stored
  jsonb as untrusted (malformed → 404, never rendered garbage).
- **Deliberate scope bounds** (each a decision, not a shortcut): HOMEPAGE
  ONLY, one 10s/1MB fetch (the enrichment engine's contact-discovery
  sub-hops don't inform a grade and triple the wall-clock of a form the
  visitor is watching); NO AI (an AI call per anonymous visitor is an
  abuse vector — the heuristic verdict's signals are what the report
  names anyway); the on-screen report is the product and the email is a
  courtesy copy (transactional, platform identity — NOT the cold-outreach
  subdomain — with a "nothing to unsubscribe from" footnote).
- **Reuse over rebuild**: `extractCrawlSignals` + `heuristicVerdict` (the
  Hunter's own eyes), `findDentalPlace` (existing field mask kept — no new
  Places SKUs), `comparableUrl` (the GBP forgiving-URL compare, now
  grading listing↔website match for strangers), the /r /d token-IS-auth
  pattern, `looksLikeBot` + `rateLimitPublicAction('grader', 4/10min)`
  (the spend gate — every run is a live fetch + a metered Places call).
- **The Hunter hook** (best-effort, never blocks the report): email match
  → `promoteProspectByEmail(email, 'grader_run')` — ITS FIRST REAL
  PRODUCTION CALLER — lands the prospect on the call list with a "they
  just read their own gaps" alert; name+state pipeline match → linked
  WITHOUT promotion (a shared name is not an email); stranger →
  `addGraderProspect` (call_list · warm · intentSignal 'grader_run' ·
  emailSource 'grader' — and unlike addManualProspect it logs NO call,
  because none happened). New intent signal `grader_run` registered.
- **Schema 0156**: `practice_grade` (token-uniqued, platform-global,
  result jsonb, prospectId link). Surfaces: `/grade` (marketing nav +
  footer + sitemap via MARKETING_PUBLIC_PATHS) and `/g/[token]` (noindex
  + robots.txt disallow — one practice's numbers per page). The `grader`
  channel joined the closed attribution registry: the emailed report link
  is UTM-tagged, so grader-driven visits and signups report as their own
  acquisition channel.
- Two repo guards earned their keep in review: the legibility floor
  (slice 1b) and this slice the server-render timezone guard (the report
  footer's date now pins UTC explicitly).
- Suite 6,756 green + `pnpm build` clean. Next: slice 3 (the dials
  cockpit) or content-engine work per the owner's call.
- **THE STRANGER GUARD (2026-08-27, same day — the owner's own live run
  caught the grader's worst possible failure).** The owner graded "Dream
  Dental" in Ward, AR (no such listing exists) and the report presented a
  real Dream Dental from another state — 4.9★, 385 reviews — as "Your
  reviews": searchText returns the closest-sounding practice ANYWHERE and
  the grader trusted it blindly. Fixed at three layers: (1) the Places
  field mask grew `displayName` + `formattedAddress` (both below the
  Advanced SKU the call already pays for — verification data, not new
  cost); (2) pure `placeMatchesPractice` (lib/practice-grade.ts) — a
  website match is proof of ownership, explicit website DISAGREEMENT is a
  hard reject, a given city/state MUST appear in the listing's address
  (unreadable address + given geo = reject: cannot-verify ≠ verified), and
  the name's salient tokens (generic dental words excluded) must overlap;
  (3) no confident match now grades BOTH Google axes as UNKNOWN — never
  the old fake-low score, because a one-result search can't prove absence
  either — with the rejection DISCLOSED ("we found a similar-sounding
  practice somewhere else and left it out"), and a verified match NAMES
  the matched listing + address in the report so a wrong match is visible
  to its owner in one glance. The Ward-AR incident is pinned verbatim as a
  test at both the pure and service layers. Suite 6,766 green.
- **v2 — THE BEFORE/AFTER REPORT (2026-08-27, owner directive: "use the
  gaps as leverage; scan deeper; check search rank; present it better").**
  (1) Every finding now carries an AFTER — what the same check reads with
  DreamCRM running — from a SHIPPED-features-only registry (site-build,
  24/7 booking, HTTPS, phone-first templates, structured data, tap-to-call,
  sitemap, the watched listing = gbp_website_fix, self-sending review
  asks, private escalations); a check the product can't deterministically
  pass (a review rating, a search rank) gets after: null BY LAW — the
  report says what happens instead ("asks send themselves", "climbs as
  the fixes land"), never a promise. `projectedWithDreamCrm` projects
  per-axis bars the same way (website/listing ~95, reviews/search never).
  (2) DEEP SCAN — pure `lib/practice-scan.ts` (h1, JSON-LD dentist
  structured data, OG tags, tap-to-call phone, canonical) + service-filled
  robots.txt/sitemap probes and homepage response time; each gap is a
  finding with its remedy. (3) SEARCH VISIBILITY as a 4th axis behind an
  INERT SERP driver (`lib/serp.ts`, Serper.dev wire format, SES/Bedrock
  pattern — no `SERPER_API_KEY`, no calls, and the axis HIDES rather than
  nagging "not graded"; scraping Google violates its TOS, so ranks come
  from an API the owner can switch on for ~$1/1k checks). Query = the one
  a new patient runs: "dentist in {city}, {state}". Weights rebalance
  .35/.25/.2/.2 with null axes re-weighted out. (4) The report page tells
  the story: paired Today/With-DreamCRM bars per axis (direct-labeled,
  one 0–100 axis, thin marks), remedy lines under every finding, honest
  growth notes where projection is refused, CTA reframed "Every 'With
  DreamCRM' line above is shipped, not promised." v1 stored rows parse
  back-compat (string findings → afterless; missing search axis →
  hidden). Suite 6,775 green.
- **SERPER KEY LIVE (2026-08-27, same day).** The owner supplied the
  Serper.dev key + a dedicated `Claude` IAM user; `scripts/setup-serper.sh`
  (new, the setup-sms-aws.sh pattern — idempotent, validates the key with
  one live query, MERGES into App Runner's RuntimeEnvironmentSecrets,
  waits out in-flight rollouts; re-running with a new value IS the
  rotation path) stored `SERPER_API_KEY` in dreamcrm/app-secrets and
  mapped it into the service. Live-verified end to end on the Ward-AR
  inputs: all four axes render — website 39 w/ deep-scan findings
  (tap-to-call, structured data) + Today/~95 paired bars, listing/reviews
  honestly ungraded w/ the stranger disclosure, and SEARCH VISIBILITY
  live ("isn't on page one for 'dentist in Ward, AR'", score 20, no
  projected rank by law). Housekeeping owed: the AWS key CSV + Serper key
  passed through chat/uploads — rotate both at the owner's convenience
  (Serper: regenerate + re-run the script; AWS: rotate the Claude user's
  key in IAM).
- **THE REPORT DESIGN RUN (2026-08-29, owner directive: "state-of-the-art
  tech design, not a basic report card — it's the first impression of the
  business").** The /g page's visual body extracted to
  `app/g/[token]/report-view.tsx` — pure presentational + framework-free
  (plain <a>, no next/link) SO an offline design harness can render it
  with mock data against the BUILT Tailwind CSS and screenshot it before
  any deploy (three iteration rounds ran that loop). The design: a
  diagnostic INSTRUMENT, deliberately dark against the white marketing
  site — deep blue-black canvas, glass cards, ONE signature teal→sky
  gradient spent in exactly two places (the animated hero score ring and
  the CTA), monospace micro-labels, the axis readout strip in the hero
  (anchor-linked chips), Today→With-DreamCRM as a structural two-column
  LEDGER with per-panel column headers (inline labels only on mobile
  stacking), wins as chips, CSS-only staggered entrance honoring
  prefers-reduced-motion. Every v2 content law holds unchanged. The
  css-var guard earned its keep (the ring's inline animation vars joined
  RUNTIME_PROVIDED with a reason). Suite 6,775 green.
- **THE GADGETS (2026-08-29, same directive round 2: "still a generic
  layout without any cool looking gadgets/charts/graphs").** The report
  grew three data-driven instruments, each fed ONLY by real sensor data —
  a gadget with nothing true to show doesn't render. The fuel is a new
  `facts` block on `PracticeGradeResult` (`GradeFacts`: checks/serp/
  reviews), assembled by `buildGradeFacts` from the SAME inputs the axes
  graded — one source, so a gadget can never disagree with its panel —
  and parsed leniently (`parseGradeFacts`: a malformed block costs the
  gadgets, never the report; pre-gadget rows → facts null → the report
  degrades to text). (1) THE SITE-SCAN MATRIX (website axis): the ten
  checks as LED cells — HTTPS / MOBILE READY / ONLINE BOOKING / SEARCH
  TITLE / MAIN HEADLINE / STRUCTURED DATA / TAP-TO-CALL / SOCIAL PREVIEW
  / SITEMAP / RESPONSE (with the real ms readout) — pass glows emerald,
  fail glows rose, unknowable stays unlit (ok:null, never a fake fail),
  with a pass-count header. (2) THE PAGE-ONE BOARD (search axis): the
  REAL ten organic slots for "dentist in {city}, {state}" with the
  competitors who own them named (service stores
  `serp.organicHosts.slice(0,10)`), the practice's row lit teal with a
  YOU pill — or a trailing dashed rose slot reading NOT ON PAGE ONE. Who
  owns the page is more persuasive than any score. (3) THE REVIEWS METER
  (reviews axis, verified-match only by construction — facts.reviews is
  built from the SAME place the stranger guard vetted): the rating as a
  numeral + partial-fill stars, the count as a bar against the honest
  benchmark tick (MAP-PACK WINNERS · 100+) — a benchmark is an
  instrument, not a projection, so no law bends. Round-trip law:
  `detail` is always present (null when silent) so a computed grade and
  its stored-then-parsed twin are structurally identical — the existing
  toEqual round-trip test caught exactly that asymmetry, and the parser
  gained Array.isArray guards the malformed-facts test exposed. Staggered
  cell/slot entrance rides the same reduced-motion-gated keyframes.
  Suite 6,782 green.
- **THE SALES-COPY PASS (2026-09-08, owner directive: "sales copy, not
  pure honest copy" — the example: 'Without a confidently-matched…' reads
  like a disclaimer).** The frame shift: the empty lookup IS the pitch.
  Rewritten hedges → leverage, without inventing a fact: the
  listing-not-found finding now reads "We searched Google for your
  practice and your listing didn’t come up — patients searching 'dentist
  near me' are hitting the same wall… it’s also the highest-impact fix on
  this list" (still never claims to KNOW whether a listing exists — a
  one-result search can't prove absence, and the axis still scores null);
  the reviews twin reads "if patients can’t find the listing, they can’t
  find the reviews — every five-star experience you deliver right now is
  invisible"; the stranger disclosure tightened to "you deserve your own
  numbers, not a stranger’s"; the report intro's "checks the product
  passes by construction" engineer-speak became "we only project what the
  product actually ships — your reviews and your rank are earned, not
  promised." The honesty laws all hold: null axes stay null, transient
  can't-check strings stay plain, no projected reviews/rank.

**Slice 3 — the dials cockpit (SHIPPED 2026-09-08, migration 0157).** The
budget philosophy from Part 3 + ruling #3, running as code — the machine
computes, the owner moves the money:
- **`marketing_spend` (0157)**: one row per (month, channel), owner-typed
  monthly spend in cents, unique-upserted (the latest figure is the
  figure). Human-entered by design — ad-platform APIs can come later, but
  a number the owner typed is a number the owner believes. Platform-global
  like its siblings.
- **Pure `lib/marketing-dials.ts`**: the master dial rule as constants
  (dial down at blended CAC >$1,600 two consecutive judged months; dial up
  under $800; 60-day cohort lag), the per-channel cost-per-trial kill bars
  from the Part 3 table (google_ads $120, meta_ads $80), and
  `assessDials` — month cohorts in, a typed recommendation out (no_spend /
  collecting / dial_up / dial_down / hold) with one warm reason sentence.
  Honesty laws carried over from the grader: a cohort inside the lag is
  COLLECTING, never a verdict (every fresh month reads zero-paying at
  first — screaming at it would train the owner to ignore the dial); zero
  conversions is not an infinite CAC — a mature zero-paying month counts
  against the ceiling only when its spend ALONE exceeds it (even one
  conversion wouldn't have saved it), and below that the per-channel bars
  are the instrument that catches the burn; blended means blended
  (untracked paying clinics count — they're still revenue the spend period
  produced). `STEP_ONE_PLAN` renders ruling #3 verbatim while nothing is
  spent: the whole $1k on Google competitor terms, manual exact-match,
  land on /compare, judge on cost/trial <$120, Meta at the NEXT step.
- **Service `lib/services/marketing-spend.ts`**: `recordSpend` upsert
  (validated month key + closed-registry channel) and `getDialsReport` —
  6-month window, signup cohorts by UTC month from the same
  signup_attribution stamps + `hasPaidSubscription` grading the billing
  wall uses, demo orgs excluded (a seeded clinic is not a CAC).
- **UI**: `DialsPanel` on the platform Marketing home under the
  acquisition panel — verdict pill + reason + the rule spelled out, a
  month table (spend / signups / paying / blended CAC / judged-or-
  collecting) with per-channel sub-rows showing cost-per-trial against
  the bars, the step-one plan card, and the one input the machine needs:
  a month × channel × dollars entry form (platform-gated
  `recordSpendAction` in admin-actions.ts). The retired-tones CI guard
  earned its keep in the very first run — the "collecting" state shipped
  in retired sky and was moved to the v3 info violet. Suite 6,802 green.

**Slice 4a — compare-page AEO hardening (SHIPPED 2026-09-08).** The
content engine's first piece, and the one the ad plan lands on:
- **The derived FAQ** (`buildComparisonFaq` in lib/marketing/
  comparisons.ts): the four questions buyers actually type — "{vendor}
  cost", "{vendor} alternative", "when is {vendor} better", "can I
  switch" — COMPOSED from the same registry fields the page renders
  (reportedPricing, category, theirStrengths), so the FAQ and its
  FAQPage JSON-LD twin can never drift from the comparison, and no
  answer can carry a fact the honesty bar didn't already admit. The
  when-they-win answer concedes the vendor's real strengths by
  construction (machine-checked in tests/marketing/seo.test.ts).
  Rendered as a details/summary FAQ section on every /compare/[vendor]
  page + emitted as FAQPage schema (schema describes only on-page
  content, per Google's requirement).
- **The query surface**: titles/descriptions now carry "pricing,
  features & alternatives" — the BOFU terms thin-domain challengers
  provably rank for (Part 5); the /compare hub gained ItemList JSON-LD
  and a description naming all eight vendors.
- **STALE-FACT SWEEP**: the registry still claimed "Open Dental two-way
  via the official API only" from before the 2026-08-19 one-door ruling
  — fixed to the NexHealth-bridge truth everywhere (baseMatrix note,
  NexHealth bottom line, Tebra copy), with a test pinning that the
  retired claim stays out (`'official API' stays out of the registry`).
  Ad landing pages carrying stale facts are both a conversion and an
  honesty problem — this sweep is why the slice touched the registry at
  all.
- **The funnel cross-link**: every comparison page's CTA block now
  offers the free grader ("Grade your online presence free →") — the
  Part 5 free-tool magnet feeding the same attributed funnel.
  Suite 6,804 green.

**Slice 4b — the practice-growth resource library (SHIPPED 2026-09-08).**
Part 5 item 3, built as CODE-OWNED marketing pages rather than blog rows
(hand-written depth, not scaled-thin — the shape the helpful-content
updates reward; the DB-backed platform blog stays the home for ongoing
posts). `/resources` + three guides targeting the provably-winnable
long-tail queries, each carrying ORIGINAL material:
- **/resources/dental-recall-scripts** — the email/text/phone recall
  scripts, where the email template IS the product's real reactivation
  campaign copy ("Has it been a minute?…"), the texts carry the STOP
  line + a plain-language TCPA consent caveat and the GSM-7 alphabet
  cliff (one smart quote halves the segment), the phone script uses the
  two-yeses close, plus the due+2w/+3w/+6w cadence and the
  patient-keyed frequency-cap rule — all lessons the product itself
  enforces in code.
- **/resources/dental-membership-plan-pricing** — the worked pricing
  math (cost-to-deliver floor → 65–80%-of-retail target band), family
  tiers, monthly-vs-annual, the pitfalls (never stack with insurance,
  lab-cost discounting, renewal-as-recall), the front-desk one-sentence
  script, and a visible state-regulation caveat ("arithmetic, not legal
  advice").
- **/resources/how-to-get-more-dental-patients** — the ORDERED playbook
  (listing → reviews → a website that books → reactivation → referrals
  → only then paid), mirroring the grader's own checks and
  cross-linking both the grader and the recall guide; it makes no rank
  promises and says why nobody honestly can.
Infrastructure: `lib/marketing/resources.ts` registry (single source for
hub, sitemap, Article JSON-LD), `GuideShell`/`ScriptCard`/`GuideNote`
shared shell with Breadcrumb+Article schema, '/resources' in
MARKETING_PUBLIC_PATHS (middleware + sitemap in one move), nav Resources
menu + footer links, ItemList on the hub, grader CTA on every guide.
Also fixed in passing: the nav's stale "official paths only" PMS line →
the NexHealth-bridge truth. Tests pin that each guide renders its
original material and its honest caveats (tests/marketing/
resources.test.tsx). Suite 6,811 green.
**Slice 4 remaining — owner-action-gated, not code:** (1) claim the
G2/Capterra listings (review-ask machinery is premature until there are
paying clinics to ask — revisit at ~5 customers); (2) ongoing long-tail
posts via the platform blog in-app; (3) YouTube long-form + LinkedIn via
Zernio need content produced first — surfacing the composer for the
platform org is a small slice once there's something to post.

**Part 9 A① — the recall-revenue calculator (SHIPPED 2026-09-09, the
idea engine's first pull).** /roi — the research's named second free
tool, built to the grader's honesty laws: `lib/recall-roi.ts` (pure,
client-safe — patients × off-schedule share × 2 visits/yr × the
visitor's own fee = the AT-STAKE headline, explicitly "arithmetic on
your own numbers, not a projection"; THREE hedged win-back scenarios
(10/25/40%, all capped well under 100%, called scenarios out loud);
the break-even line divides the real $200 plan price by the visitor's
own visit fee; junk inputs degrade to zeros never NaN). The whole
calculator runs in the browser and the page says so — "nothing you
type is sent, stored, or seen by us" is part of the pitch. Slider UI
(roi-calculator.tsx client component), a methodology section showing
ALL the math, CTAs to signup + the grader, cross-linked from the
recall-scripts guide, '/roi' in MARKETING_PUBLIC_PATHS (middleware +
sitemap in one move), nav + footer. Tests pin the arithmetic, the
scenario hedging, the break-even edge cases, and the privacy promise
(tests/marketing/recall-roi.test.tsx). Suite 6,817 green.

**Part 9 B① — the delta re-grade (SHIPPED 2026-09-09).** The flagship
magnet keeps earning: when a practice re-runs the grader (same email +
same practice name, both normalized so a retyped capitalization doesn't
sever the history), the report opens with a "SINCE YOUR LAST GRADE"
strip — overall and per-axis movement as real numbers (backsliding
included: ▼ −N in rose, never silence), axes that went unknown→scored
labeled NEWLY CHECKED (unknown never scored, so unknown never deltas
either), and scan checks that flipped between runs as FIXED / NOW
FAILING chips matched by check id. Pure `compareGrades` +
`deltaIsEmpty` in lib/practice-grade.ts; the previous-run lookup rides
`getGradeByToken` best-effort (a failed history read or an unparseable
v1 row costs the strip, never the report); `PublicGradeView.delta` is
optional so the offline harness needs no mock. Identical runs still
render ("held steady" is honest information after a re-run); an
all-unknown pair renders nothing. This is the compounding loop: the
grader stops being a one-shot report and becomes a progress tracker a
practice returns to — and the 30-day re-grade nudge email (C①'s warm
nurture) now has a reason to exist. Suite 6,825 green.

**Part 9 D① — the partner-program public door (SHIPPED 2026-09-09).**
The referral-partner machinery (10% default of every paid invoice,
per-partner rate/term, Stripe Express payouts with the $25 floor, the
live partner portal) was fully built and had NO public door — a
standing channel (consultants, dental CPAs/bookkeepers, IT providers,
agencies, study-club leaders — the people practices already ask "what
software should we use?") waiting on one page. /partner-program: the
pitch built on the REAL terms only (every number on the page is the
schema's default, and the FAQ hedges "your exact rate and term are
written into your partner agreement"), the 3-step mechanism, the
plain math ("ten practices = $200/mo to you"), FAQ + FAQPage schema
(one source, rendered verbatim), and an application form wearing the
full public-form armor (honeypot + time-trap + per-IP rate limit).
NO NEW TABLE: an application IS a lead —
`lib/services/partner-applications.ts` files it into the PLATFORM
org's own pipeline (leadSource 'partner_program', anchored to the
platform owner) where the owner already works daily; a re-apply
refreshes the existing row's notes instead of minting a duplicate;
a best-effort admin email alert rides on top (a mail hiccup never
fails the applicant). '/partner-program' joined MARKETING_PUBLIC_PATHS
+ the footer's Get-started column. Suite 6,831 green.

**Part 9 C① — grader-lead nurture (SHIPPED 2026-09-09, migration 0158).**
The warm loop, built so it can never become the cold one: two touches,
both about the report the person ASKED for, both carrying a one-click
unsubscribe that writes to the SAME `prospect_suppression` list the
Hunter obeys (one "never again" covers every machine we run). Day 3 —
"your report's still here" + THE ONE FIX from their own stored result
(`topFixFor`: the worst-scored axis's first finding with a shipped
remedy; a clean report yields no email, because a nudge with nothing
to offer is noise). Day 14 — the re-grade invite, with B①'s delta
strip as the payload. Laws in `lib/services/grader-nurture.ts`: a row
without a prospectId is never emailed (no working unsub target → no
send, ever); suppression is checked at send time; an account for the
email means the product's onboarding took over → quiet; a newer grade
for the same practice supersedes the touch; every considered row is
STAMPED (0158 `nurture_report_at` / `nurture_regrade_at` — "resolved",
sent OR skipped) so the daily scan never grinds; a deliver failure
does NOT stamp, so the next run retries. Windows [3,10) and [14,28)
days double as the first-deploy guard (old backlog ages out, no
surprise blast); cap 50/run. Links carry utm_campaign nurture-report /
nurture-regrade so the acquisition panel shows what the touches
earn. `grader-nurture` is the 22nd cron (daily; JOBS entry +
parity-guarded). HONESTY FIX riding along: the courtesy report email
said "there's nothing to unsubscribe from" — true when it was
one-time, a lie once follow-ups exist — now "we may check in once or
twice — every follow-up carries a one-click unsubscribe." Suite 6,838
green.

**Part 10.8 / M1 slice 1 — THE HEADSHOT FUNNEL, the conference kit
(SHIPPED 2026-09-09, migration 0159).** The first build of the Arkansas
engine, and the general association kit underneath it. Two public doors on
the token-IS-auth pattern: `/e/<token>` — the FLOOR capture page, where
the EVENT's token is the auth and the page lives on the owner's own phone
(attendee types name/email/practice/role/city, ticks the required PHOTO
RELEASE, chooses the OPT-IN — unticked by default, in plain words —
optionally shoots a phone photo, and the form resets itself for the next
person) — and `/h/<token>` — the attendee's own page (the photo, its
download, the scan card, one tagged door to the product). A NEW CLOSED
CHANNEL `association` (`ASSOCIATION_UTM_SOURCE`; source OR medium marker
classifies; campaign key = the event slug, so one channel row rolls up
every association and the campaign column tells them apart). Schema:
`marketing_event` (slug = campaign key, capture_token, active) +
`event_capture` (release timestamp NOT NULL — a capture without it cannot
exist; opt_in + opt_in_at; grade_id, prospect_id, delivered_at), both
platform-global like prospecting. LAWS in `lib/services/event-capture.ts`:
(1) the headshot email is TRANSACTIONAL and goes to everyone who asked;
(2) NOTHING ELSE goes to a "no" — enforced at the machine level: a
`prospect_suppression` row (reason `no_consent`, the table every
automated sender already checks) + the grade's nurture stamps resolved
at capture, never by a person remembering; a "yes" in person is a fresh
consent that clears a prior unsub/no_consent row (never a bounce or
complaint — those are facts about the address); (3) the Practice Scan
PRE-RUNS QUIETLY — `runPracticeGrade` grew `quiet` (no courtesy email;
the delivery carries the report link) + `hunter:false` (no call-list
alert; hundreds of "X graded their practice" notes in one afternoon is
noise about people he just shook hands with) and the prospect link is
made here with the honest `event_met` intent signal (`addGraderProspect`
grew an `intent` option); (4) delivery fires the moment a photo is
DURABLE — at capture when the phone took it, or later when the owner
attaches the camera's edited file on the platform's new Events tab
(`/platform/prospecting/events`, per-event capture link + the honest
counts captured/need-photo/delivered/opted-in/scanned; `/events/[id]`
lists captures with per-row Attach/Replace/Resend) — stamped
`delivered_at` only after the send, so a failed send retries and a
delivered capture gets its photo REPLACED but never a second email.
Crash order is row → consent → scan → prospect → photo → delivery, so a
scan that dies never loses the person. Bytes are sniffed (the bucket is
public-read) on both doors; the floor action's per-IP limit is sized for
ONE device working a hallway all day (150/hour). Copy is code-owned
(`lib/event-capture.ts`: subject, the scan line that is SILENT without a
grade, the consent footnote that says out loud which box was ticked).
Still owner-gated: the event itself (create it on the Events tab once
the conference date is known), the member rate + benefit page (10.8
item 3), the statewide pre-scan (item 2).

**Part 11 slice 1 — the technical SEO foundation (2026-11-23, no migration).**
The first slice the audit paid for. Everything below was a measured defect on
the live site, and each fix ships the test that was watched failing against
it.

- **The header menu is in the HTML.** The three dropdown panels were mounted
  on hover, so the server document carried five nav links and none of the 23
  behind them; `/resources` had three inbound pages on the whole site. The
  panels are always rendered now and closed with `hidden` (still out of the
  tab order and the accessibility tree). `components/marketing/chrome.tsx`;
  `tests/marketing/nav-links-in-html.test.tsx` renders the header the way the
  server does and reads the string.
- **The Resources menu fits the window.** Found by the visual check of the
  fix above, and older than it: the two-column panel under the last trigger
  hung from the trigger's LEFT edge and ran 23px past a 1280px window, 87px
  past 1152 and 191px past 1024, scrolling the page sideways while open — the
  panel that holds the free tools. `panelAnchor()` hangs a wide panel in the
  right half of the bar from the trigger's right edge. After: inside the
  window at every width from 1024 up, zero sideways scroll.
- **One head for every marketing page.** `pageMetadata()` in
  `lib/marketing/seo.tsx` writes the canonical, `og:url`, `og:type`,
  `og:site_name`, the share image and a matching Twitter card from one input;
  every static marketing page and the two registry-driven ones build through
  it. The homepage and the grader had no canonical; no page but a blog post
  had an `og:url`. The homepage description went from 290 characters to under
  160 with the price inside the visible window.
  `tests/marketing/page-head.test.ts` derives its list from
  `MARKETING_PUBLIC_PATHS`, so a new public route cannot ship a hand-built
  head.
- **The sitemap only states dates it can stand behind.** Every `lastmod` was
  the time of the request. Now: a comparison is dated by its pricing check, a
  guide by its revision day, a post by its own timestamps, and everything
  else states none. `tests/marketing/sitemap-dates.test.ts`.
- **Help articles link to each other.** "More in this category" walked the
  first three articles for every reader, leaving fifteen articles with one
  inbound link. `relatedDocs()` walks the category as a ring: inbound equals
  outbound for every article. `tests/marketing/docs-related-ring.test.ts`.
- **Three comparisons quote the vendor instead of a review site.** The
  registry gained `pricingChecked { on, source, url }` — present only on an
  entry somebody re-read against the vendor's own page — and the page renders
  "pricing last checked <day> against <source>". **Weave** now carries its
  published $199 base and two $149 bundles, its "no long-term contracts"
  answer and the insurance-verification line from its pricing page; the
  third-party band and the "annual agreements" and "Elite tier" lines are
  gone. **Solutionreach** carries its own "pricing starts at $199" and its
  "yearly contract options" answer in place of a $329 third-party figure.
  **NexHealth** is described as it describes itself: no price on its pricing
  page, a month-to-month option, annual plans paid up front with 90 days'
  notice — the contract row moves from "terms vary" to an honest yes.
  `tests/marketing/comparison-pricing-check.test.tsx`. **The other five
  entries have not been re-read and carry no date** — the refresh law in 10.4
  ("monthly, dated") now has the field it needs; it still needs the reading.
  *(Update: all five were re-read on 2026-11-24 — "Part 12 slice 1" below.)*
- **Titles that say what the page is.** `/pricing`, `/product`, `/compare`
  and `/blog` carried "Pricing — DreamCRM"-shaped titles; they now name the
  subject and, on pricing, the resolved price.
- **A help article's search snippet stopped contradicting its own first
  paragraph** (`requesting-a-pms-integration` told a Dentrix practice to wait
  for something the article says works today).

Not done here, by decision or because it is not marketing-site code: the
"regularly $500" wording, the legal pages, the clinic-site canonical, the demo
practice's indexability, the homepage's per-request render, and click-id
capture for ad conversion upload (11.5 and `site-audit.md`).

**Part 11 slice 2 — ad readiness: the click kept whole, and the campaign as data (2026-11-23, no migration).**
Owner directive, same day: "we need 2 new customers per month from our web
marketing alone", and "walk me through which ad account to set up". The
arithmetic that answers the first: two paying practices a month is 25 trials
at the 8% survey median (17 at 12%, 40 at 5%), about $3,000 a month at ~$120 a
trial — so the target needs a larger budget, a trial-to-paid rate at or above
the median, AND trials that cost nothing per click, together. The runbook for
the second is `docs/ads-go-live.md`.

- **The sensor keeps the click id's VALUE and the keyword.** It recorded only
  that a `gclid` was present — enough to name the channel, useless for telling
  Google which click became a trial (its Data Manager upload requires the id
  when no tag collects user data, and we run no ad-platform tag on a domain
  that also serves clinic sites). `AttributionTouch` gains `clickId { kind,
  value }` for `gclid` / `gbraid` / `wbraid` / `msclkid` and `utmTerm`. Case
  is preserved (the ids are case-sensitive; the UTM cleaner lowercases), an
  over-long or malformed id is REJECTED rather than clipped, and presence
  still classifies a touch whose value could not be kept. The cookie carries
  them as three OPTIONAL short keys with no version bump, so every 90-day
  memory already in a browser keeps parsing and a touch with neither costs
  the cookie nothing. The signup stamp inherits both; `adClickIdFor(stamp,
  platform)` answers "which click do I report?" — the most recent touch from
  THAT platform.
- **Two classification defects closed on the way.** Google's iOS click ids
  (`gbraid`, `wbraid`) were not looked for at all, so those ad clicks arrived
  with a google.com referrer and were filed under organic search. And paid
  Bing intent was filed under Google Ads. **`microsoft_ads` is a channel now**
  (registry, label, the dials' bar and spend list), and it is asked BEFORE
  Google: a campaign imported from Google keeps `utm_source=google`, so on a
  Bing click the click id is the truth and the UTM is a leftover.
- **The campaign is data** — `lib/marketing/ad-campaigns.ts`. An ad is typed
  into somebody else's system and never re-read, and it quotes the three
  things here that change: the price, the trial length, and which comparison
  pages were actually checked. The campaign resolves all three
  (`getQuotedPlan`, `TRIAL_DAYS`, `pricingChecked`): **an ad group exists only
  for a vendor whose page carries a dated check**, so an unverified page gets
  no paid traffic by construction. `tests/marketing/ad-campaign.test.ts` holds
  Google's limits, that no rival is named in ad text, that any dollar figure
  in the copy is the resolved price, and that the brief in
  `docs/ads-go-live.md` — the text that gets pasted — is the one the code
  renders (`UPDATE_ADS_BRIEF=1` regenerates it).
- **The landing pages have a door at the top.** A comparison page's only way
  into a trial was its closing block, after the strengths, the matrix and the
  FAQ. The header's button covers that on a desktop; below `lg` the header is
  a logo and a menu icon. Measured in a browser at 390×844 on the built app:
  the first trial button now sits at y≈660 on the Weave page and y≈580 on
  NexHealth's — on the first screen — where it used to be at the bottom of a
  page about 9,500px tall. The line beside it resolves the trial length and
  the price. `tests/marketing/compare-hero-cta.test.tsx` holds its POSITION
  (before the first section and the matrix) on every page in the registry.
- **Not built:** the conversion upload itself (trial started / became paying,
  through Google's Data Manager); a keyword readout on the Acquisition panel;
  the Privacy Policy and Terms the campaign must not launch without.

**Part 11 slice 3 — the trial: 14 days, and a card to sign up (2026-11-23, owner ruling, no migration).**

The ruling replaced the 2026-06-16 trial (seven days, no card) and is the
largest change to who gets charged since the single-plan collapse. No schema
change: `subscription_status` is free text, and the new state is a value.

- **Three kinds of clinic, one resolver (`lib/trial.ts`).** A signup that has
  not added its card is `awaiting_card`: no end date, `expired` + `needsCard`,
  so every existing gate (the wall, the public site, the engines) closes it
  without learning a new rule. A trial with the card on file is a Stripe
  subscription in `trialing`: **Stripe owns that clock**, so the clinic is
  never walled on ours (at the end date Stripe is converting it and the
  webhook is behind). The no-card trial is unchanged, and is what a
  hand-provisioned clinic still starts on.
- **Who is charged today is one pure function.** `trialDaysAtCheckout`
  grants the days only to `awaiting_card`; `createCheckoutSession` passes them
  as `subscription_data.trial_period_days` with `payment_method_collection:
  'always'`, and FAILS CLOSED when it cannot read the row (the card step said
  "nothing is charged today"). One trial per clinic: a cancel writes Stripe's
  `canceled` over the status that grants them.
- **The backstop the Stripe-owned clock needs.** `reconcileOverdueTrials`
  re-reads from Stripe any trial still recorded as running two hours past its
  end, from the `trial-reminders` cron — otherwise a webhook that never
  arrives is free access forever. That cron is a money path on the review
  gate now.
- **The card is a counted signup step.** `/onboarding-complete` is the card
  step for a practice without one (what it costs today, what happens at the
  end, that reminders come first) and the "site is ready" screen after;
  Stripe returns there and the subscription is synced before anything
  renders. `/welcome` waits behind it, so no AI is spent on a signup that
  never finished.
- **The emails say the opposite things to the two trials.** A no-card trial
  is still asked for a card. A card-on-file trial is told the DAY its card is
  charged, in the clinic's own calendar, a week out and the day before — and
  never an amount, which depends on the period, a promo code and tax. The
  welcome moved from signup to the moment the card goes on file (the Stripe
  webhook), claimed once.
- **The platform reads it truthfully.** "No card yet" is its own standing,
  pill and Acquisition column — not "walled" and not "trial ended". The dials
  grade cost per trial STARTED, so a channel that fills the card step with
  people who leave does not look cheap.
- **The copy has one home.** `TRIAL` in `lib/marketing/site.ts` supplies the
  length and the card terms to every public surface; the ad brief, the
  comparison FAQ's JSON-LD, the help docs, the signup form and the outreach
  knowledge file read it. `tests/marketing/trial-copy.test.ts` holds "no
  card" about our own trial, and any typed trial length, at zero across the
  public trees — 52 lines said otherwise on the day of the ruling.
- **Not built, and each needs the owner:** an email to a signup that stops at
  the card step (a new message to customers); a higher cost-per-trial bar now
  that a trial is worth more; the Stripe dashboard's own trial-reminder and
  cancellation-policy-link settings. **Not verifiable from here:** the
  Checkout request against Stripe itself — the first real signup after the
  deploy is the test.

**Part 11 slice 4 — the Privacy Policy and the Terms of Service (2026-11-23, owner direction, no migration).**

- **`/privacy` and `/terms`**, public (the same list the middleware and the
  sitemap read), linked from the footer of every marketing page, from the
  signup form ("by creating an account you agree…") and from the card step.
  Two of the seven paths the DREAM-164 audit used as examples of pages that
  did not exist now do.
- **The words are data (`lib/marketing/legal.ts`) and every figure is
  resolved** — the trial's length, the monthly and yearly price, the cookie
  names and lifetimes — so the Terms cannot promise a trial the checkout does
  not give. The Terms describe the trial exactly as slice 3 built it.
- **One list of the companies information is sent to** (`SERVICE_PROVIDERS`),
  quoted by the policy, including that AI features send the content they work
  on to the AI provider. Adding a provider to the product means adding it
  there in the same change.
- **No compliance claim, by test.** `tests/marketing/legal-pages.test.tsx`
  holds the vocabulary of docs/COMPLIANCE.md at zero over every sentence of
  both documents; the Terms say whose duty the health-privacy laws are and
  state that they claim nothing. Texting is not mentioned.
- **What a careful reader should know:** nobody qualified has read these. The
  clauses that most need it are the limit of liability, the governing-law
  clause (Arkansas), the founding-rate promise restated as a term, and what
  the Terms say — and deliberately do not say — about patient information. No
  refund policy is stated; no data-processing addendum and no business
  associate agreement is offered, because those decisions are still open
  (11.5 item 3).

**Part 12 slice 1 — the organic foundation (2026-11-24, owner ruling, no migration).**

- **One list of what the marketing site publishes**
  (`lib/marketing/public-pages.ts`). The sitemap renders it and the search
  notice reads it, so a page cannot be in one and missing from the other.
  Each page carries a real `lastModified` or none, and a CONTENT KEY that
  moves exactly when the page's content does: a registry page is keyed on its
  own entry, pricing on the resolved price and trial, the legal pages on
  their date, an article on its own last change, the blog index on what its
  cards show. A hand-written page carries a constant — announced once, then
  left to ordinary crawling. That limit is stated, not papered over.
- **Search notices (IndexNow)** — `lib/indexnow.ts` (the protocol, pure and
  edge-safe), `lib/services/indexnow.ts` (the pass), `/api/cron/search-notify`
  (hourly, a `JOBS` entry). A RECONCILE, not an event: it sends the difference
  between what is public and what the engines were last told, so the
  protocol's "do not resubmit unchanged URLs" holds by construction — no
  deploy, restart, retry or autosave can re-send a page. The record lives
  under its own key of `platform_config` (the seventh), passed whole.
  **Three refusals to guess:** both reads are strict and a failure sends
  nothing (a failed posts read must not announce every article as deleted; a
  failed record read must not re-send the site); a page is marked announced
  only on 200 or 202; and the pass fetches its own key file first, because an
  engine that cannot read it discards the notice silently. The first notice
  ever waits until the process has been up ten minutes — the protocol fetches
  the key AFTER accepting the first request, and during a rolling deploy that
  fetch can land on the old version. Inert wherever the app URL is not a
  public https host: no laptop, test or browser harness makes a request.
- **The key file** is answered by the middleware at the root of every host,
  before any host logic. The key is public by design and committed for that
  reason. Not on `SERVICE_PROVIDERS`: what is sent is the address of our own
  public pages, no information about any person.
- **The owner can see it ran.** The platform's Search Console page gained a
  card, "Bing and the other search engines": when the last notice landed, how
  many pages, and a warning mark (never colour alone) with the reason when
  one was refused. Dated in the owner's timezone. A clinic never sees it.
- **The demo practice is `noindex`** — an `X-Robots-Tag` header on every
  response under its path, by subdomain and by `/site/<slug>`. A seeded
  practice with an invented address and `Dentist` structured data was
  indexable on the platform's own domain. A real clinic never gets the header,
  including one whose slug merely starts like the demo's.
- **A fallback font is no longer preloaded on every page.** Geist Sans sits
  behind Nunito in the dashboard's stack and no public page reads it; it was
  a 70 KB high-priority request on every page of the platform. Declared with
  `next/font/local`, `preload: false`; the variable still resolves. Checked in
  the built HTML and in a browser. NOT fixed: the mono face (71 KB) is still
  preloaded on clinic sites, which do not use it.
- **The last five comparison pages, re-read against the vendors' own sites.**
  None of the five publishes a price; each page says so and attributes its
  figure to third parties. **(WRONG FOR TWO OF THE FIVE — Podium and Tebra
  do publish. Found and corrected the next day; slice 5 below has the
  account and the method that replaced this read.)** Corrected in the COMPETITOR'S favour where the
  read required it: RevenueWell's monthly contracts, free trials, shared
  inbox and phone add-on; Adit's no-binding-contract answer; Dental
  Intelligence's phones and insurance verification; Podium Phones. Claims the
  read could not confirm are gone (a RevenueWell product name its site no
  longer shows, "vendor-branded", postcards; "runs under its own brand" for
  Dental Intelligence; every unhedged statement of Tebra's contract terms).
  Tebra's home and pricing pages do not mention dentistry, and the page now
  says that. **How read:** four first-hand, by fetching the page and
  searching its text; Adit's through the fetch tool twice, because its site
  answers a plain request with a challenge page. One RevenueWell claim rests
  on its help centre, which refused both readers — kept on a search engine's
  copy of the article, and reworded to say only what that copy says.
- **"No check, no date" outlived its last example.** With all eight read, the
  tests that picked an unread entry had nothing to pick. The rule is held on
  a planted one now (`tests/marketing/unchecked-comparison.test.tsx`): no
  date on its page, none in the sitemap, no ad pointed at it.
- **The listing kit** (`lib/marketing/listing-kit.ts`) — the copy for G2 and
  every other profile, generated from the resolved price, trial, insurance
  allowance and comparison registry, and printed into
  `docs/organic-go-live.md` between markers a test compares. "Dental" beside
  the name in every field; no compliance word, no texting, no phones, no
  superlative; the trial always with its card; the list price left out
  (11.5 item 1); Open Dental left out (11.5 item 7).
- **`docs/organic-go-live.md`** — the runbook.
- **Verified live, 2026-11-24:** `/`, `/pricing` and `/sitemap.xml` answer 200
  to the user agents of OpenAI's search crawler, ChatGPT's fetcher, GPTBot,
  PerplexityBot, ClaudeBot, Bingbot and Googlebot.
- **What a careful reader should know.** No notice has been sent to a real
  engine: the pass is inert outside the public host, so its first run is the
  first hour after deploy. The protocol's response codes are implemented from
  its documentation, not observed. "Bing's index does not hold the site" was
  never established: the two queries behind it were answered with unrelated
  pages, which is how Bing answers an automated visitor, so it is unknown
  until Webmaster Tools says (corrected 2026-11-24). And none of this is the lever
  that matters most — Part 12 item 3 is the owner's, and it has not started.

**Part 12 slice 2 — `/about`: which DreamCRM this is (2026-11-24, no migration).**

- **A facts page** (`lib/marketing/about.ts`, `app/(marketing)/about/`). The
  site had no page whose job was to STATE what the product is; the home page
  argues, the tour shows, pricing prices. This one is a definition list in the
  server HTML — what it is, who makes it, who it is for, what it costs, the
  trial with its card, what it works with — then what is included, what it
  does not do, a note that other products share the name, and the eight
  comparisons.
- **It writes almost nothing of its own.** The summary, the definition, the
  audience, the price, both lists and the comparison links are the listing
  kit's and the registry's, compared by test. A product described identically
  on its own site and on a marketplace gives each page a second witness.
- **What it withholds, by test:** the operator's name and email (the Privacy
  Policy carries them; a marketing page naming the owner is his ruling), the
  street and ZIP (the town and state are derived from the operator record,
  never typed), Open Dental (11.5 item 7), every compliance word, and the
  name of any other product called DreamCRM.
- **Registered once.** `/about` is on `MARKETING_PUBLIC_PATHS`, so the
  middleware serves it signed-out, the sitemap lists it and the search notice
  announces it — keyed on its own data, so a reprice or a trial ruling
  re-announces it. In the footer of every marketing page, and in the browser
  sweep at three widths.
- **Found by looking, and fixed on nine pages.** The hero button the
  comparison pages gained in slice 1 sits in a row beside its caption, and
  the caption won: from 640px up the button was squeezed to its narrowest
  word and "Start your free trial" broke onto two lines — on all eight
  comparison pages, for a day, and on this page, which copied the pattern.
  Every unit test was green, because none has a layout engine; it was seen
  in a screenshot. The wrapper no longer lets the button shrink
  (`sm:shrink-0`), and the browser sweep now asks the engine how many lines
  every primary button's label occupies, on every marketing page at three
  widths (`data-cta="primary"` is the hook). Watched failing first: eighteen
  failures, exactly those nine pages at 834 and 1440, and none anywhere else.

**Part 12 slice 3 — the pricing guide (2026-11-24, no migration).**

- **`/resources/dental-software-pricing`** — what each vendor's own website
  says about its price and its contract terms, with the page it came from and
  the day it was read; who publishes a price and who makes a buyer call; and
  the questions to ask before a demo. On the day it shipped it said six of
  the eight vendors we compare ourselves with published no price; the true
  count was four (slice 5 below).
- **It has no words of its own about a competitor.** Every pricing line,
  contract answer, source and date is read from the comparison registry
  (`publishesPrice`, `contractAnswer`, `latestPricingCheck` are the three
  readers), compared verbatim by test. A second copy of a competitor's price
  is how a page comes to disagree with the vendor it quotes.
- **Never a number in a vendor's mouth.** A vendor whose site states no price
  is listed as stating none; any figure beside it is attributed to the third
  parties who reported it; the two lists are held to be everyone exactly once.
  Every pricing line in the registry must open one of three ways, so a new
  entry cannot be classified by accident.
- **Dated truthfully.** The guide's own date is the day of the newest read,
  by test, so its sitemap date is real; an entry nobody read is not on the
  page. Its search-notice key follows the registry it is built from, so a
  same-day correction to a competitor's record re-announces the guide too.
- **Not a ranking.** We are not on the list; our price is in the close,
  resolved, with the trial and its card. The page says we make one of these
  products and that this is a reason to check it. The guide shell gained an
  optional closing block, because "everything in this guide is a job the
  software does" is untrue of a guide about other companies' prices.
- **Why a page and not a post.** The platform's seeded posts are written once
  and never touched again; a price list frozen on its publication day is the
  defect `pricingChecked` exists to end.

**Part 12 slice 4 — the first read of Search Console, and what it changed (2026-11-25, no migration).**

- **The first real measurement.** The owner opened Search Console on the
  25th and exported it. The Domain property already existed, so nothing had
  to be verified. Google held **57 pages indexed and 46 known-and-not** across
  the whole domain — marketing site, demo practice and clinic sites together.
  Over three months it showed the site **about 2,100 times for 117 queries,
  and was clicked 8 times.** The full reading is in
  `docs/organic-go-live.md` Part 1; what follows is what it changed.
- **Two pages are 60% of everything Google shows:** the Tebra (PatientPop)
  comparison (937 showings, no clicks) and the recall scripts guide (505).
  The best position on the sheet — sixth on average for `patientpop pricing`,
  240 showings — was never clicked. Our own name is not ours: `dreamcrm`
  averages fifth and `dream crm` thirteenth.
- **It confirmed the demo practice had to leave the index.** About a tenth of
  all showings were the made-up practice appearing for people who were
  looking for real dentists by name. The header shipped the day before.
- **The recall guide gained a letter and a postcard.** Eight queries, 135
  showings between positions 12 and 26, were asking for a recall letter, and
  the page did not contain the word. Both are copy-ready cards written to the
  guide's own three rules, with the cadence step and a plain note on what a
  postcard may say.
- **And it stopped overclaiming.** The page closed on the shell's default,
  "everything in this guide is a job the software does", and opened by calling
  every script one "our own platform sends" — never true of the phone
  scripts, not backable for the texts, and false of a letter. It now says the
  email is the product's own template and sends itself, and that the text,
  the letter and the phone call stay with the practice ("does not send text
  messages today … does not print or mail letters", the listing kit's words).
- **Every comparison page answers "what is {vendor}" first.** The Tebra page
  was shown for "what is patientpop" under two spellings (150 showings) and
  nothing on it said what PatientPop is without also arguing with it. The
  registry gained a required `whatItIs` per vendor — a second wording of facts
  the entry already carries, never a new one, with no price, nothing about us
  and no superlative, by test — and `buildComparisonFaq` emits it as the first
  question on the page and in its `FAQPage` twin.
- **The comparison pages' heads lead with the vendor.** Every one of the
  fifty-odd queries that showed a comparison page named a vendor; none named
  us, and every title opened "DreamCRM vs". The title
  is now `{vendor} pricing & alternatives, compared with DreamCRM`, and the
  description opens with the answer: the dated pricing line's own opening
  clause (`pricingHeadline`, a prefix and never a paraphrase, by test) and the
  day it was read, then our resolved price.
- **What this did not do, and what is not known.** No page was added. Whether
  the page-one showings for `patientpop pricing` are ordinary results or
  sources listed under an AI answer cannot be told from the export, so the
  new head is a reasoned change and not a measured one — the next export says
  whether clicks moved. The four comparison pages with no showings at all, the
  patient-growth guide at position 70, and being fifth for our own name are
  all untouched here.

**Part 12 slice 5 — two wrong lines about competitors corrected, and the PatientPop pricing read out in full (2026-11-25, no migration).**

- **THE CORRECTION, FIRST.** For one day the site said two competitors
  publish no price when they do. **Podium's** pricing page shows $399 and
  $599 a month; the figures are drawn by the page's scripts, and the read of
  the 24th fetched the page's text without running them. **Tebra's** main
  pricing page really is a form with no number — and a second page on its own
  site, `/pricing/overview`, publishes its whole price list; the read of the
  24th looked at one page. Tebra's wrong line was restated in that page's
  meta description by the next day's merge. Both were found on the 25th while
  researching the pricing section below, not by a test: no test can know what
  a vendor's website says.
- **The method that replaced it.** A "no price" line now takes three reads:
  the vendor's pricing page in a real browser with scripts running; a search
  of the vendor's own domain for a price on any other page; and the page's
  structured data. All eight were re-read that way on the 25th and re-dated.
  Two more lines changed without flipping — **Adit** shows a reader no price
  and carries $399 in its pages' structured data; **RevenueWell's** Plans page
  shows none while an offer page elsewhere on its site quotes $199 a month —
  and both lines say so now. Four of eight show a buyer no price on their
  pricing page, not six. The rule is in `CLAUDE.md`; the account is in
  `tests/marketing/comparison-pricing-check.test.tsx`.
- **What else was wrong in Tebra's entry, corrected with it.** "Terms not
  stated on its site" — its terms of service state them (automatic renewal
  for the same term, sixty days' notice, no early cancellation). "A
  quote-only price" in the card that says where we win. Both are gone; the
  card now compares one flat price with per-provider pricing.
- **THE PRICING, LINE BY LINE.** The owner asked for the top of page one for
  "patientpop pricing" (240 showings in three months; he found the page near
  the bottom of page two). What the results above it lack is the vendor's own
  fee schedule and contract terms, which are public on pages nobody quotes.
  So `pricingDetail` in the registry carries them, a line per fact, each
  group under ONE page of Tebra's own site with the day it was read and that
  page's own date: the published prices (from $49 and $99 per provider for
  the package that holds the PatientPop tools), what that package includes
  and marks as not included, the fees outside the subscription (a one-time
  onboarding fee, website hosting as its own monthly line, $84.87 per
  location a year in messaging compliance, $1,000 to export the website),
  the contract, and what happens to the site and the domain on leaving.
- **Third parties are kept apart.** One report, under its reporter's name,
  with the reporter's own caveat. Six sources that refused an automated read
  are named on the page so their absence is not taken for agreement.
- **It says where their price is lower than ours** — for one provider on the
  marketing package alone it is — by test.
- **The rest of what the site can do for that search.** The head leads with
  the name people type ("PatientPop pricing (now Tebra) …", since five
  searches in six used the old name). Three pricing questions join the page's
  questions and their data twin, each answer ending with its source and date.
  The pricing guide links straight to the section. Every comparison page
  names the other seven in its body by "{vendor} pricing". Each page's data
  carries `lastReviewed`, the day its vendor's pages were read, and never a
  modification date nobody recorded.
- **What the site cannot do, said plainly.** The pages above ours are Tebra's
  own and review directories with years of links. Content gets a page from
  the bottom of page two toward page one; the top of page one also takes
  other sites naming us, which is the owner's half (`docs/organic-go-live.md`
  steps 3 to 6). And most people who search PatientPop are not dentists —
  the same treatment on the Weave and NexHealth pages would bring
  better-matched readers, and is the natural next slice.
- **Not re-read.** Only pricing was re-read on the 25th. One thing seen in
  passing and left alone: RevenueWell's Plans page now marks its patient
  portal and its review management "coming soon" on its new platform, while
  our page credits it with both. That errs in their favour; re-read the whole
  entry before touching it.

**Part 12 slice 6 — the cancellation and no-show policy guide (2026-11-25, no migration).**

- **Why this page.** The first Search Console export showed what Google
  already takes this site to be for: the front desk's own paperwork. The
  recall guide was shown 505 times in three months for about two dozen
  script-and-letter searches. This is the second page of that kind, and the
  first item built off the queue in `docs/organic-go-live.md` Part 10.
- **What is on it.** The policy a patient signs, with a three-step ladder
  (first miss forgiven in writing, a fee on the second, a different way of
  booking on the third); the phone script for a late cancellation; the
  same-day voicemail; the first-miss email and the two letters that follow;
  the codes that track a missed visit; and how to make the miss rarer.
- **The first-miss email is the product's own, read rather than retyped.**
  The card renders `EMAIL_AUTOMATION_SPECS.no_show_rebook` (the note the
  product sends when a visit is marked a no-show, on by default) through
  `lib/marketing/guide-templates.ts`, which respells the product's tokens as
  blanks and throws on a token it has no blank for. An edit to the product's
  copy moves the page, and moves the page's search-notice key with it; the
  recall guide's typed email can do neither. The next guides that show a
  product email use the same reader.
- **It picks no numbers.** Every fee, notice period and look-back in a card is
  a blank the practice fills. There is no first-hand source for what practices
  charge, and no statistic about missed visits on the page. The one figure in
  the prose, a full day's notice, is quoted from Open Dental's manual.
- **Who may not be charged is quoted, not paraphrased.** North Carolina
  Medicaid's own page and the California Dental Association's article on
  Medi-Cal, each in its words, linked and dated; the data is
  `lib/marketing/guide-sources.ts`, the first registry of outside pages a
  guide quotes, with the comparison registry's rule (read first-hand, dated,
  a refused page is never cited). The federal guidance both rest on, and two
  other states' pages, refused the reader on the 25th and are not cited. A
  search summary of a trade article said one state's rule differs, and that
  article refused the reader too — so the page says "two" and sends the reader
  to their own state's manual.
- **No dismissal letter.** The ladder stops at booking differently. The page
  says where that letter comes from (the malpractice carrier, the state
  association) and why it is not here.
- **The closing block is worded off the code.** Reminder emails three days
  and one day ahead, on by default, with a button to confirm or cancel;
  patients moving their own visit outside the notice window; a cancelled
  slot offered by email to the waitlist; a missed visit sending the note and
  opening a next-day follow-up for the team. The test ties each sentence to
  the default or the rule that makes it true, so a change there fails here.
  It says in words that the product charges no fee, sends no text today and
  mails nothing.
- **Wiring.** Registry entry (the hub, the sitemap and the search notice all
  read it), the footer link, and a link each way with the recall guide.
- **Tests.** `tests/marketing/no-show-policy-guide.test.tsx` (eighteen) and
  `tests/marketing/guide-templates.test.ts` (four), each watched fail against
  a broken page, a broken reader or a changed default: forty-two mutations,
  all caught (two were missed on the first pass — a code named twice, a due
  date shared with another rule — and both assertions were narrowed to the
  sentence they protect).

**Part 12 slice 7 — the appointment reminder templates guide, and the library's opening claim corrected (2026-11-26, no migration).**

- **The page.** `/resources/dental-appointment-reminder-templates`, queue item
  1: the confirmation email sent when a visit is booked, the reminder email
  for a visit not yet confirmed, the quieter heads-up once it is, the email
  for a moved visit, four reminder texts, the confirmation call and its
  voicemail, the timing, and the federal rule on reminder texts and calls.
- **The four emails are the product's, read from its spec** through
  `productEmail` (slice 6's reader). `REMINDER_GUIDE_EMAILS` is the one list
  of which four: the page, the page's search-notice key and the test all read
  it. The lines the senders add around each (the heading, the button, the
  last line) are typed on the page and checked against the senders' source.
- **The texts are NOT the product's, and the page says so twice** — beside
  them and in the closing block. They are hand-written
  (`REMINDER_TEXTS`) and held by test to what the rule quoted under them
  asks: one message on a realistic fill by the product's own segment math
  (`lib/sms-segments.ts`), the plain alphabet, the practice named first, a
  number to call, nothing about money, the STOP line last. The first draft of
  the longest one measured 176 characters on that fill and went out as two
  messages; the test is why it does not.
- **The rule is quoted, not paraphrased:** seven fragments of 47 CFR
  64.1200(a)(9)(iv), each pinned in the test, read at Cornell's Legal
  Information Institute and labelled so — the government's own copies
  (ecfr.gov, govinfo.gov) refused the reader. The page says it is not legal
  advice and that whether a practice relies on that exemption or on its
  patients' consent is a question for its lawyer and its texting vendor.
- **The closing block is tied to the defaults:** the confirmation, the
  reminder at three days and one day, and the confirmed-visit note are each
  on unless switched off; the timing chapter's "three at most" and "never
  two in a day" are the product's own limits. It says the product sends no
  text today and places no calls.
- **THE HUB'S OPENING LINE WAS FALSE AND IS CORRECTED.** `/resources` opened
  with "the scripts are the ones our own platform sends". That stopped being
  true guide by guide — phone scripts, then texts, then a mailed letter, then
  a policy to sign — and each guide was corrected as it changed while the
  sentence above all of them was not. It now says the emails are the
  platform's and the rest are written to the same rules; a test holds the old
  sentence out. The hub's description and the header menu's line were
  brought up to what is on the shelf.
- **Wiring.** Registry entry, footer link, a link each way with the no-show
  guide, the search-notice key built from the rule, the texts and the four
  emails.
- **Tests.** `tests/marketing/reminder-templates-guide.test.tsx` (fourteen)
  plus one on the hub; thirty-one mutations, all caught.

**Part 12 slice 8 — the review request templates guide, and one legal claim in an older guide cut back to what was read (2026-11-26, no migration).**

- **The page.** `/resources/dental-review-request-templates`, queue item 3:
  the review request email, a one-message text, what to say at the front
  desk, the wording for a card on the counter, two public replies, how often
  to ask, and what Google and the FTC allow.
- **The one guide where the template itself can break a rule.** A request
  that says "if you loved your visit, leave us five stars" is the practice
  selectively soliciting positive reviews, in the words of the Google policy
  the page quotes. So the first thing the test holds is the cards: none asks
  for a good review, names a number of stars, offers anything in return or
  asks for a name, and every ask says in its own words that a bad answer is
  welcome.
- **The email is the product's**, read from its spec; its button is checked
  against the sender. Its own wording — "good, bad, or in-between" — is the
  sentence the guide tells a practice to keep.
- **The rules are quoted, each fragment pinned:** seven lines of Google's
  Maps user-generated content policy, two of its Business Profile help page,
  and the FTC's rule on paid reviews (16 CFR 465.4, read at Cornell's Legal
  Information Institute). The rule's section on a business's own people
  (465.5) is named by its title and not summarised; it runs to conditions a
  one-line paraphrase would get wrong.
- **The text is hand-written, one message on the sample fill,** and the page
  says a review request is not among the purposes the calling rule's
  health-care allowance lists — so text only patients who agreed to it.
- **The replies never confirm a patient,** by test.
- **The closing block is tied to the schema's defaults:** sent when a visit
  is marked complete, one ask per patient per year, the same page for every
  patient (the private note on, the star ask off). It says the product sends
  no text today.
- **A CLAIM IN THE PATIENT-GROWTH GUIDE WAS CUT BACK.** It said review gating
  "violates the FTC's fake-reviews rule and Google's policies". Google's
  policy says so in words the registry now quotes. The sections of the FTC's
  rule read for this slice (465.2, 465.4, 465.5, 465.7) do not say it in any
  words that can be quoted, so the sentence now claims the half that was read
  and links to the new guide. Its search-notice key follows the quoted line.
- **Seen and NOT fixed here — a follow-up.** The two guides written in
  September (patient growth, membership pricing) carry figures and
  comparisons with no source ("100+ Google reviews", "converts multiples
  better", "almost every time"). The registry's content law is "no invented
  statistics". They need a re-read against it, sentence by sentence; that is
  its own slice, and it is on the queue in `docs/organic-go-live.md`.
- **Tests.** `tests/marketing/review-request-guide.test.tsx` (sixteen);
  thirty-three mutations, all caught (one was missed on the first pass — a
  caveat said twice — and the assertion was narrowed to the one it protects).

**Part 12 slice 9 — Weave's pricing, read out line by line (2026-11-26, no migration).**

- **Why Weave.** It is the largest name a dentist searches among the eight,
  and in the first Search Console export its page turned 42 showings into
  three clicks, the best rate of any comparison page. Queue item 4.
- **What was read, on the 26th, three ways.** Its plans page and its pricing
  page in a real browser with scripts running; its own sitemap, searched for
  any other page carrying a price (there are those two, and promotion pages
  with no number); and both pages' structured data (no price in either).
  Then its terms of service, which carry their own date (October 2, 2026).
- **What the section says.** The base plan from $199 a month and two bundles
  at $149 each, with the page's own statement that other add-ons are "at
  varying prices"; the three named tiers that show no number; that the price
  of a selection appears after an email address is entered; no free trial of
  the full platform, in Weave's words.
- **Both clauses on price, and no choosing between them.** The terms say fees
  stay fixed during the initial term, with exceptions, and separately that
  they may rise by up to 10% in any twelve-month period without notice. The
  section prints both. Reconciling them would be our reading of a contract.
- **The contract, as its two pages put it.** The plans page: no long-term
  contract required, discounts on year-long ones. The terms: an order with no
  stated term renews monthly and is cancelled on thirty days' notice; one
  with a stated term is owed in full and, at a year or more, renews
  automatically. Our comparison row ("no long-term contract required, per
  its plans page") stands, and the section adds what the terms add.
- **Leaving.** A cancellation is not effective until every phone number has
  been ported out; leased phones go back within ten business days; data is
  made available on written request within thirty days.
- **No third party's figure.** The review directories cannot be read from
  here, so none is repeated and the section says so. That exposed a hole: the
  "Not read" line was rendered only inside the branch that lists reports, so
  the first entry with none would have dropped it. The card now renders in
  both cases; a test holds both branches.
- **It says where Weave is lower** — its base plan is a dollar under ours —
  and what that base plan is (a phone system, which this product is not).
- **Dates.** Weave's stamp moved to the 26th; the pricing guide's date moved
  with it, as its test requires. The other seven are unchanged.
- **Tests.** Weave's facts are pinned beside the generic rules in
  `tests/marketing/pricing-detail.test.tsx`; fifteen mutations, all caught.

**Part 12 slice 10 — the new-patient welcome letter guide (2026-11-26, no migration).**

- **The page.** `/resources/dental-new-patient-welcome-letter`, queue item 7:
  the first phone call, a welcome email, a one-page letter for the patients a
  practice mails, the forms request, the portal invitation, a what-to-bring
  list, and when the privacy notice is due.
- **Which emails are the product's is said on the page, and held.** The forms
  request and the portal invitation are read from their specs, with the
  senders' own buttons. The welcome email and the letter are hand-written —
  the product has no "welcome" email — and a test keeps the page from
  claiming them, which is the mistake the library hub carried until slice 7.
- **The forms claim is conditional because the feature is.** Intake forms are
  off until a practice switches them on (`patientFacingIntakeOpen`). The
  closing block says "switch intake forms on"; a test fails if it ever says
  forms go out with every booking.
- **No card makes the patient wait, promises treatment or names a price.**
  The opening paragraph quotes "please arrive fifteen minutes early to
  complete paperwork" as the thing to avoid, and no card may say it. What
  happens in the chair is the dentist's to promise.
- **The privacy-notice timing is quoted, by citation:** six fragments of
  45 CFR 164.520(c)(2), read at Cornell's Legal Information Institute. The
  statute's four-letter name appears nowhere on the page — beside our product
  it would read as a claim about our standing under it — and the same test
  that pins the quotations holds that.
- **Wiring.** Registry entry, footer link, links on to the reminder, review
  and recall guides and one back from the review guide, the search-notice key
  built from the rule and the two product emails.
- **Tests.** `tests/marketing/welcome-letter-guide.test.tsx` (twelve);
  twenty-seven mutations, all caught.

**Part 12 slice 11 — the two September guides, re-read against the library's own content law (2026-11-26, no migration).**

- **What was wrong.** The resource registry's content law is "no invented
  statistics", and it was written beside two guides that broke it. The
  patient-growth guide said most new patients pick from the map's three
  tiles, that winning practices carry 100+ Google reviews, that an evening
  review request "converts multiples better", that unverified listings "get
  outranked", and that "we've watched a practice lose essentially all of its
  online traffic" to a dead link. The membership guide said what practices
  "commonly" charge and what hygiene costs "in most practices". None had a
  source, and nothing found them for two and a half months because no test
  read prose for a number. Found while building slice 8.
- **Sourced where a source exists.** Google's own help page on local ranking
  was read as served and five of its lines are now quoted, pinned and linked
  (`LOCAL_RANKING`): verifying, complete information, reviews and ratings,
  replies, and that a ranking cannot be requested or bought. They replace the
  guide's own assertions on those five points.
- **Cut where there is none.** The share of patients who pick from the map,
  the review count of "winning practices", the conversion multiple, the
  after-hours share, the "typical practice" and the anecdote nobody could
  verify are gone. The guide now says what to do and stops saying how often
  it works.
- **The membership example says it is an example.** Its lines read as market
  facts ("commonly 10–20%", "a common landing spot"). They are one example's
  choices now, said as choices. Its arithmetic was also inconsistent — a
  target band of $280–$345 a year printed beside a "landing spot" of
  $350–$420 — and has one price inside its own floor and ceiling; a test adds
  it up. The legal note stopped describing what "several US states" require,
  which nobody here had read.
- **A rule for the whole library.** In any prose guide, a percentage in the
  guide's own words is either inside a quotation from a registered source or
  in a sentence that calls itself an example. The guides are imported by
  name and the list is checked against the registry.
- **Dates.** Both guides carry the day they were revised; the growth guide's
  search-notice key now follows the page it quotes.
- **Tests.** `tests/marketing/sourced-guides.test.tsx` (eight); seventeen
  mutations, all caught.

**Part 12 slice 12 — the past-due balance letters guide (2026-11-26, no migration).**

- **The page.** `/resources/dental-past-due-balance-letters`, queue item 9:
  the balance email, three letters from first reminder to final notice, the
  phone call and its voicemail, a payment-plan letter, why there is no text
  template, and when to stop writing.
- **The guide with the most ways to hurt somebody, so the cards are held
  first.** None threatens, shouts or names a consequence of its own — no
  agency, no credit report, no lawyer. The final notice has a blank the
  practice fills from its own financial policy, and the note under it says to
  fill it only with something the practice will do. Every notice carries the
  amount, what it is for and how to pay, as blanks; no card picks a number.
  Every letter leaves a door open for a mistake.
- **The voicemail says nothing about money**, by test: not the amount, not
  "balance", not "account".
- **No text template, and the page says why** in the calling rule's own words
  (the fragment the reminder guide already quotes: such a message "may not
  include accounting, billing, debt-collection, or other financial content").
- **The balance email is the product's**, read from its spec. The shared
  reader learned the `{{balance}}` token for it.
- **The installment rule is quoted and not explained:** one sentence of
  12 CFR 1026.2(a)(17), read at Cornell's Legal Information Institute, beside
  the payment-plan letter. Whether it reaches a practice is a lawyer's answer
  and the page says so; a test keeps the page from answering it.
- **The closing block is conditional three times over.** A balance in this
  product comes from the practice's own software, a pay link needs online
  payments switched on, and the automatic reminder is off until chosen and
  stops at three (`BALANCE_OUTREACH_DEFAULTS`). It says the product is not a
  collection agency.
- **Wiring.** Registry entry, footer link, a link from the reminder guide's
  "what it may not carry" line, the search-notice key.
- **Tests.** `tests/marketing/past-due-letters-guide.test.tsx` (fourteen);
  thirty-one mutations, all caught (one was missed on the first pass — a
  caveat said twice, the third time that shape has been missed, and now named
  as a shape in the test).

**Part 12 slice 13 — the footer's Guides column (2026-11-26, no migration).**

- **What changed.** The footer's hand-kept "Resources" list took six new
  guide links in a day and reached fourteen, each typed twice (the registry
  and `site.ts`). The guides now have their own column, DERIVED from
  `RESOURCE_GUIDES` the way Compare is derived from the comparison registry.
  "Resources" keeps the tools and the hub (`All guides` is new). Every page of
  the site links every guide by name, and a new guide is in the footer the
  moment it is registered.
- **The name is not a field on the guide, and the first draft got that
  wrong.** It put `shortTitle` on each registry entry. A guide's entry is what
  its page's search-notice key is computed from (`public-pages.ts`), so that
  draft moved the key of all nine guides and would have told the engines nine
  pages had changed when only the site's footer had. Caught before commit.
  The names live beside the registry in `GUIDE_SHORT_TITLES`, keyed by slug;
  `GuideSlug` is derived from its keys, so a guide with no name does not
  compile. All 63 public pages' keys were dumped before and after the change:
  none moved.
- **The layout.** The old grid put the brand block and four columns in one
  row. A sixth track in that row leaves a column about 146px at full width
  and 125px at 1024, where nearly every guide label wraps. So from `lg` the
  brand block takes a row of its own and the five columns share the next
  (189px at full width, 163px at 1024); at `md` the six cells make two rows of
  three; one column below. Measured in a browser at 1440, 1280, 1024, 834, 768
  and 390: no sideways scroll, no label past two lines.
- **Tests.** `tests/marketing/footer-guides.test.tsx` (nine): the column
  equals the registry in order; every guide has a name and no name is left
  over; a name is short, plain and one of a kind; Resources holds no single
  guide; the rendered footer has five named column landmarks plus Legal, links
  no page twice, and gives the columns their own row; a guide's entry carries
  only content fields; and renaming every label moves no page's key.
  Twenty-five mutations, all caught.

**Part 12 slice 14 — the unscheduled-treatment follow-up guide (2026-11-26, no migration).**

- **The page.** `/resources/dental-unscheduled-treatment-follow-up`, queue
  item 8: the handoff before the patient leaves, the plan in writing, the
  check-in message and text, the follow-up call and its voicemail, answers
  for cost, nerves, "it doesn't hurt" and time, the year-end benefits note,
  the letter that closes the loop, and a cadence that ends.
- **The one guide about a decision that is somebody else's**, so the cards
  are held to that first. None presses: no deadline of ours, no "before it
  gets worse", no exclamation mark. The first rule on the page is the ADA's
  own sentence about involving the patient in the decision.
- **The front desk never says what happens if the patient waits**, by test:
  no card carries a clinical word of ours. The one script that needs the
  consequence carries a blank for the dentist's sentence, and the note under
  it gives the script for a chart that has none.
- **The voicemail and the text name no treatment and no cost.** The text is
  one segment on the sample fill.
- **The check-in message is the product's**: the saved reply every practice's
  Messages is seeded with, read by name (`savedReply`), which throws if the
  product stops shipping it.
- **The year-end note asks and does not tell.** The ADA's patient site says
  unused benefits do not roll over for most plans AND that plans differ; the
  page quotes both sentences and the template says "if your dental plan runs
  on the calendar year". Who it goes to (patients with benefits left) is in
  each vendor's own words about its own report.
- **Where the list comes from** is the practice software, and the page says
  so in Open Dental's and Dentrix Enterprise's own sentences (the Dentrix
  post is dated 2020 on the page). The close opens with what the product
  does not do: it does not read treatment plans (`NEVER_TOUCHED`).
- **The hub's claim was corrected again.** "The emails are the ones our own
  platform sends" stopped being true with this guide (two hand-written
  emails). It now reads "where an email or a message is one our own platform
  sends, the page says so", which no later guide can break.
- **Noticed and not touched (the app's lane):** the product's own year-end
  campaign email has the subject "Your dental benefits reset January 1",
  stated to every insured patient; the ADA page above says some plans end at
  other times. Reported to the owner.
- **Wiring.** Registry entry and footer name, the search-notice key (sources,
  saved reply, text), links to and from the recall guide, a link to the
  membership pricing guide.
