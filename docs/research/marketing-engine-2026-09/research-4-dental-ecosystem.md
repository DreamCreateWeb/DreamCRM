# Research 4 — The US Dental Ecosystem: Where Dentists and Office Managers Can Be Reached, and How They Buy Software

Prepared 2026-09-09 for the DreamCRM marketing-engine design. DreamCRM = $200/mo self-serve front-office SaaS (website, booking, patient portal, reviews, recall, PMS sync via NexHealth) for US dental practices.

**Evidence flags used throughout:**
- **[FACT]** — stated by a primary or reputable secondary source, URL inline.
- **[VENDOR CLAIM]** — self-reported by the entity being described (unaudited).
- **[EST]** — a third-party estimate (e.g., Orbital, Feedspot, Gaebler) with undisclosed method.
- **[INFERENCE]** — my derivation from the facts above; the reasoning is shown.
- **[UNVERIFIED]** — from background knowledge; the page could not be fetched this session (Cloudflare/403/blocked). Treat as a lead to confirm, not a fact.

Method note: ~30 web searches were run before the session's search budget was exhausted; the remainder of the work used direct page fetches (media kits, conference sites, vendor directories, ADA HPI PDFs). Pages behind Cloudflare challenge screens (AADOM, ADMC, Roadside, Dentistry Today's media kit, Reddit, Facebook) are flagged.

---

## 1. Market structure, 2025–2026

### 1.1 Headcounts

| Metric | Value | Flag | Source |
|---|---|---|---|
| Professionally active US dentists (2025) | **205,088**; 60.0 per 100k population | FACT | [ADA HPI dentist workforce](https://www.ada.org/resources/research/health-policy-institute/dentist-workforce) |
| Age mix (2025) | <35: 17.4% · 35–44: 26.3% · 45–54: 22.5% · 55–64: 18.6% · 65+: 15.2% | FACT | same |
| Average retirement age | 68.7 (up from 64.7 in 2001); career span 41.3 yrs | FACT | same |
| Female share | 39.4% overall; ~50% of dentists under 35 | FACT | same; [DentistryIQ on the 2025 HPI report](https://www.dentistryiq.com/dentistry/research-and-news/article/55318380/the-future-of-dentistry-2024-ada-hpi-workforce-report-unpacks-emerging-trends) |
| General practitioners | ~80% of all dentists; specialists 21.2% | FACT | same two |
| Dental practice locations | ~178,000–179,600 (IBISWorld "Dentists in the US" business count, re-published by a list vendor) | EST | [IBISWorld](https://www.ibisworld.com/united-states/number-of-businesses/dentists/1557/) via [dentistemaillist.com](https://www.dentistemaillist.com/us-dental-data) |
| Top states by practice count | CA 14,388 · FL 6,489 · TX 6,321 · PA 3,868 · NY 3,594 · OH 3,109 · IL 2,986 · MA 2,325 · MI 2,288 · NJ 2,240 | VENDOR CLAIM | [dentistemaillist.com](https://www.dentistemaillist.com/blog/how-many-dental-practices-in-the-us) |
| Hygienists employed | 221,600; ~1.3 per practice | FACT (BLS) | [dentistemaillist.com data page](https://www.dentistemaillist.com/us-dental-data) |
| BLS annual openings | Dentists ~4,500/yr; assistants 52,900/yr; hygienists 15,300/yr (2024–34) | FACT (BLS) | [Pearl AI workforce summary](https://hellopearl.com/blog/dentist-workforce-statistics-2026-trends-and-insights-pearl-ai) |

**Office-manager population.** No agency counts "dental office managers." **[INFERENCE]** Nearly every location with a front desk has one person acting as OM (owner-dentist's spouse, lead front-desk, or a titled manager); with ~178k locations and a large solo-practice tail where the dentist or a spouse plays the role, the addressable OM population is ~120,000–160,000 people, of which AADOM's reach (see §2.3) is a small, engaged slice. The BLS "medical and health services managers" category is not dental-specific and should not be used.

### 1.2 Practice modality: solo vs group vs DSO

- **Solo practice: "about one-third of dentists" (2024).** FACT — [ADA HPI via DentistryIQ](https://www.dentistryiq.com/dentistry/research-and-news/article/55318380/the-future-of-dentistry-2024-ada-hpi-workforce-report-unpacks-emerging-trends). Longer series: 67% (2001) → 46% (2021) per [DrBicuspid on HPI data](https://www.drbicuspid.com/dental-practice/office-management/practice-trends/article/15379216/practice-ownership-fades-as-the-face-of-dentistry-changes). About two-thirds of dentists are now in some form of group practice.
- **DSO affiliation: 16.1% of dentists (2024), more than doubled from 7.4% in 2015.** FACT — [ADA HPI research brief, June 2025](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/practice_ownership_trends_dentistry_new_look_old_data.pdf). By career stage: **27% of dentists <10 years out** (up from 24% in 2023) vs **9% of those 25+ years out**. Only **15%** of <10-year dentists are solo vs **48%** of 25+-year dentists.
- **Beware the "38% of clinics are DSO-affiliated" figure** circulating on list-vendor pages ([dentistemaillist](https://www.dentistemaillist.com/blog/how-many-dental-practices-in-the-us)). It is a location-count claim with no method; the HPI dentist-share figure (16.1%) is the defensible one. **[INFERENCE]** Because DSO locations run more dentists per site, DSO share of *locations* is plausibly 12–20%, not 38%. The same vendor cites "13,000+ DSO-affiliated offices," which is consistent with the lower estimate.
- DSO market growth: US DSO market projected $37.9B (2024) → $44.7B (2025), 17.9% CAGR. EST — [MRL Advisory Group](https://www.mrladvisorygroup.com/post/dental-industry-trends-how-dental-practices-dsos-and-specialties-performed-in-q1-2025). Dentrix claims "90% of the top 50 DSOs" [VENDOR CLAIM, via medixdental](https://medixdental.com/dental-pms-market-data/).

**What this means for a $200/mo self-serve product.** The DSO segment buys centrally, on RFPs, with enterprise PMS (Denticon/Dentrix Enterprise) and its own marketing stack — it is not a self-serve buyer. The addressable core is the **~110,000–130,000 independent, owner-operated locations** [INFERENCE: ~178k locations minus the DSO tail and minus hospital/public-health/academic settings], skewed toward dentists 35–64 who own their practice.

### 1.3 Ownership transitions — the software-switch moment

- **Ownership rate: 73% of dentists own (2023), down from 85% (2005).** FACT — [ADA HPI brief](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/practice_ownership_trends_dentistry_new_look_old_data.pdf). Under-35 ownership fell from 25% (2005) to 9.5% (2021) [DrBicuspid](https://www.drbicuspid.com/dental-practice/office-management/practice-trends/article/15379216/practice-ownership-fades-as-the-face-of-dentistry-changes).
- **Ownership is delayed, not abandoned.** The 2016–2020 graduating cohort was 21% owners at 5–9 years out vs 33% for the prior cohort and 63–70% for pre-2010 cohorts; but by 15–19 years out, 81% of the 2006–2010 class owned (vs 89% of the 1991–95 class). FACT — same HPI brief. HPI's own phrasing: ownership "is the career end game for most dentists… a longer process for newer generations."
- **Annual transaction volume — no authoritative count exists.** Anchors: ADS Transitions claims "over 42,000 successful sales and purchases" cumulatively across its broker network [VENDOR CLAIM, [adstransitions.com](https://www.adstransitions.com/)]; Henry Schein DPT fields "50+ consultants" nationwide [VENDOR CLAIM, [dentalpracticetransitions.henryschein.com](http://dentalpracticetransitions.henryschein.com/)]. **[INFERENCE]** With ~150k owner-dentists retiring at 68.7 on a ~41-year career, steady-state exits run ~3,500–4,500/yr; add partner buy-ins, DSO acquisitions, and relocations, and the realistic number of **owner-change events is ~5,000–8,000 locations per year (3–4.5% of locations)**. Each is a software-review moment, and buyers are disproportionately the 30–40-year-old cohort that expects cloud/self-serve tooling.
- **Startups (de novo practices).** No lender publishes counts. BofA Practice Solutions offers up to $5M and "100% project financing" for startups [FACT, [bankofamerica.com](https://www.bankofamerica.com/smallbusiness/business-financing/practice-solutions/dentist-loans/)]; Lendeavor/Provide had a $120M/yr loan-purchase agreement (2019) [FACT, [DentistryIQ](https://www.dentistryiq.com/practice-management/industry/article/16366777/how-lendeavor-is-disrupting-dental-and-health-care-lending-an-interview-with-ceo-dan-titcomb-and-coo-james-bachmeier)]. Startup cost $500–750k, of which technology/software runs **$2,000–3,000/month recurring** and "hidden costs" (subscriptions the largest) add 15–25% [VENDOR/CONSULTANT CLAIM, [Scott Leune](https://scottleune.com/blog/dental-practice-startup-costs-complete-guide-2025/)]. **[INFERENCE]** Industry estimates of scratch startups cluster around **800–1,500 per year** in the US; Provide's $120M/yr at a ~$550k average ticket alone implies ~200+ startups/yr from one lender, so 1,000+/yr nationally is plausible.

### 1.4 The pipeline: graduates and their plans

- **7,015 graduates in 2025** (6,872 in 2024) from 67 schools; 28,925 predoctoral students enrolled 2025–26. FACT — [ADEA Dentists of Tomorrow 2025](https://www.adea.org/detail-pages/blog/adea---bulletin-of-dental-education/2026/02/10/adea-releases-dentists-of-tomorrow-2025--research-on-graduating-predoctoral-dental-students-in-the-united-states); [ADEA seniors survey](https://www.adea.org/seniors2025).
- Seniors' plans (3,325 respondents, 48% response): **77% start as associates**; of those entering private practice, **32% DSO-affiliated, 50% non-DSO**; 37% go straight to residency; 82% carry debt averaging **$297,800**. FACT — [ADEA seniors2025](https://www.adea.org/seniors2025).
- Reading: new grads are not buyers for 5–10 years, but they are cheap to reach (ASDA, §2.9) and they *choose the software* when they eventually buy in — an early-relationship play, not a conversion play.

### 1.5 Who decides on software, the stack, and the spend

- **Decision-makers** (Software Advice's advisor data): dentists (clinical/owner), practice managers/office administrators, with hygienists/assistants as influencers. Top requested PMS features: e-prescribing (87%), scheduling coordination (86%), charting (82%); buyers' stated fear is losing data in migration. FACT (as reported) — [Software Advice dental](https://www.softwareadvice.com/dental/). **[INFERENCE]** For a front-office product like DreamCRM the pattern is: OM discovers/evaluates, dentist-owner approves spend; in solo practices the dentist (or spouse) does both.
- **Stack and monthly price bands** (2026 vendor comparison): PMS $160–900/mo; patient communication/engagement (Weave, NexHealth, RevenueWell, Lighthouse 360, Dental Intel) **$300–700/mo**; AI imaging $300–500/mo; review management (Birdeye, Podium); websites/SEO/LSAs; payments 2.6–2.9%. **Total tech spend 3–6% of gross revenue** ($36–72k/yr for a $1.2M practice). EST — [dentalpracticeinsider.org](https://dentalpracticeinsider.org/dental-practice-technology-stack/). Capterra pricing percentiles for "dental software": $10–57 / $57–167 / $167+ per month [FACT as published](https://www.capterra.com/dental-software/); Software Advice tiers $49–499 basic, $699 mid, $899 premium [same](https://www.softwareadvice.com/dental/).
- **Positioning implication.** DreamCRM at $200/mo undercuts the $300–700 patient-engagement band *and* replaces a $100–300/mo website subscription; the honest pitch is "one $200 line replaces two to three lines totaling $500–900."
- Cloud/SaaS: SaaS 60.5% of PMS market (2025); 81% cloud adoption "when monthly billing is offered" [EST, market-research aggregates via [Clerri](https://clerri.com/blog/dental-practice-management-software-statistics)]. Treat ">80% of practices on cloud" claims as implausible ([medixdental](https://medixdental.com/dental-pms-market-data/) makes this point well).
- Practice benchmarks that shape the pitch: 57 new patients/month, 43% case acceptance, 15% cancellations, 7% no-shows across 3,400+ practices. VENDOR CLAIM — [Planet DDS 2025 Outlook](https://www.planetdds.com/2025outlook/).

### 1.6 PMS market share — what is actually known (matters because DreamCRM rides NexHealth)

- The widely-quoted "Dentrix 18–22% / Eaglesoft 15–20% / Open Dental 14–18%" figures trace to SEO listicles with no method. FACT (critique) — [medixdental.com](https://medixdental.com/dental-pms-market-data/); the ranges appear e.g. at [Siotek](https://siotek.net/resources/dental-practice-management-software-comparison).
- Hard-ish anchors (all vendor-reported, overlapping scopes): **Dentrix + Dentrix Ascend "more than 48,000 US dental practices"** (Henry Schein One, Mar 2026); **Planet DDS "13,000+ practices"** (Denticon/Cloud 9/Apteryx); **Eaglesoft "over 30,000 users"** (Patterson). VENDOR CLAIMS via [medixdental](https://medixdental.com/dental-pms-market-data/), [Planet DDS](https://www.planetdds.com/2025outlook/), [Kwikly](https://www.joinkwikly.com/blog/top-10-most-common-dental-software-solutions-for-2025).
- **NexHealth Synchronizer**: "60+ systems," "more than 5,000 individual practices," "over 70 million patient records," no setup fee, month-to-month or annual; a **$500 refer-a-practice bounty** for existing customers. VENDOR CLAIM — [NexHealth FAQ](https://www.nexhealth.com/frequently-asked-questions). Partnerbase shows 18 tracked partners incl. Dentrix, Open Dental, Curve, Cloud 9, Eaglesoft as "channel" partners [EST, [partnerbase.com/nexhealth](https://www.partnerbase.com/nexhealth)]. Birdeye licenses the Synchronizer for booking [FACT, [nexhealth.com](https://www.nexhealth.com/features/nexhealth-synchronizer)].
- **RISK — Open Dental has publicly blacklisted NexHealth.** Open Dental's third-party vendor page lists NexHealth under **"Dangerous/Unknown"** (vendors that "write directly to the Open Dental database" rather than via the API) with two dated warnings: 08/08/2024 "We specifically advise customers not to use NexHealth products that claim to integrate with Open Dental," and 06/05/2026 "NexHealth representatives claiming to work with or for Open Dental. NexHealth is not partnered with Open Dental." FACT — [opendental.com/site/vendorsthirdparty.html](https://www.opendental.com/site/vendorsthirdparty.html). Open Dental users are a vocal, price-sensitive, self-serve-friendly segment (exactly DreamCRM's buyer), and they read that page. **[INFERENCE]** For OD practices, marketing must not lead with "NexHealth"; long-term, an Authorized-vendor listing via Open Dental's own API (87 vendors listed as Authorized, e-mail vendor.relations@opendental.com) is a channel in its own right — DreamCRM's inert OD-direct provider code is the seed of that.
- **Dentrix Ascend API Exchange**: "140+ vendors," online application → security review → setup; requires SOC 2 Type II + OAuth 2.0. FACT — [henryscheinone.com API Exchange](https://www.henryscheinone.com/dental-solutions/api-exchange/api-exchange-vendors/). Fees not published [UNVERIFIED: the legacy Dentrix Developer Program charged annual fees].

---

## 2. Reachable communities and channels — size, access terms, cost

### 2.1 Facebook groups (the densest concentration of owner-dentists and OMs online)

Member counts are point-in-time snapshots; Facebook cannot be fetched from this session, so the freshest published counts are used.

| Group | Members | As of | Audience | Vendor terms | Source |
|---|---|---|---|---|---|
| **Dental Peeps Network** (+ regional subgroups) | 300,000+ | 2022 | Whole dental team | Large, loosely moderated; regional subgroups | [Compendium](https://compendiumlive.com/2022/10/social-media-for-dentistry-too-important-to-ignore) |
| **Nifty Thrifty Dentists** (Dr. Glenn Vo) | ~40,000 (Compendium 2022); site's own copy says "17,000+" (older) | 2022 | Owner-dentists, deal-seekers | **Vendor-friendly by design**: "connects dental professionals who want discounts… with dental vendors"; exclusive-deal posts + Facebook Lives; software deals explicitly listed | [Compendium](https://compendiumlive.com/2022/10/social-media-for-dentistry-too-important-to-ignore); [niftythriftydentists.com](https://niftythriftydentists.com/4-reasons-to-join-the-nifty-thrifty-dentists-facebook-group/) |
| **Dental Nachos** (Dr. Paul "Nacho" Goodman) | ~35,300 (2022); likely materially larger now [INFERENCE] | 2022 | Dentists, students, staff, "dental salespeople" welcome | Paid sponsor directory + "Shop Sponsor Deals" + sweepstakes + event speaking; Supreme membership (CE); "Super Dentist Boost 2026" growth camp; DentistJobConnect | [Compendium](https://compendiumlive.com/2022/10/social-media-for-dentistry-too-important-to-ignore); [dentalnachos.com](https://www.dentalnachos.com/); [sponsors page](https://www.dentalnachos.com/sponsors) |
| **Dental Disrupt Nation** | ~30,000 | 2022 | Dentists; edgy humor allowed | Strict on offensiveness; vendor posts [UNVERIFIED] | [Compendium](https://compendiumlive.com/2022/10/social-media-for-dentistry-too-important-to-ignore) |
| **Dental Hacks Nation** (Very Dental Podcast Network) | 29,000+ | 2020 | Dentists, podcast listeners | Podcast-network adjacent; sponsorship via network | [Dental Hacks Listeners group](https://www.facebook.com/groups/330693121196568); [Very Dental](https://www.verydentalpodcast.com/) |
| **Dental Office Managers Community (DOMC)** (Kyle Summerford) | 20,000+ | 2025 | Office managers | Now backed by the **Dental Office Managers Alliance (DOMA)** with "vendor partner perks and exclusive deals… gift card incentives, product trials, and conference discounts"; DOMC Live regional workshops | [DentistryIQ press release](https://www.dentistryiq.com/front-office/career-enhancement/press-release/55290155/new-dental-office-managers-alliance-doma-provides-leadership-and-support-for-dental-management-professionals); [group](https://www.facebook.com/groups/dentalofficemanagers/) |
| **Dentist Executives and Practice Owners** | ~16,000 | 2022 | Owners; practice sales/investment | Deal/transition oriented | [Compendium](https://compendiumlive.com/2022/10/social-media-for-dentistry-too-important-to-ignore) |
| **Dental Office Managers** / **Dental Office Managers Forum** / **DOM Leadership Network** | not published | — | OMs | [UNVERIFIED] | [group 1](https://www.facebook.com/groups/1594069521337374/), [group 2](https://www.facebook.com/groups/1468442813252012/) |
| **Dental Marketing Society** (The Dental Marketer, Michael Arias) | not published | — | Owners interested in marketing; startup dentists | Free to join; host also runs "Making of a Dental Startup" podcast | [thedentalmarketer.site](https://thedentalmarketer.site/) |
| **Mommy Dentists in Business** | not published (est. 10k+ [UNVERIFIED]) | — | Female owner-dentists | Vendor posts restricted [UNVERIFIED] | [ADA News](https://adanews.ada.org/ada-news/2024/december/creating-community-online-and-off/) |
| **Dental Vendor Review group** | not published | — | Owners reviewing vendors (phones, membership systems…) | Reviews-only; vendors cannot pitch [INFERENCE from description] | [ADA News](https://adanews.ada.org/ada-news/2024/december/creating-community-online-and-off/) |
| **Open Dental Users** groups (several) | not published | — | OD practices | [UNVERIFIED]; note §1.6 NexHealth issue | — |

**Access reality [INFERENCE + UNVERIFIED]:** Most dentist-run groups prohibit unsolicited vendor posts but allow (a) member-dentist recommendations, (b) paid "sponsor" slots (Nachos, Nifty Thrifty, DOMA), and (c) the founder's own promotional Lives. The lowest-cost, highest-trust route is a real customer answering "what do you use for online booking/reviews?" threads. The paid route runs through the founders as media properties — Nifty Thrifty's deal posts and Nachos' sponsor directory are effectively affiliate/sponsor deals priced by negotiation (typical structure in this space: a discount for members + a flat fee or a revenue share to the group [INFERENCE]).

### 2.2 Dentaltown (Farran Media)

- Products: forums (specialty message boards, private groups), monthly magazine, online CE, classifieds (practice sales, jobs), podcasts/blogs, webinars, Townie Choice Awards, Townie Perks, Townie Meeting (Las Vegas). FACT — [dentaltown.com/mediakit](https://www.dentaltown.com/mediakit).
- Reach: a 2026 "Publisher's Report" exists but sits behind the media-kit form [FACT that it exists — [advertising page](https://www.dentaltown.com/advertising)]. Third-party estimate: ~120,000 monthly readers; full-page B/W print est. **$7,433** (Gaebler estimate, not a rate card). EST — [Gaebler](https://www.gaebler.com/DentalTown-magazine-advertising-costs++34098). Historic Dentaltown claim of ~250k+ registered members worldwide [UNVERIFIED].
- Sales: Mary Lou Botto (Director of Sales), Stephan Kessler, Valerie Berger; (480) 598-0001. FACT — [advertising page](https://www.dentaltown.com/advertising).
- **Fit:** Forum presence is free and long-lived (threads rank on Google for years); the "Townie Choice Awards" is a low-cost credibility badge to campaign for once there are ~50 customers. Print at $7k+/page is poor value for a $200 product.

### 2.3 AADOM (office managers) and the OM ecosystem

- **AADOM Annual Conference 2026: Sept 3–5, Loews Sapphire Falls, Orlando; "over 1,100" practice-management professionals; boutique format with exhibitors "centrally located in the meeting space."** FACT — [exhibitor.aadomconference.com](https://exhibitor.aadomconference.com/); prospectus exists; contact Karin Wilson, karin@dentalmanagers.com, 559-303-3730 [FACT]. Prices are in a PDF prospectus not retrievable this session [UNVERIFIED; from memory the low-tier booth has sat in the ~$4–6k range with named sponsorships $10–25k].
- AADOM also runs local chapters, the FAADOM/MAADOM designation ladder, AADOM Radio (1k–10k monthly listeners, Facebook 24.6k) and a "Green Leader"/vendor-partner program [UNVERIFIED for the partner program; podcast figures [EST, Feedspot](https://podcast.feedspot.com/dental_business_podcasts/)]. The dentalmanagers.com site is Cloudflare-gated from this session.
- **DOMA / DOMC** (see 2.1) is the newer, cheaper OM channel with an explicit vendor-perks structure.
- Front Office Rocks (Laura Nelson, now "an UptimeHealth company"): OM/front-desk training at $1,999/yr; "thousands" of practice clients; no public partner program. FACT — [frontofficerocks.com](https://frontofficerocks.com/).
- **Fit:** OMs are the daily users of booking/recall/reviews and the loudest word-of-mouth network in dentistry; AADOM's 1,100-person room is small enough that a $200 product can be *the* memorable booth. Strong fit; budget one AADOM per year and the DOMA vendor-perk route year-round.

### 2.4 Trade media (Endeavor B2B dental group, Dentistry Today, others)

**Endeavor B2B Dental (Dental Economics, DentistryIQ, RDH, Perio-Implant Advisory, DACE CE) — 2026 media kit, rate card retrieved.** FACT — [Dental Media Kit PDF](https://dental.endeavorb2b.com/wp-content/uploads/Dental-Media-Kit.pdf).

| Property | Audience | Rates (2026) |
|---|---|---|
| **Dental Economics** magazine | 92K+ subscribers, 10 print+digital editions; 24K+ unique monthly web visitors; 201K+ social; "The Bottom Line" newsletter 35K+ (Wed/Sun); 349K+ monthly digital touchpoints | Full page **$12,500**; spread $16,500; 1/2 $7,500; 1/3 $6,250; 1/4 $5,148 |
| **DentistryIQ** (whole-team, incl. OMs) | 46K+ UMV, 88K+ page views; 133K+ social; **Morning Briefing newsletter 45K+ (M–F)**; Clinical Insights 49K+ (Tu–Th); Perio-Implant Advisory 39K+ monthly | Newsletter/eblast/native priced on request; podcast packages include an eblast to 5,000 names |
| **RDH** (hygienists) | 53K+ UMV; RDH eVillage 46K+; 65K+ magazine; RDH Graduate 38K+ | Full page $9,158; 1/2 $6,375; 1/3 $5,314; 1/4 $4,579 |
| Extras | Trade-show bundles (Chicago Midwinter, Under One Roof, GNYDM); "Dental Innovators Awards"; Meta/LinkedIn audience-extension campaigns run off their first-party data; free Signet ad study with leads (1/2 page+) | on request |

Older public claim: "more than 100,000" print subscribers and 170,000 monthly web readers [EST, [hcn.health](https://hcn.health/hcn-trends-story/sources/dental-economics/)]. DE's 2026 editorial calendar lists "Marketing Alignment / Google Reviews" in **May** and "Retention Systems / Reactivation" in **August**, "Re-care Reboot" in **September** — natural months for a contributed article. FACT — same PDF.

- **Dentistry Today**: 2026 digital media kit exists at [dentistrytoday.com/digital-media-kit-2026](https://www.dentistrytoday.com/digital-media-kit-2026/) but returns 403 to fetchers; clinically-oriented, ~100k+ circulation [UNVERIFIED]. Lower fit for a front-office product.
- **Dental Products Report, Inside Dentistry/Compendium (AEGIS), The Progressive Dentist, Incisal Edge (Benco)**: not retrievable this session [UNVERIFIED]. Incisal Edge is Benco's customer magazine — reachable only via a Benco relationship. Dental Products Report runs "product roundups" that accept submissions [UNVERIFIED].
- **Becker's Dental Review / Group Dentistry Now**: DSO-oriented; free news pickup for funding/launch announcements; sponsorship offered but audience is DSO executives [FACT that GDN is a content hub with ads — [groupdentistrynow.com](https://www.groupdentistrynow.com/)]. Low fit for self-serve.
- **Fit:** Print display is the wrong shape for $200/mo. The right Endeavor products are (1) contributed practice-management articles (free, DE/DIQ accept expert contributors — editors named in the kit), (2) a DentistryIQ Morning Briefing newsletter sponsorship (45K, daily, whole-team incl. OMs), and (3) their Meta/LinkedIn audience-extension using first-party dental data — this is one of the few ways to buy a *verified-dentist* retargeting audience.

### 2.5 Podcasts

Monthly-listener bands are Feedspot/Rephonic estimates; the shows themselves publish cumulative downloads.

| Podcast | Host | Audience | Notes | Source |
|---|---|---|---|---|
| **Bulletproof Dental Practice** | Peter Boulden, Craig Spodak | 10k–50k monthly [EST]; **3M+ downloads, 450+ eps, 2×/week** [VENDOR CLAIM] | Marketing/systems/leadership; Bulletproof Summit + Mastermind; no public rate card | [Feedspot](https://podcast.feedspot.com/dental_business_podcasts/); [bulletproofdentalpractice.com](https://www.bulletproofdentalpractice.com/best-dental-podcast/) |
| **Shared Practices** | George Hariri, Richard Low, Scott Leune | 10k–50k monthly; 719 episodes, weekly | Practice-ownership "bootcamp"; acquisition/startup audience = trigger-moment listeners | [Rephonic](https://rephonic.com/podcasts/shared-practices-your-dental-roadmap-to-practice-o) |
| **The Dentalpreneur** | Mark Costes | 10k–50k monthly | Dental Success Network + Dental Success Summit (June 11–13 2026, Frisco TX) | [Feedspot](https://podcast.feedspot.com/dental_business_podcasts/); [Surch list](https://surchdigital.com/50-us-dental-ortho-conferences-in-2026/) |
| **Thriving Dentist Show** | Gary Takacs | 10k–50k monthly | + "Less Insurance Dependence" (with Naren Arulrajah of Ekwa — an agency) | Feedspot |
| **Dental A Team** | Kiera Dent | 10k–50k monthly | Consulting firm, "1000+ practices," has a Partnerships page | Feedspot; [thedentalateam.com](https://www.thedentalateam.com/) |
| **Dentistry Uncensored** | Howard Farran (Dentaltown) | large, long-running [UNVERIFIED size] | Vendor-friendly interview format | [Voices of Dentistry](https://www.voicesofdentistry.com/sponsors) |
| **The Best Practices Show** | Kirk Behrendt (ACT Dental) | 1k–10k monthly; Facebook 37.8K | Coaching firm; TTT study clubs; partnerships | Feedspot; [actdental.com](https://www.actdental.com/) |
| **Nobody Told Me That!** | Teresa Duncan | 1k–10k | OM/insurance-coordinator audience | Feedspot |
| **Dental Drills Bits** | Sandy Pardue, Dana Salisbury | 1k–10k | Front-office systems consultant | Feedspot |
| **The Making of a Dental Startup** / **The Dental Marketer** | Ashley Joves, Michael Arias | 1k–10k | **Startup dentists** — pure trigger-moment audience | Feedspot; [thedentalmarketer.site](https://thedentalmarketer.site/) |
| Dental Practice Heroes, Dentistry Made Simple (TBone), Dental CEO (Leune), Dental Unfiltered, Daily Dental (Killeen), Millennial Dentist, Working Interferences | various | 1k–10k each | Working Interferences / Millennial Dentist not in Feedspot's top list this year [UNVERIFIED size] | Feedspot |
| **AADOM Radio** | John Stamper | 1k–10k | OM audience | Feedspot |
| A Tale of Two Hygienists (Endeavor) | — | 750+ eps, 2M+ downloads | Hygienist audience; Endeavor sells sponsorship | [Endeavor kit](https://dental.endeavorb2b.com/wp-content/uploads/Dental-Media-Kit.pdf) |

**Pricing.** No dental show publishes a rate card. Industry CPMs: B2B $50–100+, mid-roll $25–50 [EST, [Influencer Marketing Hub](https://influencermarketinghub.com/podcast-sponsorship/), [Operation Podcast](https://www.operationpodcast.com/blog/podcast-sponsorship-pricing-2026)]. **[INFERENCE]** A top-tier dental show (~10–20k downloads/episode) will quote **$1,500–3,500 per host-read episode** or $5–15k for a monthly package; mid-tier shows $300–1,000 per episode, and many will trade a sponsorship for a demo-account + affiliate code. The Voices of Dentistry Gold tier ($10k) explicitly bundles mentions on Dental Hacks, Dentalpreneur and Dentists/Implants/Worms — a useful price anchor for multi-show reach. FACT — [voicesofdentistry.com/sponsors](https://www.voicesofdentistry.com/sponsors).

### 2.6 YouTube, LinkedIn, Reddit

- **YouTube** [UNVERIFIED sizes]: practice-business channels are small relative to clinical/consumer dental content; the ones that matter are the podcast video feeds above (Bulletproof, Shared Practices, Dental A Team), Dentaltown's channel, and startup-journey vlogs. Best use: the product's own how-to and "Google Business Profile fix" videos for search intent, not sponsorships.
- **LinkedIn** [UNVERIFIED]: dental-influencer reach on LinkedIn is concentrated among DSO executives, consultants, and vendor founders (Kirk Behrendt, Mark Costes, Emmet Scott/DEO, Gary Takacs, Kiera Dent, Teresa Duncan, Sandy Pardue, Laura Nelson). Owner-dentists are lightly present. LinkedIn works for partner/consultant recruitment, not for direct practice acquisition.
- **Reddit**: r/Dentistry (six figures of members [UNVERIFIED]) prohibits advertising/solicitation and requires mod approval for surveys; r/dentaloffice and r/DentalHygiene are small [UNVERIFIED — reddit.com is blocked from this session]. Use for listening (objections, PMS complaints, "NexHealth" sentiment), never for posting.

### 2.7 Conferences

| Meeting | When/where (2026) | Attendance | Exhibitors / cost | Fit | Source |
|---|---|---|---|---|---|
| **Chicago Midwinter (CDS)** | Feb 19–21, McCormick Place West | "largest scientific dental meeting in North America"; historically ~25–30k [UNVERIFIED] | **500+ exhibitors**, 250+ CE; expanded hall in 2026; exhibits@cds.org | Medium — huge, expensive, clinical | [cds.org](https://www.cds.org/2026-midwinter-meeting/); [DentistryIQ](https://www.dentistryiq.com/dentistry/research-and-news/press-release/55320415/2026-midwinter-meeting-expands-exhibit-hall-adds-new-amenities) |
| **Hinman (Atlanta)** | Mar 12–14, GWCC | 10,000+ | 500+ exhibitors; all-in booth $15–40k [EST] | Medium | [Orbital](https://withorbital.com/conferences/thomas-p-hinman-dental-meeting-2026) |
| **Greater New York Dental Meeting** | Nov 27–Dec 1, Javits | **32,012 registrations (2025); 12,080 dentists** | large hall; pricing on request | Medium-low (international, clinical) | [gnydm.com](https://www.gnydm.com/) |
| **Yankee Dental Congress** | Jan 29–31 2026; Jan 28–30 2027 | ~20k+ [UNVERIFIED] | ydc27.mapyourshow.com; yankeedental@massdental.org | Medium | [yankeedental.com](https://www.yankeedental.com/) |
| **CDA Presents** (Anaheim + SF) | May 14–16 | large [UNVERIFIED] | cda.org 800-232-7645 | Medium (CA = 14k practices) | [Surch list](https://surchdigital.com/50-us-dental-ortho-conferences-in-2026/) |
| **Pacific Dental Conference** (Vancouver) | Mar 5–7 | ~12–14k [UNVERIFIED] | — | Low (Canada) | same |
| **ADA SmileCon** | Oct 8–10, Indianapolis | — | ADA Member Advantage vendors showcased | Low-medium | same; [ADA News](https://adanews.ada.org/ada-news/2024/october/discover-ada-member-advantage-endorsed-products-services-at-smilecon/) |
| **AADOM Conference** | Sept 3–5, Orlando | 1,100+ OMs | boutique; prospectus on request | **High** | [exhibitor.aadomconference.com](https://exhibitor.aadomconference.com/) |
| **Voices of Dentistry** (podcast summit) | Jan 16–17, Scottsdale/Gilbert AZ | several hundred owner-dentists [INFERENCE from tier structure] | **Silver $6,000 · Gold $10,000 · Platinum $17,500**; party $12k, WiFi $6k, DJ $5k | **High** (owner-dentists + 7 podcast hosts in one room) | [voicesofdentistry.com/sponsors](https://www.voicesofdentistry.com/sponsors) |
| **Dental Success Summit** (Costes) | June 11–13, Frisco TX | — | sponsorship via Dental Success Network | High (growth-minded owners) | [Surch list](https://surchdigital.com/50-us-dental-ortho-conferences-in-2026/) |
| **Bulletproof Summit** | — | — | via hosts | High | [bulletproofdentalpractice.com](https://www.bulletproofdentalpractice.com/best-dental-podcast/) |
| **Dykema DSO Conference** | July 15–17, Denver Gaylord Rockies | 1,000–2,000 (organizer says 1,500+) | 25–74 exhibitors; $250-off codes circulate | Low (DSO buyers) | [Orbital](https://withorbital.com/conferences/dykema-dso-conference-2026); [GDN](https://www.groupdentistrynow.com/events/dykema-dso-conference-2026-use-discount-code-gdn26/) |
| **DEO events** (Revenue Intensive Oct 8–10, Grapevine TX) | — | "600+ dental leaders" | DEO app $700/mo incl. "$1,500/mo vendor savings" (a vendor-discount club) | Low-medium (group owners) | [deodentalgroup.com](https://www.deodentalgroup.com/) |
| **Nifty Thrifty / Dental Nachos events** (Super Dentist Boost 2026) | — | — | sponsor via founders | High, cheap | [dentalnachos.com](https://www.dentalnachos.com/) |
| State meetings (TX May 7–9, FL June 25–27, GA, OH Sept 17–19, MI, NC, NJ, PA, VA, AZ, UT, Rocky Mountain, Star of the North, Southwest) | see list | 2–8k each [UNVERIFIED] | booths typically $1.5–4k [UNVERIFIED] | Medium-high per $ | [Surch list](https://surchdigital.com/50-us-dental-ortho-conferences-in-2026/) |

**Fit summary.** Big-hall meetings are where PMS vendors, distributors and DSOs spend; a $200/mo product cannot recover a $20k Hinman booth from a 10k-attendee crowd that is 50% hygienists/assistants. The economics favor **small rooms full of owners** (Voices of Dentistry, Dental Success Summit, Bulletproof Summit, Nachos/Nifty events, AADOM) and **state meetings** with sub-$4k booths. A Chicago Midwinter or GNYDM appearance is worth doing once for press/photos and the Endeavor "trade show bundle," not as a pipeline source.

### 2.8 Study clubs and CE platforms

- **Seattle Study Club**: "250+ study clubs nationwide"; national Symposium (Jan 2027, Marco Island); Directors/Coordinators Summit Sept 25 2026, Louisville; "Become a Partner" form; runs an Align discount program (i.e., they do vendor deals). FACT — [seattlestudyclub.com](https://www.seattlestudyclub.com/). **[INFERENCE]** The coordinators (usually the director's OM) are an under-marketed OM network.
- **Spear Education** study clubs (faculty-designed curricula), **Kois Center**, **Pankey Institute**: pages fetched but publish no counts or partner terms; Kois/Pankey are clinical-excellence cultures with premium fee-for-service practices — good *customers*, poor *channels* (no vendor programs to speak of) [FACT for Spear page: [speareducation.com/study-club](https://www.speareducation.com/study-club); rest UNVERIFIED].
- **ACT Dental "To The Top" (TTT) study clubs** (Kirk Behrendt) and **Fortune Management** ("150+ executive consultants, 400+ local live events annually, 15,000+ dentists coached") are consultant-run study-club networks with explicit vendor relationships. FACT — [actdental.com](https://www.actdental.com/); [fortunemgmt.com](https://www.fortunemgmt.com/).
- CE marketplaces (Dentaltown CE, DACE by Endeavor, CE Zoom/Viva Learning) sell sponsored webinars; DACE webinars are in the Endeavor kit [FACT]. A sponsored "fix your Google Business Profile in 20 minutes" CE webinar is an on-brand, low-cost play [INFERENCE].

### 2.9 Dental schools, new dentists, and associations

- **ASDA (American Student Dental Association)** — 2026 media kit retrieved. **23,000+ members (~82% of all US dental students)**; *Word of Mouth* magazine circulation 22,000; email 42% open rate; Instagram 30,000+. **Rates**: dedicated email to one predoctoral class (5,000) **$3,500**, two classes $4,500, three $5,500, all members (21,000) **$5,750**; one ASDA district (~2,000) $1,750; state grouping ≤3,000 $2,000; follow-up-to-openers $1,750; web banner $950; print ads $1,100–2,500. FACT — [ASDA media kit PDF](https://www.asdanet.org/docs/media-kit/asda-mediakit.pdf), CorporateRelations@ASDAnet.org.
- **ADA New Dentist** program (New Dentist Committee, New Dentist Conference, "Success" seminars in schools): page 404'd this session [UNVERIFIED]. **ADA Member Advantage** currently endorses **Weave** for patient engagement and **BaseKamp Design** for websites, plus Panacea (practice loans), Best Card, CareCredit; the review process is not public. FACT — [adamemberadvantage.com](https://www.adamemberadvantage.com/en/endorsed-programs). **[INFERENCE]** Endorsements are royalty-bearing exclusives negotiated with ADA Business Enterprises; a two-year-old $200/mo product will not displace Weave there, but **state associations run their own endorsed/preferred programs** (Iowa, Nevada, Massachusetts "MDA Programs," etc.) with lower bars and local relationships — a realistic 2027 target once there is a reference base in a state. Sources: [Iowa](https://www.iowadental.org/member-services/endorsed-companies), [Nevada](https://www.nvda.org/membership/benefits-of-membership), [MDA Programs](https://www.mdaprograms.com/mda-services-programs/financial-solutions/practice-equipment-loans/).
- **Fit:** Students are a 5–10-year relationship; the cheap, precise ASDA email ($3,500 for a graduating class) is worth it only with an offer shaped for associates-who-will-own (free "startup/acquisition readiness" content, not a $200 subscription). Otherwise deprioritize.

### 2.10 Software marketplaces and review sites

- **Capterra**: 233 dental products; top-rated include CareStack, Doctible, NexHealth, Adit. FACT — [capterra.com/dental-software](https://www.capterra.com/dental-software/). **Software Advice**: free buyer consultations; "Vendors pay Software Advice for these referrals." FACT — [softwareadvice.com/dental](https://www.softwareadvice.com/dental/). GetApp/G2 similar [UNVERIFIED].
- **Fit:** Listing is free and reviews compound; paid PPC/PPL on Gartner Digital Markets runs $5–25+/click for healthcare categories [UNVERIFIED] and buyers there are researching PMS more than front-office add-ons. List, collect reviews, don't buy clicks yet.

---

## 3. The referral / partner ecosystem map

Legend: **Partner** = refers or resells; **Both** = partners on some functions, competes on others; **Compete** = overlaps DreamCRM's core.

### 3.1 Practice-management consultants (Partner — the highest-leverage tier)

| Firm / person | Scale | Vendor relationship | Fit | Source |
|---|---|---|---|---|
| **Fortune Management** | 15,000+ dentists coached; 150+ local consultants; 400+ live events/yr; since 1989 | Coaches recommend stacks; runs camps | Very high (local consultants = distributed sales force) | [fortunemgmt.com](https://www.fortunemgmt.com/) |
| **Levin Group** (Roger Levin) | "over 30,000 practices"; 25,000 daily-tip subscribers | Systems-driven; no public partner program | High (newsletter + OM training modules) | [levingroup.com](https://levingroup.com/) |
| **ACT Dental** (Kirk Behrendt) | Pro coaching + TTT study clubs; Best Practices Show podcast | "Partnerships" program exists | High | [actdental.com](https://www.actdental.com/) |
| **Dental A Team** (Kiera Dent) | 1,000+ practices; podcast 10k–50k/mo | "Partnerships" page | High (OM-centric consulting) | [thedentalateam.com](https://www.thedentalateam.com/) |
| **Scheduling Institute** (Jay Geier) | "thousands" of practices; Alpharetta GA; "5-Star Challenge" new-patient assessment | No public partner program; sells its own phone/new-patient training | Medium (their new-patient obsession = DreamCRM's story; possible conflict with their marketing upsells) | [schedulinginstitute.com](https://www.schedulinginstitute.com/) |
| **Front Office Rocks** (Laura Nelson) | thousands of clients; $1,999/yr training | Now owned by UptimeHealth (compliance) | Medium-high (front-desk training = adoption engine) | [frontofficerocks.com](https://frontofficerocks.com/) |
| **Sandy Pardue** (Classic Practice Resources), **Teresa Duncan** (Odyssey Mgmt), **Kevin Henry** (DentistryIQ/AADOM voice) | individual authorities; podcasts 1k–10k | Speak at AADOM/state meetings; sponsor-friendly | High per dollar | [Feedspot](https://podcast.feedspot.com/dental_business_podcasts/) |
| **Dental Success Network** (Mark Costes) | Dentalpreneur podcast 10k–50k; Summit June 2026 | Sponsorships | High | see §2.5 |
| **The DEO** (Emmet Scott) | 2,000+ practices; app $700/mo with a vendor-savings club | Vendor-discount club is a formal channel | Medium (group owners) | [deodentalgroup.com](https://www.deodentalgroup.com/) |
| **ADMC** (Academy of Dental Management Consultants) | site Cloudflare-gated; est. ~150–200 consultant members with a corporate-member tier [UNVERIFIED] | Corporate membership + annual meeting | High (one membership reaches the whole consultant guild) | [admc.net](https://www.admc.net/) |
| **Dental Consultant Connection** | [UNVERIFIED] | — | Medium | — |

**Why consultants first:** they are in the practice at exactly the trigger moments (new owner, bad month, staff turnover), they are trusted by the dentist *and* the OM, and their business model welcomes a recurring referral fee. **[INFERENCE]** Offer: 20–30% recurring for 12 months or a flat $300–500 per activated practice, plus a co-branded "front-office scorecard" they can run in the practice.

### 3.2 Dental CPAs and bookkeepers (Partner)

- **Academy of Dental CPAs (ADCPA)**: site returned empty this session; ~25–30 member firms serving several thousand practices, with an annual meeting that accepts sponsors [UNVERIFIED]. [adcpa.org](https://www.adcpa.org/).
- Dental CPAs see the P&L line for "software subscriptions" and are asked "is this worth it?" at every year-end review; they also broker startups and acquisitions (feasibility studies). Fit: medium-high; low effort (a one-page "what a $200 front-office stack replaces" for the CPA to hand over).

### 3.3 Brokers and transition consultants (Partner — the new-owner door)

- **ADS Dental Transitions**: national network of independent broker firms; "over 42,000 successful sales and purchases" cumulative; preferred-lender program; buyer resources. FACT — [adstransitions.com](https://www.adstransitions.com/). Their own 2025 article tells sellers that buyers want "modern practice management software" and a "strong online presence with SEO" — i.e., brokers already coach *sellers* to fix the website before listing. FACT — [ADS article](https://www.adstransitions.com/resources/articles/buying-selling-dental-practices-in-2025-trends-challenges-strategies/).
- **Henry Schein Dental Practice Transitions**: 50+ consultants, all 50 states; buyer registration ("Preferred Purchaser Form"). FACT — [dentalpracticetransitions.henryschein.com](http://dentalpracticetransitions.henryschein.com/). Note: Schein owns Dentrix and pushes Schein One products at transition [INFERENCE].
- **Aftco**, **Choice Transitions**, regional brokers: not retrievable [UNVERIFIED]; same shape.
- Fit: high. Every closed deal is a website/booking/reviews re-do (new name, new doctor bio, new phone tree). A "new-owner launch kit" co-branded with the broker is the natural artifact.

### 3.4 Lenders (Partner — the startup door)

- **Bank of America Practice Solutions**: up to $5M; 100% startup financing; dedicated project managers for startups; reps maintain "an extensive network of partners… marketing firms, and more." FACT — [BofA](https://www.bankofamerica.com/smallbusiness/business-financing/practice-solutions/dentist-loans/); [Student Loan Planner review](https://www.studentloanplanner.com/bank-of-america-practice-loan-solutions-review/). Endorsed by state associations (e.g., Mass. Dental Society, Michigan's MDA Programs). FACT — [massdental.org](https://www.massdental.org/partners/boaps/); [mdaprograms.com](https://www.mdaprograms.com/news/bank-of-america-practice-solutions-can-help-with-financing-for-first-time-practice-owners-startups-acquisitions-remodels-and-more/).
- **Provide** (formerly Lendeavor; Fifth Third subsidiary): startup/acquisition loans; "The Path to Owning It" podcast; no vendor program on site. FACT — [getprovide.com](https://www.getprovide.com/).
- **Panacea Financial**: ADA-endorsed practice loans. FACT — [ADA Member Advantage](https://www.adamemberadvantage.com/en/endorsed-programs). **Wells Fargo Practice Finance, Huntington, US Bank**: same shape [UNVERIFIED].
- Fit: high but slow — lenders' rep networks are informal; the play is regional rep relationships plus a free "startup web presence 90 days before opening" package (the startup needs a site and phone number before the loan funds the buildout).

### 3.5 Marketing agencies (Both — compete on websites, partner on everything else)

- **ProSites** (~7,500+ practices; historically endorsed by ~20 state dental associations [UNVERIFIED — site blocked]); **PBHS** (AAOMS/ADA-adjacent specialty websites [UNVERIFIED]); **Roadside Dental Marketing**, **Golden Proportions**, **Wonderist**, **Smile Marketing**, **Ekwa** (Gary Takacs' co-host) — all sell $150–600/mo websites plus SEO/ads at $1,500–5,000/mo [UNVERIFIED pricing; pages blocked or DNS-failed]. **BaseKamp Design** is the current ADA-endorsed website vendor. FACT — [ADA MA](https://www.adamemberadvantage.com/en/endorsed-programs).
- Verdict: **Compete on the $150–300/mo website line; partner on ads/SEO.** Agencies that sell SEO/PPC but not booking/reviews/recall (most of the smaller ones) can white-label DreamCRM's booking + reviews + portal behind their site — the "we'll build the site, DreamCRM runs the front office" bundle. The big website mills (ProSites, PBHS) will not partner. [INFERENCE]

### 3.6 Dental IT / MSPs (Partner — present at every startup and every PMS switch)

- **Darkhorse Tech**: "1000+ dentists," 6 metro markets, explicit startup packages ("dental software installation… over 300 installs"), and an "Open Dental Cloud Solutions" framework where the practice "choose[s] which appointment scheduling, paperless, data analytics, or review provider you want" — i.e., they already assemble the front-office stack for OD practices. FACT — [darkhorsetech.com](https://www.darkhorsetech.com/).
- **Pact-One Solutions**: "3,000+ dental pros daily," 12 western/central states, a dedicated startup segment, existing client referral program, PMS-agnostic. FACT — [pact-one.com](https://www.pact-one.com/).
- **Dental IT, TechCentral (Henry Schein), Patterson's tech arm**: [UNVERIFIED]; distributor-owned ones push their own stacks.
- Fit: high for independents (Darkhorse, Pact-One, regional MSPs): they touch every new install, they hate vendors that "write directly to the database" (see §1.6 — this is where the NexHealth/OD issue will surface), and they want a booking/reviews recommendation that doesn't create tickets.

### 3.7 Distributors' rep networks (Low fit near-term)

Henry Schein (owns Dentrix + a website business), Patterson (owns Eaglesoft + partners with RevenueWell), Benco (Incisal Edge magazine; ~independent). Reps are compensated on equipment/supplies and on their house software; a third-party $200/mo SaaS earns them nothing. **[INFERENCE]** Benco is the only distributor plausibly open to a co-marketing conversation, and only via its magazine/events team. Deprioritize.

### 3.8 PMS marketplaces and vendor directories (Partner surfaces; some gated)

| Marketplace | Terms | Fit | Source |
|---|---|---|---|
| **Open Dental third-party vendors page** | Listing requires a verified API status; authorized vendors use the OD API (87 listed); vendor.relations@opendental.com | High *if* DreamCRM integrates via OD's API (its OD-direct code) — and it neutralizes the NexHealth warning for OD practices | [opendental.com](https://www.opendental.com/site/vendorsthirdparty.html) |
| **Dentrix Ascend API Exchange** (Henry Schein One) | Online application → security review → setup; SOC 2 Type II + OAuth 2.0 required; 140+ vendors | Medium-high; SOC 2 is a real gate (budget 6–9 months + $20–40k [UNVERIFIED]) | [henryscheinone.com](https://www.henryscheinone.com/dental-solutions/api-exchange/api-exchange-vendors/) |
| **NexHealth developer program** | Free developer account, docs.nexhealth.com; refer-a-practice $500 | Already the integration; co-marketing with NexHealth is plausible once volume exists | [NexHealth FAQ](https://www.nexhealth.com/frequently-asked-questions) |
| **Curve Dental / CareStack / Eaglesoft partner pages** | 404 this session [UNVERIFIED] | Medium | — |
| **Capterra / Software Advice / GetApp** | Free listing; paid referrals/PPC | List now; buy later | §2.10 |

---

## 4. How dentists research and buy software in 2026

There is no rigorous published survey of dental *front-office* software buying; the picture below is assembled from vendor-comparison sites, buyer-advisor data, HPI structure, consultant guidance, and forum behavior. Flags apply.

**Trust signals (in the order dentists cite them) [INFERENCE from Software Advice advisor data, Facebook-group behavior, ADA endorsement structure]:**
1. A peer dentist's unprompted recommendation in a group thread or study club ("what do you use for…").
2. The consultant/OM-trainer already in the practice.
3. Evidence it works with *their* PMS — the first question in every thread. Open Dental users in particular check the OD vendor page.
4. Association endorsement (ADA/state) — less as a driver than as a permission slip for conservative buyers.
5. Review-site ratings (Capterra shows CareStack/Doctible/NexHealth at 4.7–4.8) and Townie Choice Awards.
6. Whether the vendor will *do the migration/setup* — "no information is left out" is the recurring migration fear (Software Advice, [FACT](https://www.softwareadvice.com/dental/)).

**Demo vs self-serve.** Guides uniformly say "never purchase without a live demo… arrange a trial period" and "involve the front-office team" ([Curve](https://www.curvedental.com/dental-blog/ultimate-guide-to-dental-software), [Flex](https://learn.flex.dental/flex-dental-seo-blogs/choosing-the-best-dental-practice-management-software-for-2025)) — that is PMS advice, where switching costs are large. **[INFERENCE]** For a $200/mo front-office layer with a no-card trial, the demo is a *reassurance*, not a gate: expect ~60–70% of sign-ups to be self-serve (OM-driven), with the dentist wanting a 15-minute screen-share before the card goes in. Design for "book a 15-minute walkthrough" inside the trial rather than a demo-before-trial funnel.

**Biggest objections [INFERENCE + forum patterns]:** "Does it sync with Dentrix/Eaglesoft/Open Dental (and will it break it)?"; "We already pay Weave/RevenueWell/Solutionreach"; "Our website agency handles that"; "Who trains my front desk?"; "Is it HIPAA-compliant / will you sign a BAA?" (see docs/COMPLIANCE.md); "What happens to my Google reviews link if I switch?"; and the contract objection — the field is trained to fear 24–36-month auto-renewing patient-communication contracts, so month-to-month is a selling point worth saying out loud.

**Seasonality and budget cycles [INFERENCE from the Endeavor editorial calendar, tax law, and meeting calendar]:** January–March is planning + the big-meeting season (Yankee, Midwinter, Hinman, Voices of Dentistry) — highest research intent; **Q4 (Oct–Dec) is the Section 179/year-end spend window** and when CPAs review subscriptions; summer is slow (vacations; AADOM in early Sept is the OM re-start). DE's own calendar places "Google Reviews/Marketing Alignment" in May and "Reactivation/Retention/Re-care" in Aug–Sep, i.e., the trade press primes recall/reviews conversations in exactly those months.

**Who signs.** In solo/small practices the owner-dentist signs anything over ~$100/mo but the OM chooses; in 2–5-doctor groups an OM/administrator often holds a budget up to a few hundred dollars per month and buys without the doctor [INFERENCE]. DSOs are RFP/central and out of scope.

---

## 5. Trigger moments (when a practice actually buys)

Ranked by (volume × propensity × reachability). Volumes are US per-year estimates; see §1 for derivations.

| # | Trigger | Est. events/yr | Why it converts | Where to intercept |
|---|---|---|---|---|
| 1 | **Practice purchase / owner change** | 5,000–8,000 [INFERENCE] | New name, new doctor, new phone/hours; the buyer is younger and cloud-native; the seller's website and review link are often unusable | Brokers (ADS, HS DPT), lenders, dental CPAs (feasibility), Shared Practices / Dentist Executives & Practice Owners group |
| 2 | **Scratch startup** | 800–1,500 [INFERENCE] | Needs a site, booking, Google Business Profile and a phone number 90+ days before opening; no incumbent to displace; budget planned at $2–3k/mo for software | Lenders' startup teams (BofA, Provide), Darkhorse/Pact-One startup packages, The Making of a Dental Startup / Dental Marketing Society, Scott Leune's programs |
| 3 | **PMS switch (esp. to cloud: Ascend, Curve, Denticon, OD Cloud)** | tens of thousands of practices are mid-migration over the decade; a few thousand/yr [INFERENCE from SaaS 60% share growing ~14%/yr] | Every integration is re-evaluated; the IT/MSP is in the building | MSPs, PMS marketplaces (OD authorized list, Ascend API Exchange), Open Dental Users groups |
| 4 | **Bad-reviews incident / Google listing problem** | continuous; every practice ~annually | Emotional, urgent, dentist-driven; DreamCRM's GBP-truth + review loop is the direct answer | Google search intent, Facebook "help, a 1-star" threads, consultants, the public grader (marketing-engine) |
| 5 | **Front-desk turnover** (BLS: 52,900 assistant openings/yr; OM churn high [INFERENCE]) | 20,000+ practices/yr affected [INFERENCE] | New OM inherits a stack she didn't choose; wants automation she can run alone | DOMC/DOMA, AADOM, Front Office Rocks, Dental A Team |
| 6 | **Adding a location / associate** | ~2,000–4,000/yr [INFERENCE from group growth] | Multi-location scheduling, per-location reviews, one portal | Consultants, DEO (light), Dental Success Network |
| 7 | **Website redesign / agency contract ending** | 10–15% of practices/yr [INFERENCE] | The website line is up for grabs; agencies churn | SEO for "dental website" intent, agencies that don't sell booking, the grader |
| 8 | **Year-end budget review (Q4) / CPA review** | all practices | Subscription consolidation ("replace three lines with one") | Dental CPAs, DE/DIQ Q4 editorial, ASDA-style eblasts through DIQ Morning Briefing |
| 9 | **Insurance/PPO drop or membership-plan launch** | growing (Less Insurance Dependence audience) | Needs a patient-facing plan page, recall and reviews to replace PPO flow | Thriving Dentist / Less Insurance Dependence, Kleer/BoomCloud ecosystems, consultants |
| 10 | **Dental-school graduation → associate → future owner** | 7,015/yr | Relationship only; 5–10-year lag | ASDA email ($3,500/class), ADA New Dentist, school "business of dentistry" courses |

---

## 6. Master channel table

Fit rating for a **$200/mo self-serve** product: ★★★★★ = cheap, owner/OM-dense, trust-transferring; ★ = expensive or wrong buyer.

| Channel | Size / reach | Access terms | Cost | Fit |
|---|---|---|---|---|
| Nifty Thrifty Dentists FB group + deals | ~40k members [EST 2022] | Founder-run vendor deals, Facebook Lives | Negotiated discount + fee/rev-share [INFERENCE] | ★★★★★ |
| Dental Nachos FB group + sponsor directory + Super Dentist Boost | ~35k+ members [EST 2022] | Paid sponsor slots, sweepstakes, speaking | Negotiated; mid four figures/yr [INFERENCE] | ★★★★★ |
| DOMC (20k OMs) + DOMA vendor perks | 20,000+ [FACT 2025] | Vendor-partner perks program | Low (gift cards, trials, discounts) | ★★★★★ |
| AADOM conference + chapters | 1,100+ attendees; chapters nationwide | Prospectus; boutique exhibit | ~$5–25k [UNVERIFIED] | ★★★★☆ |
| Voices of Dentistry | several hundred owners + 7 podcast hosts | Silver/Gold/Platinum | $6k / $10k / $17.5k [FACT] | ★★★★☆ |
| Top-5 business podcasts (Bulletproof, Shared Practices, Dentalpreneur, Thriving Dentist, Dental A Team) | 10–50k monthly each [EST] | Host-read; no rate cards | ~$1.5–3.5k/episode [INFERENCE] | ★★★★☆ |
| Startup/transition podcasts (Making of a Dental Startup, Shared Practices, Path to Owning It) | 1–10k monthly | Host-read/affiliate | $300–1k/episode [INFERENCE] | ★★★★★ (trigger-dense) |
| Consultant referral program (Fortune, Levin, ACT, Dental A Team, Pardue, Duncan) | tens of thousands of client practices combined | Partnerships pages; ADMC corporate membership | Recurring referral fee | ★★★★★ |
| Brokers (ADS network, HS DPT) | 5–8k transitions/yr [INFERENCE] | Co-branded new-owner kit; preferred-vendor status | Referral fee / free | ★★★★★ |
| Lenders' startup teams (BofA, Provide, Panacea) | ~1k startups/yr [INFERENCE] | Rep relationships; state-association tie-ins | Free (relationship) | ★★★★☆ |
| Dental IT/MSPs (Darkhorse 1,000+ dentists; Pact-One 3,000+ pros) | thousands of practices | Referral program / stack recommendation | Referral fee | ★★★★☆ |
| Open Dental authorized-vendor listing | OD installed base (tens of thousands [EST]) | Integrate via OD API; vendor.relations@opendental.com | Engineering time | ★★★★☆ (also de-risks NexHealth warning) |
| Dentrix Ascend API Exchange | 140+ vendors; Ascend base | SOC 2 Type II + OAuth 2.0; application | SOC 2 cost | ★★★☆☆ |
| DentistryIQ Morning Briefing newsletter | 45K daily (whole team) | Sponsorship / eblast to 5,000 | on request; Endeavor eblast-class pricing [UNVERIFIED] | ★★★☆☆ |
| Endeavor Meta/LinkedIn audience extension (first-party dental data) | verified dentist audiences | Managed campaign | on request | ★★★☆☆ |
| Dental Economics contributed articles | 92K subs / 24K UMV / 201K social | Editorial pitch (Pam Maragliano, DE) | Free | ★★★★☆ |
| Dental Economics print display | 92K+ | Rate card | $12,500/page | ★☆☆☆☆ |
| Dentaltown forums / Townie Choice Awards | ~120k readers [EST] | Free participation; awards campaign | Free; print ~$7.4k/page [EST] | ★★★★☆ (forums) / ★ (print) |
| State dental meetings (TX, FL, CA, GA, OH, MI, NC…) | 2–8k each [UNVERIFIED] | Booth | $1.5–4k [UNVERIFIED] | ★★★☆☆ |
| Chicago Midwinter / Hinman / GNYDM / Yankee | 10–32k each | Booth | $15–40k all-in [EST] | ★★☆☆☆ |
| Dykema / DEO / Becker's (DSO) | 1–2k execs | Sponsor | mid-five figures [UNVERIFIED] | ★☆☆☆☆ |
| ASDA email / print | 23,000 students; 82% of all | Rate card | $3,500 per class; $5,750 all | ★★☆☆☆ (long lag) |
| ADA Member Advantage endorsement | 150k+ members | Opaque review; Weave incumbent | Royalty [INFERENCE] | ★☆☆☆☆ now / ★★★ state-level later |
| State association endorsed-vendor programs | per state (CA 14k practices) | Negotiated; local references | Royalty / member discount | ★★★☆☆ (2027) |
| Seattle Study Club partner program | 250+ clubs | "Become a Partner" form | Negotiated | ★★★☆☆ |
| Capterra / Software Advice / GetApp | 233 dental products | Free listing; PPC/PPL | $0 → $ per lead | ★★★☆☆ |
| Reddit r/Dentistry | six figures [UNVERIFIED] | No advertising | $0 | ★☆☆☆☆ (listen only) |
| LinkedIn | consultants/DSO execs | Organic | $0 | ★★☆☆☆ (partner recruiting) |
| YouTube (own channel + podcast video) | search intent | Organic | production | ★★★☆☆ |

---

## 7. Partner ecosystem map (who touches the practice at which moment)

```
                    ┌──────────────── PRE-OWNERSHIP ────────────────┐
  Dental school → ASDA (23k) → ADA New Dentist → Associate (77% of grads)
                                   │                     │
                                   ▼                     ▼
             ┌──────── STARTUP ────────┐        ┌──── ACQUISITION ────┐
             │ Lenders: BofA PS, Provide│        │ Brokers: ADS network,│
             │ Panacea; CPA feasibility │        │ HS DPT (50+ reps),  │
             │ Consultants: Leune, DSN  │        │ Aftco; dental CPAs   │
             │ MSPs: Darkhorse, Pact-One│        │ Lenders (same)       │
             │ Podcasts: Making of a    │        │ Podcast: Shared      │
             │   Dental Startup         │        │   Practices          │
             └────────────┬────────────┘        └──────────┬──────────┘
                          ▼                                 ▼
             ┌──────────────── OPERATING PRACTICE (~120k independent) ───────────────┐
             │ Daily voice: OM  ← DOMC/DOMA (20k), AADOM (1.1k/yr), Front Office Rocks│
             │ Owner voice:      Nachos (35k+), Nifty Thrifty (40k), Dental Peeps,    │
             │                   Dentaltown forums, Bulletproof/Dentalpreneur/        │
             │                   Thriving Dentist/Dental A Team podcasts               │
             │ In-the-building:  Consultants (Fortune 150 coaches, Levin, ACT,         │
             │                   Dental A Team, Scheduling Inst., Pardue, Duncan)      │
             │                   MSPs (PMS switch), CPA (year-end), agency (website)   │
             │ Rails:            PMS marketplaces (OD authorized list, Ascend API      │
             │                   Exchange), NexHealth, Capterra/Software Advice        │
             │ Permission slips: ADA Member Advantage (Weave incumbent), state         │
             │                   association endorsed-vendor programs                  │
             └────────────────────────────────┬───────────────────────────────────────┘
                                              ▼
                              EXIT: brokers again (seller told to fix website
                              & software before listing) → next buyer = trigger #1
```

**Compete/partner verdicts:** consultants, CPAs, brokers, lenders, MSPs, OM communities, podcasts → **partner**. Website agencies → **compete on the $150–300 website line, partner on ads/SEO**. Patient-engagement platforms (Weave, RevenueWell, Solutionreach, NexHealth's own app) → **compete**; distributors' house software → **compete by proxy** (their reps won't carry a third party). Open Dental → **court** (authorized listing) precisely because it has blacklisted NexHealth.

---

## 8. Open questions and next verification steps

1. Pull the AADOM 2026 prospectus PDF (Karin Wilson) for real booth/sponsor prices; the page is Cloudflare-gated.
2. Pull the Dentaltown Publisher's Report (June 2026) and Dentistry Today's 2026 digital kit via the media-kit forms.
3. Confirm current member counts for Dental Nachos, Nifty Thrifty, Dental Peeps, Dental Disrupt Nation and the OD Users groups from inside Facebook (all 2020–2022 figures here).
4. Ask ADMC and ADCPA for corporate-membership terms and meeting sponsorship rates.
5. Ask three podcast hosts (Bulletproof, Shared Practices, Making of a Dental Startup) for rate cards to replace the CPM inference.
6. Decide the Open Dental posture: an Authorized listing via the OD API is both a channel and the mitigation for the NexHealth warning on OD's vendor page — it is the single most consequential ecosystem fact found in this research.
7. Verify state-association endorsed-vendor entry terms in the three states with the most practices (CA, FL, TX).
