# AI-assistant citation evidence, crawler behaviour and Google structured-data eligibility (as of 2026-11-23)

Grading key: STRONG = controlled test or official statement, replicated or unambiguous; MODERATE = large observational study or single controlled test with limits; WEAK = small/vendor/single-snapshot or practitioner claim; DEBUNKED = tested and not supported. Most WebFetch results below are summaries by a small model; where I could not open the primary page (403/404) I say so. Dates are publication dates unless stated.

## 1. Citation drivers: which page and domain factors correlate with being cited

### Takeaway
Nearly all evidence is correlational and vendor-run. The only controlled tests I found say: (a) adding JSON-LD schema did not move citations (Ahrefs, 1,885 pages + 4,000 controls); (b) llms.txt does not matter; (c) in lab setups, quotations/statistics/attributed sources help a page already in the model's context, but this does not generalize to organic retrieval (45-study critical survey, July 2026). Domain-level signals (referring domains, third-party brand mentions, Reddit/review-site presence) are the most consistently reported correlates, which is a headwind for a new domain.

### Cited Findings

Controlled / quasi-controlled
- Schema (JSON-LD): Ahrefs tracked 1,885 pages that added JSON-LD between Aug 2025 and Mar 2026 against 4,000 control pages, across Google AI Overviews, AI Mode and ChatGPT. No meaningful citation uplift on any platform (AI Mode/ChatGPT slightly positive but within noise; AIO -4.6%, significant, but treated and control were both already declining). Limits: all pages already had 100+ AIO citations beforehand, so it cannot say whether schema helps unseen pages; schema types pooled; other page edits coincided. Published May 2026. GRADE: moderate (best controlled test available; limited to already-cited pages) — [Ahrefs](https://ahrefs.com/blog/schema-ai-citations/) (found via search; summary via [SEJ](https://www.searchenginejournal.com/schema-markup-didnt-move-ai-citations-in-ahrefs-test/574568/), [SERoundtable](https://www.seroundtable.com/study-schema-citations-study-41311.html), [TechWyse](https://www.techwyse.com/news/ai-search/schema-markup-ai-citations-ahrefs-study)). The same Ahrefs piece notes AI-cited pages were ~3x more likely to have JSON-LD (correlation that the experiment suggests is not causal). A searchVIU test cited there found none of five AI systems used schema when fetching live; they read visible HTML only (second-hand; not opened).
- Princeton/Georgia Tech/AI2/IIT Delhi GEO paper (Aggarwal et al., KDD 2024, GEO-bench 10,000 queries): methods such as quotation addition, statistics and cited sources raised visibility "up to 40%" (quotation best at +22% position-adjusted word count in section 6; up to 37% on Perplexity). GRADE: weak for real-world generalization. A July 15, 2026 critical survey (arXiv 2607.14035; scoping review of 45 studies, Nov 2023-Jul 2026) says: "the evidence is narrow"; the 40% is a relative gain on one metric (19.3 to 27.2) with five documents fixed in context, GPT-3.5-turbo, no retrieval, LLM judge from same family, no truthfulness constraint, no clicks measured; C-SEO Bench found only 3 of 54 method-domain combinations significantly positive and none in QA; SAGEO Arena (with retrieval/reranking) found body-only rewrites cut final citation ~6%; E-GEO found 10 of 15 heuristics neutral or negative in e-commerce; a 252,000-trial factorial study (Vishwakarma et al. 2026) found query relevance and position in context dominate; keyword stuffing null/negative; only 74.5% of citations in one audit supported their claims. Survey rates quotations/statistics as moderate-to-strong only if truthful, attributed, verifiable. — [Original paper](https://arxiv.org/pdf/2311.09735); [Critical survey](https://www.alphaxiv.org/abs/2607.14035.md). Blog figures like "statistics +41%", "position-5 +115%" and "stats +23-33%" are repeated by agencies; I could not confirm them against the paper (treat as folklore).
- llms.txt: SE Ranking's ChatGPT study found negligible effect; Google's AI-search guide says no llms.txt or machine-readable AI files needed (see section 4). GRADE: debunked for citation benefit — [SE Ranking](https://seranking.com/blog/ranking-factors-for-chatgpt/); [SEJ on Google guide, 2026-05-15](https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/).

Correlation studies
- SE Ranking (ChatGPT only; 129,000 domains, 216,524 pages, 20 niches; version/timeframe undisclosed): referring domains the strongest correlate (secondary summary: up to ~2,500 referring domains averaged ~1.6-1.8 citations vs 8.4 above 350,000); Domain Trust below 43 averaged ~1.6 citations; traffic only matters after ~190,000 monthly visitors; longer articles, FAQ/Q&A sections and question-style headings correlate with citations; Quora/Reddit heavy presence ~7-8 citations, review-platform listings ~4-6; pages pages updated within three months averaged 6 citations vs 3.6 for outdated (SEJ summary; the blog summary I saw did not give a freshness threshold, so freshness figure is MODERATE/secondary); pages with FAQ schema averaged 3.6 citations vs 4.2 without. GRADE: moderate for domain-authority/third-party-presence correlation, weak for causal claims. — [SE Ranking](https://seranking.com/blog/chatgpt-citation-factors/); [SEJ](https://www.searchenginejournal.com/new-data-top-factors-influencing-chatgpt-citations/561954/)
- Ahrefs, ChatGPT's top 1,000 cited pages (Sept 2025): reported ChatGPT seems to favour accuracy, freshness, relevance over backlink popularity; freshness data retrievable for only just over half of URLs. Cuts against SE Ranking's backlink finding, so the backlink claim is contested. GRADE: moderate/conflicting — [Ahrefs](https://ahrefs.com/blog/chatgpts-most-cited-pages/) (via search snippet).
- Ahrefs "Best X" list study (Allsopp, 2025-12-04; 750 TOFU prompts across software/products/agencies; 10,000+ third-party URLs categorized with GPT-5 plus manual review; 1,100 lists for freshness; 3,000 cited lists for DR; Brand Radar top 1,000 pages per platform over 150M+ prompts): "Best X" lists were 43.8% of cited source page types; brands ranked higher on third-party lists were more likely recommended; 79.1% of lists last updated in 2025 and 26% in the prior two months (freshness is widespread, not proven causal); ~35% of cited best lists on low-authority domains. GRADE: moderate (observational) — [Ahrefs](https://ahrefs.com/de/blog/best-lists-research/)
- Brand mentions: Ahrefs (75,000 brands) Spearman 0.664 between branded web mentions and AI Overview visibility, vs 0.218 for backlinks (the 0.218 figure attributed to Onely in one summary). GRADE: moderate (correlation, AIO only; not opened primary) — via search summary, no URL opened.
- Position Digital (B2B SaaS; 278 prompts, six niches, US/UK, one snapshot July 2026): 66% of ChatGPT brand recommendations happen without citing the brand's own site. GRADE: weak (small, single snapshot, authors flag correlation) — [Position Digital](https://www.position.digital/blog/chatgpt-ranking-factors/) (via search summary).
- Software-specific third-party sources: see first-round notes (G2, Peec 30M, Writesonic) — vendor-sourced, already covered in ai_search_and_seo.md section 2.
- Digital Applied audit of 500 SaaS landing pages (Apr 26, 2026): top-citation quartile cited far more often; authors say domain authority does not explain the gap, structural choices do. GRADE: weak (single vendor audit, not opened) — [Digital Applied](https://www.digitalapplied.com/blog/ai-citation-visibility-audit-500-saas-sites-2026)

Per-tactic quick table (my grading of the evidence found)
- Freshness / visible dates: correlation only (SE Ranking, Ahrefs lists); moderate-weak.
- Statistics, quotations, attributed sources: controlled-lab support only (GEO paper), not validated for organic retrieval; weak-to-moderate; only with true, attributed data.
- Original data: not found as an isolated tested factor.
- Comparison tables, pricing transparency, answer-first structure, heading structure: no controlled test found. Only the SE Ranking correlation for question-style headings/FAQ sections and longer content (weak). "44% of citations from first third of a page" claims came from marketing articles I could not verify.
- Content length: SE Ranking correlation only.
- Backlinks/authority: SE Ranking strong correlation (ChatGPT); Ahrefs says ChatGPT de-emphasizes popularity; Lily Ray found recommended brands had more referring domains. Conflicting but leaning "authority matters".
- Third-party brand mentions: moderate (Ahrefs 0.664 on AIO).
- Reddit / review sites / YouTube: moderate correlational (SE Ranking; Peec 30M sources in first-round notes).
- Schema: debunked as a citation lever (Ahrefs controlled test); still valid for rich results.
- llms.txt: debunked.

### Inferences
- For a new low-authority domain, on-page tweaks are the weakest lever; third-party mentions, review-site profiles and Reddit/YouTube presence are the best-supported, but all correlational.
- "Do the basics, don't pay for schema as a GEO trick" is consistent with Google's own statement and Ahrefs' test.

### Gaps
- No Profound, Semrush or Kevin Indig primary study opened in this pass; Copilot- and Gemini-specific factor studies not found; no study isolating comparison tables or pricing transparency; the SE Ranking freshness numbers came from secondary summaries; Ahrefs 0.664 primary not opened.

## 2. Do AI crawlers execute JavaScript? Official crawler/robots.txt docs

### Takeaway
Tests say the major AI fetchers read raw HTML only; Google's own stack and Bing Copilot render. A server-rendered Next.js site is fine for all of them as long as critical content is in the initial HTML. OpenAI separates search (OAI-SearchBot) from training (GPTBot); ChatGPT-User may ignore robots.txt.

### Cited Findings
- Resoneo (Jan 2026; test page with 15 injection methods and unique sentinel strings; user-triggered fetches only): Bing Copilot, Grok and DeepSeek executed JS; ChatGPT (ChatGPT-User), Claude (Claude-User), Gemini and Perplexity (Perplexity-User) read static HTML, `<noscript>` and `<template>` but no JS-injected content; Perplexity retrieved no sentinels (empty Accept headers, likely decode failure); Google AI Mode makes no live fetch and uses only Google's index; Copilot has ~53ms timeout, missing delayed content. Does not cover training/indexing bots. GRADE: moderate (controlled, but only user-triggered bots, single test) — [Resoneo](https://think.resoneo.com/sentinel/geo-llm-crawler-report.html)
- Vercel/MERJ crawler analysis (older, 2024-25; widely repeated): over 500M GPTBot fetches with no JS execution seen; GPTBot fetched JS files in 11.5% of requests and ClaudeBot 23.84% without running them; Gemini uses Googlebot infrastructure and renders. GRADE: moderate (log analysis; I saw it only via search summary) — [Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler)
- OpenAI docs: OAI-SearchBot surfaces sites in ChatGPT search (opt out means no search answers, only navigational links; changes take ~24h; recommends allowing its IP ranges); GPTBot is for training and is independent; ChatGPT-User handles user-initiated actions and "robots.txt rules may not apply". No JS statement. GRADE: strong (official; undated page) — [OpenAI bots page](https://developers.openai.com/api/docs/bots)
- Google: Google-Extended controls AI training/grounding in some other Google systems and is separate from Search features; AI Overviews/AI Mode eligibility depends on being indexed and snippet-eligible, controlled by Googlebot robots.txt and nosnippet/data-nosnippet/max-snippet/noindex. GRADE: strong (official) — [Google AI features doc](https://developers.google.com/search/docs/appearance/ai-features)
- Anthropic crawler docs (ClaudeBot, Claude-User, Claude-SearchBot): page URL I tried returned 404; not verified. GRADE: not found.
- seoClarity "ChatGPT's 3 bots crawl patterns" and a log study of 7B+ OpenAI requests exist but I did not open them.

### Inferences
- Allow OAI-SearchBot, ChatGPT-User, Claude-SearchBot, PerplexityBot in robots.txt; blocking GPTBot/Google-Extended/ClaudeBot (training) is a separate decision.
- Verify key claims (pricing, comparisons, FAQ answers) appear in curl'd HTML, not client-hydrated.

### Gaps
- No per-bot JS test for GPTBot/OAI-SearchBot/ClaudeBot/Claude-SearchBot themselves in 2026 (Resoneo tested user-fetch agents only); Anthropic and Perplexity official docs not retrieved; Bingbot rendering limits only second-hand.

## 3. Vendor "best X"/"alternatives" pages: Google stance and LLM behaviour

### Takeaway
Evidence conflicts. Lily Ray's tracked data says Google AIO cites vendor listicles but usually recommends other brands, and reports a January 2026 organic demotion; a different August 2026 dataset does not confirm a demotion; Peec shows ~11% of software-listicle citations are self-promotional (ChatGPT ~3.6%, Google AI Mode ~10.3%, Perplexity ~10.4%); Ahrefs found no clear visibility downside. I found no explicit Google spam-policy statement targeting vendor listicles.

### Cited Findings
- Lily Ray (Substack; 184 self-promoting listicles from 146 brands; 100 B2B "best [category] software" queries; AIO and AI Mode captured Apr 15, May 15, Jun 8, 2026 via Ahrefs Brand Radar MCP; ~80 prompts triggered an AIO): 323 self-promo listicles cited, 69% (224) from brands not recommended in the answer; 74 of 100 prompts had a cited-but-not-recommended self-promoter; recommended brands generally had more referring domains and brand mentions; organic visibility fell on sites leaning on the tactic after an apparent January 2026 change and accelerated in the May 2026 core update (her inference; Google has not confirmed). GRADE: moderate (observational, small, author interest) — [Lily Ray](https://lilyraynyc.substack.com/p/why-calling-yourself-the-best-could)
- Peec (232,000 citations from 13,000 listicles; Dec 2025-Feb 2026; non-branded software review prompts across six platforms): self-promo ~11% overall; ChatGPT ~3.6%, AI Mode ~10.3%, Perplexity ~10.4%; stable over 12 weeks (no sign of algorithmic correction); authors do not recommend the tactic. GRADE: moderate (software only) — [Peec](https://peec.ai/blog/self-promotional-listicles-analysis-from-232k-citations)
- Ahrefs (Dec 2025): 67.6% of 250 software Google searches had a list ranking its publisher first; more than a third of software answers recommending a brand's own site used a self-promo list; author concludes no clear visibility downside but is cautious and will link to alternatives. GRADE: moderate — [Ahrefs](https://ahrefs.com/de/blog/best-lists-research/)
- Counter-data: an August 2026 analysis of 5.32M result rows (via ppc.land headline: vendor listicles gained 38% median traffic since January) says 62% gained traffic and does not confirm a demotion; Search Engine Land headline "Has Google demoted listicles?" and Seer headline "listicle window closing, 30% MoM decline" (ChatGPT listicle citations) — pages 403 or not opened, so only headlines/search summaries. GRADE: weak — [ppc.land](https://ppc.land/vendor-listicles-gain-38-median-traffic-since-googles-january-demotion/); [Seer](https://www.seerinteractive.com/insights/the-listicle-window-is-closing-in-ai-search-30-decline-mom); [SEL](https://searchengineland.com/has-google-demoted-listicles-485775)
- Google's May 2026 AI-search guide (via SEJ, not opened directly): seeking inauthentic mentions "isn't as helpful as it might seem"; core ranking focuses on quality and spam systems; emphasizes non-commodity content with unique insight. No direct listicle policy statement found. GRADE: strong for the quote's existence only via secondary; weak for any enforcement implication — [SEJ](https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/)
- What makes a vendor comparison credible: Lily Ray implies third-party recognition; Ahrefs says link to alternatives and don't always rank yourself first; a practitioner post (datadab, not opened) argues cited alternatives pages say when to choose the competitor. Seer: growing listicles listed 10-20 items vs 5-8 for declining (via search summary). GRADE: weak (practitioner opinion).

### Inferences
- A low-authority vendor risks sending AIO recommendations to competitors (Ray). Frame pages as honest comparisons with verifiable, dated facts and a "when to choose them" section rather than "Top 10 with us at #1".

### Gaps
- No official Google spam-policy text on vendor-authored comparisons; no study of LLM treatment of vendor comparison pages specifically (as opposed to rankings listicles); Seer, SEL and Wix AI Search Lab pages not read.

## 4. Structured data in late 2026 (Google Search Central) and Bing

### Takeaway
Google's gallery still lists Article, Breadcrumb, Organization, Product, Profile page, Review snippet, Software app, Video, Dataset and others. FAQ rich results were removed May 7, 2026; sitelinks search box ended Nov 2024. SoftwareApplication rich results require a rating or review, which a new site with no real reviews cannot honestly supply. Google says no special markup is needed for AI Overviews/AI Mode.

### Cited Findings
- Google structured-data gallery lists 25 types: Article, Breadcrumb, Carousel, Course list, Dataset, Discussion forum, Education Q&A, Employer aggregate rating, Event, Image metadata, Job posting, Local business, Math solver, Movie, Organization, Product, Profile page, Q&A, Recipe, Review snippet, Software app, Speakable, Subscription/paywalled content, Vacation rental, Video. FAQ, HowTo and sitelinks search box are NOT in the list. GRADE: strong (official; undated fetch) — [Gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)
- Software app: required `name`, `offers.price` (0 for free; with priceCurrency if above 0), and one of `aggregateRating` or `review`; recommended `applicationCategory` and `operatingSystem`; MobileApplication and WebApplication subtypes; no guarantee of display; no last-updated date shown. GRADE: strong — [Software app doc](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- Review snippets: entity-controlled self-serving reviews (LocalBusiness/Organization, own site or embedded widget) are ineligible for star results; ratings must come directly from users; SoftwareApplication is a valid itemReviewed type. Rule dates from Sept 2019. The doc as fetched did not explicitly say whether a vendor's own reviews of its own SoftwareApplication are barred (the rule text names LocalBusiness/Organization); treat self-authored ratings as risky. GRADE: strong for text, moderate for application to SaaS — [Review snippet doc](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- FAQ: Google ended FAQ rich results in Search effective May 7, 2026 for all sites (including previously exempt gov/health); Search Console FAQ report dropped June 2026; API support ending Aug 2026; FAQPage markup remains valid and may still help understanding. Based on secondary reports (SEJ, SERoundtable, Search Engine Land); I did not open Google's own notice. GRADE: moderate — [SERoundtable](https://www.seroundtable.com/google-drops-faq-rich-results-41298.html); [SEJ](https://www.searchenginejournal.com/google-drops-faq-rich-results/574429/)
- Sitelinks search box: announced Oct 21, 2024, removed from Nov 21, 2024; markup harmless; site-name (WebSite) markup continues. GRADE: strong — [Google blog](https://developers.google.com/search/blog/2024/10/sitelinks-search-box)
- AI Overviews/AI Mode: "There's also no special schema.org structured data that you need to add"; structured data should match visible text; no AI-specific optimization required. Google's May 2026 guide: "optimizing for generative AI search is optimizing for the search experience, and thus still SEO"; no chunking, no llms.txt. GRADE: strong — [Google AI features doc](https://developers.google.com/search/docs/appearance/ai-features); [SEJ 2026-05-15](https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/)
- Bing/Copilot: Fabrice Canel said on stage at SMX Munich (March 2025) that Microsoft's LLMs use schema markup to understand content; reported by SERoundtable (2025-03-20). Not a written Bing doc; Search Engine Land adds that schema does not guarantee citations. GRADE: weak-moderate (spoken statement, 2025) — [SERoundtable](https://www.seroundtable.com/schema-llms-copilot-bing-microsoft-39093.html); [SEL](https://searchengineland.com/microsoft-bing-copilot-use-schema-for-its-llms-453455)
- HowTo, Organization logo property details, Dataset requirements, ProfilePage requirements, VideoObject requirements, Product/Offer requirements for subscription pricing: not verified in this pass (gallery shows them as existing types only; HowTo absent from gallery).

### Inferences
- Keep Organization, BreadcrumbList, Article (and ProfilePage for author pages if useful) for eligibility/understanding; FAQPage is harmless but earns no rich result in Google now.
- SoftwareApplication markup will not produce a rich result without honest aggregateRating/review; do not fabricate or self-write ratings. The markup can stay for understanding but should not be expected to win stars.

### Gaps
- Product/Offer subscription requirements, ProfilePage, Dataset, Video, Organization logo specifics not read; Google's own FAQ-removal notice not opened.

## 5. How ChatGPT search and Copilot get web results; Bing Webmaster Tools, IndexNow, AI Performance

### Takeaway
Copilot uses the Bing index. For ChatGPT, early reporting (Nov 2024) said Bing; later analyses claim OpenAI built its own crawler-fed index and is decoupling, but no direct 2026 OpenAI statement found. Bing officially recommends sitemaps with accurate lastmod plus IndexNow, and offers an AI Performance report.

### Cited Findings
- OpenAI documents OAI-SearchBot as ChatGPT's search crawler (see section 2). Peec ("ChatGPT built its own search index") and llmrefs ("hidden cached index") argue OpenAI has its own index; third-party inference, not OpenAI statement. SERoundtable (Nov 2024) reported ChatGPT search powered by Bing's index. GRADE: weak/contested — [SERoundtable](https://www.seroundtable.com/bing-powers-chatgpt-search-38345.html); [Peec](https://peec.ai/blog/chatgpt-built-its-own-search-index)
- Bing blog (July 2025): sitemaps; lastmod is a freshness signal (use true modification time in ISO 8601); changefreq/priority ignored; submit in robots.txt or BWT; IndexNow notifies Bing and participating engines and helps freshness for AI search; no guarantee of how content appears in AI answers. Mentions Copilot, not ChatGPT. GRADE: strong (official) — [Bing blog](https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search)
- Bing AI Performance report (preview Feb 10, 2026; Intents/Topics/Citation Share/Compare added June 2026): citations in Copilot and partners, no click data — see first-round notes.
- Evidence that IndexNow feeds ChatGPT: not found (one unverified dev post).

### Inferences
- BWT verification + sitemap with honest lastmod + IndexNow is cheap, official, and covers Copilot; do not promise ChatGPT effects.

### Gaps
- No 2026 OpenAI or Microsoft statement on whether ChatGPT search still queries Bing.

## 6. Prevalence of AI answers and click effect

### Takeaway
AI answers are near-universal on comparison queries, and B2B technology queries show very high AIO rates in BrightEdge data; CTR on AIO queries fell steeply in 2025 and partially recovered in early 2026. No B2B-specific CTR found.

### Cited Findings
- Seer Interactive (April 2026; 53 brands, 5,471,127 queries, 2.43B organic impressions; actuals Jan 2025-Feb 2026, Mar 2026 projected; not B2B-specific): organic CTR with AIO 3.19% (Jan 2025) to 1.31% (Dec 2025) to 2.36% (Feb 2026); without AIO 2.75% to 3.16% to 3.82%. Cited brand informational full-year organic CTR 2.07% vs 0.94% not cited vs 3.35% no AIO; paid CTR cited 15.74%. AIO prevalence by type: comparison queries 95.4%, question format 85.9%; by intent informational 36%, commercial 8%, transactional 5%. Caveats: higher-authority brands more likely to be cited; one account is 47% of one segment. GRADE: moderate — [Seer](https://seerinteractive.com/insights/aio-impact-on-google-ctr-2026-update)
- BrightEdge: B2B technology queries triggering AIO rose from 36% to 82% (Feb 2025-Feb 2026), all-industry 48% in Feb 2026; conflicting figures: ~70% (MX Group citing BrightEdge), 84% (Fan Out, 1,000 B2B queries via HubSpot). GRADE: weak-moderate (vendor, secondary) — [SEJ](https://www.searchenginejournal.com/google-ai-overviews-surges-across-9-industries/568448/); [HubSpot](https://blog.hubspot.com/marketing/what-ai-overviews-mean-for-seo)
- Semrush: AIO prevalence 6.49% (Jan 2025), peak 24.61% (Jul 2025), ~15.69% (Nov 2025); ~42.9% of AIO queries commercial/transactional/navigational by early 2026. GRADE: moderate (via search summary) — no URL opened.
- Aggregator figure of -14% B2B/SaaS and -26% tech organic traffic loss on AIO queries lacks a primary source; do not use.

### Gaps
- Semrush Sensor, seoClarity, Advanced Web Ranking late-2026 numbers; AI Mode prevalence for B2B; B2B-specific CTR: not found.

## 7. New-domain case studies

### Takeaway
No rigorous tracked case study of a new low-authority SaaS domain winning comparison/pricing queries or AI citations was found. Only agency/founder anecdotes and one audit.

### Cited Findings
- Digital Applied 500-SaaS-page audit (Apr 2026): structural features, not domain authority, separate top-quartile cited pages; single vendor, not opened. GRADE: weak — [Digital Applied](https://www.digitalapplied.com/blog/ai-citation-visibility-audit-500-saas-sites-2026)
- Indie Hackers founder post on getting a new product cited in AI Overviews (~8 weeks post launch); not read; anecdote. GRADE: weak — [Indie Hackers](https://www.indiehackers.com/post/how-i-got-my-new-product-cited-in-ai-overviews-189cb3fbf6)
- Aleyda Solis SaaS AI search findings page (403; not read) — not verified.
- Counter-evidence for low-authority domains: SE Ranking (Domain Trust below 43 averages ~1.6 citations) and Lily Ray (recommended brands have more referring domains and mentions). GRADE: moderate.

### Gaps
- Timelines (weeks/months) for new domains: not found with credible method.

## 8. Entity and brand signals

### Takeaway
The strongest measured signal is third-party brand mentions (Ahrefs 0.664 on AIO). I found no independent study isolating sameAs, Organization schema, Crunchbase/LinkedIn/G2 profiles or Wikidata as drivers; these are vendor/practitioner recommendations.

### Cited Findings
- Branded web mentions Spearman 0.664 with AIO visibility (Ahrefs, 75,000 brands) vs backlinks 0.218 (Onely attribution); sameAs/Wikidata claims such as "35% higher AI visibility with Knowledge Graph presence" have no stated source or method. GRADE: moderate for mentions; weak/folklore for sameAs. Based on search summaries of agency articles, e.g. [Digital Applied entity guide, May 26, 2026](https://digitalapplied.com/blog/entity-seo-knowledge-graph-optimization-guide-2026).
- G2/Capterra review profiles and Reddit presence correlate with citations (SE Ranking review-platform listings ~4-6 citations; first-round notes on G2).
- Name collision: "DreamCRM" is shared by unrelated products (first-round notes), so disambiguating "DreamCRM dental" via Organization schema and consistent naming is sensible, but unmeasured.

### Gaps
- No study of Wikipedia/Wikidata eligibility for a small vendor or the effect of sameAs on AI answers; no test of how ChatGPT/Gemini "know" a small vendor.
