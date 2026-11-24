# Meta, Microsoft Advertising, review marketplaces, Reddit and ChatGPT ads for a tiny US dental-SaaS advertiser (as of 2026-11-23)

Method note: about 18 tool calls. WebSearch returns model-written summaries of result pages, so claims attributed to a search are labelled "search summary". Direct page fetches are labelled "fetched". Meta Business Help Center pages could not be fetched (403/404), so no Meta help-page text is quoted. Many specifics are in Gaps.

## Meta targeting in late 2026 (job titles, employers, field of study, Advantage+ audience)

### Takeaway
Job title, employer and field-of-study targeting still appear to exist in 2026, but Advantage+ audience treats them as suggestions rather than hard filters. I found no official Meta page on the January 2026 consolidation or on dental-specific values; verify live in Ads Manager.

### Cited Findings
- Search summary of Meta's developer docs: Advantage+ Audience treats initial audience inputs as suggestions. Non-negotiable constraints (location, minimum age, language, custom audience exclusions) are not expanded. Advantage detailed targeting is described as off by default for supported objectives in June 2026 docs. — [Meta developer docs, Advantage audience](https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/targeting-expansion/advantage-audience); [Advantage detailed targeting](https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/targeting-expansion/advantage-detailed-targeting) (page text not fetched; summary only)
- Third-party guides place job title/employer under Demographics > Work and field of study under Education. — [Linear Design 2026 guide](https://lineardesign.com/blog/facebook-detailed-targeting-list-2024/) (VENDOR; the URL slug says 2024, content claims 2026); [Meta 2018 developer post on professional targeting](https://developers.facebook.com/ads/blog/post/2018/08/09/professional-targeting-options/)
- The Jan 15, 2026 consolidation is reported by trade press as removing interest categories, not job titles. — [MediaPost](https://www.mediapost.com/publications/article/408262/meta-further-consolidates-ad-targeting-options.html) (earlier round's cite)
- Jon Loomer (named practitioner) writes that creative diversification is the new targeting. — [Jon Loomer pubcast, dated Sept 3, 2025](https://pubcast.jonloomer.com/creative-diversification-is-the-new-targeting/)

### Inferences
- A dental-owner audience is probably reachable only through custom lists/lookalikes plus loose job-title suggestions; expect Advantage+ to broaden beyond dentists.

### Gaps
- Whether "Dentist", "Dental hygienist", "Office manager" job-title values or "Dentistry" interests exist in late 2026: NOT FOUND (no Meta Help Center page retrieved).
- Official Meta statement of the January 2026 consolidation: NOT FOUND.
- Exact controls an advertiser keeps under Advantage+ audience beyond the constraints above: not retrieved.

## Meta Custom Audiences: customer-list terms and sizes

### Takeaway
Documented lookalike source minimum is 100 people from one country; 1,000+ is a commonly cited recommendation. Meta's customer-list terms (who collected the data, consent) were NOT retrieved, so whether a registry-derived or crawled list is permitted is unresolved.

### Cited Findings
- Meta Marketing API docs (search summary): a lookalike needs at least 100 seed members from one country. — [Meta lookalike guide](https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/guides/lookalike-audiences)
- Jon Loomer reports a test where a source of nine or fewer still produced a lookalike, so the minimum is inconsistently enforced. — [Jon Loomer pubcast](https://pubcast.jonloomer.com/videos/lookalike-audiences-error/) (search summary)
- Recommended 1,000+ source size is from Hootsuite and other secondary sources, not confirmed on Meta pages. — [Hootsuite](https://blog.hootsuite.com/facebook-targeting/) (VENDOR)
- Hightouch: ad platforms generally do not show a matched count below about 1,000 matched users. — [Hightouch](https://hightouch.com/fr/docs/destinations/facebook) (VENDOR)

### Inferences
- An NPPES-derived list of dentists (tens of thousands) clears size floors, but match rates on business emails are typically low (unquantified here).

### Gaps
- Meta Custom Audience Terms text (the advertiser must have the right/permission to use the data; notice and consent): NOT RETRIEVED. I will not state them from memory.
- Whether public-registry or crawled data may be uploaded: NOT FOUND.
- Official match-rate or minimum matched size: NOT FOUND.

## Meta health and wellness data-source restrictions

### Takeaway
Meta classifies each data source and restricts event data for health and wellness; vendors report appeals rarely succeed. No dental-software classification evidence found.

### Cited Findings
- Meta classifies a data source (domain/app) by its own review of products, services and content; a business can be categorized even if advertising is general. Check path (vendor-described): Events Manager > data source > Settings > Manage data source categories; review request option may not always appear. — [Search Engine Land](https://searchengineland.com/meta-ads-restrictions-health-wellness-campaigns-453094); [CustomerLabs](https://www.customerlabs.com/docs/destinations/ad-platforms/meta-health-and-wellness/restrictions/) (VENDOR)
- A vendor describes three tiers (mild core setup, moderate standard events, severe full restrictions) and says Conversions API does not bypass them. — [Ours Privacy](https://oursprivacy.com/blog/meta-platform-restrictions-explained-core-setup) (VENDOR, search summary)
- Vendor: successful appeals are infrequent. — [Triple Whale](https://www.triplewhale.com/blog/meta-health-and-wellness-brands) (VENDOR, search summary)

### Inferences
- A B2B dental-software domain whose content is dentistry might be classified by keyword; unverified. A pixel on a separate marketing domain with minimal dental content is a possible mitigation (ESTIMATE).

### Gaps
- Meta Business Help Center article "Understand data sharing restrictions based on data source categories": NOT RETRIEVED; category definitions and exactly what each blocks not confirmed from Meta.
- How a B2B dental-software domain is classified: NOT FOUND.

## Meta lead ads vs website conversions; learning phase; Andromeda creative volume

### Takeaway
Learning exit is about 50 results per week per ad set (Meta wording via vendor quote). 2026 practitioner consensus: creative diversity over near-duplicates, but numbers are vendor rules of thumb. Lead ads vs website for B2B SaaS: not found.

### Cited Findings
- Ad sets exit learning after about 50 results in the week after the last significant edit; Meta warns too many ads can worsen performance. — [Segwise quoting Meta](https://segwise.ai/blog/meta-andromeda-update-creative-strategy-2026.md) (VENDOR quoting Meta)
- Meta dropped the old ~6 ads per ad set guidance; one source recommends 6-8 creatives per ad set minimum and 15-25 above $5k/month; Loomer ran a 50-ad ad set. — [Common Thread Co](https://commonthreadco.com/blogs/coachs-corner/meta-andromeda-roas-creative-strategy-2026); [Jon Loomer](https://www.jonloomer.com/meta-andromeda/) (VENDOR / practitioner)
- Dentsu: duplicating ads with small edits is insufficient. — [Dentsu](https://www.dentsu.com/ae/en/our-latest-thinking/meta-andromeda-strategy)
- Rule of thumb of at least $50/day per ad set is a blog heuristic, not Meta. — search summary of vendor blogs
- The "17% more conversions at 16% lower cost for 25 creatives" claim could not be traced to a primary source.

### Inferences
- At $1-2k/month (about $33-66/day) one ad set can barely reach 50 results a week unless the optimization event is a cheap one (a trial start at $60-150 cost implies roughly 3-7 events/week, so Meta's learning threshold is likely unreachable; ESTIMATE).

### Gaps
- Instant Form requirements (privacy-policy URL): NOT RETRIEVED from Meta.
- Lead ads vs website conversions for B2B SMB SaaS evidence: NOT FOUND.
- Official minimum daily budget: NOT FOUND.

## Microsoft Advertising

### Takeaway
Import from Google Ads works but copies only part of the setup; LinkedIn profile targeting exists in the US for company, industry and job function (bid-only for Search per official help). Dental-specific values, minimum budgets and desktop share were not found.

### Cited Findings
- Import help: targeting differs between platforms and must be reviewed; demographics import covers age and gender only. — [Microsoft Learn Google Ads import](https://learn.microsoft.com/en-us/advertising/guides/google-ads-import) (search summary)
- LinkedIn profile targeting: add companies, industries or job functions in the Demographics tab with a bid adjustment; US, CA, UK, AU, FR, DE only; up to 1,000 companies; bid-only (does not narrow audience); adjustments multiply (10% industry x 20% job function = 32%). — [Microsoft Learn](https://learn.microsoft.com/en-us/advertising/msa-help/hlp_ba_conc_linkedintargeting); [help.ads.microsoft.com](https://help.ads.microsoft.com/apex/index/3/en/56905) (search summary)
- PPC Land reports a newer "target and bid" option for Audience campaigns only, Search always bid-only; a July 2026 Learn version still said bid only; unverified. — [PPC Land](https://ppc.land/microsoft-audience-ads-gain-option-to-show-only-to-chosen-linkedin-job-roles/)
- UET consent mode: mandatory since May 5, 2025 for EEA/UK/Switzerland traffic per vendor guides; Google Consent Mode does not cover Microsoft. Nothing found requiring it for US traffic. — [Usercentrics](https://usercentrics.com/knowledge-hub/microsoft-uet-consent-mode/) (VENDOR)

### Inferences
- US-only advertiser likely does not need UET consent mode (inference from absence of a US requirement in the vendor sources; confirm in Microsoft UET docs).

### Gaps
- Dental-relevant company/industry/job-function values (e.g., "Dental" industry, "Healthcare Services" function): NOT FOUND.
- Copilot ad placements official detail, minimum budgets, Bing/Edge US desktop share: NOT FOUND.

## G2 / Capterra / Software Advice / GetApp

### Takeaway
G2 caps review incentives at $100 and labels incentivized reviews. A free Capterra "Launch" listing exists, apparently via a G2-run form with one sign-up for the three Digital Markets sites; timelines, dental categories and PPC minimums were not verified.

### Cited Findings
- Fetched G2 community guidelines: "G2 limits the value of any incentive offered in exchange for a review to $100 USD"; covers cash, gift cards, swag, credits and subscriptions; incentivized reviews are labelled; "eligibility to receive an incentive is never based on the opinions, positive or negative"; undisclosed vendor incentives prohibited; reviewers verify via LinkedIn, a business email or personal email; only actual users may review, and competitor employees and the product company's employees may not. Page shows no last-updated date; mentions a unified review flow effective November 4, 2026. — [G2 community guidelines](https://legal.g2.com/community-guidelines) (fetched 2026-11-23)
- Capterra/GetApp/Software Advice guidelines show a last-updated May 4, 2026; nominal incentives where lawful, gift cards to a predetermined number of reviewers (search summary; page itself returned 403). — [Capterra community guidelines](https://www.capterra.com/legal/community-guidelines/); [Software Advice](https://www.softwareadvice.com/reviews-guidelines/)
- Free Launch tier with a Capterra profile and vendor portal. — [Gartner Digital Markets vendor signup](https://digital-markets.gartner.com/capterra-vendor-signup) (search summary); a directory page claims listing buttons now lead to G2's form with one sign-up covering the three sites — [SaaSCity](https://saascity.io/directories/capterra) (self-promotional, caution)
- Acquisition closed Feb 5, 2026 per earlier round; one source in this run conflicts ("completed by June"). — [G2](https://company.g2.com/news/g2-acquires-capterra-software-advice-getapp)

### Inferences
- A small vendor can collect reviews at up to $100 value with disclosure on G2; whether the same cap applies on Capterra is not established.

### Gaps
- Listing approval timelines, dental category names, PPC minimum bids and minimum spend, whether G2 itself has a free listing flow now: NOT FOUND.
- Capterra incentive page text (403): not read.

## Reddit Ads

### Takeaway
$5/day minimum for standard campaigns (third-party quoting Reddit's advertise page); Max campaigns reported at $20/day. Community targeting is available generally; subreddit-specific eligibility for dental communities not confirmed.

### Cited Findings
- Standard daily minimum $5, no lifetime minimum; Max campaigns $20/day or $620 lifetime; published March 9, 2026. — [Stackmatix](https://www.stackmatix.com/blog/reddit-ads-minimum-spend) (fetched; VENDOR; cites business.reddit.com/advertise)
- Subreddit sizes are aggregator figures and conflict: r/Dentistry about 104K to 168K; r/DentalSchool about 34K to 41K; r/DentalHygiene about 18K to 21K; r/DentalAssistants about 18K (one count). — [PainOnSocial](https://painonsocial.com/subreddits/dentists) (VENDOR, undated)

### Inferences
- These communities mix students, hygienists and assistants; few are practice owners or office managers (ESTIMATE).

### Gaps
- Reddit help-center text on community targeting, sensitive-category rules, whether named subreddits can be targeted, and Reddit-published 2026 CPC/CPM: NOT FOUND.

## ChatGPT Ads

### Takeaway
Dental is named in OpenAI's ad policy as a US health category that may be approved case by case, with possible proof of licensure; this appears aimed at consumer dental ads, and B2B software is not addressed. No official minimum budget found.

### Cited Findings
- Fetched OpenAI ad policies (updated November 20, 2026): healthcare & medicine is restricted; "OpenAI may allow a narrow range of health-related ads from selectively approved advertisers"; "may require proof of licensure and/or compliance"; US dental, vision, health insurance and supplements listed as case-by-case approvals; ads outside the US generally prohibited; no section on software/B2B; no minimum or billing text. — [OpenAI ad policies](https://openai.com/policies/ad-policies/)
- Fetched OpenAI announcement (May 5, 2026): CPM and CPC buying supported; CPC charged on click outcome; Conversions API and pixel measurement; beta self-serve Ads Manager opening gradually; payment details added in Ads Manager. — [OpenAI](https://openai.com/index/new-ways-to-buy-chatgpt-ads)
- Earlier round: CPC bid suggestion $3-5, default CPM $60. — [PPC Land](https://ppc.land/openai-opens-chatgpt-ads-manager-to-all-us-businesses-with-cpc-bidding/)
- AirOps (VENDOR) says self-serve starts at $25/day as of August 2026, citing Search Engine Land. — [AirOps](https://www.airops.com/blog/chatgpt-ads-performance) (unverified)
- Early B2B results (VENDOR): Stub Group, a compliance-services company, 30 days: $0.76 CPC, $92.21 cost per lead, 0.8% conversion versus $10.46, $157.57 and 6.64% on Google, updated Sept 23, 2026; Q1Media about $5 CPC. — [Stub Group](https://stubgroup.com/case-study/chatgpt-ads-case-study/); InterTeam SaaS case study figures not retrieved — [InterTeam](https://www.interteammarketing.com/case-study/chatgpt-ads-case-study)

### Inferences
- Whether a dental-practice-software ad triggers the healthcare review is uncertain; expect possible manual review (ESTIMATE).

### Gaps
- Targeting inputs and ad formats beyond what is above, official minimum budget, B2B SaaS results with spend/conversion detail: NOT FOUND from OpenAI.
