# AI search, AEO/GEO and organic SEO for B2B software marketing (as of 2026-11-23; changes since Sep 2026)

Method note: ~20 search/fetch calls. Snippets from WebSearch are summaries, not full pages, except where I fetched (G2 report, SER Nov core update, SER Shepard study). Labels: FACT = primary source or direct fetch; VENDOR CLAIM = commercial party's own data; ESTIMATE = third-party/derived. Where late-2026 data was not found, I say so.

## 1. Google: AI Mode / AI Overviews, CTR, updates, structured data, Search Console

### Takeaway
Google shipped a broad core update on Nov 10, 2026 (still settling; no reliable winners/losers analysis yet). AI Overview CTR evidence is mixed (Seer: rebound from a Dec 2025 floor; CMU/ISB field experiment: -38% organic clicks; Shepard Oct 30 small test: ~0.9% CTR on AI impressions plus a "halo" effect). Search Console now has dedicated generative-AI reports; FAQ rich results ended May 7, 2026; ads in AI Mode are live in the US with multiturn ads from Oct 28, 2026.

### Cited Findings
- Google November 2026 core update began Nov 10 (~1 pm ET); Google called it a "regular update designed to better surface relevant, satisfying content for searchers from all types of sites"; rollout "may take up to 2 weeks." Chatter was muted; most volatility Nov 14; forum reports mixed (some >20% drops; AI-generated/outdated content reportedly outranking commercial pages in YMYL). Glenn Gabe (Nov 20) had seen no major reversals and said Search Console data was more reliable than visibility tools (SERP poisoning/bot clicks distort tools). FACT (reporting of Google statement, 2026-11) — [SER Nov 2026 core update](https://seroundtable.com/google-november-2026-core-update-ranking-volatility-42543.html)
- This is the third broad core update of 2026 after March and May. Aleyda Solis's May 2026 analysis headline: "Intent, Market Fit and Source Type Drove the Biggest Visibility Shifts" (I did not read the body, so winner/loser detail for scaled AI content, programmatic pages, affiliate pages is NOT verified). ESTIMATE — [Aleyda Solis May 2026](https://www.aleydasolis.com/en/ai-search/google-may-2026-core-update-analysis-intent-market-fit-and-source-type-drove-the-biggest-visibility-shifts); [Aleyda March 2026](https://www.aleydasolis.com/en/search-engine-optimization/google-march-core-update-2026)
- Cyrus Shepard small case study (SER, 2026-10-30): used Google's new AI opt-out controls on one site; estimated CTR on AI impressions ~0.9%; AI impressions ~8% of total; regular organic clicks also fell when opted out ("SERP halo" hypothesis); sample tiny, no with/without-AIO click comparison. FACT on the reporting, ESTIMATE on the metric — [SER](https://seroundtable.com/google-ai-overviews-mode-ctr-42421.html)
- Seer Interactive 2026 update: organic CTR on AIO queries rose from a 1.3% floor (Dec 2025) to 2.4% (Feb 2026); no-AIO ~3.3%; AIO with citation ~2.1%; AIO without citation ~0.9%. VENDOR CLAIM (agency data, Feb 2026) — [Seer](https://seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update)
- Carnegie Mellon/ISB randomized field experiment: AIOs cut organic clicks on triggered queries by 38% with no change in user-experience ratings (reported via SEJ). ESTIMATE/academic, date uncertain (2026) — [SEJ](https://www.searchenginejournal.com/ai-overviews-cut-organic-clicks-38-field-study-finds/)
- Ahrefs (Feb 2026): AIO presence correlates with a 58% CTR reduction for top-ranking pages. VENDOR CLAIM — [Ahrefs](https://ahrefs.com/blog/de/ai-overviews-reduce-clicks)
- Search Console: Google introduced dedicated "Search Generative AI performance reports" (June 2026) showing impressions of your URLs in AI Overviews/AI Mode/Discover generative features, by page and country, plus an opt-out control. Earlier (2025) AI Mode clicks/impressions were blended into the Performance report. Mueller acknowledged position reporting is for the AI block, not the individual link. FACT (Google blog June 2026) — [Google Search Central](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports); [SER AI Mode counting](https://www.seroundtable.com/google-search-console-counting-ai-mode-39599.html)
- Preferred Sources extended to AI Mode (reported May 2026; a "source preferences" control was being tested in the AI Mode citation sidebar). ESTIMATE (secondary reporting) — [SER](https://seroundtable.com/google-ai-mode-citations-preferred-sources-42323.html)
- FAQ rich results: Google doc note "As of May 7, 2026, FAQ rich results are no longer appearing in Google Search." FAQPage markup remains valid and is still used for understanding; removal not required. HowTo rich results were already gone (mobile 2023). Search Console/Rich Results Test removal dates conflict between sources (June vs Jan 2026) -- unverified. FACT on May 7 (Google doc note via SER/SEL) — [SER](https://www.seroundtable.com/google-drops-faq-rich-results-41298.html); [SEL](https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957)
- Ads in AI Mode: existing Search/Shopping/PMax campaigns eligible automatically, same auction, no separate opt-in/out; Oct 28, 2026 Google launched multiturn "Sponsored" ads for follow-up queries in the US and expanded AI Mode ads to ten more markets; Conversational Discovery ads and Highlighted Answers in US testing. Adthena: Healthcare ~0.38% of AI Mode ads in its sample. FACT/VENDOR (Google blog; Adthena) — [Google blog](https://blog.google/products/ads-commerce/ads-in-ai-mode-global/); [SER](https://www.seroundtable.com/google-expands-ads-ai-mode-42412.html); [Adthena](https://www.adthena.com/?p=332622)
- Google-Extended is a robots.txt token with no separate crawler; it gates model training only, not Search/AIO/AI Mode. Only blocking Googlebot opts out of those. FACT — [Google crawler docs](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers?hl=en)

### Inferences
- For a new-domain site, CTR on AIO queries is low-single-digit at best; being cited inside the AIO is better than being absent (Seer 2.1% vs 0.9%), and Shepard's halo hints citation has indirect value. Direction unsettled; do not plan on a CTR recovery.
- Do not build FAQ schema for a Google rich result; it can stay for page understanding.
- The Nov core update is mid-flight; hold judgment on traffic changes until ~early Dec, and use Search Console, not rank trackers.

### Gaps
- Share of US queries showing AIO / AI Mode in Nov 2026: not found.
- Winners/losers of the Nov 2026 update (scaled AI content, programmatic, affiliate, small sites): not found; no published analysis yet. June-Oct spam/helpful-content updates: not found in my searches.
- SoftwareApplication/Product/Review snippet rule changes and any new schema support in H2 2026: not found.
- Google's own latest guidance on AI-generated content / succeeding in AI features: only surfaced as the June Search Central post; body not read.
- B2B/software-specific AIO CTR: not found.

## 2. AI assistants: buyer usage, referral traffic, citation sources

### Takeaway
G2's March 2026 survey (n=1,076) is the best late data: ChatGPT is used by 62% of B2B software buyers, SMB buyers skew ChatGPT 58 / Gemini 21 / Claude 7 / Copilot 6 / Perplexity 2. AI referral traffic is still a tiny share of B2B sessions (<2% per Octane11) but growing; B2B conversion data is thin and conflicting. Reddit/YouTube lead overall citations; G2/Capterra and roundup articles lead software queries.

### Cited Findings
- G2 2026 AI Search Insight Report (fielded March 2026; n=1,076 B2B decision-makers, global): ChatGPT 62% of buyers (47% in 2025); 71% use chatbots somewhere in software research (~60% seven months earlier); 51% start research with a chatbot more often than Google; 45% say review-site citations are the most confidence-inspiring signal. Funnel: ChatGPT 73% at discovery, 53% consideration, 56% decision; Gemini 14/22/23%. SMB segment (read from tables, approximate): ChatGPT 58, Gemini 21, Copilot 6, Claude 7, Perplexity 2. Claude more than doubled; Copilot and Perplexity fell; Gemini gained. VENDOR CLAIM (G2 sells to software vendors/review ecosystem) — [G2 report](https://learn.g2.com/g2-2026-ai-search-insight-report?tp=1); [G2 survey page](https://learn.g2.com/ai-search-surging-for-b2b-buyers)
- G2: nearly 7 in 10 buyers chose a different vendor than expected because of chatbot guidance. VENDOR CLAIM — [G2 news](https://company.g2.com/news/g2-research-the-answer-economy)
- Octane11 (400M B2B sessions): AI engines <2% of B2B search referral traffic, up ~35x since March 2025. VENDOR CLAIM — [Octane11](https://octane11.com/insights/insights-state-of-b2b-ai-search-q2-26/)
- Demandbase: ChatGPT visits to B2B sites it tracks +303% YoY to 2.6M in June 2026. VENDOR CLAIM — [CMSWire](https://www.cmswire.com/the-wire/chatgpt-referrals-to-b2b-websites-nearly-quadrupled-in-a-year-demandbase-data-shows/)
- Conversion: First Page Sage (160+ clients, May 2025-Feb 2026) ChatGPT B2B SaaS conversion 2.4%; Visibility Labs ChatGPT ~31% higher than non-brand organic (mostly ecommerce); Searchless says AI converts above search by Mar 2026 (US retail). All vendor/agency; no robust B2B SMB benchmark. VENDOR CLAIM/ESTIMATE — [ALM Corp](https://almcorp.com/blog/chatgpt-vs-organic-search-conversion-rate/); [Leadfeeder](https://www.leadfeeder.com/resources/studies/ai-referrals-in-b2b/)
- Peec (30M sources): Reddit most cited across ChatGPT, AI Mode, Gemini, Perplexity, AIO; YouTube, LinkedIn, Wikipedia, Forbes follow. VENDOR CLAIM — [Peec](https://peec.ai/blog/top-domains-cited-by-ai-search-analysis-based-on-30m-sources)
- Software-specific: G2 claims 22.4% influence on software queries (G2's own analysis of 30,000 citations); a 2026 AIO software study reports roundup articles earn 46.4% of Google AIO citations on software searches, YouTube in 75.7% and Reddit in 43.3% of 247 AIOs (small n). Writesonic: alternatives queries lean Reddit; B2B comparisons lean G2/Capterra. VENDOR CLAIM/ESTIMATE — [Lilach Bullock](https://www.lilachbullock.com/ai-overview-citations-software-study/); [G2 BoFu](https://learn.g2.com/do-software-review-platforms-show-up-more-in-the-bottom-of-the-funnel); [Writesonic](https://writesonic.com/blog/llm-ai-search-citation-study-dominant-domains)
- Search Engine Land counterpoint: no universal top source; results vary by platform and keep flipping. ESTIMATE — [SEL](https://searchengineland.com/ai-citation-data-no-universal-top-source-brands-471285)

### Inferences
- A dental-practice owner is an SMB buyer: ChatGPT dominates, Gemini second; optimize for ChatGPT (Bing-indexed) and Google, not Perplexity/Copilot.
- Click referrals will be too small to measure early; expect influence via brand-name searches.

### Gaps
- No Gartner/Forrester/TrustRadius/6sense/Bain/Semrush/SparkToro/Similarweb late-2026 share data retrieved. No dental- or healthcare-practice-specific buyer data. No evidence of a post-mid-2026 shift in top cited sources (the G2 note that Perplexity/Copilot declined and Claude/Gemini rose is the only shift signal).

## 3. Tactics, crawlers, Bing/IndexNow, Cloudflare

### Takeaway
Evidence for any single tactic is weak and mostly vendor-sourced. Bing is the plumbing for ChatGPT search/Copilot and Bing Webmaster Tools now reports AI citations. Cloudflare's default blocking announced for Sept 15, 2026 targets ad-supported pages, so a SaaS marketing site is less affected, but check bot settings.

### Cited Findings
- Bing Webmaster Tools AI Performance (public preview Feb 10, 2026): citations in Copilot, Bing AI summaries and partners; total citations, cited pages, grounding queries, trends ~3 months; no clicks. June 2026 added Intents, Topics, Citation Share, Compare views. Bing says IndexNow helps AI systems reference current page versions. FACT (Bing blog) — [Bing Feb 2026](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview); [Bing June 2026](https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare)
- Cloudflare: pay-per-crawl private beta July 2025, being rebranded "Pay Per Use" (July 2026 reports); reports say from Sept 15, 2026 new customers/sites default to allowing search crawling but blocking training and agents on pages with ads. I did not find Cloudflare's own 2026 post or outcome data. ESTIMATE (secondary) — [TNW 2026-07-02](https://thenextweb.com/news/cloudflare-block-ai-crawlers-pay-publishers?type=AI); [Semafor 2026-07-07](https://www.semafor.com/article/07/07/2026/cloudflare-puts-prices-on-ai-scraping)
- G2: community signals/review profiles are the largest third-party AI source for software (consistent with Search Engine Land headline "community signals AI largest third-party source"). ESTIMATE — [SEL](https://searchengineland.com/community-signals-ai-largest-third-party-source-484606)

### Inferences
- Verify the host does not block OAI-SearchBot/ChatGPT-User/Claude-SearchBot; blocking training bots (GPTBot, CCBot, Google-Extended) is separable from search/answer bots.
- Register on Bing Webmaster Tools, submit IndexNow, and use its AI Performance report as a free tracker.

### Gaps
- Not found: controlled evidence for tables/stats/schema/author entities raising citations; debunk evidence beyond the prior llms.txt finding; whether vendor-site "best X" listicles are penalized by Google or discounted by LLMs; JS-rendering visibility to AI crawlers; per-bot current user-agent behavior (ClaudeBot, PerplexityBot, Applebot-Extended).

## 4. Ads and agentic surfaces

### Takeaway
ChatGPT ads are open to US advertisers of all sizes via self-serve Ads Manager (May 2026), with no minimum reported and CPC bidding. Google AI Mode ads are live. Healthcare/regulated inventory is thin.

### Cited Findings
- ChatGPT ads: pilot Feb 2026 ($250K minimum); self-serve Ads Manager opened to all US businesses with CPC bidding/conversion tracking (OpenAI, Axios dated 2026-05-05); minimum reported dropped to $0; StackAdapt $0 minimum (May), Criteo $10K (June). EU expansion claim (Sacra, Aug 31) uncorroborated. FACT for launch (Axios/OpenAI), ESTIMATE for minimums — [OpenAI](https://openai.com/index/new-ways-to-buy-chatgpt-ads); [Axios](https://axios.com/2026/05/05/openai-self-serve-ad-platform); [Digiday](https://digiday.com/marketing/openai-opens-up-chatgpt-ads-manager-to-the-u-s-while-promising-third-party-measurement-cpa-bidding/); [Digital Applied](https://www.digitalapplied.com/blog/chatgpt-ads-land-grab-stackadapt-criteo-minimums-2026)
- Google AI Mode ads: see Section 1.

### Gaps
- Not found: ad formats/CPCs for ChatGPT; Perplexity and Copilot ad status; ChatGPT apps/connectors, Atlas, Comet, Gemini-in-Chrome relevance to SaaS signups; whether dental/health-adjacent B2B software is restricted in ChatGPT ads.

## 5. Measurement tools and DIY panel

### Takeaway
Free first-party data exists (Search Console gen-AI reports, Bing AI Performance); paid trackers range ~$29-$2,000+/mo with conflicting price reports.

### Cited Findings
- Entry tiers ~$29-$300/mo: Otterly ~$29; Peec ~EUR 85-95; Semrush AI Visibility ~$99; Ahrefs Brand Radar ~$199-$828 (add-on $199/engine or $699 bundle, conflicting); Profound reports conflict ($99 vs enterprise $2,000+/mo). ESTIMATE (roundups, July 2026) — [Detailed](https://detailed.com/ai-visibility-tools-pricing/); [Rework](https://resources.rework.com/tools/aeo-ai-visibility/best-aeo-tools-2026); [Gracker](https://gracker.ai/blog/ai-visibility-tools-pricing-compared-2026)

### Inferences
- A DIY panel: ~25-40 buyer prompts (category, "X alternatives", "X pricing", pain-point), run monthly in ChatGPT, Gemini, Google AI Mode; log whether the brand is named/cited and which domains are cited. (My design, not sourced.)

### Gaps
- Prices need verification on vendor pages; no methodology validation of tools found.

## 6. Field check (queries run 2026-11-23 via WebSearch; ranking order not guaranteed)

### Takeaway
Results are dominated by review/directory aggregators (Capterra, Software Advice/GetApp, G2, TrustRadius), vendor blogs/comparison pages (NexHealth, Weave, Quo, Pabau, DemandHub, Emitrr, Curve), and listicle farms (Gitnux, ZipDo, WifiTalents, Slashdot). DreamCRM / dreamcreatestudio.com appeared in none.

### Cited Findings
- "best dental patient communication software 2026": Dentaltown, Gitnux, ZipDo, WifiTalents, Software Advice, Capterra, GetApp, Jotform, Curve Dental blog; names Weave, CareStack, Solutionreach, Dental Intelligence, Podium. [query results above; e.g. Capterra](https://capterra.com/dental-software/)
- "Weave alternatives": Capterra compare pages, G2, TrustRadius, Quo, Pabau, SoftwareSuggest, Software Advice; recurring: Solutionreach, RevenueWell, NexHealth, Adit, Tebra.
- "Weave pricing": Weave unpublished/quote-based; third parties conflict ($129-$250+/mo per location); Quo, Pabau, CostBench, Listicler, Capterra, Software Advice, G2. [Capterra](https://capterra.com/p/141842/Weave/pricing/)
- "NexHealth pricing": NexHealth's own page is a sales form; Capterra says ~$350 (per feature/mo, unverified); G2, TrustRadius, Software Advice, CostBench, Emitrr. [NexHealth](https://nexhealth.com/pricing)
- "NexHealth alternatives": Capterra, G2, Software Advice, Slashdot, SourceForge, LeadSquared, DemandHub, Emitrr, CB Insights, Toolradar. [Capterra](https://www.capterra.com/p/182271/NexHealth/alternatives/)
- "dental online scheduling software": Cal.com, Quo, NexHealth guides, Thryv, Zoho, CareStack.
- "dental recall / all-in-one small practice": DemandHub, NexHealth guide, CareStack, Capterra, The Dental App, Taskade.
- "dental website builder with online booking": Wix, Hostinger, Weblium, Dorik, 10Web, IONOS, WordPress guides; no dental-PMS-integrated competitor surfaced.
- "DreamCRM" collision: App Store iOS app "DreamCRM" (free, developer Bhavin Patel), Dreamer Technologies (dreamertechs.com, India; SugarCRM-based "DreamCRM"), "Dreams CRM" (GoodFirms), Breakcold "dream CRM" article. No hit for dreamcreatestudio.com. "Dream CRM dental" returned only generic dental-CRM pages (ClickUp, HubSpot, LeadSquared, CareStack), no brand product. [App Store](https://apps.apple.com/ca/app/dreamcrm/id6464315192); [GoodFirms](https://www.goodfirms.co/software/dreams-crm); [Breakcold](https://www.breakcold.com/blog/dream-crm)

### Inferences
- Competitor pricing is hidden everywhere; third-party sites guess and conflict. A transparent $200/mo page plus "Weave/NexHealth pricing" comparison content has an open lane, but must displace aggregator pages.
- Brand name "DreamCRM" is shared by unrelated products, so branded queries are not clean; pair it with "dental".

### Gaps
- I ran 10 of the suggested queries (not "dental practice marketing software" or "all in one dental software for small practice" verbatim). Searches were not logged-out Google SERPs; positions, AI Overview content and ChatGPT/Gemini answers were not checked.
