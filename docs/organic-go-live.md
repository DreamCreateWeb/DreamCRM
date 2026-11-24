# Organic go-live — being found, and being recommended, before a dollar goes to ads

**Owner ruling, 2026-11-24.** Paid ads wait. In the owner's words: *"only after
we've exhausted every single perfected marketing tactic, then we can start
paying money to add fuel to that fire — if there's an SEO hack, if there's a
search ranking tip, if there's a method of getting ChatGPT to recommend us, I
want to exhaust those."* `docs/ads-go-live.md` stays in the tree, ready and
unused, until the gate in Part 7 is met.

This is the runbook for that. It says what the evidence supports, what the
product now does by itself, and the steps only the owner can take, in order.
Every fact carries where it came from and the day it was read. Where something
could not be read, it says so.

The research behind it is `docs/research/marketing-engine-2026-11/` (the
report, the site audit, fourteen notes). The paid plan it defers is
`docs/ads-go-live.md`. The program of record is `docs/marketing-engine.md`
Part 12.

---

## 0. The short version

**There is no hack.** The controlled tests that exist say the tricks sold as
"AI SEO" — extra schema markup, an `llms.txt` file, FAQ markup, a "best dental
software" list that ranks yourself first — do not make an assistant recommend
you (Part 2 has the numbers). What correlates with being named is plainer and
slower: **other sites saying your name**, and **being in the search indexes the
assistants read**.

So the work splits in two.

1. **What the site can do alone — done in this change.** Every public page is
   readable by every search and AI crawler; the sitemap states only true
   dates; Bing and the engines that share its notice protocol are told within
   the hour a page changes; the comparison pages quote each competitor from
   its own site with the day it was read; one page says plainly which DreamCRM
   this is; and the demo practice is marked to stay out of the index.
2. **What only you can do — Part 4.** Verify the site with Google and Bing,
   claim a free G2 profile, and ask real customers for reviews. Those three
   are most of the distance. An hour and a half of your time starts all of
   them.

**What to expect.** Nobody can honestly promise a date or a count. Google's
own documentation says a crawl "can take anywhere from a few days to a few
weeks", and ranking for a term a competitor already holds takes longer than
being crawled. What can be promised is that it will be measured: Part 4,
step 7 is a monthly check with a log, and the platform's own Search Console
page shows clicks as they arrive.

---

## 1. Where we stand

Measured on the live site, 2026-11-23 and 2026-11-24.

| Question | Answer | How it was checked |
|---|---|---|
| Is the site in Bing's index? | **No sign of it.** `site:dreamcreatestudio.com` on Bing returned only unrelated hosts; a search for the product name with "dental software" returned nothing of ours | Two Bing queries, 2026-11-24. Google, DuckDuckGo and Brave refused the automated check, so Google's count is **unknown** until Search Console says |
| Does any assistant or search result name us for a buyer's question? | **No.** Ten buyer queries, zero appearances. Review marketplaces (Capterra, Software Advice, GetApp, G2, TrustRadius), competitors' blogs and list sites filled the results | Web-search tool, 2026-11-23 (notes-01 §6). Not logged-out Google, so positions are unverified |
| Can the crawlers read the site? | **Yes.** `/`, `/pricing` and `/sitemap.xml` answered 200 to the user agents of OpenAI's search crawler, ChatGPT's fetcher, GPTBot, PerplexityBot, ClaudeBot, Bingbot and Googlebot. `robots.txt` admits all of them and blocks only signed-in and token pages | `curl` with each user agent against the live site, 2026-11-24. This tests the user agent, not the crawlers' own addresses |
| Do pages render without JavaScript? | **Yes.** Server-rendered, including the header menu's 23 links (fixed in the first slice) | Site audit, 2026-11-23 |
| Is the name ours alone? | **No.** At least two unrelated products and an iOS app are called DreamCRM or Dreams CRM | Report, 2026-11-23. **Always write the name beside the word "dental"** |
| Do we have a profile on any review marketplace? | **Not that we found** | Same field check |

The first row is the one that matters most for the ChatGPT question, and Part 2
says why.

---

## 2. What moves it, and what does not

| Tactic | What the evidence says | Source | What we do |
|---|---|---|---|
| **Schema markup** (JSON-LD) to earn AI citations | No measurable lift: 1,885 pages that added JSON-LD, against 4,000 controls, across Google AI Overviews, AI Mode and ChatGPT | Ahrefs, May 2026 (a vendor's study; limited to pages already cited) | Keep what is already there for ordinary search eligibility. Add no more |
| **`llms.txt`** | No effect found | Report, "Controlled tests turned against schema, llms.txt and self-ranked lists" | **Not built.** It would be a file nobody reads |
| **FAQ markup** | Google ended FAQ rich results on May 7, 2026 | Google Search Central | The comparison FAQs stay (they are content). Nothing is added for the markup's sake |
| **A "best dental software" list with us first** | Such lists are cited — but 69% of the cited self-promotional lists came from brands the answer then did **not** recommend, and the same researcher reports Google demoting them since January 2026 | Lily Ray, Apr–Jun 2026 (an estimate, 100 queries) | **Not written.** The comparison pages lead with what each rival does better instead, which is the form the evidence calls credible |
| **Other sites naming you** | The strongest signal measured: branded web mentions correlate with AI Overview visibility at 0.664, against 0.218 for backlinks | Ahrefs data on 75,000 brands, seen through a secondary summary (May 2026) | Part 4, steps 3–6. This is the main lever and it is not code |
| **Review-marketplace profiles** | Correlate with citation; 45% of B2B buyers call a review-site citation the most confidence-inspiring thing in an AI answer | SE Ranking; G2's survey of 1,076 buyers, March 2026 (G2 owns the sites it finds persuasive) | Part 4, steps 3–4 |
| **Being in Bing's index** | Microsoft Copilot answers from it. OpenAI says ChatGPT search has its own crawler and "sometimes partners with other search providers" | notes-02 §5; OpenAI's crawler documentation and help centre, read 2026-11-24 (the help article does not name Bing) | Part 3 (the notices) and Part 4, step 2 |
| **Static HTML** | The fetchers behind ChatGPT, Claude, Gemini and Perplexity read static HTML and do not run JavaScript | Resoneo, January 2026 (one controlled test) | Already true of every public page |
| **A page that states facts plainly** | An assistant can only quote a price or a term that is written on a page. Five of our eight named competitors publish no price at all | Their own sites, read 2026-11-23/24 | Our price, trial terms and "what we do not do" are on the page in words, and resolved from one source so they cannot drift |
| **Honest dates** | Google uses `lastmod` "if it's consistently and verifiably accurate" | Google's sitemap documentation | The sitemap states a date only where the tree holds a real one |

Which assistant matters: among small-business software buyers the split is
roughly ChatGPT 58, Gemini 21, Claude 7, Copilot 6, Perplexity 2 (G2, March
2026, the vendor's own survey). So the monthly check in step 7 watches ChatGPT,
Gemini and Google's AI Mode.

---

## 3. What the site now does by itself

Nothing in this part needs you. It is here so you know what is running.

**One list of what we publish.** `lib/marketing/public-pages.ts` names every
public marketing page once. The sitemap renders it; the search notices read
it. A page cannot be in one and missing from the other.

**Search notices (IndexNow).** Once an hour the site compares what is public
with what the search engines were last told, and sends them the difference:
pages added, changed or removed. It reaches Bing, Yandex, Naver, Seznam, Yep
and Amazon. **Google does not take part** — Google is served by the sitemap and
Search Console.

- It sends a page again only when that page's content changed. The protocol's
  own FAQ says "Do not resubmit unchanged URLs", so nothing fires on a deploy
  or a restart, and an article edited forty times in an hour is one notice.
- The first notice names every page once. The protocol says it "is not
  designed for submitting every URL on your site at once", with one exception:
  "If your entire site has been recently updated… it is acceptable to submit
  all URLs." That is this deploy — the trial terms, every page's title and
  description, and the header changed sitewide.
- It will not guess. If it cannot read the posts, or cannot read its own
  record, it sends nothing. If the engines refuse a notice, nothing is marked
  as announced and the next hour tries again.
- Where you see it: **Search Console** in the sidebar (under Content) has a
  card, "Bing and the other search engines", with the last notice, how many
  pages, and a warning mark if one was refused.
- A new post is announced within the hour it is published. Pages built from
  data (pricing, the legal pages, comparisons, help articles, guides, the
  changelog) are re-announced when that data changes. A hand-written page (the
  home page, the product tour) is announced once; a later copy edit reaches
  the engines by ordinary crawling. That is a known limit.
- The key file the protocol requires is served at the root of every host. The
  key is public by design and proves only that we control the site.
- Clinic sites are **not** announced yet. Each clinic host is a separate site
  to the protocol, and which address is a clinic's real one is an open ruling
  (Part 8).

Code: `lib/indexnow.ts` (the rules), `lib/services/indexnow.ts` (the hourly
pass), `/api/cron/search-notify` (a `JOBS` entry the deploy schedules).

**A page that says which DreamCRM this is** — `/about`. The site argued,
showed and priced, but had no page whose job was to state the plain facts: what
it is, who makes it, who it is for, what it costs, what it does not do, and that
other products share the name. It is built from the listing kit (Part 5), so
the site and every outside profile describe the product in the same sentences
and each corroborates the other. It gives the town, not the street, and it does
not name you — the Privacy Policy does, as it must; whether a marketing page
should is yours to rule (Part 8).

**The demo practice is marked to stay out of the index.** "Dream Dental" is
seeded: an invented address, phone and staff. Every page under it now answers
with `X-Robots-Tag: noindex`, so an engine that already holds one drops it the
next time it looks. It is still there to browse. A real clinic's site never
gets that header. This was decided in the session, not ruled by you; it is one
line to reverse (`withDemoNoindex` in `middleware.ts`).

**One font instead of two before the page paints.** A fallback font nobody
sees on a public page was being fetched at high priority on every page of the
platform (70 KB). It is declared without the preload now. *Not fixed:* the
root layout still preloads the 71 KB mono font on every page, clinic sites
included, and clinic sites do not use it — a follow-up, because the marketing
site and the dashboard do.

**Eight comparison pages, each read against the vendor's own site.** Weave,
Solutionreach and NexHealth on 2026-11-23; RevenueWell, Adit, Dental
Intelligence, Podium and Tebra on 2026-11-24. What the second read found:

- **None of those five publishes a price.** Each page now says so, and
  attributes the figure it shows to third-party reviews.
- Things the old pages had wrong in the competitor's disfavour are corrected:
  RevenueWell offers monthly contracts and free trials, per its own site;
  Adit's pricing page says its software has no binding contract; Dental
  Intelligence now sells phones and insurance verification.
- Claims the read could not confirm were removed rather than restated.
- Tebra's home and pricing pages do not mention dentistry at all, and the page
  says that.

How they were read: four first-hand (the page text fetched and searched for
each phrase). Adit's site answers a plain request with a challenge page, so
its two pages were read through the fetch tool, twice, with matching results.
One RevenueWell claim rests on its help centre, which refused both readers
(403); it is kept on the strength of a search engine's copy of that article.

---

## 4. Your steps, in order

### Step 0 — Merge, and do one real signup (15 minutes)

Nothing in this document is live until the pull request merges. The same pull
request changes who is charged (the 14-day trial with a card), and that could
not be exercised against Stripe from the build environment. Sign up once
yourself, with a real card, and cancel from Settings → Plan & billing.

### Step 1 — Google Search Console (15 minutes, then a wait for DNS)

The platform already has a Search Console connection built in: one **Domain
property** for `dreamcreatestudio.com` covers `www` and every clinic subdomain,
and each clinic's SEO page then reads its own slice of it.

1. Open **Search Console** in the sidebar (under Content). If it shows search
   numbers, this step is already done — skip to step 2.
2. If it shows a Connect button: go to
   [search.google.com/search-console](https://search.google.com/search-console),
   add a property, choose **Domain**, and enter `dreamcreatestudio.com`.
   Google's page defines it as "a domain-level property that includes all
   subdomains (m, www, and so on) and multiple protocols".
3. Google gives you a TXT record. Add it at name.com, where the DNS lives. A
   Domain property is verified by "DNS record verification only". Google says
   it "can take a few minutes or even days" for the record to be visible to
   it.
4. Back in the app, press **Connect Search Console**, sign in with the same
   Google account, and pick the `sc-domain:dreamcreatestudio.com` property.
5. In Search Console, open the **Sitemaps** report, enter
   `https://www.dreamcreatestudio.com/sitemap.xml` and submit. "Success" means
   "the sitemap was loaded and processed successfully with no errors. All URLs
   will be queued for crawling."
6. In the URL Inspection tool, request indexing for the home page, `/pricing`
   and `/compare`. Do it once each: Google says "there's a quota" and that
   asking again "won't get it crawled any faster".

Sources: Google's Search Console help (answers 9008080, 34592, 7451001) and
"Ask Google to recrawl your URLs", read 2026-11-24.

### Step 2 — Bing Webmaster Tools (10 minutes)

This is the step closest to the ChatGPT question, because the site is not in
Bing's index today.

1. Go to [bing.com/webmasters](https://www.bing.com/webmasters) and sign in.
2. On My Sites, choose **Import**, sign in with the Google account from step
   1, and import `dreamcreatestudio.com`. Bing says imported sites "will be
   automatically verified, eliminating the need for manual site verification
   steps", and that the import brings the sitemaps with it.
3. Check the sitemap is listed. If it is not, add
   `https://www.dreamcreatestudio.com/sitemap.xml`.
4. Look for the IndexNow page. Bing's own getting-started page says to "use
   Bing Webmaster Tools to verify if your URLs are received by search
   engines". The first notice goes out at the first hourly pass after the new
   version has finished going live; the card on the Search Console page in
   the app says when it did.
5. Find **AI Performance**. It "shows how publisher content appears across
   Microsoft Copilot, AI-generated summaries in Bing" and select partners:
   total citations, cited pages, and the queries that led to them. It will be
   empty at first. It is the free instrument for step 7.

Sources: Bing Webmaster blog, "Easily verify your site… by importing from
Google Search Console" (2019, updated June 2025) and "Introducing AI
Performance in Bing Webmaster Tools" (Feb 10 2026); bing.com/indexnow; all read
2026-11-24. **Not read:** Bing's help pages for adding a site and for sitemaps
render only in a browser, so the exact button names in items 3–5 are from the
blog posts, not from the help pages. The AI Performance post calls it a public
preview and does not say every site has it.

### Step 3 — A G2 profile (30 minutes, then their review)

One free profile now reaches four marketplaces.

- A profile is free: "You can claim your profile for free." Add the product at
  [g2.com/products/new](https://www.g2.com/products/new). Verification takes
  about 3–5 business days and a claim 1–3 (G2's seller pages, read 2026-11-24).
- G2 announced on January 29, 2026 that it is acquiring Capterra, Software
  Advice and GetApp. Its review guidelines (effective November 4, 2026) say a
  G2 review "counts toward the product's review count and ratings on every
  marketplace where that product is listed (G2, Capterra, Software Advice, and
  GetApp)".
- Those four, with TrustRadius, are the sites that filled the results for
  every buyer query in the baseline.

Paste from the listing kit in Part 5. For the category, do not pick by name:
search G2 for Weave, RevenueWell and Solutionreach, and choose the category
they are listed in. Being on the same list as the products we are compared
with is the point. **Not read:** Capterra's and TrustRadius's own vendor pages
refused the reader (403), so their category names and claim steps are unknown
here.

### Step 4 — Ask real customers for reviews (ongoing)

An empty profile is a listing. Reviews are what an assistant quotes.

G2's rules, as its guidelines state them (read 2026-11-24):

- Reviews come from actual users only. No employees.
- A reviewer is verified through LinkedIn, a business email, or a personal
  email with a screenshot showing they use the product.
- You may ask customers — G2 encourages it. You may not ask only the happy
  ones: never "segment out" the customers likely to be negative.
- An incentive is allowed up to $100, must be disclosed to G2, and must never
  depend on the review being positive.

The FTC's rule on reviews (16 CFR 465.4, in force since October 21, 2024) bars
paying for "a particular sentiment". Whether it reaches a business's review of
software is not settled (notes-14), so the same line is the safe one: the same
ask to everyone, the same thank-you whatever they write, and never write one
for them. **This is not legal advice.**

The ask that works is a personal one, from you, with the link, a few weeks
after a practice goes live. Start with the practices that are live today.

### Step 5 — The other profiles (an hour, once)

Each of these is a page on somebody else's site that says, in our words, what
DreamCRM is and that it is for dentists. Use the listing kit for every one, so
they all say the same thing.

| Profile | Why | Status of what is written here |
|---|---|---|
| **LinkedIn company page** | LinkedIn is among the sources assistants cite most (Peec, a vendor's analysis of 30M sources). Half of software go-to-market leaders call founder posting a core channel (Poyar, Sept 2026) | General knowledge that company pages are free; not re-read |
| **TrustRadius** | Appeared in the baseline results beside G2 | Its vendor page could not be read (403) |
| **Crunchbase** | A company record that search engines surface for a brand name | Not read |
| **YouTube** | Listed next after Reddit in the same analysis. A five-minute screen recording of the product, titled with "dental", is a page about us on a site assistants read | Not read |

Tell me the address of each once it exists. They go in the site's footer and
its company data, which ties the profiles to the site for a search engine.

### Step 6 — Being mentioned where dentists read (ongoing)

This is the lever with the strongest evidence and the least shortcut. From the
channel research (notes-12, read 2026-11-23, with its own caveats):

- **One contributed article in Dental Economics.** Its submission guidelines
  (updated October 23, 2026) take articles by email, require commercial
  relationships to be disclosed, and let editors strip brand names and links.
  So the article has to be useful on its own — the byline and the bio are the
  mention.
- **Dentaltown.** Article submissions at `dentaltown.com/submit-article`. The
  Townie Choice entry was free per an older notice; check the current rules.
- **The Arkansas State Dental Association.** Its Annual Scientific Session is
  March 11–13, 2027 in North Little Rock. Exhibitor terms were not on the page.
  A member-benefit listing on an association's own site is a mention on a
  dental organisation's own domain.
- **The communities** (Dental Nachos, Nifty Thrifty Dentists, the Dental
  Office Managers Community). Their rules for vendors could not be read. The
  safe route is the founder-run sponsor or deal page, by direct email — not
  posting. A vendor who posts unasked in a clinicians' group loses the room.
- **Podcast guesting.** Rates and guest forms were not published for the shows
  checked.
- **Reddit** is the most-cited source in the analysis above. The dental
  communities' rules were not read, and clinicians' forums rarely welcome a
  vendor. If you take part, do it as yourself, say what you make, answer the
  question that was asked, and never lead with a link.

None of this is free of effort, and most of it costs nothing but a founder's
time.

### Step 7 — The monthly check (20 minutes, first week of each month)

Ask the same ten questions, logged out, in ChatGPT, Gemini and Google's AI
Mode. Record whether we are named, and who is.

1. best dental patient communication software
2. Weave alternatives for a dental practice
3. Weave pricing
4. NexHealth pricing
5. NexHealth alternatives
6. dental online scheduling software
7. all-in-one software for a small dental practice
8. dental website and online booking in one system
9. dental patient portal software
10. DreamCRM dental — what is it, and what does it cost

| Month | Named in (of 30) | Who was named instead | Bing AI Performance citations | Search Console clicks (28 days) | G2 reviews |
|---|---|---|---|---|---|
| 2026-11 (baseline) | 0 of 10 run | Review marketplaces, competitors' blogs, list sites | not connected | not connected | no profile |

Question 10 is the one to watch first. If an assistant describes some other
DreamCRM, the name-collision problem is biting, and the fix is more pages that
say "DreamCRM" and "dental" together — which is what steps 3 to 6 produce, and
what `/about` is on our own site.

---

## 5. The listing kit

Paste from here. It is generated from the same values the site uses, so the
price and the trial are always the current ones. **If this block changes, the
profiles pasted from the old text are now wrong** — go and correct them (the
list is in step 5, plus G2).

Open Dental is left out of the kit on purpose. Open Dental's own third-party
page advises its customers against NexHealth products that claim to integrate
with it (read 2026-11-23, notes-12). The site still names Open Dental; that is
one of the copy claims waiting on your ruling (Part 8), and a marketplace
profile is harder to take back than a page of ours.

<!-- listing-kit:start — generated from lib/marketing/listing-kit.ts; do not edit by hand -->

**Product name:** DreamCRM — where a form allows a longer name, write "DreamCRM (dental)"
**Company / seller:** Dream Create
**Website:** https://www.dreamcreatestudio.com

**Tagline / headline** (46 characters; keep under 60)

> The front-office platform for dental practices

**One-line description** (147 characters; keep under 160)

> DreamCRM is dental practice software in one system: website, online booking, patient portal, messages, reviews and recall, around the PMS you keep.

**Short description** (297 characters; keep under 300)

> DreamCRM is the front-office platform for dental practices. One subscription covers the practice website, online booking, a patient portal in the practice’s own branding, one inbox for patient messages, review requests and recall. It works alongside the practice management system you already use.

**Full description** (1237 characters; keep under 1300)

> DreamCRM is a front-office platform built only for dental practices. It brings together what a practice usually buys separately — the website, the booking widget, review requests, recall — in one system, and it works alongside the practice management system (PMS) a practice already runs rather than replacing it.
>
> What is included: a practice website you edit by clicking the page; online booking; a patient portal in the practice’s own branding where patients confirm, reschedule, fill in forms and pay; one inbox for portal messages and patient email; review requests that feed the website’s testimonials; Google Business and social posting; recall and reactivation campaigns by email; intake forms; an online store and membership plans; insurance eligibility checks (200 a month included); and a careers page. It syncs with Dentrix, Eaglesoft and other dental PMSs through NexHealth.
>
> What it is not: DreamCRM is not a practice management system — charts, procedures and claims stay in the PMS. It does not include phones, and it does not send text messages today.
>
> Pricing is published: $200/month, month-to-month, or $2,000/year paid annually. There is a 14-day free trial; a card starts it and is not charged until the trial ends.

**Pricing details** (197 characters; keep under 300)

> One plan for dental practices: $200/month, month-to-month, or $2,000/year paid annually. A 14-day free trial; a card starts it and is not charged until the trial ends. No setup fee and no contract.

**Who it is for / target customer** (175 characters; keep under 200)

> Independent dental practices in the United States — general, pediatric and cosmetic — that want their website, booking, patient portal and patient communication in one system.

**What makes it different** (346 characters; keep under 400)

> Built only for dental practices, and priced on the page: $200/month for the whole platform, with no quote call. The practice website is part of the product, not a separate service. In the patient portal, a feature the practice turns off disappears for patients instead of leaving a dead link. And the listing above says what DreamCRM does not do.

**Features** (tick these, or paste them as a list)

- Dental practice website with an edit-in-place editor
- Online appointment booking
- Patient portal in the practice’s own branding
- Unified patient inbox (portal messages and email)
- Review requests and website testimonials
- Google Business Profile sync and social posting
- Recall and reactivation campaigns (email)
- Digital intake forms
- Online store and in-house membership plans
- Insurance eligibility checks (200 a month included)
- Careers page and applicant tracking
- Dental PMS sync through NexHealth (Dentrix, Eaglesoft and more)

**Not included** (answer "no" to these wherever a form asks)

- Practice management (charting, procedures, claims) — it works alongside your dental PMS
- VoIP phones or call answering
- Text messaging (SMS) — not available today

**Alternatives to / compared with:** Weave, NexHealth, RevenueWell, Solutionreach, Adit, Dental Intelligence, Podium, Tebra (PatientPop)

<!-- listing-kit:end -->

---

## 6. What to publish next

The blog is the platform's own posts (the **Platform Blog** entry in the
sidebar, under Content), written and published in the app. Every post is
announced to the search engines within the hour.

The order follows the evidence: pages that state a checkable fact a buyer is
searching for, written from something we know first-hand. Not volume.

| # | Page | The search it answers | Why us |
|---|---|---|---|
| 1 | What dental front-office software actually costs in 2026 | "{vendor} pricing", "dental software cost" | Five of eight rivals publish nothing. We read all eight sites on stated dates and can say exactly what each one shows |
| 2 | Which dental software vendors publish their price, and which make you call | "dental software pricing transparent" | Same first-hand read. A table nobody else has a reason to publish |
| 3 | Month-to-month or annual: the contract terms of eight dental software vendors | "{vendor} contract", "cancel {vendor}" | Each answer quoted from the vendor's own page, with the date |
| 4 | What a dental practice website should cost, and what you get | "dental website cost" | We sell one inside a flat price and can show the arithmetic |
| 5 | Asking every patient for a review, the same way: what the FTC rule allows | "dental reviews FTC", "review gating dental" | The product was built around the rule |
| 6 | A patient portal patients will actually use | "dental patient portal" | The portal research already written up in the launch post |
| 7 | Switching your practice management system: what it really costs | "switch dental PMS" | The reason the product wraps a PMS instead of replacing one |
| 8 | What we do not do, and who does it better | "DreamCRM dental" | The page that settles the name. Nobody else in the category publishes one |

Three rules for every one of them: the word "dental" beside the product name;
no claim about a competitor that is not on its own site with a date; and no
ranking of ourselves. I can draft any of these for you to read and publish.

Each month, re-read the eight competitor pages. Their `pricingChecked` dates
are on the comparison pages for everyone to see, and a stale one is worse than
none.

---

## 7. When paid ads begin

Your ruling says ads come after the organic tactics are exhausted. That needs
a definition, or it never arrives. **This is a proposal — change it.**

Organic is exhausted, and `docs/ads-go-live.md` comes off the shelf, when all
of these are true:

1. Steps 0 to 3 and step 5 are done.
2. Search Console shows the marketing pages indexed, and Bing does too.
3. The G2 profile has at least five reviews from real practices.
4. The first four pages in Part 6 are published.
5. Two monthly checks in a row show organic signups no longer rising.

Until then the campaign in `docs/ads-go-live.md` costs nothing to keep. It is
generated from the same registry, so it stays current by itself.

---

## 8. Waiting on a ruling

Each of these is yours, not mine (the rulebook's owner-only list: pricing,
anything sent to customers, external communications).

| # | Question | Why it matters here |
|---|---|---|
| 1 | **"Regularly $500"** — may the struck-through price be advertised? | It sits in the home and pricing page descriptions, the text a search result or an assistant lifts first. The listing kit leaves it out until you say |
| 2 | **Open Dental in our copy** — the site says the sync is the "sanctioned path" | Open Dental publicly advises against NexHealth products that claim to integrate with it. The kit and `/about` leave Open Dental out. **The sharpest instance is live:** the blog post `/blog/why-we-wrap-your-pms` says "DreamCRM talks to Open Dental exclusively through its sanctioned API" (read on the live site, 2026-11-24), while the direct Open Dental path was removed on 2026-08-19 and the sync runs through NexHealth. That sentence reads as untrue today. It is a published post, so it was not edited — say how you want the connection described and it is one correction |
| 3 | **"Nobody else ships"** and similar | An unprovable claim about competitors. The comparison pages were just cleaned of several |
| 4 | **Where a clinic's site really lives** (`NEXT_PUBLIC_SITE_USE_SUBDOMAIN`) | Clinic pages declare their address on the marketing domain. Until this is settled, clinic sites cannot be announced to the search engines and the Search Console baseline mixes them with ours |
| 5 | **Your name on `/about`** | The page exists and says "Dream Create, in Ward, Arkansas". A named founder is a stronger answer to "which DreamCRM is this?", and the Privacy Policy already names you — but a marketing page is a different thing to put a name on. One line to add if you say yes |
| 6 | **An email to a signup who stops at the card step** | Not built — it is a new message to customers |

---

## 9. Keeping it true

- **The price or the trial changes** → the listing-kit test fails and names
  this file. Regenerate the block (the command is in the test), then correct
  every outside profile.
- **A competitor changes its site** → re-read it, update its entry in
  `lib/marketing/comparisons.ts` with the new date, and the page, the sitemap
  and the search notice follow.
- **A new comparison is added without a read** → it shows no date, gets no ad,
  and is still listed. `tests/marketing/unchecked-comparison.test.tsx` holds
  that on a planted entry.
- **The notices stop** → the card on the Search Console page says so, and the
  hourly job answers 500 when it cannot read. A refusal by the engines is on
  the card with the reason.
- **Changing the IndexNow key** → one line in `lib/indexnow.ts`. The middleware
  serves whatever it says. The record of what was announced survives a key
  change.
