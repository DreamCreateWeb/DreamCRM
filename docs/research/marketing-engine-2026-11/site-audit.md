# Marketing-site audit — www.dreamcreatestudio.com, measured 2026-11-23

Outside-in: every figure below was read off the LIVE site on 2026-11-23 (build
`mwcxbe8n`) with a crawler over the sitemap, mobile Lighthouse 12, and direct
header probes — not inferred from the code. Lab numbers ran through this
session's egress proxy, so absolute timings are indicative; the structural
findings are exact. "Fixed" means fixed on branch `claude/charming-newton-qn2k4p`
in the same session, not yet merged.

## What was measured

- 57 URLs in `sitemap.xml`, all 200, all server-rendered (the full copy is in
  the raw HTML — AI fetchers and search crawlers that do not run JavaScript see
  everything).
- No third-party tag anywhere: the code carries no analytics or ad pixel, and
  every network request the homepage made was first-party.
- `robots.txt` allows every crawler, AI crawlers included; the token landings
  and app routes are disallowed.
- Redirects: `http → https` 301, apex and `app.` → `www` 308, trailing slash →
  308. One two-hop chain (`http://dreamcreatestudio.com/x` → `https://dreamcreatestudio.com:443/x` → `www`).
- HSTS with preload; gzip; `X-Frame-Options: SAMEORIGIN`.

## Lighthouse, mobile (simulated slow 4G)

| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS | Weight |
|---|---|---|---|---|---|---|---|---|
| `/` | 87 | 96 | 100 | 100 | 3.5 s | 160 ms | 0 | 613 KiB |
| `/pricing` | 93 | 100 | 100 | 100 | 2.9 s | 20 ms | 0.006 | 497 KiB |

Both LCP figures sit above the 2.5 s "good" line in the lab. The contributors:
the 58 KiB render-blocking stylesheet (≈0.8–1.1 s estimated by Lighthouse); two
Geist font files (≈140 KiB) preloaded by the root layout on pages that read
Inter; and, on the homepage, 3.5 s of main-thread work over a 1,620-element
document whose largest paint is the hero paragraph (≈0.6 s of element render
delay). Server time is NOT one of them: time-to-first-byte for `/` and for the
prerendered `/pricing` measured the same (0.12–0.45 s over five alternating
requests, proxy latency included).

## Findings

### Fixed on the branch

1. **The header menu's links were not in the HTML.** The three dropdowns were
   mounted on hover, so the server document carried five nav links and none of
   the 23 behind them. Link graph: `/resources` had 3 inbound pages on the
   whole site; the grader, the calculator and four comparisons were reachable
   only from the footer or a hub.
2. **No canonical on the homepage or the grader; no `og:url` / `og:type` /
   `og:site_name` on any page except blog posts.** The site answers on three
   hosts and ad landings will carry `utm_*` and click-id query strings.
3. **The homepage meta description was 290 characters** with the price and the
   trial as its last clause — the part a result page truncates.
4. **Every sitemap `lastmod` was the time of the request.** All 57 pages
   "modified" on every fetch.
5. **Fifteen help articles had exactly one inbound link** (the docs index):
   "More in this category" always listed the first three articles.
6. **Four pages were titled with a section name and the brand** ("Pricing —
   DreamCRM", "Platform tour — DreamCRM", "Blog — DreamCRM", "Help docs —
   DreamCRM"), and the comparison hub with "Compare DreamCRM to the
   alternatives" — nothing a searcher could tell the subject from, on a brand
   name other products share.
7. **One help article's search snippet contradicted its own first paragraph.**
   `/docs/requesting-a-pms-integration` showed "Run Dentrix, Eaglesoft, or
   Curve? Raise your hand and we'll notify you when it's ready" while the
   article opens by saying those systems connect today.
8. **The Resources dropdown ran off the right edge of the window** on any
   screen narrower than about 1,304px, and the page scrolled sideways while it
   was open. Measured in a browser with the menu open, before and after:

   | Window | Before (panel left–right) | After |
   |---|---|---|
   | 1024 | 671–1215, clipped 191px | 236–780 |
   | 1152 | 695–1239, clipped 87px | 259–803 |
   | 1280 | 759–1303, clipped 23px | 323–867 |
   | 1366 | 802–1346 | 366–910 |

   It is the menu that holds the grader, the calculator and the growth
   library, and its right-hand column was the part cut off. No check at rest
   could see it: a closed panel is not laid out.
9. **Three comparison pages trailed the vendors' own sites.**
   - *Weave* said "reported ~$249–$449/mo … annual agreements … scheduling
     gated to Elite". Weave's own site reads: base plan $199/mo;
     Coordinate bundle $149/mo (online scheduling, forms, reminders, recall);
     Attract bundle $149/mo (reviews, email marketing, bulk texting); "we
     don't require any long-term contracts"; no free trial of the full
     platform; purchase is "Checkout and demo". Read at getweave.com/plans and
     /pricing.
   - *Solutionreach* said "reported ~$329/mo". Its pricing page reads "Pricing
     starts at $199", every package "Request a Quote", and "We offer yearly
     contract options". Read at solutionreach.com/pricing.
   - *NexHealth* said "custom quotes; terms vary". Its pricing page shows no
     price, offers a month-to-month option, and says annual plans are paid up
     front with 90 days' notice not to renew and no cancellation fees. Read at
     nexhealth.com/pricing.

   All three read on 2026-11-23. The other five entries (RevenueWell, Adit,
   Dental Intelligence, Podium, Tebra) were not re-read.

### Open — needs an owner decision or a separate slice

10. **No Privacy Policy and no Terms page on www** (`/privacy`, `/terms` → 404)
   while the grader, the partner form and signup collect email addresses.
   Blocks: ad-platform lead forms and audience features, review-marketplace
   listings, and it is the first thing a careful office manager looks for.
11. **"Regularly $500"** appears in the homepage description, the pricing page
   and the price card. No practice has been charged $500. The FTC's
   former-price guide (16 CFR 233.1) defines a former price as one actually
   offered "on a regular basis for a reasonably substantial period of time".
   Pricing presentation is an owner ruling; nothing was changed.
12. **Clinic sites answer at three addresses and canonicalise to the one that
   redirects.** `https://{slug}.dreamcreatestudio.com/…` and
   `https://www.dreamcreatestudio.com/site/{slug}/…` both return 200, and both
   declare `rel=canonical` (and `og:url`, sitemap, JSON-LD `@id`) as
   `https://dreamcreatestudio.com/site/{slug}` — the apex, which 308s to `www`.
   Cause: `publicSiteUrl()` uses the subdomain form only when
   `NEXT_PUBLIC_SITE_USE_SUBDOMAIN=true`, and nothing in the deploy sets it.
   Effect: every practice without a custom domain is consolidated INTO the
   marketing host's index under `/site/…`, behind a redirecting canonical.
13. **The demo practice is indexable.** `acme-dental-demo` carries no `noindex`,
    and publishes `Dentist` structured data for a practice that does not exist
    (Austin address, a 555 number, an `.example` email, a stock logo URL).
14. **A help article describes the PMS connection in terms the bridge may not
    meet.** `/docs/requesting-a-pms-integration` says integrations go through
    "the vendor's sanctioned path … not a database scraper". Open Dental's own
    vendor page says of the bridge we ride: "NexHealth is not partnered with or
    associated with Open Dental in any way" (entry dated 06/05/2026, per the
    research thread). How to describe the bridge truthfully is a ruling, not a
    copy edit; nothing was changed.
15. **"A shop and membership plans nobody else ships"** (`/product`) is an
    absolute claim; membership-plan software exists as a category.
16. **The homepage is the one marketing page rendered per request**
    (`force-dynamic`, to redirect signed-in visitors), so it is served
    `Cache-Control: no-store` and cannot enter the browser's back/forward
    cache or be cached at an edge. It is not measurably slower to respond
    today; this is headroom, not a defect.
17. **Ad measurement cannot round-trip yet.** First-party attribution records
    THAT a Google or Meta click id was present, not its value, so a trial or a
    paid conversion cannot be reported back to an ad platform. Microsoft Ads
    clicks have no channel of their own (`utm_source=bing` classifies as
    `google_ads`).
18. **Thin spots in the content graph.** Three blog posts; eight comparison
    pages (none for the AI-receptionist vendors or the website agencies); no
    About, Contact or security/trust page; one share image for every page.
19. **Accessibility, minor.** Lighthouse flags the logo link's accessible name
    not containing its visible text ("Dream Create — home" vs the wordmark),
    and contrast on sub-12px text inside the homepage's decorative dashboard
    mock.
