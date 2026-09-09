# Research 3 — The 2026 B2B SMB SaaS Growth Stack: tools, build-vs-buy, benchmarks, compliance, and what "autonomous marketing" actually is

**Prepared for:** DreamCRM (Dream Create) — $200/mo self-serve vertical SaaS for US dental practices, solo founder building with AI coding agents.
**Date:** 2026-09-09. **Method:** ~45 web searches + ~20 direct page fetches (vendor pricing pages, Navattic's 2026 benchmark report, G2 community guidelines, Google News). The session's search budget ran out before a handful of long-tail checks (Apollo per-seat prices, Capterra's own PPC page, Chicago Midwinter booth rates, Meta's current job-title targeting for dentists); those items are marked accordingly.

**Flag legend used throughout:**
- **[FACT]** — stated on a vendor/primary page or in a reputable secondary source I fetched or that appeared in search results (URL inline).
- **[3P]** — third-party blog/aggregator claim (pricing comparisons, "benchmark" posts); treat as directionally right, not gospel.
- **[INFERENCE]** — my reasoning applied to DreamCRM's situation; not a sourced fact.

**Economic frame for every verdict [INFERENCE]:** ACV ≈ $2,400 (founding rate; $6,000 at list). At a 3:1 LTV:CAC target and ~30-month expected life, the all-in CAC ceiling is roughly $1,500–2,400 per paying clinic, and the *marginal-tool* budget is a fraction of that. Anything whose entry price is ≥$1,000/mo needs to bring ≥1 net-new clinic per month by itself to be defensible. That single rule kills most of the enterprise MarTech layer below and points the strategy at owned channels, review sites, partners, and code the founder can write.

---

## 0. Six things that changed in 2026 that reshape the whole map

1. **G2 bought Capterra, GetApp and Software Advice from Gartner** (announced Jan 29, 2026, closed Feb 5, 2026, ~$110M) [FACT — https://blastra.io/blog/g2-acquires-capterra-gartner-digital-markets/, https://valasys.com/g2-acquires-capterra/]. Dashboards, sales teams and pricing are still separate for now [3P — https://blastra.io/guides/how-to-navigate-g2-and-capterra/]. The "review site" layer is now a single vendor with two funnels; expect consolidation of programs and pricing within 12–24 months.
2. **Salesforce is acquiring Fin (formerly Intercom) for $3.6B** (definitive agreement June 15, 2026; CNBC, TechCrunch, MarTech, Salesforce newsroom) [FACT — Google News RSS query, https://news.google.com/rss/search?q=Salesforce+acquire+Intercom+Fin]. Fin's outcome pricing is unchanged as of writing [3P — https://www.getmacha.com/blog/intercom-fin-pricing], but a solo founder should assume the SMB tier gets folded into Agentforce packaging.
3. **HubSpot moved Breeze Customer Agent and Prospecting Agent to outcome pricing on April 14, 2026** — $0.50 per resolved conversation, $1.00 per recommended lead, credits at $10/1,000 [FACT — https://www.hubspot.com/company-news/hubspots-customer-agent-and-prospecting-agent-now-you-pay-when-the-task-is-complete, https://martech.org/hubspot-moves-to-outcome-based-pricing-for-some-breeze-ai-agents/].
4. **LinkedIn went from warnings to suspensions and hit a vendor directly** — in March 2026 it removed HeyReach's company page and banned the founder's profile; ~40% of accounts on non-API automation (HeyReach, Expandi, Dripify, Waalaxy) saw restrictions Jan–Mar 2026 per one vendor study [3P — https://www.joinvalley.co/blog/linkedin-automation-safety-2026, https://northlight.ai/blog/is-linkedin-automation-against-the-rules].
5. **Google's March 2026 core update named "scaled content abuse" explicitly**; template/AI pages without added value lost 60–90% of rankings, and the penalty is site-level [3P — https://www.digitalapplied.com/blog/programmatic-seo-after-march-2026-surviving-scaled-content-ban]. Recovery 6–12 months.
6. **The FTC Consumer Reviews & Testimonials Rule (16 CFR 465, effective Oct 21, 2024) is now an active enforcement priority** — ten warning letters went out in the 2025 holiday season; penalties run to ~$53K per violation [FACT — https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers, https://www.arnoldporter.com/en/perspectives/blogs/consumer-products-and-retail-navigator/2026/01/ftc-warning-letters-over-consumer-review-rule].

Plus three legal facts that constrain outbound: the 11th Circuit vacated the FCC's TCPA one-to-one consent rule (Jan 24, 2025) and the FCC formally removed it in July 2025 [FACT — https://www.mofo.com/resources/insights/250130-eleventh-circuit-vacates-fcc-s-tcpa-one-to-one-consent-rule, https://www.consumerfinanceinsights.com/2025/09/15/the-fcc-issues-final-rule-formally-eliminating-the-one-to-one-consent-requirement/]; the CCPA B2B exemption expired Jan 1, 2023 so California work emails/phones are fully covered personal information [FACT — https://www.truevault.com/learn/ccpa-employee-and-b2b-data]; and Gmail/Yahoo/Microsoft now hard-bounce (5xx) unauthenticated or high-complaint bulk mail with a 0.3% spam ceiling and 0.1% target [FACT — https://powerdmarc.com/bulk-email-sender-requirements/, https://redsift.com/guides/bulk-email-sender-requirements].

---

## 1. Attribution & analytics

| Tool | 2026 price | Verdict for DreamCRM | Benchmark / note |
|---|---|---|---|
| **PostHog** | Free: 1M events/mo + 5,000 session replays/mo; then $0.00005/event (1–2M) falling to $0.000009 at 250M+; identified-person events carry an extra ~$0.000198/event surcharge; replays $0.005 → $0.0015 [FACT — https://flexprice.io/blog/posthog-pricing-guide, https://www.budgetforge.dev/tools/posthog-pricing-2026] | **BUY (free tier).** Session replay + funnels + feature flags + surveys in one SDK. You will not exceed the free tier for years. Do NOT build replay. | 97% of PostHog companies stay on the free tier [3P — flexprice]. Watch the "4× event trap": autocapture + identified-person surcharge can quadruple a bill [3P — budgetforge]. |
| **June** | Dead. Acquired by Amplitude late 2024; wound down Aug 8, 2025 [FACT — https://www.productgrowth.blog/p/why-is-june-so-joining-amplitude, https://usermaven.com/blog/june-analytics-alternatives] | n/a | Its B2B "company-level" reports are the thing to replicate in-house (see below). |
| **GA4** | Free | **BUY (free) but only as the ads-platform bridge.** Needed for Google Ads conversion import and Search Console linkage; not your source of truth. | — |
| **Segment (Twilio)** | Free tier (Free/Team plans) then per-MTU; not re-verified this session | **SKIP.** One app, one warehouse (Postgres) — a CDP is a tax on a single-product company. | — |
| **Dreamdata** | From $599/mo (30k MTU); free web-analytics tier exists; mid-market $25–45K/yr [3P — https://www.factors.ai/blog/dreamdata-vs-hockeystack, https://abmatic.ai/blog/hockeystack-vs-dreamdata] | **SKIP / BUILD.** Multi-touch attribution across many channels is exactly what `signup_attribution` + `marketing_pageview` already do. | — |
| **HockeyStack** | From ~$1,399/mo (10k visitors); GTM Execution ~$2,200+/mo; no self-serve tier [3P — https://www.fibbler.co/blog/hockeystack-vs-dreamdata] | **SKIP.** Priced for $50K+ ACV. | — |

**Build-in-house verdict [INFERENCE]:** DreamCRM already has the hard part (first-touch stamp written once at org creation, a www pageview table with a channel dimension, the spend "dials" cockpit). What's missing and cheap to write: (a) a *company-level* funnel (visit → grader run → trial → paid) keyed on `signup_attribution` plus a last-touch column — June's whole product was this view; (b) offline-conversion export to Google Ads (a cron that posts paid conversions with `gclid` back), which is the single prerequisite every PMax/Search guide calls non-negotiable [3P — https://www.farsiight.com/resources/performance-max-for-b2b/]; (c) PostHog replay on the grader + pricing page only. Total: a weekend with agents. Buy nothing above the free tiers.

---

## 2. Lifecycle / email

| Tool | 2026 price | Verdict | Note |
|---|---|---|---|
| **Resend** (current) | Usage-based; AUP **prohibits cold outreach, purchased lists, scraped data** — every recipient must have opted in [FACT — https://resend.com/legal/acceptable-use] | **KEEP for everything opt-in** (transactional, lifecycle, clinic→patient). | Your own docs already flag the cold-email red line; this confirms it verbatim. |
| **Loops** | Free ≤1,000 contacts and ≤4,000 sends/30d; paid by contacts (~$49 at 5k → ~$399 at 100k per 3P), transactional included, no seat fees [FACT — https://loops.so/pricing; 3P — https://www.sequenzy.com/versus/loops-vs-customer-io] | **BUY only if you want a visual journey editor for prospect nurture.** | Founder-led teams pick Loops; Customer.io when you need SMS/push/in-app off product events [3P — sequenzy]. |
| **Bento** | $29/mo up to 5,000 active users; $0.01/user 5k–50k; transactional $5/mo to 12,500; Bento Chat +$30/mo [FACT — https://bentonow.com/pricing] | **Best "buy" in the layer if you buy at all** — includes site tracking, forms, chat, SMS, CRM-lite. | Charges only for *active* users, which suits a long dormant-prospect list. |
| **Customer.io** | From $100/mo (5k profiles, 1M emails) [3P — https://www.authencio.com/blog/customerio-overview-features-pricing-pros-cons-best-alternatives] | **SKIP** at this stage. | Overkill until multichannel product-event journeys matter. |

**Build verdict [INFERENCE]:** You already run 22 crons, a proposal/approval spine, a grader-nurture touch, and per-clinic sender identity. A prospect-lifecycle engine (grader lead → day-3 nudge → day-14 re-grade → trial → activation nudges → win-back) is a `lib/services/` module + one table, not a product. **BUILD.** The one thing worth buying is a *separate sending domain and provider* for anything that is not strictly opt-in (see §21 and §Compliance).

---

## 3. Website personalization, CRO and visitor identification

| Tool | 2026 price | Verdict | Legality |
|---|---|---|---|
| **Mutiny** | $25–45K/yr Starter (20–50k MUV); commonly $60K+; Mutiny+Clearbit $70–140K/yr [3P — https://abmatic.ai/blog/mutiny-pricing, https://www.conversionwax.com/mutiny-pricing/] | **SKIP — BUILD.** | — |
| **Clearbit Reveal** | Now part of HubSpot; company-level IP→firm only | **SKIP.** Dental practices are small; IP-to-company resolution rarely names a 4-chair practice. | Company-level is the safer class. |
| **RB2B** | Free (150 resolutions/mo) → Starter $79 → Pro $149 → Pro+ $199 (person-level, "US Only", 35–45% coverage) [FACT — https://www.rb2b.com/pricing] | **DO NOT DEPLOY person-level.** | RB2B says it is a registered data broker and US-IP only [3P — https://www.leadpipe.com/blog/is-rb2b-safe-to-use/]. Pre-consent pixel firing is the trigger in "virtually every" CIPA suit; the CPPA fined PlayOn Sports $1.1M in March 2026 for sharing tracking data without a compliant opt-out [3P/FACT — https://securityboulevard.com/2026/05/anonymous-website-visitor-identification-how-it-works-top-tools-compared-and-gdpr-ccpa-compliance/]. Consensus 2026 guidance: company-level only, person-level only with documented consent + DPIA [3P — https://mojoauth.com/blog/anonymous-website-visitor-identification-gdpr-ccpa-tools]. |

**Build verdict [INFERENCE]:** The personalization that actually moves a $200/mo vertical SaaS is *segment-by-URL/UTM* (Pediatric vs Cosmetic landing copy, "you came from the grader" states, "your competitor page → their-gaps hero"), which is a `searchParams` branch in Next.js — you already do a version of this with the prospect-branded presenter mode. Add: a consent-gated (CMP) analytics loader so nothing fires pre-consent for California visitors, and never buy person-level de-anonymization. Also worth building: the grader's *report page* as the personalization hub (it already knows the practice's name, site, and gaps).

---

## 4. Interactive demos

| Tool | 2026 price | Verdict |
|---|---|---|
| **Storylane** | Free (1 demo) → Starter $40/mo annual (1 seat, no HTML) → Growth $500/mo annual (5 seats, HTML capture, A/B) → Premium $1,200/mo [FACT — https://www.storylane.io/pricing] | **BUY Starter ($40)** if you want screenshot-style tours in a week. |
| **Navattic** | ~$500–600/mo unlimited seats, highest-fidelity HTML clone [3P — https://www.arcade.software/post/navattic-vs-storylane-vs-arcade-which-should-you-choose-in-2024, https://www.storylane.io/blog/storylane-vs-navattic] | **SKIP.** |
| **Arcade** | Pro ~$32/user/mo; Growth ~$297.50/mo w/ HTML capture [3P — arcade.software] | Alternative to Storylane Starter. |

**Benchmarks [FACT — Navattic State of the Interactive Product Demo 2026, https://www.navattic.com/report/state-of-the-interactive-product-demo-2026]:** top-25% demos: 55% engagement (past step 1), 43% completion, 29% CTA click-through; top 1%: 71% CTR. 1–6 steps per flow completes best; multi-flow demos complete 48% more often; **ungated beats gated (+6% engagement, +7% completion)**; 62% of top performers put the demo on product pages; only 18% of 5k B2B SaaS sites have an interactive-demo CTA (up from 12%). Storylane cites "$1.3M pipeline attributed" and "35% increase in pipeline" for named customers [FACT (vendor claim) — storylane pricing page]. Persona-specific demos "6.6× more MQLs" [3P — search summary; vendor-sourced].

**Build verdict [INFERENCE]:** DreamCRM has something no demo tool can fake: a real demo clinic ("Dream Dental") that resyncs every deploy, a prospect-branded presenter mode, and a `/demo/compare` page. **BUILD** a *live sandbox* ("Try it as Dream Dental" — read-only demo org session minted from a token, self-expiring, no signup) rather than a click-through clone. That is the ungated, product-page-placed, multi-path demo the report says wins, and it is mostly auth + cookie work you already have (`demo_context`). Buy Storylane Starter only for embeddable 6-step GIF-style tours in emails/G2 listing.

---

## 5. Chat / AI sales agents on site

| Tool | 2026 price | Verdict | Benchmark |
|---|---|---|---|
| **Intercom Fin** | $0.99/resolution, 50-outcome minimum (~$49); **Fin for Sales $10 per qualified lead** (customer defines "qualified"), $1 per disqualification/handoff [FACT — https://www.intercom.com/blog/building-outcome-based-pricing-for-fin-for-sales/; 3P — https://www.gleap.io/blog/intercom-fin-ai-pricing-2026] | **SKIP** (acquisition uncertainty + seat plans on top). | Real-world resolution 42–50% [3P — getmacha]. |
| **HubSpot Breeze Customer Agent** | $0.50/resolved conversation (Pro/Enterprise only) [FACT — hubspot.com company news] | **SKIP** (requires Pro hub). | — |
| **Chatbase** | Free → Hobby $32 → Standard $120 → Pro $400/mo annual; +$25/agent, branding removal $99/mo [3P — https://talkbar.ai/blog/chatbase-pricing-2026] | **SKIP — BUILD.** | — |
| **Qualified (Piper)** | No public price; Premier/Enterprise/Ultimate, demo-only; claims "3× more meetings in 6 months" (Emburse), "22% more opportunities" (Emplifi) [FACT (vendor claims) — https://www.qualified.com/pricing] | **SKIP.** Enterprise ABM tool. | — |
| **Drift** | Folded into Salesloft; enterprise-only | **SKIP.** | — |

**Build verdict [INFERENCE]:** You already ship a chat widget for clinics' public sites and have `lib/ai.ts`, the Brain (`effectiveProductKnowledge`), and the demo-booking token flow (`/d/[token]`). A www-side sales agent that (a) answers from the Brain, (b) offers to run the grader on the visitor's site, (c) books a demo slot from the owner's availability, is a few hundred lines. **BUILD**, and price-compare: Fin would bill you $10 per qualified lead — your own agent costs API tokens. What stays human: any pricing negotiation and anything touching PHI/HIPAA claims (route to the founder; see compliance).

---

## 6. Lead magnets / free tools

You already have the grader and ROI calculator. The category tools (Outgrow, Involve.me, Typeform calculators, ~$30–100/mo) add nothing a Next.js route can't. **BUILD, always.** The pattern to copy [INFERENCE]: one flagship *engineering-as-marketing* tool per competitor gap the prospecting engine already scores (no-website / weak-website / weak-presence) — e.g. "Google Business Profile checker" (you already parse listing snapshots), "missed-call cost calculator", "review-velocity benchmark for your ZIP". Each tool = a programmatic-SEO-safe page *because it produces unique, live data per input* (see §10 — that is precisely the surviving pSEO pattern). Benchmark: no reliable public conversion number for graders in 2026 was found in-budget; HubSpot's Website Grader remains the canonical case [INFERENCE].

---

## 7. Review-site management (G2 / Capterra / GetApp / Software Advice / Crozdesk)

**Pricing [FACT — https://sell.g2.com/plans]:** G2 Free (profile, "Users Love Us" badge, non-incentivized collection) → **Starter $299/mo no-contract or $2,999/yr** (managed review campaigns, $100 in gift-card credits, custom CTAs, report/milestone badges, G2 Clicks PPC) → Professional/Enterprise custom ($500/$1,000 gift-card credits, buyer-intent add-on, lead forms). Renewal reportedly jumps to ~$6,000/yr for <50-employee vendors [3P — https://blastra.io/blog/g2-capterra-vendor-pricing-compared/]. **Capterra PPC:** $500/mo minimum, $2/click floor, bids by category; one campaign runs across Capterra + GetApp + Software Advice [3P — https://www.spotsaas.com/blog/capterra-advertising, blastra]. Dental-software-category CPC specifically was not published anywhere I could reach; Capterra's own vendor PPC page 404'd [gap]. Expect $3–10/click for "dental practice management software" [INFERENCE from the $2 floor and healthcare-vertical competition].

**Incentive rules [FACT — https://legal.g2.com/community-guidelines]:** max $100 per review incentive (cash, gift card, swag, credits); eligibility "never based on the opinions, positive or negative"; G2 labels incentivized reviews; business partners may review but are labeled and excluded from the G2 Score; employees and competitors' employees may not. This mirrors the FTC rule (§Compliance).

**"Review velocity" [INFERENCE + 3P]:** Recency weighting means 3–5 fresh reviews a month beats 40 stale ones; highadvocacy/famewall guides recommend in-app asks at moments of delight and quarterly campaigns [3P — https://highadvocacy.com/blog/how-to-get-more-g2-reviews/]. DreamCRM's proposal spine can *ask for a G2/Capterra review* as a proposal to the clinic owner at a real trigger (first Google review earned, first empty-chair campaign booked, 90 days on Premium) — no vendor needed.

**Benchmark:** I could not fetch a 2026 G2 "category leader → demo lift" study within budget (search cap hit). Treat any such number as vendor marketing [INFERENCE]. **Verdict: BUY G2 Starter monthly ($299) only once you have ≥10 reviews and a badge to defend; run the Capterra PPC minimum ($500/mo) as a 90-day test with offline-conversion tracking; do NOT sign the annual until CPL is known.** Crozdesk (Black & White Zebra, independent) — free listing, low priority [3P — https://www.spotsaas.com/blog/g2-alternatives].

---

## 8. Affiliate / partner platforms

| Tool | 2026 price | Verdict |
|---|---|---|
| **Rewardful** | Starter $49/mo (≤$7.5k affiliate volume/mo, 1 campaign) → Growth $99 (≤$15k) → Enterprise $149+; **0% transaction fee**, Stripe-native, REST API, PayPal/Wise payouts [FACT — https://www.rewardful.com/pricing] | Closest "buy" comparable — but you already built it. |
| **FirstPromoter** | From $49/mo [3P — https://firstpromoter.com/blog/rewardful-alternatives] | Alternative; no marketplace. |
| **Reditus** | Free to $12k affiliate-ARR, then $49 → $179 → $299/mo; has a SaaS affiliate *marketplace* [3P — https://getreditus.com/blog/reditus-alternatives] | The one feature you lack: discovery. Consider listing there for inbound affiliates. |
| **PartnerStack** | Demo-only; est. $800+/mo + 3–15% transaction fees [3P — https://rekomi.com/blog/partnerstack-alternatives] | **SKIP.** |
| **Impact** | Enterprise | **SKIP.** |

**Verdict [INFERENCE]:** DreamCRM's referral-partner subsystem (Stripe Express payouts, per-invoice commission ledger, $25 floor, partner portal) already *is* Rewardful. Don't re-buy. What partner platforms would add is a marketplace of affiliates; in dental the real "affiliates" are dental CPAs, practice brokers, consultants, supply reps, DSO-lite groups, and the Nifty Thrifty-style deal communities — recruited by hand, not marketplace. Benchmark: partner-sourced revenue for SMB SaaS commonly 10–30% once mature [INFERENCE; no 2026 source in budget].

---

## 9. Customer referral programs

| Tool | Price | Verdict |
|---|---|---|
| **Viral Loops** | $35–279/mo annual (1k–25k participants) [3P — https://wiserreview.com/blog/viral-loops-pricing/] | **SKIP — BUILD.** |
| **ReferralCandy** | E-commerce oriented | **SKIP.** |
| **SaaSquatch** | Quote-based, five figures [3P — spotsaas] | **SKIP.** |

**Verdict [INFERENCE]:** A clinic-refers-clinic program is a proposal type ("Dr. Patel, you've booked 41 new patients this quarter — want to send this to a colleague? They get a month free, you get a month free") + a token landing page — the same token-IS-auth pattern as `/r/`, `/w/`, `/d/`. Compliance: dual-sided *service credit* rewards are fine; **never condition on the referred party leaving a review** and disclose the reward on any testimonial (FTC 465).

---

## 10. SEO / AEO

**Tools & prices [3P — https://zapier.com/blog/best-seo-tools/, https://ampifire.com/blog/semrush-subscription-cost-pricing-plans-in-2026/]:** Ahrefs Starter $29/mo (limited) / Lite $129; Semrush Pro ~$117–140/mo; Surfer Discovery €49/mo; Clearscope Essentials $129/mo. **AEO trackers:** Otterly Lite $29/mo (15 prompts) → $189 (100) → $489 (400); Peec from €89/mo; Profound from $99/mo (ChatGPT-only, 1 seat; 10 engines at higher tiers); Scrunch from $300/mo; Goodie Pro $495/mo (11+ models) [3P — https://www.surmado.com/blog/best-ai-visibility-tools-2026, https://contextbolt.com/blog/best-aeo-tools/].

**Verdict [INFERENCE]:** BUY Ahrefs Starter ($29) for backlink/keyword sanity and Otterly Lite ($29) to track ~15 prompts ("best dental CRM", "NexHealth alternative", "dental practice marketing software", "how do I get more Google reviews for my dental office"...). Build the rest: a weekly agent that runs your prompt set against ChatGPT/Perplexity/Gemini APIs and logs whether dreamcreatestudio.com is cited is ~200 lines and replaces the $189+ tiers.

**What measurably earns AI citations [3P — https://www.digitalapplied.com/blog/ai-search-citation-ranking-factors-2026-data-study, https://www.thehoth.com/blog/how-to-get-cited-in-ai-overviews/]:** 38% of AI Overview citations come from top-10 organic results (so classic SEO still gates it); 72.4% of ChatGPT-cited pages carry a 40–60-word "answer capsule" right under the H2; 44% of citations come from the first 30% of the text; content updated <12 months earns 3.2× more citations; structured H2/H3 + tables + bullets ~65% more citations; Perplexity reacts in days–2 weeks, ChatGPT/AIO 4–8 weeks. **Reddit + YouTube = 78% of social citations**; Reddit is 46.7% of Perplexity's citations and 21% of AIO's, and *comments* are cited more than posts [3P — https://red-engage.com/blog/reddit-citations-in-ai-answers-2026-study, https://www.tryprofound.com/blog/the-data-on-reddit-and-ai-search]. A counter-signal: Reddit citations reportedly fell sharply in ChatGPT while Perplexity doubled down [3P — https://www.pierview.ai/guides/reddit-citations-chatgpt-perplexity-decline-2026] — so don't over-index on one engine.

**llms.txt:** a dud. ~10% adoption; Google does not support it (Illyes, July 2025; Mueller compares it to the keywords meta tag); across 500M AI-bot visits only 408 requested it; 8 of 9 sites saw no traffic change [3P — https://www.gazeseo.com/blog/category/ai-seo/does-llms-txt-work/, https://geojacker.com/llms-txt]. Ship it (it's free) but expect nothing.

**Reddit/Quora presence:** 61% of 49 founder-pitched subreddits ban or 9:1-limit self-promotion [3P — https://oneup.today/blogs/reddit-selfpromo-rules-study-2026]. r/Dentistry ≈162k members, very active [3P — https://gummysearch.com/r/Dentistry/]. The compliant pattern: 3–6 months of disclosed, genuinely helpful participation before any mention; answer *comments* (they get cited); never sockpuppet. **This stays human** — an AI-authored Reddit persona is the fastest way to a ban and a Google spam classification [INFERENCE].

**Wikipedia/Wikidata:** Wikipedia's WP:NCORP needs ~10–20 substantial independent articles about the company; funding/launch coverage is discounted — DreamCRM does not qualify yet. **Wikidata** accepts an item with one serious public reference and feeds AI knowledge graphs; create the entity (founder, product, org, official site, founding date) [3P — https://www.mlforseo.com/knowledge-graph-strategy/wikidata-for-brands-notability-criteria-and-a-realistic-path/, https://www.qwairy.co/blog/wikipedia-wikidata-ai-visibility]. Also keep `Organization`/`SoftwareApplication`/`FAQPage` JSON-LD current — you already ship a JSON-LD suite on clinic sites; mirror it on www.

**Programmatic SEO, post-March-2026:** survive only with *real data differentiation per page* (verified listings, live pricing, real inventory) [3P — https://www.digitalapplied.com/blog/programmatic-seo-after-march-2026-surviving-scaled-content-ban]. DreamCRM's safe pSEO surfaces are therefore: (a) the grader's public *aggregate* benchmark pages ("Dental practice websites in Little Rock, AR: median grade 61/100, 38% have online booking") built from real grader runs, (b) comparison pages with live feature/price matrices, (c) the free tools. Not safe: 500 "dental marketing in {city}" pages.

---

## 11. Video

**Prices [3P — https://aivideopicks.com/posts/heygen-pricing-2026.html, https://zapier.com/blog/best-ai-video-generator/]:** HeyGen Creator ~$24/mo, Pro $99, Business $149; Synthesia Starter $14/mo annual (120 min/yr); Descript Creator ~$24/mo; OpusClip Starter ~$19/mo. A founder stack of HeyGen Creator + Descript + OpusClip ≈ $67/mo.

**Strategy [3P — https://sellontube.com/blog/youtube-for-saas-demos, https://www.growthspreeofficial.com/blogs/youtube-ads-b2b-saas-b2b-2026-benchmarks-formats-roi-vertical]:** product walkthroughs generate 4–6× the demo requests of brand content; "vs competitor" videos have the highest demo-request rate per view of any SaaS format; YouTube Ads work mid-funnel, not as top-funnel direct response. YouTube is also the #1 or #2 cited social source in AI answers (it overtook Reddit in one 2026 study) [3P — https://www.emarketer.com/content/youtube-overtakes-reddit-top-cited-source-ai-answers].

**Verdict [INFERENCE]:** BUY Descript ($24) — the founder's own face and voice in 5–8-minute walkthroughs ("How Dream Team fills an empty Thursday", "DreamCRM vs Weave for a 2-doctor practice") beats an avatar for trust in a relationship vertical; use HeyGen only for translation/dubbing (Spanish practices) if ever. BUILD: an agent that turns each product changelog into a script + Descript-ready shot list, and a cron that turns published walkthroughs into 3 Shorts via OpusClip's API-less flow (manual) — modest. Measure in demos, not subscribers.

---

## 12. Podcasts

**Guesting:** PodMatch $6–64/mo month-to-month [FACT — https://podmatch.com/pricing]; skews to entrepreneurship/personal-dev shows, weaker for traditional B2B [3P — https://alexberman.com/podcast-booking-platform]. Booking agencies $5k+/mo retainers [3P]. **Hosting:** Transistor $19/mo (20k downloads, unlimited shows) → $49 → $99 [FACT — https://transistor.fm/pricing].

**Verdict [INFERENCE]:** Dental has a dense, owner-run podcast ecosystem (Nifty Thrifty Dentists, Tooth & Coin, The Dentalpreneur, Bulletproof Dental, Dental A-Team, Shared Practices, etc.). **Guest, don't host** — a prospecting-style agent can build the show list from Apple Podcasts/Listen Notes, score by recency and audience, and draft the pitch; the founder records. Skip PodMatch unless the dental shows are on it (spot-check first). Hosting your own show is a 12-month commitment with a 30-episode payback; defer until post-1.0 marketing pivot.

---

## 13. Webinars

**Prices:** Livestorm free (30 attendees, 20 min) → Pro $99/mo → $299+; ~$289+ at 500 attendees; Zoom Webinars from ~$500/mo tier for advanced features [3P — https://easywebinar.com/blog/livestorm-pricing/, https://www.getcontrast.io/learn/livestorm-vs-zoom-webinars]. Contrast pricing not captured [gap].

**Benchmarks [3P — https://www.digitalapplied.com/blog/webinar-statistics-2026-attendance-conversion-data, https://www.cloudpresent.co/blog/average-webinar-conversion-rate]:** median register→attend 41.6%; a 2026 B2B study reported ~38% live-attendee→MQL and 16% MQL→SQL; landing-page registration 20–40%; CPL ≈ $72.

**Verdict [INFERENCE]:** BUY Livestorm free/Pro for a monthly "Fill your empty chairs in 30 minutes" live demo + Q&A. Co-host with a dental CPA/consultant partner for audience. The registration/reminder/replay/lead-routing plumbing is trivial to BUILD on your existing token-auth + reminder infrastructure if Livestorm's attendee metering starts to bite.

---

## 14. Communities

**Prices:** Skool $9–99/mo; Circle Professional $89/mo (real cost $188–277 with add-ons), Business $199; Discord free [3P — https://circle.so/blog/skool-alternatives, https://www.schoolmaker.com/blog/circle-so-pricing].

**The dental reality [3P — https://www.dentaleconomics.com/macro-op-ed/article/16386332/private-dental-facebook-group-etiquette-its-all-about-jbn, https://niftythriftydentists.com/]:** the audience already lives in private Facebook groups — Nifty Thrifty Dentists (~40k, group-buy deals on software/supplies), Dental Practice Owners, Dental Hacks, The Business of Dentistry, The Making of a Dental Startup, Dental Marketing & Profits, Dental Nachos. These groups pre-qualify members, monitor intensely and punish vendor pitches; etiquette is "just be nice/useful."

**Verdict [INFERENCE]:** Do NOT launch your own community pre-1.0. Instead: (1) negotiate a **Nifty Thrifty group deal** (their entire model is vendor discounts for members — a founding-rate deal is a natural fit and the channel is native); (2) founder-only participation in 3–4 groups, disclosed, answering marketing/Google-review questions with no links; (3) an agent may *monitor* groups for questions worth answering (via the founder's own account, manually) but must never post. Later, a customer-only community lives inside the product (Support tab already exists) — not on Circle.

---

## 15. LinkedIn: founder-led content + Sales Navigator

**Prices:** Sales Navigator Core $119.99/mo, Advanced $159.99/mo, Advanced Plus ~$1,600/seat/yr; 50 InMails/mo [3P — https://www.salesrobot.co/blogs/linkedin-sales-navigator-cost]. **Automation:** LinkedIn's UA bans third-party automation and scraping; 2026 enforcement is suspension-first and vendor-targeted (HeyReach) [3P — https://www.joinvalley.co/blog/linkedin-automation-safety-2026]. **Ads:** median B2B SaaS CPC $12–18 direct-response, vertical SaaS $7–10; CPL $103–160 (SMB ICP $80–200/MQL); the consensus rule is LinkedIn ads only at ACV ≥$25K [3P — https://www.growthspreeofficial.com/blogs/linkedin-ads-benchmarks-2026-b2b-saas-cpc-cpl-cost-per-sql, https://benly.ai/learn/linkedin-ads/linkedin-ads-benchmarks].

**Verdict [INFERENCE]:** Dentists are on Facebook and in dental groups far more than LinkedIn; DSO executives and dental consultants/CPAs (your *partner* ICP) are on LinkedIn. So: founder-led LinkedIn content aimed at the partner/DSO layer (2–3 posts/week, drafted by agent from your build log and grader aggregate data, edited by the founder), **no** automation tools, **no** LinkedIn ads at $2.4k ACV. Sales Navigator Core is worth $120/mo only during a deliberate partner-recruiting sprint.

---

## 16. Paid search & social

**Google Search:** dental *services* CPC ≈ $7.85–8.00, CPL $73–84 (consumer side, for context) [3P — https://ppcchief.com/google-ads-cost/dental, https://www.wordstream.com/blog/2026-google-ads-benchmarks]; B2B software terms typically $3–8 CPC [3P]. **Competitor conquesting:** bidding on "Weave", "NexHealth", "RevenueWell" as keywords is allowed in the US; using the mark in headline/copy/display URL is not, absent reseller/informational exceptions; landing page must be relevant and non-misleading; trademark complaints are per-ad since July 2023 [3P — https://bluepear.net/blog/google-ads-trademark-policy, https://www.admapix.com/blog/best-practices/competitor-brand-keywords-google-ads]. Your `/compare` pages are the correct landing targets.

**Performance Max / AI Max:** the consensus is that most B2B companies should not run PMax as a primary; prerequisites are offline conversion tracking, ~30+ qualified conversions/month, brand exclusions (40% of "conversions" in one audit were brand queries), reCAPTCHA, placement exclusions, URL expansion locked [3P — https://www.farsiight.com/resources/performance-max-for-b2b/, https://www.growthspreeofficial.com/blogs/branded-search-cannibalization-pmax-b2b-saas-2026]. AI Max removes keywords entirely [3P — https://www.digitalapplied.com/blog/social-media-ai-advertising-april-2026-meta-google]. Meta Advantage+ "goal-only" campaigns are rolling out; a 640-test incrementality study found Advantage+ underperforms manual over time; all headline lift figures (Google 14%/7%, Meta 7/10/20%) are vendor-reported and unaudited [3P — https://pixis.ai/blog/advantage-vs-performance-max-head-to-head-2026/, https://www.buildmvpfast.com/blog/ai-ad-targeting-meta-advantage-plus-google-performance-max-2026].

**Healthcare policy for a B2B advertiser:** Google *loosened* in 2026 — limited healthcare-professional (HCP) targeting returned for eligible advertisers, explicitly expanding compliant B2B options [3P — https://www.accelerateddigitalmedia.com/insights/health-policies-and-restrictions-guide-for-google-ads-microsoft-ads-2026/]. Meta's 2025–26 health-data restrictions target advertisers whose offering is "associated with medical conditions, specific health statuses, or provider/patient relationships," flag PHI-like form fields and restrict portal links; "dental products for general wellbeing" are carved out [3P — https://www.accelerateddigitalmedia.com/insights/guide-to-social-media-health-ad-restrictions-2026/, https://www.curvecompliance.com/meta-healthcare-ad-restrictions-2026-changes-adaptation]. **Inference:** a practice-management/marketing SaaS sold to dentists is B2B software, not a health product, so Meta lead ads are permissible — but your landing pages and pixel must not send patient-adjacent data, and Meta may still auto-categorize you if copy talks about "patients"; use "new-patient bookings" as business outcomes and keep the pixel off any patient-facing route. Whether Meta still allows job-title targeting for "Dentist" was not verified this session [gap]; lookalikes from your customer list plus dental-interest signals are the usual workaround [INFERENCE].

**Verdict [INFERENCE]:** Search only, manual/tCPA, $1.5–3k/mo, three buckets: (1) competitor-brand conquesting → `/compare/*`; (2) problem terms ("dental office missed calls", "get more dental google reviews", "dental practice website builder") → grader; (3) your brand defense. Feed paid conversions back via the offline-conversion cron. No PMax until 30+ trials/month. Meta: retargeting + lookalike from grader leads only, small.

---

## 17. Retargeting

AdRoll: $5/day minimum spend, $10/day minimum budget, self-serve [FACT — https://help.adroll.com/hc/en-us/articles/360039418131-Does-AdRoll-have-a-minimum-spend]. StackAdapt: no minimum spend per its plans page [3P — https://www.stackadapt.com/plans-and-packages]. **Verdict:** run retargeting inside Google/Meta natively first; AdRoll only for cross-network reach at ~$300/mo once grader traffic passes ~5k/mo [INFERENCE]. Consent-gate all pixels (see §3).

---

## 18. Direct mail, handwritten notes, gifting

**Prices:** Handwrytten retail $3.75/card; Pro plan $1.99/card at $449/mo ($374 annual), Enterprise $1.49 at $649/mo; postage at USPS rate; API + Zapier + HubSpot + Salesforce [FACT — https://www.handwrytten.com/pricing]. Lob/Postalytics: API postcards ~ $0.70–1.50 each at low volume [INFERENCE from public rate cards; not re-verified]. Sendoso ≈ $20k/yr platform before gifts; Reachdesk $20k/yr minimum + $2.5k swag minimum [3P — https://docket.io/resources/research/sendoso-pricing, https://givingli.com/business-gifting-platform/compare/reachdesk-alternative].

**Benchmarks [3P — https://www.postalytics.com/direct-mail-statistics/, https://www.mydoceo.com/blog/direct-mail-response-rates-2026]:** ANA: 5.3% house list / 2.9% prospect list; B2B cold prospect ≈ 4.4%; "84% of marketers say direct mail has the highest ROI" (Lob's own survey).

**Verdict [INFERENCE]:** This is the *most under-used compliant outbound* for your ICP: every dental practice has a verified NPPES street address, no consent regime applies to a letter, and the mailbox is uncrowded. BUILD a "grader report by mail" flow: prospecting engine scores a practice → generates a 1-page printed grade card with a QR to their live report → Lob postcard ($~1) or Handwrytten card ($3.75, no subscription) via API. At a 3% response and 20% trial conversion, ~$170/trial before any follow-up [INFERENCE]. Skip Sendoso/Reachdesk entirely.

---

## 19. Events / tradeshows

Largest US dental meetings: Greater New York Dental Meeting (32k+, late Nov), Chicago Midwinter (30k+, Feb 19–21), CDA Presents Anaheim (25k+, May), Hinman Atlanta (Mar 12–14) [3P — https://www.withorbital.com/blog/top-10-us-dental-conferences-2026]. Booth pricing was not retrievable (CDS exhibitor page 404'd) [gap]; 10×10 inline booths at major dental shows have historically run $3–6k plus $5–10k of furniture/drayage/travel [INFERENCE from prior knowledge — verify with the prospectus].

**Verdict [INFERENCE]:** Attend, don't exhibit, in year one — walk the floor, meet consultants/CPAs (partners), record founder videos, and run the grader live on prospects' phones. A $15–20k booth needs ~8 paying clinics to clear CAC; walking the show costs $1.5k. Regional/state meetings (Arkansas State Dental Association, given your Mammoth Spring foothold) are cheaper and denser with owner-operators.

---

## 20. Compliant outbound alternatives

- **Warm intros:** Cabal, Boomerang, Affinity, Introhive, Common Room are VC/enterprise relationship-graph tools [3P — https://www.getboomerang.ai/glossaries/best-warm-introduction-software-2026]; Commonstock was a retail-investor social app acquired by Yahoo in 2023 — not relevant [FACT — https://pitchbook.com/profiles/company/172144-99]. **SKIP.** Your warm-intro graph is the partner program + customers' referrals.
- **Intent data:** Bombora $25–30k/yr minimum, $75–100k all-in to act on it; G2 Buyer Intent add-on brings G2 to $40–50k list, ~$8–10k negotiated per Vendr [3P — https://marketbetter.ai/blog/bombora-pricing-breakdown-2026/, https://abmatic.ai/blog/bombora-vs-g2-buyer-intent-2028]. **SKIP** — and note your prospecting engine already computes better first-party "intent" (site quality, GBP gaps, reachability, email opens/clicks) than any third-party topic surge would for a 4-chair practice [INFERENCE].
- **LinkedIn outreach tools:** see §15 — API-channel tools survived the 2026 restriction wave; browser/headless tools did not [3P]. Manual only.
- **Phone:** B2B cold calling to business lines is the most legally open channel you have (see §Compliance) and CALL MODE already exists. Keep it human-dialed, no autodialer, no prerecorded/AI voice, scrubbed against DNC + internal list.

---

## 21. AI SDR / agents and outbound infrastructure

| Tool | 2026 price | Reality |
|---|---|---|
| **11x / Artisan / AiSDR** | Custom, typically $2–5k+/mo [3P] | "None of them books meetings on their own"; 11x faced public scrutiny over churn/revenue claims; reviews mix wins with "serious complaints about quality and contracts" [3P — https://salesmotion.io/blog/best-ai-sdr-tools-2026, https://getbreakout.ai/blog/11x-vs-artisan-ai-sdr-platform]. **SKIP.** |
| **Clay** | Repriced Mar 2026: Free / Launch $185/mo ($167 annual; 2,500 data credits + 15k actions) / Growth $495; full enrichment ≈75 credits ≈ $3.75/lead on Launch; failed lookups no longer charged [3P — https://www.landbase.com/blog/clay-pricing, https://www.joinvalley.co/blog/clay-pricing-and-credits-explained-2026] | Your enrichment (NPPES → crawl → MX-verify → brand capture) already does 80% of this for $0. Use Clay only as a one-off *waterfall* for phone/email on hot prospects (~$50/mo of credits). |
| **Apollo** | Free "Starter forever"; trial 50 credits; fair-use 10k credits/mo free, 1M/yr paid [FACT — https://www.apollo.io/pricing/]; per-seat prices not captured (~$49–119/user/mo historically) [gap] | Contact database for the phone-first queue; sequences on Apollo violate your own cold-email demotion. |
| **Instantly** | Growth $47/mo (5k emails, unlimited accounts + warmup) → Hypergrowth $358; bundles $94–555/mo with lead DB [FACT — https://instantly.ai/pricing] | The only legal-ish way to run cold email (separate domains, warmup, rotation). Your docs demoted cold email; this is the tool if you ever un-demote it, and it must NEVER touch Resend or the dreamcreatestudio.com domain. |
| **Lindy / Relevance AI** | ~$50–500/mo agent builders [3P] | You have Claude Code + crons; **SKIP.** |

**Deliverability reality [FACT/3P — https://redsift.com/guides/bulk-email-sender-requirements, https://www.bluespirithosting.com/blog/gmail-yahoo-microsoft-bulk-sender-2026-compliance/]:** SPF+DKIM+DMARC, one-click unsubscribe (RFC 8058) on marketing mail, spam rate <0.3% hard / <0.1% target, or Gmail 5xx-rejects since Nov 2025; compliant senders average 89% inbox placement vs 22–34% spam-foldered for non-compliant. Every shared-pool ESP (Resend, SES, SendGrid, Postmark) bans prospecting in its AUP [FACT — https://resend.com/legal/acceptable-use, https://support.sendgrid.com/hc/en-us/articles/4404316003483-Email-Prohibited-Content-Types-and-Uses].

**Verdict [INFERENCE]:** Keep cold email demoted. The compliant, high-ROI outbound sequence for this ICP is **mail → call → (optional) one personal email from the founder's Google Workspace at human volume (<50/day, no tool)**. Your prospecting engine is already the best "AI SDR" for dental because it's fed by NPPES and site reality rather than a rented database.

---

## 22. Marketing-ops automation

Zapier Free (100 tasks) → Starter $19.99 → Pro $73.50 → ~$399; Make from $9/mo (10k credits); n8n from $20/mo cloud or free self-hosted, per-execution not per-task (80–90% cheaper on multi-step flows) [3P — https://automationatlas.io/guides/zapier-vs-make-vs-n8n-comparison/, https://futurepicker.com/en/n8n-vs-zapier-2026-en/]. **Verdict:** you have a developer (you + agents) and 22 crons on EventBridge; **BUILD** — n8n self-hosted only if a non-technical helper ever needs to edit flows.

## 23. CRM

HubSpot Free (2 users, 1k contacts, automation crippled); Attio free ≤3 users then $29–69/user/mo; folk $24/user/mo [3P — https://www.coffee.ai/articles/attio-vs-folk-crm-startups/, https://automaiva.com/folk-vs-hubspot-vs-pipedrive-vs-attio-crm/]. **Verdict:** DreamCRM's platform tenant already has a pipeline, prospecting, deal rooms, call mode and win/loss. The only reason to add HubSpot Free is as a *sync target* for partners/investors who expect it. **SKIP.**

---

## Compliance rails (US B2B SaaS emailing / texting / calling dental practices, 2026)

**CAN-SPAM (email).** Applies to B2B exactly as B2C; no prior consent required for a commercial email to a work address, but: honest From/headers, accurate subject, physical postal address, functioning opt-out for ≥30 days, honored within 10 business days, no fee/login to unsubscribe, clear identification as an ad where applicable. Penalties up to ~$53,088 per email (2026 inflation-adjusted) [3P — https://www.allegrow.co/knowledge-base/can-spam-act-compliance-guide, https://litemail.ai/blog/can-spam-compliance-guide-for-cold-email-2026]. **Practical line:** law-legal cold email is still AUP-illegal on Resend/SES/SendGrid/Postmark; if ever run, it needs its own domain + Instantly-class infra + suppression sync with your product's unsubscribe list, and it will still trip the 0.3% complaint ceiling if list quality is poor.

**TCPA (calls + texts).** The one-to-one consent rule is gone (vacated Jan 2025, removed July 2025) [FACT — mofo.com, consumerfinanceinsights.com]. Still in force: prior express consent for any autodialed/prerecorded/AI-voice call or text to a *cell* number; prior express *written* consent for marketing texts; a practice's front-desk landline is outside the National DNC (which covers residential/personal cell) but a dentist's mobile is not, and "business" lists are full of personal cells; statutory damages $500–1,500 per message; state mini-TCPAs (Florida's FTSA — narrowed by the May 2023 amendments and a court holding that a business-loan call didn't trigger it; Oklahoma; Washington; Maryland) add their own rules [3P — https://www.fransis.ai/articles/does-tcpa-apply-to-b2b-texts, https://subscriberverify.com/blog/tcpa-sms-carrier-restrictions-cold-calling-2026, https://www.tcpaworld.com/?s=FTSA+business-to-business]. **Hard lines for DreamCRM:** (1) never cold-*text* a prospect (no consent = 227(b) liability even to a "business" cell) — your A2P 10DLC brand/campaign registration also forbids it; (2) calls are human-dialed from Call Mode, no autodialer, no AI/prerecorded voice, DNC-scrubbed, internal DNC honored, 8am–9pm local (some states 8–8); (3) log consent and opt-outs with timestamps.

**State privacy (CCPA/CPRA + 18 other states).** California is the only state whose comprehensive law covers B2B contact data since the exemption sunset (Jan 1, 2023): work emails, direct dials, titles of California residents are personal information; sole proprietors are consumers; rights requests, a compliant privacy policy and "Do Not Sell/Share" opt-out apply to covered businesses (thresholds: $26.6M+ revenue, or 100k+ consumers, or 50%+ revenue from selling PI — DreamCRM is likely *below* threshold today but the prospecting DB should be built as if not) [FACT — https://www.truevault.com/learn/ccpa-employee-and-b2b-data, https://www.cookieyes.com/blog/cpra-exemptions/]. Penalties $2,663 / $7,988 per violation. Person-level visitor identification and pre-consent pixels are the active litigation surface (CIPA suits; PlayOn $1.1M fine) [3P — securityboulevard]. **Practical:** publish a B2B privacy notice for the prospect database (source = NPPES public data + your site crawl), honor deletion, no person-level de-anonymization, consent-gate pixels for CA visitors.

**Email provider AUPs.** Resend: no unsolicited mail of any kind, opt-in only [FACT]. SendGrid: bans addresses "obtained from the Internet or social media," suspends without warning [FACT]. Postmark: rejects cold-email use cases [3P]. AWS SES: AUP prohibits unsolicited bulk email [3P]. Google Workspace: cold email at scale violates Gmail terms and trips the bulk-sender thresholds [3P].

**Google/Meta health-ad policies.** B2B software for dentists is advertisable; Google's 2026 HCP targeting return helps; Meta restricts anything it categorizes as provider/patient-relationship marketing and flags PHI-like form fields — keep pixels and copy on the business side, never on patient-facing pages [3P — accelerateddigitalmedia.com]. **Also — the HIPAA claim line from docs/COMPLIANCE.md applies to ads and landing copy: no "HIPAA-compliant" claims beyond what the subprocessor posture supports.**

**FTC Consumer Reviews & Testimonials Rule (16 CFR 465).** Prohibits buying/selling fake reviews, review suppression, insider reviews without disclosure, and **incentives conditioned on sentiment** — you may pay for a review, never for a positive one, and may not imply positivity is required; disclosure alone does not cure a sentiment-conditioned incentive [FACT — https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers, https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465]. Endorsement Guides still require clear disclosure of material connections in testimonials (partners earning commission, clinics receiving credits). **G2/Capterra program rules** cap incentives at $100, require sentiment-neutral eligibility, label incentivized reviews, bar employees, label partners [FACT — legal.g2.com]. **This also governs the clinic-facing product:** DreamCRM's Google-first review loop must never gate or filter by star rating before the Google ask in a way that suppresses negatives (your "optional star-gate triage" should be a *private-feedback branch offered in addition*, not a filter that withholds the Google link from unhappy patients — Google's own policy and the FTC rule both treat review gating as deceptive) [INFERENCE — legal review recommended].

---

## What "autonomous marketing" looks like in 2026 — and what stays human

**Vendors.** HubSpot Breeze: outcome-priced agents ($0.50/resolution, $1/lead, $0.10/data answer), Pro/Enterprise only [FACT — hubspot.com]. Salesforce Agentforce: three pricing models in 18 months — $2/conversation, Flex Credits $500/100k, or $125/user/mo — typical year-1 $250–600k mid-market [3P — https://www.saastr.com/salesforce-now-has-3-pricing-models-for-agentforce-and-maybe-right-now-thats-the-way-to-do-it/, https://coworker.ai/blog/salesforce-agentforce-pricing]; now absorbing Fin. Jasper Pro $59–69/mo, Business ~$900/mo with Agents/Studio [3P — https://www.demandsage.com/jasper-ai-pricing/]. Copy.ai GTM: Chat $29/mo, Agents $249/mo, Growth–Scale $1–3k/mo [3P — https://www.eesel.ai/blog/copy-ai-pricing]. Google AI Max / Meta Advantage+ goal-only campaigns: URL + budget → AI does creative/targeting/bidding; independent incrementality data says Advantage+ underperforms manual over time; every lift figure is vendor-reported [3P — pixis.ai, buildmvpfast]. The recurring phrase across the 2026 literature is **"governed autonomy" — spend caps, approval gates, audit trails** [3P — https://www.digitalapplied.com/blog/agentic-advertising-2026-ai-ad-ops-playbook]. That is, verbatim, the Dream Team's proposal-then-yes model applied to Dream Create's own marketing.

**What the founder-with-agents case studies say [3P — https://www.nxcode.io/resources/news/how-to-market-your-saas-ai-first-playbook-2026, https://dev.to/glad_labs/ai-saas-solo-founder-success-stories-2026-startup-journeys-of-solo-developers-who-built-jca]:** AI now covers drafting, repurposing, sequencing, reporting, code, and support so that one person runs the output of a 3-person content team; "AI made building cheap, but it didn't make getting users cheap" — distribution, audience and timing remain the moat; "one case study or testimonial is worth 10 blog posts"; the founder keeps voice, judgment and the customer relationship.

**A concrete "marketing Dream Team" for Dream Create [INFERENCE, mapping the above onto what already exists]:**
- *Autonomous (day-0 deep-sleep lanes):* attribution rollups and the CAC dials; the AEO prompt monitor; changelog → blog/LinkedIn/YouTube-script drafts; grader-nurture touches; Wikidata/JSON-LD freshness; G2/Capterra review-ask proposals to clinics at real triggers; retargeting audience sync; direct-mail grade cards to newly scored hot prospects (budget-capped); weekly benchmark pages regenerated from real grader data.
- *Ask-first (proposals to the founder):* every paid-spend change; competitor-conquesting ad copy (trademark exposure); any public claim involving HIPAA, ROI numbers, or a customer name; partner deals; anything posted under the founder's name on Reddit/Facebook/LinkedIn.
- *Human only:* Reddit and dental-Facebook-group participation; phone calls; the demo; podcast appearances; pricing/discount decisions; review requests to customers (the ask, not the trigger detection); signing anything (BAA/DPA); the choice of which stories to tell.

---

## Ranked shortlist for DreamCRM (cost → expected ROI, [INFERENCE])

1. **Direct mail grade cards to scored prospects** (Lob/Handwrytten API, ~$1–4/piece, no consent regime) — the compliant outbound channel nobody in dental SaaS is using at scale.
2. **Review-site presence with real velocity** — G2 free now; Starter $299/mo when you have 10 reviews; Capterra PPC $500/mo 90-day test with offline conversions. Merged G2/Capterra means one program covers four sites.
3. **Live sandbox demo (build) + ungated product-page placement** — the 2026 report's winning pattern, and you own the demo clinic.
4. **Search conquesting → `/compare` + problem-term → grader**, manual bidding, $1.5–3k/mo, offline conversion import (build the cron first).
5. **Nifty Thrifty-style group deal + partner recruitment of dental CPAs/consultants** on your existing commission rails; founder-led LinkedIn aimed at that layer.
6. **AEO hygiene** — answer capsules, 12-month refresh cadence, Wikidata, JSON-LD, Otterly Lite $29 or your own prompt monitor; ignore llms.txt beyond shipping it.
7. **Founder video walkthroughs + "vs" videos** (Descript $24) — cited by AI engines and 4–6× demo yield vs brand content.
8. **Monthly Livestorm demo webinar co-hosted with a partner** (free/$99).
9. **Podcast guesting on dental-owner shows** (agent builds the list; founder records).
10. **PostHog free + your attribution tables** — buy nothing else in analytics.

**Do not buy:** Mutiny/HockeyStack/Dreamdata/Bombora/Sendoso/PartnerStack/Qualified/AI SDRs/LinkedIn ads/PMax (yet)/RB2B person-level/any LinkedIn automation.

---

## Source index (URLs cited inline; grouped)

Analytics: flexprice.io/blog/posthog-pricing-guide · budgetforge.dev/tools/posthog-pricing-2026 · productgrowth.blog/p/why-is-june-so-joining-amplitude · factors.ai/blog/dreamdata-vs-hockeystack · fibbler.co/blog/hockeystack-vs-dreamdata
Email: resend.com/legal/acceptable-use · loops.so/pricing · bentonow.com/pricing · sequenzy.com/versus/loops-vs-customer-io · support.sendgrid.com/…/4404316003483 · powerdmarc.com/bulk-email-sender-requirements · redsift.com/guides/bulk-email-sender-requirements
Personalization/ID: rb2b.com/pricing · abmatic.ai/blog/mutiny-pricing · securityboulevard.com/2026/05/anonymous-website-visitor-identification… · mojoauth.com/blog/anonymous-website-visitor-identification-gdpr-ccpa-tools · leadpipe.com/blog/is-rb2b-safe-to-use
Demos: navattic.com/report/state-of-the-interactive-product-demo-2026 · storylane.io/pricing · arcade.software/post/navattic-vs-storylane-vs-arcade…
Chat: intercom.com/blog/building-outcome-based-pricing-for-fin-for-sales · gleap.io/blog/intercom-fin-ai-pricing-2026 · qualified.com/pricing · talkbar.ai/blog/chatbase-pricing-2026 · Google News RSS (Salesforce–Fin)
Reviews: sell.g2.com/plans · legal.g2.com/community-guidelines · blastra.io/blog/g2-capterra-vendor-pricing-compared · blastra.io/blog/g2-acquires-capterra-gartner-digital-markets · spotsaas.com/blog/capterra-advertising · highadvocacy.com/blog/how-to-get-more-g2-reviews
Partners/referrals: rewardful.com/pricing · getreditus.com/blog/reditus-alternatives · rekomi.com/blog/partnerstack-alternatives · wiserreview.com/blog/viral-loops-pricing
SEO/AEO: digitalapplied.com/blog/ai-search-citation-ranking-factors-2026-data-study · thehoth.com/blog/how-to-get-cited-in-ai-overviews · red-engage.com/blog/reddit-citations-in-ai-answers-2026-study · tryprofound.com/blog/the-data-on-reddit-and-ai-search · pierview.ai/guides/reddit-citations-chatgpt-perplexity-decline-2026 · gazeseo.com/…/does-llms-txt-work · geojacker.com/llms-txt · digitalapplied.com/blog/programmatic-seo-after-march-2026… · oneup.today/blogs/reddit-selfpromo-rules-study-2026 · gummysearch.com/r/Dentistry · mlforseo.com/…/wikidata-for-brands… · qwairy.co/blog/wikipedia-wikidata-ai-visibility · surmado.com/blog/best-ai-visibility-tools-2026 · contextbolt.com/blog/best-aeo-tools · zapier.com/blog/best-seo-tools
Video/podcast/webinar/community: aivideopicks.com/posts/heygen-pricing-2026.html · sellontube.com/blog/youtube-for-saas-demos · emarketer.com/content/youtube-overtakes-reddit… · podmatch.com/pricing · transistor.fm/pricing · easywebinar.com/blog/livestorm-pricing · digitalapplied.com/blog/webinar-statistics-2026… · circle.so/blog/skool-alternatives · dentaleconomics.com/…/private-dental-facebook-group-etiquette… · niftythriftydentists.com
LinkedIn/paid: joinvalley.co/blog/linkedin-automation-safety-2026 · northlight.ai/blog/is-linkedin-automation-against-the-rules · salesrobot.co/blogs/linkedin-sales-navigator-cost · growthspreeofficial.com/blogs/linkedin-ads-benchmarks-2026… · bluepear.net/blog/google-ads-trademark-policy · farsiight.com/resources/performance-max-for-b2b · growthspreeofficial.com/blogs/branded-search-cannibalization-pmax-b2b-saas-2026 · pixis.ai/blog/advantage-vs-performance-max-head-to-head-2026 · accelerateddigitalmedia.com/insights/health-policies-and-restrictions-guide-for-google-ads-microsoft-ads-2026 · accelerateddigitalmedia.com/insights/guide-to-social-media-health-ad-restrictions-2026 · ppcchief.com/google-ads-cost/dental · help.adroll.com/…/360039418131
Mail/gifting/events: handwrytten.com/pricing · postalytics.com/direct-mail-statistics · mydoceo.com/blog/direct-mail-response-rates-2026 · docket.io/resources/research/sendoso-pricing · givingli.com/…/reachdesk-alternative · withorbital.com/blog/top-10-us-dental-conferences-2026
Outbound/AI SDR/ops/CRM: salesmotion.io/blog/best-ai-sdr-tools-2026 · landbase.com/blog/clay-pricing · instantly.ai/pricing · apollo.io/pricing · marketbetter.ai/blog/bombora-pricing-breakdown-2026 · abmatic.ai/blog/bombora-vs-g2-buyer-intent-2028 · getboomerang.ai/glossaries/best-warm-introduction-software-2026 · automationatlas.io/guides/zapier-vs-make-vs-n8n-comparison · coffee.ai/articles/attio-vs-folk-crm-startups
Compliance: ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers · ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465 · arnoldporter.com/…/ftc-warning-letters-over-consumer-review-rule · mofo.com/…/eleventh-circuit-vacates-fcc-s-tcpa-one-to-one-consent-rule · consumerfinanceinsights.com/2025/09/15/… · fransis.ai/articles/does-tcpa-apply-to-b2b-texts · subscriberverify.com/blog/tcpa-sms-carrier-restrictions-cold-calling-2026 · tcpaworld.com (FTSA posts) · truevault.com/learn/ccpa-employee-and-b2b-data · cookieyes.com/blog/cpra-exemptions · allegrow.co/knowledge-base/can-spam-act-compliance-guide · litemail.ai/blog/can-spam-compliance-guide-for-cold-email-2026
Autonomous marketing: hubspot.com/company-news/hubspots-customer-agent-and-prospecting-agent… · martech.org/hubspot-moves-to-outcome-based-pricing… · saastr.com/salesforce-now-has-3-pricing-models-for-agentforce… · coworker.ai/blog/salesforce-agentforce-pricing · demandsage.com/jasper-ai-pricing · eesel.ai/blog/copy-ai-pricing · digitalapplied.com/blog/agentic-advertising-2026-ai-ad-ops-playbook · nxcode.io/…/how-to-market-your-saas-ai-first-playbook-2026 · dev.to/glad_labs/ai-saas-solo-founder-success-stories-2026…
