# Keyword and competitor ad intelligence: dental front-office software (US, as of 2026-11-23)

Method note: SpyFu returned HTTP 403 (Cloudflare block) for every domain page, via both WebFetch and Playwright. Google and DuckDuckGo SERPs were bot-blocked. The WebSearch budget was exhausted partway through, so several planned organic and brand checks were not run. A Bing page loaded through Playwright returned unrelated results (Jack Daniels, Copilot) that ignored the query, so none of it is used. I did not attempt Semrush, Ahrefs, Moz or Ubersuggest, because search volume and domain authority there are login-gated and I ran out of budget. Nothing below is estimated from memory.

## Search volume and CPC for the keyword families

### Takeaway
No US monthly volume or CPC figure was obtainable for any of the 30 keywords. Every free tool I tried was blocked or gated. This is not a finding about the keywords themselves.

### Cited Findings
- SpyFu keyword and domain pages returned 403 "Sorry, you have been blocked" (Cloudflare) on 2026-11-23 — [SpyFu](https://www.spyfu.com/overview/domain?query=getweave.com)
- The only pricing-related facts found are about vendor prices, not keyword demand. NexHealth does not publish pricing and routes buyers to a quote form (as of 2026-05-06). Capterra lists a starting price of $350 per feature per month (a third-party estimate, from the web-search summary) — [NexHealth pricing](https://nexhealth.com/pricing), [Capterra](https://www.capterra.com/p/182271/NexHealth/pricing/)
- Emitrr's blog (last updated 2026-08-13) repeats the $350 figure but gives the unit inconsistently (per user vs flat). The post is by a NexHealth competitor and is secondhand, so treat it as weak — [Emitrr](https://emitrr.com/blog/nexhealth-pricing/)
- The existence of many "nexhealth pricing" results (Capterra, TrustRadius, G2, Software Advice, SelectHub, SpotSaaS, ITQlick, costbench, frontdeskreview, xpay and others) shows commercial intent around the query and heavy aggregator coverage. It says nothing quantitative — [WebSearch, 2026-11-23, query "nexhealth pricing"]

### Inferences
- The "X pricing" queries are served mostly by review marketplaces and price aggregators because vendors hide prices. A published, transparent $200/mo page could therefore match intent that competitors don't serve. This is inference only.

### Gaps
- Volume and CPC for all 30 keywords: not found. The next step is a logged-in Semrush, Ahrefs, SpyFu or Google Keyword Planner export, which has to be run by a person with accounts.

## Competitor paid search (SpyFu-style estimates)

### Takeaway
SpyFu figures (estimated paid keyword counts, monthly budgets, top paid keywords, brand-bidding) are not found. The Google Ads Transparency Center is scrapable, and it gives ad volume and live creatives for five of the ten domains.

### Cited Findings
Ad counts below are from the Transparency Center domain search, region US, loaded 2026-11-23. The counts cover ads pointing to each domain across all formats, they are not US-only spend, and the tool shows "~" approximations.
- getweave.com: ~800 ads — [Ads Transparency Center](https://adstransparency.google.com/?region=US&domain=getweave.com)
- nexhealth.com: ~700 ads — [Ads Transparency Center](https://adstransparency.google.com/?region=US&domain=nexhealth.com)
- revenuewell.com: ~200 ads — [Ads Transparency Center](https://adstransparency.google.com/?region=US&domain=revenuewell.com)
- dentalintel.com: 91 ads — [Ads Transparency Center](https://adstransparency.google.com/?region=US&domain=dentalintel.com)
- adit.com: 75 ads. Several of these are Adit-built practice ads (clinic ads whose domain is a client's, for example Floss Dental Dallas), not Adit's own product ads — [Ads Transparency Center](https://adstransparency.google.com/?region=US&domain=adit.com)
- The domain pages for getweave.com, nexhealth.com and adit.com each aggregate several advertiser accounts. NexHealth's domain page also includes ads from dental clinics whose sites use NexHealth booking, for example Beach Dental, and from other clinics (Cornerstone Orthodontics, Smilecraft). These are not NexHealth's own ads.
- Domains not checked: solutionreach.com, podium.com, yapiapp.com, flex.dental, emitrr.com.
- Brand bidding between competitors: not found. The creatives sampled did not mention a rival's name.

### Inferences
- Weave and NexHealth run ad programs roughly 3 to 9 times larger by creative count than Dental Intelligence, Adit or RevenueWell. The count is only a rough proxy for spend.

### Gaps
- SpyFu paid keyword counts, budgets, top paid keywords and brand-bidding data are all not found, because of the 403 block.

## Actual ad copy from the Google Ads Transparency Center

### Takeaway
The Transparency Center can be scraped with Playwright. Direct advertiser-page navigation errors ("Something went wrong"), but opening creative detail links found on the domain page works. I sampled up to 8 creatives per domain, and the same creatives repeat, so this is a thin sample.

### Cited Findings
Retrieved 2026-11-23; ads are shown for the US region.
- Weave, Text ad: "$150 Amazon gift card with Weave demo. Streamline your patient communication, scheduling, and payments all in one platform." Also seen: "Phones, texting, reminders, and more – all-in-one-system and seamless PMS integration. A modern phone system that..." with sitelinks "Pricing Plans", "Weave VoIP Phone System", "Veterinary Software Platform". A "Vet Payment & Billing Tools" variant targets veterinary buyers. The offer is a demo with a gift card. The date range was not captured — [Ads Transparency Center, getweave.com](https://adstransparency.google.com/?region=US&domain=getweave.com)
- NexHealth, Text ad, try.nexhealth.com: "NexHealth For Eaglesoft - Writes Back To Your Schedule" / "Booking, forms, reminders and payments that write back to Eaglesoft. See pricing." Sitelinks: "See Plans And Pricing", "Get Pricing", "Patient Payments", "Works With Eaglesoft", "Payment Terminals". Last shown Nov 23, 2026. This is a PMS-specific ad pointing to a pricing page — [Ads Transparency Center, nexhealth.com](https://adstransparency.google.com/?region=US&domain=nexhealth.com)
- RevenueWell, Text ad: "Periodontic Website Design - Digital Marketing for Perio - Contact Us Today" / "Drive patient bookings with a complete digital strategy — built for periodontal practices. Custom digital marketing - everything you need to grow your periodontal practice. Built for Dental Teams. Grow Your Practice." Sitelinks include "Book a Demo", "Dental Practice Marketing", "Dental AI Solutions", "Patient Engagement Tools" — [Ads Transparency Center, revenuewell.com](https://adstransparency.google.com/?region=US&domain=revenuewell.com)
- Dental Intelligence, ad: "Dental Intelligence Voice. Connect Every Call, Voicemail, and Patient Interaction in One Powerful Platform." This was a video/sponsored format, not text — [Ads Transparency Center, dentalintel.com](https://adstransparency.google.com/?region=US&domain=dentalintel.com)
- Adit: the sample returned only client-practice ads (Floss Dental Dallas, Big Smile Dentistry, a Terrell optometrist), so no Adit product ad copy was captured — [Ads Transparency Center, adit.com](https://adstransparency.google.com/?region=US&domain=adit.com)

### Inferences
- Competitors use three angles: a hard offer (Weave's gift card), PMS-specific integration plus a pricing link (NexHealth), and vertical or specialty targeting (RevenueWell on perio). Explicit price transparency in a headline was not seen in any sampled ad, apart from NexHealth's "See pricing" link text.

### Gaps
- First-seen/last-seen date ranges for most creatives, and the sample of ads per advertiser, were not captured. Only NexHealth's "last shown" date was recorded.
- Which creatives are on competitor-brand or "alternative" terms is not visible in the Transparency Center, because it shows ads and not the keywords bid on.

## Organic results for the target queries

### Takeaway
Only partial data. The "weave alternatives" web search gave no usable ranking. The "nexhealth pricing" and "best dental patient communication software" searches returned lists, summarised below.

### Cited Findings
- "weave alternatives dental" (WebSearch, 2026-11-23): the results were dominated by dental-treatment pages (braces, implants, amalgam). The one relevant result was SoftwareSuggest's Weave alternatives page, which was last updated 2026-11-02. It lists mConsent, EagleSoft, Dentisoft Office, BlueNote Communicator, Daisy, Planmeca Romexis, Praktika ($260/mo), YAPI, LabStar and axiUm, and shows no Weave price — [SoftwareSuggest](https://www.softwaresuggest.com/weave/alternatives)
- "nexhealth pricing": Capterra, TrustRadius, G2, nexhealth.com/pricing, Software Advice, SelectHub, SpotSaaS, ITQlick, costbench, frontdeskreview, xpay, saasworthy, subscribed.fyi, and a competitor blog (emitrr.com). That is review marketplaces and vendor pricing pages, plus a competitor's comparison post — [WebSearch, 2026-11-23]
- "best dental patient communication software": curvedental.com (vendor blog), dentaltown.com (blog listicle), televox.com (vendor blog), emitrr.com (vendor blog), dentalintel.com (vendor page), gitnux.org, zipdo.co, fitgap.com, 360connect.com and slashdot.org (listicle and directory sites), sourceforge.net — [WebSearch, 2026-11-23]

### Inferences
- Vendor blogs (Emitrr, Curve, Televox) rank for the "best ... software" query, which suggests a vendor-written comparison can compete. Rank position and domain authority were not measured, so I can't call any of these low-authority.
- The "weave alternatives" SERP looked thin for dental-specific content on this one check. This is a single search and unconfirmed.

### Gaps
- "weave pricing" and the full position order for all four queries: not found (WebSearch budget exhausted).
- Authority of ranking domains: not found.

## Baseline for the new domain (dreamcreatestudio.com)

### Takeaway
Google and Bing index counts and any backlink or authority metrics are not found. The one successful search signal is weakly negative.

### Cited Findings
- WebSearch for "site:dreamcreatestudio.com" on 2026-11-23 returned no pages from dreamcreatestudio.com. Results were unrelated sites (Framer, Fab, Dribbble). WebSearch is not Google and may ignore the operator, so this does not prove the domain is unindexed — [WebSearch, 2026-11-23]
- Direct Google search was blocked ("unusual traffic") on 2026-11-23. DuckDuckGo returned 403. The Bing results loaded through Playwright ignored the query and are discarded.
- "DreamCRM dental" brand query and other products named DreamCRM/Dream CRM: not found (search budget exhausted).

### Gaps
- Indexed URL count in Google and Bing: not found. The owner can get this free and accurately from Google Search Console and Bing Webmaster Tools.
- Domain rating or authority and referring domains from Ahrefs, Moz or Semrush: not found, not attempted.
- Brand-query competition ("DreamCRM", "Dream CRM"): not found.
