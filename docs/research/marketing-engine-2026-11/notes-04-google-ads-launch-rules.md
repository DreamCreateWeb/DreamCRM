# Google Ads launch rules for a small US competitor-keyword Search campaign (research date 2026-11-23)

Method note: Google help pages were fetched via WebFetch, which returns a model-summarized extract, not raw text. Quotes below are the extract's quotation of the page. NO Google help page fetched showed a "last updated" date; each shows only a "©2026 Google" footer. Items marked (search summary) come from a search-tool summary, not a fetched page. Items marked (practitioner) are blog/trade press. Many details remain "not found" (see Gaps in each section).

## Trademark policy (Google US + Microsoft)

### Takeaway
Google permits bidding on a competitor's trademark as a keyword; restrictions attach to the ad (headline/description/etc.), and only after a trademark owner complaint against the advertiser's specific URL/domain. The informational/reseller exceptions are conditioned on the ad AND landing page being clear about the advertiser's role; whether a vendor's own comparison page qualifies is not stated by the page. Microsoft does not review keyword complaints in the US (per older sources) but does enforce ad-text use.

### Cited Findings
- Google "will not restrict" "Using trademarks as keywords" (policy applies globally; Google abides by local trademark law; the page is not US-specific). — [Google Ads Trademarks policy](https://support.google.com/adspolicy/answer/6118?hl=en) (no date shown)
- Ad-text rule on the same page: "The trademark must be used in the ad, not only on the ad's landing page." Restricted uses: "Using trademarks in an ad from a direct competitor" and ads that use the trademark "in a confusing, deceptive, or misleading way"; descriptive ordinary-meaning use is not restricted. — same page
- Complaint mechanics: if a trademark owner submits a complaint Google reviews and may restrict use; Google "will only accept complaints against specific advertisers identified on the basis of their URL(s)"; restrictions generally apply to ads using the same second-level domain in the final URL; owners file via "Report Content On Google". — same page
- Exceptions: "The ad and landing page must be clear as to whether the advertiser is a reseller or informational site." Landing pages primarily dedicated to selling the corresponding products, which clearly offer a way to purchase and show commercial information like prices, are not restricted; pages whose primary purpose is providing details about the corresponding products, or an index of related search results, are not restricted. — same page
- The extract did not state a rule specific to display path or sitelinks; it speaks only of "the ad" generally. — same page (see Gaps)
- Microsoft Advertising: advertisers are responsible that "keywords and ad content, including trademarks and logos, do not infringe or violate the intellectual property rights of others"; owners should first contact the advertiser directly; complaints go through the Intellectual Property Concern Form; fair use in ad text allowed e.g. a reseller of authentic goods. — (search summary of) [Microsoft IP policies](https://about.ads.microsoft.com/en-us/policies/intellectual-property-policies)
- Microsoft keyword complaints: "Starting March 3, 2011, adCenter will no longer review trademark keyword complaints. However, adCenter will continue to investigate brand owner complaints related to trademark use in ad text" (US). A 2014 Microsoft blog says competitor terms in ad copy are generally not allowed. A third-party table (dated) says keyword complaints are not handled in US/CA/UK/IE. — (search summary, includes older sources) [Microsoft 2014 blog](https://advertise.bingads.microsoft.com/en-gb/blog/post/october-2014/what’s-in-a-brand-name-using-trademarks-and-copyrights-in-your-advertising); [Search Engine Land](https://searchengineland.com/bing-yahoo-align-with-googles-trademark-rules-64902)

### Inferences
- Safest ad copy: do not put "Weave"/"NexHealth" in headlines, descriptions, paths or sitelinks (direct competitor use is the restricted category); use generic copy ("Switching from your current dental platform?") and let the keyword do the matching. Even a complaint only restricts ads using the same second-level domain, so a complaint could hit the whole dreamcreatestudio.com domain's ads using that mark.
- A comparison page that sells DreamCRM with price and a sign-up path is closest to the "sales-focused landing page" exception text, but that exception is framed for "corresponding products" (the trademark owner's), so it is not clearly applicable. Treat as unresolved, not as a safe harbor.

### Gaps
- Page's last-updated date: not shown. Explicit treatment of display path/sitelinks: not found. Whether a vendor's own comparison page counts as "informational": not stated. Current (2026) Microsoft text on keywords: only older/third-party sources found; the live Microsoft page was not fetched.

## AI Max for Search and strictly-exact settings (late 2026)

### Takeaway
Google's help page says "New Search campaigns have the AI Max feature turned on by default." You must opt out in setup or later. Controls: ad-group "Search term matching", "Asset optimization" panel (text customization, final URL expansion), and campaign-level AI Max opt-out toggle.

### Cited Findings
- "New Search campaigns have the AI Max feature turned on by default." — [Optimize Google Ads with AI Max](https://support.google.com/google-ads/answer/15909989?hl=en) (no date shown)
- Search term matching: turned off per ad group (open ad group > "Search term matching" > toggle off); it "must be turned on at the campaign level in order to be used at the ad group level." Text customization and Final URL expansion are in the "Asset optimization" panel under AI Max settings; "Deactivating text customization automatically disables Final URL expansion"; disabling text customization makes assets "Removed". Opt out of everything: Campaigns > Settings tab > select campaigns > "AI Max" > toggle to opt out of all AI Max settings. — same page
- Microsoft Advertising's own AI Max is enabled by default for new Microsoft Search campaigns per its August 2026 post, and can be turned off. — (search summary) [Microsoft Ads Aug 2026](https://preview-about.ads.microsoft.com/en/blog/post/august-2026/reimagining-search-campaigns-for-the-ai-era-with-ai-max)
- Existing campaigns using ACA or campaign-level broad match were auto-upgraded to AI Max from Sept 1, 2026 (see first-round notes). — [SERoundtable](https://seroundtable.com/google-ads-migrate-ai-max-sep1-41829.html)
- (practitioner) Mike Ryan analysis via SEJ: >25% of impressions attributed to exact match keywords in AI Max campaigns came via AI Max term matching; one account had competitor searches at 69% of impressions; competitor terms can leak with AI Max on; brand exclusions/inclusions live under AI Max; negatives remain available. — [SEJ](https://searchenginejournal.com/google-ads-ai-max-is-making-more-decisions-for-you-heres-what-to-audit-now/596972); [Search Engine Land brand controls](https://searchengineland.com/google-ads-brand-controls-ai-max-new-search-campaigns-458954)
- Network controls: Google is rolling out channel prioritization for Search campaigns (Search / Search Partners / Display Network ranked high or low, "not a simple on/off switch"); the existing Display spend allocation setup retires February 2027. (practitioner/trade, search summary) — [SEJ](https://searchenginejournal.com/google-ads-introduces-channel-prioritization-and-budget-allocation/592833)

### Inferences
- Checklist to verify in the UI at creation: AI Max toggled off (or search term matching, text customization, final URL expansion all off), broad match keywords none, "automatically created assets" off, ads built manually. Exact UI wording for Search Partners / Display Network / auto-apply / location "Presence" was not verified for late 2026.

### Gaps
- Current UI names/defaults for: Search Partners, Display Network expansion, auto-apply recommendations, "Presence vs Presence or interest" location option, "automatically created assets" — NOT found in this run (one search returned nothing on auto-apply/location; the channel-prioritization change may have altered the network UI). Page dates not shown.

## Bidding at ~$30/day

### Takeaway
Enhanced CPC was retired for Search/Display (week of March 31, 2025) and affected campaigns effectively run Manual CPC; Manual CPC remains described as a fit for small budgets, though I did not confirm from a Google page that "Manual CPC" is selectable in the new-campaign flow in late 2026. Google's one numeric floor found is for Target ROAS (15 conversions in 30 days); the Target CPA/Maximize Conversions threshold was not found.

### Cited Findings
- ECPC "no longer available for Search and Display campaigns as of the week of March 31, 2025"; unmigrated campaigns effectively use Manual CPC. (search summary of Google FAQ) — [Google Bidding Basics FAQ](https://support.google.com/google-ads/faq/10286469) (not fetched directly)
- Target ROAS requirement on Google page: Search and Shopping "At least 15 conversions in the past 30 days at the conversion tracking level"; advises being comfortable spending up to 2x average daily budget. — [Target ROAS](https://support.google.com/google-ads/answer/6268637?hl=en) (no date)
- ECPC page (hotel campaigns) still mentions ECPC with Manual CPC and "at least 30 conversions per week"; hotel campaigns migrate to Search campaigns for Travel starting Q4 2026. — [Google ECPC page](https://support.google.com/google-ads/answer/2464964?hl=en) (hotel-only; not applicable to Search)
- (practitioner) Blogs: start Manual CPC or Maximize Clicks with a max-CPC cap while tracking is verified, move to Maximize Conversions when conversions are reliable; "fewer than 30 conversions a month" -> manual still makes sense. The 30 figure is a blog rule of thumb, not Google policy. — [SEJ bidding strategies](https://www.searchenginejournal.com/google-ads-bidding-strategies/436483/); [Relevant Audience](https://www.relevantaudience.com/google-ads-en/google-ads-bidding-strategies-guide/)

### Inferences
- At $30/day with exact-match niche terms, expect very few conversions; Manual CPC or Max Clicks with a cap is the practitioner consensus path.

### Gaps
- Google's official data guidance for Maximize Conversions / Target CPA: not found (the fetched page was Target ROAS). Whether Manual CPC is a selectable option in the late-2026 new-campaign wizard: not verified from a primary source. 2026 practitioner pieces specific to tiny budgets: only generic results.

## New-account requirements: verification, payments, destination

### Takeaway
Advertiser verification is triggered per account; you can run ads without it until Google asks, then there is a hard, non-extendable deadline and the account pauses if missed. Payment thresholds vary by account; no fixed number found.

### Cited Findings
- Tasks: individuals: government-issued photo ID matching payments profile name/location, phone confirmation, US SSN check, video selfie; organizations: Dun & Bradstreet info or registration/legal documents matching payments profile legal name/location, plus affiliation confirmation; "business operations" questions that "Most advertisers won't see." After verification, advertiser name/location appear in ad disclosures, My Ad Center and the Ads Transparency Center. — [Tasks required](https://support.google.com/adspolicy/answer/15577076?hl=en) (no date)
- Timeline: "It can take up to 5 business days to review your task. In rare cases, review time can take up to 30 days." "Your account will be paused if you don't get verified by the deadline." "No, the deadline can't be extended." "You can still run ads if you don't complete advertiser verification," but performance may be affected. — [Timelines](https://support.google.com/adspolicy/answer/15588490) (no date)
- (search summary) Advertisers get 30 days for "About your business" questions and 30 more days to complete requested verifications; appeals available only after completing verification; creating a replacement account is risky. — [About verification](https://support.google.com/adspolicy/answer/9703665) (not fetched; program announced 2022, may be dated)
- Payments (search summary of help pages): thresholds "vary per account, country, and currency"; shown on the Billing Summary page; automatic payments charge at threshold or monthly; thresholds can rise automatically for some US advertisers; manual payments not offered in every country. — [Automatic payments](https://support.google.com/google-ads/answer/6311?hl=en); [Payment settings](https://support.google.com/google-ads/answer/2375432)
- Destination: Misrepresentation page says "Promotions that are not relevant to the destination are not allowed." (search summary) ads cannot promise offers "unavailable or aren't easily found from the destination." — [Misrepresentation](https://support.google.com/adspolicy/answer/6020955?hl=en)

### Gaps
- Specific starting payment threshold number: NOT found. Required privacy policy / business contact information / free-trial pricing transparency destination requirements: the dedicated destination-requirements page was not retrieved; Misrepresentation extract had no contact-info section. Verification trigger criteria (who gets asked): not found.

## Policies that could bite (Healthcare, personalized ads, free trial/pricing, comparative claims)

### Takeaway
No evidence found that B2B dental software is in scope of the Healthcare and medicines policy (page speaks to drugs, pharmacies, telemedicine, health insurance); dental-only insurance ads are expressly not restricted. Pricing/free-trial disclosure falls under "Dishonest pricing practices". Comparative-claim substantiation: no official page found.

### Cited Findings
- Healthcare policy: "Google Ads is dedicated to following advertising regulations for healthcare and medicine"; the page does not mention software or B2B; prescription drug services section applies to businesses including "but aren't limited to" online pharmacies and telemedicine; "Advertisements exclusively for dental, vision, and/or travel health insurance coverage aren't restricted" (US). — [Healthcare and medicines](https://support.google.com/adspolicy/answer/176031?hl=en) (no date)
- Personalized advertising: "Health" is listed among categories with targeting restrictions; "Advertisers must not use negative remarketing lists for positive personalization"; Customer Match marked "Not supported" for sensitive interest categories under advertiser-curated audience restriction. The extract had no separate personal-health section. — [Personalized advertising](https://support.google.com/adspolicy/answer/143465?hl=en) (no date)
- Dishonest pricing practices: "Failure to clearly and conspicuously disclose the payment model or full expense" that a user will bear before and after purchase "is not allowed." Unreliable claims: claims that "entice the user with an improbable result" as the likely outcome "is not allowed." No free-trial-specific text in the extract. — [Misrepresentation](https://support.google.com/adspolicy/answer/6020955?hl=en); also see [Unreliable claims](https://support.google.com/adspolicy/answer/15936857) (not fetched)
- Comparative claims: only a secondary blog says comparisons are acceptable only when substantiated with testing data (practitioner/unofficial). — (search summary) [officeconsumer.com](https://officeconsumer.com/what-counts-as-misleading-content-in-google-ads-w-examples-faqs/)

### Inferences
- Because DreamCRM sells to practices (not health services to patients) and remarketing audiences would be website visitors of a B2B page, health-targeting restrictions are unlikely to apply, but this was not confirmed by any Google page; the "Health" category listing is the caution to check in the policy manager before building remarketing.
- Ad copy should state "$200/mo after 7-day free trial, no card" plainly and keep comparison claims to what the comparison page substantiates.

### Gaps
- Official comparative-advertising/substantiation text: not found. Free-trial disclosure rule specific to Google Ads: not found in fetched pages. Full Healthcare policy scope for B2B software: not addressed on the page, so "not found" rather than "excluded".

## Conversion measurement (enhanced conversions for leads, Data Manager API, Consent Mode)

### Takeaway
From June 15, 2026 offline conversion imports and enhanced-conversions-for-leads uploads are on the Data Manager API (blocked in Google Ads API). Capture GCLID at landing; send hashed (SHA-256, trimmed, lowercased) email as a fallback. Consent Mode is required only for EEA/UK/Swiss end-user traffic, not for US-only traffic per Google's consent pages.

### Cited Findings
- Enhanced conversions for leads set up "in 2 steps": configure Google tag to capture hashed user-provided data on the website; set up automated import of offline conversions with the same hashed data. "To maximize accuracy, include GCLIDs with your uploaded events whenever possible. This is required if you're not using a tag to collect user-provided data." Migration notice: starting June 15, 2026, offline imports and enhanced conversions for leads uploads migrate to Data Manager API. — [About enhanced conversions for leads](https://support.google.com/google-ads/answer/15713840?hl=en) (no date); first-round notes cite [Upgrade offline import](https://support.google.com/google-ads/answer/14274408?hl=en)
- (search summary) Data Manager API guide: email/name must be SHA-256 hashed then hex or Base64 encoded; trim and lowercase email first. "We only keep the GCLID for 90 days" (offline import troubleshooting); hashed-only uploads can produce "Unknown clicks" errors; within a conversion action, transactionId deduplicates tag and API events. — [Send events](https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events); [Offline import errors](https://support.google.com/google-ads/answer/13321563?hl=en)
- Consent: Google's EU User Consent Policy scope is end users in the EEA/UK (and Switzerland per one result); consent mode/TCF signals required for that traffic; advertiser location is not the trigger; Google says to assess local-law obligations yourself. — (search summary) [Consent mode EEA](https://support.google.com/google-ads/answer/13695607); [Adapt with consent mode](https://support.google.com/google-ads/answer/14505993)

### Inferences
- Primary vs secondary: "trial_started" primary (volume), "became_paying" secondary or a second primary with value once volume exists — this is practice, not verified Google text.

### Gaps
- The Data Manager API devguide URL I tried returned 404; exact request shape, per-source lookback and the API's conversion-window/event-age limits were not read from the primary page. Conversion-action creation steps in Data Manager: not retrieved. US state privacy-law consent obligations: not covered by Google pages.

## Customer Match in 2026

### Takeaway
New accounts can use Customer Match only in Observation mode and for Exclusions; Targeting requires 90 days of history and over $50,000 lifetime spend. Only first-party data may be uploaded.

### Cited Findings
- Eligibility: "A good history of policy compliance" and "A good payment history." For "Targeting" and manual bid adjustments: "90 days of Google Ads history and more than USD $50,000 total lifetime spend." Without that, all policy-compliant advertisers can use "Observation" and Exclusions. — [Customer Match policy](https://support.google.com/adspolicy/answer/6299717?hl=en) (no date)
- "You may only upload customer information that you collected in the first-party context" (examples: website, apps, physical stores). The page does not explicitly mention purchased/third-party lists; the first-party requirement implies they are not allowed. — same page

### Inferences
- An NPPES-derived or purchased dentist list is not first-party data and should not be uploaded to Customer Match; with a new $1k/mo account Targeting is unavailable regardless.

### Gaps
- Page date not shown; explicit third-party-list wording not found.
