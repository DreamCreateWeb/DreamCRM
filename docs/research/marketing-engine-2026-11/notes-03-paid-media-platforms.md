# Paid media platforms for a small-budget US dental SaaS advertiser (as of 2026-11-23)

Scope note: ~15 tool calls, search-snippet level plus 2 page fetches. Labels: FACT = primary/near-primary source; VENDOR CLAIM = agency/vendor blog or platform self-reporting; ESTIMATE = my inference. Many items could not be found and are in Gaps; nothing below is guessed.

## Google Ads (Search first): 2026 changes, safe small exact-match setup, CPCs, trademark, competitor ads, tracking

### Takeaway
The biggest 2026 change: on Sept 1, 2026 Google auto-upgraded Search campaigns that used campaign-level broad match or automatically created assets (ACA) into AI Max for Search, which adds "keywordless" matching. An exact-match-only campaign with no ACA / campaign-level broad match is by reporting NOT in scope, but AI Max, ACA and final-URL expansion must be verified OFF in the UI. Offline conversion import / enhanced conversions for leads moved to the Data Manager API (June 15, 2026), so build the trial/paid feedback loop there with GCLID.

### Cited Findings
- Starting Sept 1, 2026 Google auto-upgrades Search campaigns using ACA and/or the campaign-level broad match setting to AI Max; ACA campaigns get search term matching + text customization on, broad-match campaigns get search term matching on (Final URL Expansion and text customization off). Exact-match-only campaigns are not mentioned (implied out of scope; article gives no opt-out). — [SERoundtable](https://seroundtable.com/google-ads-migrate-ai-max-sep1-41829.html) (trade press quoting Google email); [PPC Land](https://ppc.land/google-ads-broad-match-campaigns-face-ai-max-auto-upgrade-on-september-1/)
- A blog says new campaign-level broad match / ACA settings were blocked from Aug 3, 2026 and conversions ran Sept 1-30 (VENDOR CLAIM, dates differ by source). — [Common Thread Co](https://commonthreadco.com/blogs/coachs-corner/google-ai-max-migration-live-september-1-2026-ecommerce)
- Ad-group-level broad match keywords are unaffected. Search term reports label AI Max as a match type with a source column (broad match expansion vs keywordless). Identical exact match keyword takes auction priority; phrase/broad/AI Max compete on Ad Rank. — [PPC Land AI Max](https://ppc.land/ai-max/); [Google help](https://support.google.com/google-ads/answer/15910187)
- Analysis cited by SEJ: >25% of impressions attributed to exact match keywords in AI Max-enabled campaigns came via AI Max term matching (VENDOR CLAIM). — [SEJ](https://searchenginejournal.com/google-ads-ai-max-is-making-more-decisions-for-you-heres-what-to-audit-now/596972)
- FACT (Google help): offline conversion imports and enhanced conversions for leads uploads migrated to the Data Manager API starting June 15, 2026 and are blocked in the Google Ads API. Plain offline import is called legacy. GCLID is required if no tag collects user-provided data; Google recommends sending GCLID regardless. Each event needs timestamp + GCLID/user-provided data/BRAID. From April 2026 Google Ads accepts user-provided data from tags, Data Manager and API simultaneously. — [Offline import upgrade](https://support.google.com/google-ads/answer/14274408?hl=en); [Enhanced conversions for leads](https://support.google.com/google-ads/answer/15713840?hl=en); [Data Manager](https://support.google.com/google-ads/answer/15707550?hl=en)
- Benchmarks: LocaliQ/WordStream 2026 median US search CPC $5.42 (blended Google+Microsoft, all industries; VENDOR CLAIM via secondary summary); Visionary Marketing $4.34 avg, +19% YoY; GrowthSpree B2B SaaS non-brand median CPC $8.50-$14.00, +9% YoY, DevTools/PM SaaS $7-$9 (VENDOR CLAIM; Google publishes no official benchmark). — [search summary sources](https://www.growthspreeofficial.com/blogs/saas-google-ads-benchmarks-2026-cpc-cpl-ctr-conversion-rate-by-vertical.md); [Visionary Marketing](https://visionary-marketing.co.uk/blog/google-ads-benchmarks-2026)
- Competitor context only: NexHealth listed on Software Advice at "$350/month" (conflicting "$350 per feature"); Capterra/G2/Software Advice comparison and "alternatives" pages for Weave and NexHealth exist and rank for the alternative terms, meaning review sites compete for these queries. — [Software Advice](https://www.softwareadvice.com/dental/nexhealth-profile/); [Capterra alternatives](https://www.capterra.com/p/182271/NexHealth/alternatives/)

### Inferences
- ESTIMATE: Safe small-campaign settings checklist (verify in UI; I could not verify each toggle's current name): Search only (no Search Partners, no Display Network expansion); exact (and tight phrase) keywords only; AI Max OFF; ACA/"automatically created assets" OFF; Final URL expansion OFF; auto-apply recommendations OFF; location option "Presence" not "Presence or interest"; manual CPC/maximize clicks with cap until ~15+ conversions in 30 days; ad-schedule to office hours; negative keywords (jobs, free, login, reviews, competitor employee terms).
- ESTIMATE: Because of Sept 1 migration, check any campaign created earlier for AI Max flags; new campaigns should be created fresh with these off.
- ESTIMATE: Tracking stack: Google tag + GCLID captured first-party at landing -> stored on trial signup record -> upload "trial_started" immediately and "paid" later via Data Manager API with GCLID + hashed email (enhanced conversions for leads). Count "trial_started" as primary, "paid" as secondary/value.
- ESTIMATE: CPCs for target terms likely sit near/above the $5-$14 SaaS range; "weave alternative"/"nexhealth pricing" volumes are likely tiny (tens to low hundreds per month) so budget may exceed demand. Unverified.

### Gaps
- Keyword-level CPC/volume for "weave alternative", "weave pricing", "nexhealth pricing/alternative", "dental patient communication software", "dental practice marketing software", "dental website design", "dental online scheduling software", "dental recall software", "dental patient portal": NOT FOUND (search returned no Semrush/Ahrefs/SpyFu/Keyword Planner data; Keyword Planner is free inside a Google Ads account and should be pulled directly).
- Google Ads Transparency Center entries for Weave, NexHealth, Adit, RevenueWell, Solutionreach, Dental Intelligence, Podium, Yapi, Flex: NOT CHECKED (page is JS-rendered; not retrievable via search).
- Google's competitor-trademark ad-copy policy 2026 text: not retrieved this run (prior notes in docs/marketing-engine.md remain the reference).
- Ads in AI Overviews / AI Mode availability to small advertisers, PMax reporting changes, Demand Gen, advertiser verification, brand controls, smart-bidding data thresholds, US consent mode requirements: NOT FOUND this run.

## Microsoft Advertising

### Takeaway
Worth a small test via Google import; its distinctive asset is LinkedIn profile targeting (job seniority now GA in Search and Audience ads), but the US dentist/office-manager audience size is unverified. CPC discount claims are agency-sourced only.

### Cited Findings
- April 2026 Microsoft post listed job seniority and company lists as pilot in US/Canada for Search; August 2026 post says job seniority is generally available for Audience ads and Search campaigns; PPC Land reported seniority addition June 16, 2026. — [Microsoft Ads April 2026](https://preview-about.ads.microsoft.com/en/blog/post/april-2026/an-ads-ecosystem-built-for-the-ai-era); [Microsoft Ads Aug 2026](https://preview-about.ads.microsoft.com/en/blog/post/august-2026/ai-max-for-search-and-other-product-news-for-august-2026); [PPC Land](https://ppc.land/microsoft-advertising-adds-job-seniority-to-linkedin-profile-targeting/)
- Microsoft rolled out its own "AI Max" placing search ads inside Copilot responses (title-level claim); Microsoft research reportedly shows +73% CTR / +16% conversion vs traditional search ads (VENDOR CLAIM). — [DesignRush](https://news.designrush.com/microsoft-ai-max-search-ads-copilot)
- CPC 20-35% lower than Google (agency claim, unverified); Microsoft+LinkedIn targeting ~$2-$6 B2B click (agency claim). Import tool copies campaigns/keywords/conversion goals but not LinkedIn targeting. — [Dotidot](https://www.dotidot.io/post/microsoft-ads-is-bing-worth-your-budget-in-2026); [1Digital](https://www.1digitalagency.com/blog/microsoft-ads-plus-copilot-new-b2b-paid-playbook/)

### Inferences
- ESTIMATE: Start with ~10-15% of budget ($100-150/mo) mirroring Google exact terms; LinkedIn job-function targeting for "Dentist/Owner" is likely thin; test as bid modifier not hard filter.

### Gaps
- Windows/Edge/Bing share in dental offices: NOT FOUND. Microsoft minimums: none found (historically no minimum; unverified). Whether Microsoft's "AI Max" mirrors Google's settings: not verified.

## Meta (Facebook/Instagram)

### Takeaway
Meta kept consolidating targeting in 2026 (Jan 15, 2026 removal of dozens of detailed-interest categories); job-title/industry targeting status is conflicting in secondary sources and must be checked live in Ads Manager. The health-and-wellness data-source classification risk for a dental-saturated domain is real but no dental-specific evidence was found.

### Cited Findings
- Jan 15, 2026: Meta removed dozens of detailed-interest categories and manual targeting from Advantage+ catalog ads (VENDOR/trade claims, interest categories not job titles). — [MediaPost](https://www.mediapost.com/publications/article/408262/meta-further-consolidates-ad-targeting-options.html); [AdLibrary](https://adlibrary.com/posts/meta-interest-targeting-removed)
- One guide says job title/industry still available as professional demographic; another says AI overrides job-function segmentation. Unresolved. — [Linear Design](https://lineardesign.com/blog/facebook-detailed-targeting-list-2024/); [State of Brand](https://www.thestateofbrand.com/news/meta-ad-strategy-automated)
- Meta classifies each data source (domain/app) into a category; health & wellness restricts event data. Check path (vendor description): Events Manager > pixel > Settings > "Manage data source categories". Appeals via Meta rep; process slow/inconsistent. — [Search Engine Land](https://searchengineland.com/meta-ads-restrictions-health-wellness-campaigns-453094); [CustomerLabs](https://www.customerlabs.com/docs/destinations/ad-platforms/meta-health-and-wellness/restrictions/)
- Dreamdata 2026: Meta CPC EUR 1.60 vs LinkedIn EUR 5.98 (VENDOR CLAIM, euro). — [Dreamdata via summary](https://dreamdata.io/blog/linkedin-ads-benchmarks)

### Inferences
- ESTIMATE: Because the site has no pixel yet, install the Meta pixel only after checking category in Events Manager; consider Conversions API with minimal events (trial_started) and no page-content signals. Custom audiences from NPPES-derived lists are the cleaner B2B route if detailed targeting is thin.

### Gaps
- Lookalike/custom-audience upload rules 2026, lead-form changes, creative-volume expectations, learning-phase budget minimum, B2B SaaS CPL on Meta, Threads ads status: NOT FOUND this run.

## LinkedIn Ads

### Takeaway
Still expensive: ~$9 CPC and ~$200 CPL for B2B on a 138-advertiser dataset; for a ~$2,400 ACV self-serve product with a no-card trial, still a skip at $1k/mo.

### Cited Findings
- Metadata 2026 B2B Paid Media Benchmark (138 advertisers): spend-weighted $9.39 CPC, $202 CPL, 0.67% CTR, $63.19 CPM; CPL p25 $196, p75 $658; median CPL $376 (VENDOR CLAIM, 2025 data). — [Metadata via search summary](https://metadata.io/resources/blog/what-linkedin-ads-cost)
- Other ranges: CPC $5.26-$8.50, CPL $80-$200 (agency blogs, weak methodology). — [Factors.ai](https://www.factors.ai/blog/linkedin-ads-cost)

### Gaps
- US dentist/office-manager audience size, Thought Leader Ads availability/prices, official minimums: NOT FOUND.

## Reddit Ads

### Takeaway
Cheap but untargetable by job; only vendor evidence found; no SaaS-to-dental evidence.

### Cited Findings
- CPC claims conflict: $1.47 all-industry; $0.50-$2.00 B2B/SaaS (Metadata); $2-$8 B2B tech (Dupple); median $1.25 (Stackmatix). All VENDOR CLAIMs, 2026. — [Directive](https://directiveconsulting.com/blog/reddit-ads-cost-b2b-2026/); [Dupple](https://dupple.com/learn/reddit-marketing-b2b-saas-playbook)
- No job-title or company targeting natively; community targeting works but narrow subs limit impressions; sensitive-category targeting prohibited. Conversation Placement CTR 0.41% vs 0.19% platform (one roundup, unconfirmed). — [Digital Applied](https://www.digitalapplied.com/blog/reddit-statistics-2026-community-ad-data-points)

### Gaps
- Reddit's own 2026 docs, r/Dentistry ad rules and size, minimums: NOT FOUND.

## Review-marketplace PPC (Capterra / Software Advice / GetApp / G2)

### Takeaway
Ownership changed: G2 acquired Capterra, Software Advice and GetApp from Gartner (announced Jan 29, 2026; completed Feb 5, 2026). Gartner kept Peer Insights.

### Cited Findings
- FACT: G2 press release Jan 29, 2026; sale completed Feb 5, 2026 per Gartner 10-K; $110M reported (TheNextWeb headline; text unverified). — [G2](https://company.g2.com/news/g2-acquires-capterra-software-advice-getapp); [Nasdaq PR](https://www.nasdaq.com/press-release/g2-acquire-capterra-software-advice-and-getapp-gartner-2026-01-29); [TNW](https://thenextweb.com/news/gartner-110m-sale-of-digital-markets-division-in-latest-sec-filing)
- Bidding: third-party guides say bids start $2/click in $0.25 steps; $500/mo minimum unconfirmed; one campaign covers Capterra+GetApp+Software Advice (VENDOR CLAIM). Official PPC terms allow bids by category and country; General Vendor Terms updated May 4, 2026. — [Capterra PPC description](https://capterra.com/legal/ppc-service-description/); [SpotSaaS](https://spotsaas.com/blog/capterra-advertising)

### Gaps
- Dental category minimum bids, review prerequisites, G2 paid option prices, post-acquisition program changes: NOT FOUND.

## Dental-specific paid placements

### Takeaway
No public rate cards found for Dental Economics/DentistryIQ (Endeavor Business Media), Dentaltown, Dental Nachos, Nifty Thrifty, AADOM, DOMC; ADA, AAPD and Dentistry Today publish media kits (PDF content not read).

### Cited Findings
- Media kits exist: [ADA publication rates](https://ada.org/publications/publication-rates); [AAPD 2027 kit](https://www.aapd.org/globalassets/2027-media-kit.pdf); [Dentistry Today kit](https://advertise.dentistrytoday.com/media-kit.pdf). DentistryIQ is published by Endeavor Business Media. — [DentistryIQ](https://www.dentistryiq.com/index/about-us.html)

### Gaps
- All prices: NOT FOUND (PDFs not fetched; others quote-on-request).

## AI-surface ads (ChatGPT, Perplexity, Copilot, AI Mode)

### Takeaway
ChatGPT self-serve Ads Manager (ads.openai.com) opened to US businesses with CPC bidding, announced May 5, 2026; a $1k/mo advertiser can plausibly participate, but verify current access.

### Cited Findings
- FACT-ish (trade press of OpenAI announcement): self-serve beta, gradual access, billing/verification before delivery; ads shown to Free/Go users in US/CA/AU/NZ; CPM default $60; CPC max-bid recommendation $3-$5; no exact keyword targeting (context hints only); pixel + Conversions API (leads, sign-ups); no CPA bidding or third-party measurement yet. — [PPC Land](https://ppc.land/openai-opens-chatgpt-ads-manager-to-all-us-businesses-with-cpc-bidding/); [OpenAI](https://openai.com/index/new-ways-to-buy-chatgpt-ads); [Axios May 5, 2026](https://axios.com/2026/05/05/openai-self-serve-ad-platform)
- Earlier minimums: $250k (Jan pilot), $200k (Feb), $50k (April); sources conflict; self-serve reported to have no minimum (VENDOR/TRADE). — [Stacker](https://stacker.com/stories/business-economy/openai-just-launched-its-own-ads-manager-50k-entry-point-smallest-part); [Digiday](https://digiday.com/marketing/openai-opens-up-chatgpt-ads-manager-to-the-u-s-while-promising-third-party-measurement-cpa-bidding/)

### Gaps
- Perplexity, Google AI Mode ads eligibility, Copilot beyond Microsoft AI Max: NOT FOUND. Whether OpenAI excludes health/dental-adjacent contexts: not listed.

## YouTube / Demand Gen / TikTok / minor platforms

### Takeaway
TikTok US: joint venture closed late Jan 2026 (Oracle, Silver Lake, MGX 15% each; ByteDance 19.9%); advertising still run by global ByteDance entity; B2B relevance for dentists not found.

### Cited Findings
- [Fortune](https://dc.fortune.com/2025/12/19/tiktok-agrees-u-s-joint-venture-deal-with-oracle-silver-lake-and-mgx/); [eMarketer](https://www.emarketer.com/content/tiktok-s-us-overhaul-gives-advertisers-greater-certainty--though-questions-remain)

### Gaps
- YouTube/Demand Gen/CTV, X, Pinterest, Snap, Quora, Nextdoor: NOT RESEARCHED / not found.

## Benchmarks: B2B SaaS paid and no-card trial conversion

### Takeaway
No-card trial-to-paid figures range widely by definition: ~8-25% depending on source; plan with ~8-15% as the conservative band for a vertical SMB product (ESTIMATE).

### Cited Findings
- ChartMogul (via summary): opt-in/no-card trials 8.9% signup-to-paid vs 31.4% card-required; Visionary Marketing (84,200 signups) 25.2% vs 60.4%; Flint B2B SaaS median 18.5%; Userpilot-cited Kyle Poyar Jan 2026 median 8% (VENDOR CLAIMs; definitions differ). — [ChartMogul](https://chartmogul.com/reports/saas-conversion-report-2/); [Visionary Marketing](https://visionary-marketing.co.uk/blog/saas-free-trial-conversion-statistics-2026); [Flint](https://www.flint.com/blog/b2b-saas-free-trial-conversion-rate-statistics); [Userpilot](https://userpilot.com/blog/free-trial-conversion-rate/)
- TripleDart 2026 State of SaaS PPC Benchmark Report exists (contents not retrieved). — [Demand Gen Report](https://demandgenreport.com/industry-news/news-brief/tripledarts-2026-state-of-saas-ppc-benchmark-report/53375)

### Inferences
- ESTIMATE: At $5-$14 CPC and a 3-8% click-to-trial rate, cost per trial lands roughly $60-$470; the owner's <$120 target likely needs low-end CPC and strong landing-page conversion. At 10% trial-to-paid, cost per paying customer is ~$600-$1,200 vs $2,400 first-year revenue.

### Gaps
- CAC payback benchmarks for SMB self-serve, dental-specific conversion data: NOT FOUND.
