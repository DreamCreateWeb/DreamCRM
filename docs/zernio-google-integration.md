# Zernio × Google Business integration — plan

**Status: PHASE 1 (Google Business core) COMPLETE + PHASE 2 (GBP posting)
COMPLETE + PHASE 3 PR1 (billing + entitlements foundation) COMPLETE
(2026-06-15).** Foundation + reviews/AggregateRating + hours/address/phone/photos
sync + GBP local metrics into SEO + Analytics + **GBP posting (Updates / Offers /
Events composer + CTA + image + history)** are all live, and the **social-module
billing model is now FINALIZED + shipped** (PR1): per-plan social-connection
entitlements + a flat per-tier Stripe add-on, and **Google Business is now free
on every plan tier** (relaxed from Premium-only). Phase 3 PRs 2–4 (the social
UI itself) are next. Real-time review ingest via Zernio webhooks is the
recommended near-term add.

## Social-module billing — DECIDED (was "pending"), shipped in Phase 3 PR1

| Plan | GBP | Free social | Social add-on | Social limit (base → with add-on) |
|---|---|---|---|---|
| Basic ($99) | ✓ all plans | 0 | **not available** (upgrade to Pro) | 0 |
| Pro ($149) | ✓ | 1 | **$30/mo** | 1 → **3** |
| Premium ($199) | ✓ | 2 | **$20/mo** | 2 → **5** |

- **Google Business is FREE + SEPARATE on every tier** — it does NOT count
  toward the social limit and is never blocked (owner/admin role still required).
  "Total connections including GBP" = social limit + 1 → Basic 1, Pro 2/4,
  Premium 3/6.
- The add-on is a **flat per-tier SKU that raises the cap** (NOT metered per
  connection). Annual-plan clinics get an annual add-on (10× monthly = 2 months
  free) matching their interval.
- Entitlement math: `lib/types/social-entitlements.ts`
  (`socialConnectionLimit` / `socialAddonAvailable` / `socialAddonPriceCents`).
  Source of truth: `clinic_profile.social_addon` (migration 0067), kept in sync
  by the Stripe webhook (detects the add-on price among the subscription items;
  reconciles on plan change). Purchase/cancel + the cap helper
  `canConnectSocialPlatform` live in `lib/services/social-billing.ts`. Self-serve
  buy/cancel on Settings → Billing ("Social connections" card).
- **Out-of-band Stripe setup (do once, then redeploy):** create two Products
  with monthly + annual recurring prices — "Social connections — Pro" ($30/mo +
  $300/yr) and "Social connections — Premium" ($20/mo + $200/yr) — and set the 4
  price ids in `dreamcrm/app-secrets`: `STRIPE_PRICE_SOCIAL_ADDON_PRO`,
  `STRIPE_PRICE_SOCIAL_ADDON_PRO_ANNUAL`, `STRIPE_PRICE_SOCIAL_ADDON_PREMIUM`,
  `STRIPE_PRICE_SOCIAL_ADDON_PREMIUM_ANNUAL`. Until they're set, the add-on CTA
  degrades to a disabled "coming soon" (everything else still works keyless).

- **GBP posting (Phase 2 — this PR):** ✅ **DONE.** A polished **Google Posts**
  surface (`/google-posts`, premium + owner/admin, Growth sidebar group) lets a
  clinic publish GBP posts — **Updates / Offers / Events** with a CTA button + an
  image — and keeps a post history. Composer: post-type selector, a live char
  counter to 1,500, image upload via the shared XHR helper (→ public S3 URL
  passed to Zernio), a CTA picker (Book defaults to the clinic's `/book` via
  `publicSiteUrl`), offer fields (coupon / redeem URL / terms) when type=offer,
  event fields (title / start / end) when type=event, "Post to Google" +
  "Schedule" (Zernio publishes scheduled posts itself — NO publish cron on our
  side). Client wrappers `createGbpPost` / `listPosts` / `deletePost` +
  `buildGbpPostOptions` (`lib/zernio.ts`, defensive serialize/parse); service
  `lib/services/gbp-posts.ts` (`createGbpPost` validates + persists-first +
  best-effort publish — NEVER throws, failure → `status='failed'`+`lastError`;
  **demo-safe** — isDemo persists a published row w/ a synthetic id + fake
  permalink, never networks; `listGbpPosts`; `deleteGbpPost` best-effort at
  Zernio + always drops the local row; `seedDemoGbpPosts`). Schema `gbp_post`
  (**migration 0066**) — type/summary/imageUrl/CTA/event/offer/status/scheduled
  +published timestamps/googleUrl/lastError/isDemo. **HONESTY:** Google
  DEPRECATED per-post insights, so the history shows publish STATUS + a "View on
  Google" permalink — never fabricated per-post metrics (the page points to /seo
  for location-level performance). Disconnected → connect-prompt to
  `/integrations`; connected + no posts → "Write your first Google post."
  EmptyState. Demo seeds 3 posts (published Update w/ image + Book CTA, published
  Offer w/ a coupon, scheduled Event). 63 new tests. **Confirmed create-post
  REST shape below.**

Foundation + reviews/AggregateRating + hours/address/phone/photos sync + **GBP
local metrics into SEO + Analytics** are all live. The connection architecture
(foundation), Phase 1's review work, hours/location sync, AND the GBP
local-metrics surface are live:
- **GBP local metrics → SEO + Analytics (this PR):** ✅ **DONE.** Pull the
  clinic's Google Business Performance numbers (impressions / calls / direction
  requests / website clicks / bookings) + top search keywords via Zernio and
  surface them on the **SEO module** (replacing the static "claim your GBP"
  checklist with a real connected-metrics card) and the **Analytics Acquisition
  band** (a "Google Business — local actions" tile beside the GSC clicks→leads
  funnel). Client wrappers `getGoogleBusinessPerformance` +
  `getGoogleBusinessSearchKeywords` (`lib/zernio.ts`, defensive — prefer Zernio's
  pre-summed `total`, fall back to summing the daily `values` series, tolerate a
  missing metric key → 0, fold the four impression sub-series into one figure,
  cap + merge keywords across monthly buckets); service `lib/services/gbp-metrics.ts`
  `getGbpLocalMetrics(orgId,{days})` — **demo-safe** (isDemo → seeded synthetic
  metrics, NEVER the network) + **best-effort** (no connection →
  `{connected:false,…zeros}`; an API failure incl. a 402 "Analytics add-on
  required" → `{connected:true,…zeros,error}`; a keyword-pull failure doesn't
  zero the performance KPIs; never throws so the SEO/Analytics pages always
  render). Reuses the **shared `resolveGbpAccount`** resolver — which this PR
  factored into `lib/services/zernio.ts` (it was duplicated identically in
  `google-reviews.ts` + `gbp-sync.ts`; both now import the one copy). The
  30/90-day Analytics toggle threads through; the SEO card uses a 30-day window.
  **NO new migration** — a live pull per page load, exactly like
  `getClinicSeoPerformance` (no rollup/cache table; simplest + consistent with
  GSC). Demo: the metrics are a live compute returned whenever the org's Zernio
  connection is `isDemo` (seeded by `seedDemoZernio`), so `seedDemoGbpMetrics` is
  a documented no-op hook — `getGbpLocalMetrics` returns ~4,120 impressions /
  38 calls / 52 directions / 96 website clicks / 11 bookings per 30 days (scaled
  to the window) + 5–8 dental top keywords ("dentist near me", "teeth whitening
  austin", …). 30 new tests. **Confirmed performance + search-keywords REST
  shapes below.**
- **Hours / Location sync:** ✅ **DONE.** Pull the clinic's verified
  hours/address/phone/photos from their connected GBP into `clinic_profile`,
  with per-field `*_source` flags so a sync never silently clobbers a manual
  edit. Client wrappers `getGoogleBusinessLocation` + `listGoogleBusinessMedia`
- **Hours / Location sync (this PR):** ✅ **DONE.** Pull the clinic's verified
  hours/address/phone/photos from their connected GBP into `clinic_profile`,
  with per-field `*_source` flags so a sync never silently clobbers a manual
  edit. Client wrappers `getGoogleBusinessLocation` + `listGoogleBusinessMedia`
  (`lib/zernio.ts`, defensive — Google enum days + HH:MM/`{hours,minutes}` times
  + `{location}`/`{data}` wrappers tolerated); schema columns
  `clinic_profile.{hours,address,phone}_source` (text DEFAULT `'manual'`) +
  `google_synced_at` + `google_photos` (**migration 0065**); service
  `lib/services/gbp-sync.ts` — `syncGoogleBusinessProfile(orgId,{force?})`
  (SAFETY INVARIANT: auto/background sync only overwrites `'google'` fields,
  reports `skippedManual`; explicit `force` may overwrite a manual field + flips
  its source to `'google'`; demo applies seeded synthetic data with NO network;
  best-effort, never throws), `getGbpSyncState`, `revertFieldToManual`,
  `markFieldSourceManual` (wired into the save actions so editing a field flips
  it back to manual), `importGooglePhotos` (append-only into the curated
  officePhotos — never auto-clobbers), `syncAllGoogleBusinessProfiles` (cron),
  `seedDemoGbpSync`. Pulled hours map into the EXACT existing
  `clinic_profile.hours` jsonb shape (`{ mon:{open,close}, … }`, all 7 day keys,
  HH:MM 24-hour) so booking `getSlotsForDay` + the footer "open today" +
  `clinicJsonLd` consume it UNCHANGED (round-trip test in
  `tests/booking/gbp-synced-hours.test.ts`). UI: a "Sync from Google" card on
  Settings → Clinic profile (premium + owner/admin) — per-field "From Google ·
  synced {date}" vs "You've customized this" indicators, a force-sync button,
  per-field "use Google's version" / "stop syncing", and an import-from-Google
  photo gallery; disconnected → connect-prompt to `/integrations`. Cron
  `app/api/cron/sync-gbp/route.ts` (CRON_SECRET-gated; non-force, respects manual
  flags). Demo seeds the synced state + `google_photos` (one overlapping the
  curated gallery to showcase the "Added" state). Pull-only — NO write-back to
  Google (Zernio limitation). 62 new tests. **Confirmed location + media REST
  shapes below.**
- **Foundation + reviews:** the connection architecture (foundation) and the
  first half of Phase 1's review work are live:
- **Foundation:** the lazy client (`lib/zernio.ts`), client-safe types
  (`lib/types/zernio.ts`), the `zernio_connection` + `zernio_account` schema
  (migration **0063**), the connection service (`lib/services/zernio.ts`), the
  hosted-OAuth connect + callback routes
  (`app/api/integrations/zernio/{connect,callback}/route.ts`), and the
  **Google Business Profile card** on `/integrations`. Demo seeds a synthetic
  connected GBP (isDemo, no network).
- **Reviews + JSON-LD (this PR):** ✅ **DONE.** Review client wrappers
  (`listGoogleReviews` / `replyToGoogleReview` / `deleteGoogleReviewReply` in
  `lib/zernio.ts`); the `google_review` table (migration **0064**, idempotent
  upsert by `(organizationId, externalReviewId)`); the service
  `lib/services/google-reviews.ts` (`syncGoogleReviews` — demo-safe + best-
  effort + paginated; `listGoogleReviews`; `getGoogleReviewStats`;
  `replyToGoogleReview` / `deleteGoogleReviewReply` — network + demo-local;
  `syncAllGoogleReviews` for the cron); a **legit `AggregateRating`** in
  `clinicJsonLd` sourced ONLY from real synced Google reviews (omitted at zero,
  never fabricated); the **Reviews UI refactor** (a "From Google" section on
  `/reviews/received` with reply / edit-reply / delete-reply + "Refresh from
  Google" + a Connect-prompt empty state, plus Google rating/count/needs-reply
  KPIs on `/reviews`); the cron route
  `app/api/cron/sync-google-reviews/route.ts` (CRON_SECRET-gated, hourly);
  demo seed `seedDemoGoogleReviews` (~6 synthetic reviews, varied ratings incl.
  a 4★ + a rating-only review + replied/unreplied). The hand-pasted
  `clinic_review_config.googlePlaceId` is superseded by the auto-resolved Zernio
  GBP connection (the column stays as a deprecated fallback — not deleted).
What's NOT built yet (Phase 1 IS complete): **GBP posting** (Phase 2 — create
posts/offers/events to the listing from a composer + per-post performance), the
**full social module** (Phase 3), and **real-time review ingest via Zernio
webhooks** (`review.new` / `review.updated` events exist — a parallel review-side
add that lands reviews instantly instead of waiting for the hourly cron) — those
are the next PRs per the phased roadmap below.

## Confirmed review REST shapes (validated against docs.zernio.com llms.txt + OpenAPI probe, 2026-06-15)
- **`GET /v1/google-business/gmb-reviews`** — list a GBP account's reviews
  ("ratings, comments, and owner replies; use nextPageToken for pagination").
  Query params: **`accountId`** (the connected GBP account — required),
  `locationId`, `pageSize`, `pageToken`. Review object fields we parse:
  **`id`** (review id), **`starRating`** (numeric in Zernio's schema — but we
  normalize DEFENSIVELY, also accepting Google's historical enum strings
  `ONE`…`FIVE` and a webhook-style `rating`, always landing an integer 1–5 or
  null), **`comment`** (text; also accept `text`; nullable — Google allows
  rating-only), **`reviewer.displayName`** + **`reviewer.profilePhotoUrl`**
  (also accept `reviewer.name` / `reviewer.profileImage`), **`createTime`** +
  **`updateTime`** (also `createdAt`/`updatedAt`), and the owner reply
  **`reviewReply.comment`** + **`reviewReply.updateTime`** (also `reply.text` /
  `reply.createdAt`/`updatedAt`). Response array key tolerated as `reviews` /
  `data` / a bare array; `nextPageToken` paged (capped at 10 pages/run).
- **`POST /v1/google-business/gmb-reviews/{reviewId}/reply`** — post/overwrite
  the owner reply (PUT semantics on Google's side; a second call overwrites).
  Body field **`comment`**; **`accountId`** in the query. Review id is
  URL-encoded (Google ids can be path-like).
- **`DELETE /v1/google-business/gmb-reviews/{reviewId}/reply`** — remove the
  owner reply (the review stays). **`accountId`** in the query.
- **Assumption noted:** the rendered `.mdx` review pages are JS-only, so the
  per-field detail came from the `llms.txt` endpoint descriptions + the raw
  OpenAPI probe (which reported `starRating` "numeric" + a webhook
  `ReviewWebhookReview` with `rating`/`text`/`reviewer.name`/`reviewer.
  profileImage`/`reply.text`). To be safe across the doc/version split, the
  normalizer (`lib/zernio.ts::normalizeReview` + `normalizeStarRating`) handles
  BOTH numeric and enum ratings and BOTH field-name shapes — so a future Zernio
  schema change on either won't strand the integration.

## Confirmed location + media REST shapes (this PR — docs.zernio.com llms.txt + OpenAPI probe, 2026-06-15)
- **`GET /v1/google-business/location-details?accountId=…[&locationId=…]`** —
  the clinic's verified GBP location ("Returns detailed GBP location info —
  hours, description, phone, website, categories, services"). Query params:
  **`accountId`** (the connected GBP account — required), `locationId` (optional;
  Zernio uses the account's selected location when omitted). Response follows
  Google's Business Profile `locations.get` shape, parsed defensively:
  - **`regularHours.periods[]`** = `{ openDay, closeDay, openTime, closeTime }`.
    `openDay`/`closeDay` are Google day enums (`MONDAY`…`SUNDAY`). `openTime`/
    `closeTime` are **"HH:MM" 24-hour strings** in Google's newer schema; the
    older schema nested `{ hours, minutes }` objects — `normalizeGbpTime`
    tolerates BOTH (and maps the `"24:00"` end-of-day marker → `"23:59"`).
  - **`storefrontAddress`** = `{ addressLines[], locality, administrativeArea,
    postalCode, regionCode }` → `addressLine1`/`addressLine2` (lines[0] / joined
    rest), `city`, `state`, `postalCode`, `country` (defaults `US`).
  - **`phoneNumbers.primaryPhone`** (older schema: a top-level `primaryPhone` —
    both tolerated).
  - **`categories.primaryCategory.displayName`** + `additionalCategories[]`
    (captured for future SEO/metadata; not written to a column yet).
  - Some integrations wrap the object under `{ location: {...} }` /
    `{ data: {...} }`; the normalizer reaches through either.
- **`GET /v1/google-business/media?accountId=…[&locationId=…]`** — the location's
  media items (photos). Each item carries **`googleUrl`** (a usable image URL) /
  **`sourceUrl`** (the original), **`mediaFormat`** (`PHOTO`|`VIDEO` — VIDEO
  filtered out), and **`locationAssociation.category`** (`EXTERIOR`/`INTERIOR`/
  `PROFILE`/…). We prefer `googleUrl`, fall back to `sourceUrl`/`thumbnailUrl`.
  Response array key tolerated as `mediaItems` / `media` / `data` / a bare array.
- **Assumption noted (path):** the rendered `.mdx` pages are JS-only, so the
  exact path read AMBIGUOUSLY across probes — the named-resource form
  (`/google-business/get-google-business-location-details` / `…-media`), a flat
  form (`/google-business/location-details` / `…/media`), and an account-scoped
  form (`/accounts/{accountId}/google-business-location-details`). We follow the
  **shipped reviews precedent** — the flat `/google-business/<resource>`
  namespace with `accountId` as a query param, proven to work for `gmb-reviews`
  — and name the resources `location-details` + `media`. EVERY response field is
  parsed defensively (`normalizeLocation` / `normalizeMediaItem` /
  `normalizeGbpTime` in `lib/zernio.ts`), so a docs/version drift on either the
  path or the field shapes won't strand the integration. If a real connected
  office reveals a different path at build time, only the two `zernioFetch` URLs
  in the wrappers need adjusting — the mapper + service + UI are path-agnostic.
- **LIMITATION (unchanged):** Zernio exposes **no** endpoint to WRITE
  hours/address back to Google. The sync is one-directional Google → Dream
  Create. True write-back needs Google's native Business Profile API (separate
  heavy OAuth + verification) — a possible later phase, out of Zernio's scope.

## Confirmed performance + search-keywords REST shapes (this PR — docs.zernio.com llms-full.txt + OpenAPI probe, 2026-06-15)
These pages WERE readable (unlike the JS-only reviews/location `.mdx` — the
`llms-full.txt` carried the full per-endpoint spec + Node/Python/curl examples),
so the paths + params + response shapes are **confirmed**, not assumed.
- **`GET /v1/analytics/googlebusiness/performance`** — "daily performance metrics
  for a Google Business Profile location." **Path note:** the REST path is the
  flat `/analytics/googlebusiness/<resource>` form (proven by the docs' curl
  example: `…/api/v1/analytics/googlebusiness/performance?accountId=…&startDate=…&endDate=…`),
  NOT the named doc-page slug `/analytics/get-google-business-performance` (which
  is just the docs URL). Query params:
  - **`accountId`** (required) — the Zernio SocialAccount id for the GBP account.
  - **`metrics`** (optional) — comma-separated metric names; defaults to all. We
    send the explicit CSV (`GBP_PERFORMANCE_METRICS`).
  - **`startDate`** / **`endDate`** (optional, `YYYY-MM-DD`) — default 30-days-ago
    → today; max 18 months back. Our client derives the range from a `{ days }`
    count (ending today) or takes explicit dates.
  - Requires the Analytics add-on (included on Zernio's usage-based plans). A
    legacy plan without it returns **402** `{error:'Analytics add-on required',
    code:'analytics_addon_required'}` — surfaced as the thrown status+body; the
    service catches it and renders zeros + the error string (best-effort).
  - **Response:** `{ success, accountId, platform, dateRange:{startDate,endDate},
    dataDelay, metrics: { <METRIC_KEY>: { total, values:[…] } } }`. Each metric
    carries a **pre-summed `total`** PLUS a daily time series. We prefer `total`
    and fall back to summing `values` (each `{date,value}` OR a bare number)
    DEFENSIVELY; a missing metric key → 0.
  - **Metric keys** (Google's Business Profile Performance API names):
    `BUSINESS_IMPRESSIONS_DESKTOP_MAPS`, `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH`,
    `BUSINESS_IMPRESSIONS_MOBILE_MAPS`, `BUSINESS_IMPRESSIONS_MOBILE_SEARCH`
    (the four are summed into one **impressions** figure), `CALL_CLICKS` (calls),
    `WEBSITE_CLICKS`, `BUSINESS_DIRECTION_REQUESTS` (directions),
    `BUSINESS_BOOKINGS` (bookings), `BUSINESS_CONVERSATIONS`, plus
    `BUSINESS_FOOD_ORDERS` / `BUSINESS_FOOD_MENU_CLICKS` (irrelevant to dental —
    not read). Data lags 2-3 days. Some integrations wrap the payload under
    `{ data: { metrics } }`; the parser reaches through either.
- **`GET /v1/analytics/googlebusiness/search-keywords`** — "search keywords that
  triggered impressions, aggregated MONTHLY; keywords below a Google-enforced
  minimum-impression threshold are excluded; max 18 months." Query params:
  **`accountId`** (required), **`startMonth`** / **`endMonth`** (optional,
  `YYYY-MM`; default 3-months-ago → current month). Our client maps a `{ days }`
  window to a covering month span (keywords are monthly-only). **Response:**
  `{ success, accountId, platform, monthRange, keywords: [{ keyword, impressions }],
  note }`. We normalize `{ keyword → term, impressions → count }` (also tolerate
  `searchKeyword` / `value` / `impressionsValue` aliases + a `{ data:{keywords} }`
  wrapper), MERGE a term across monthly buckets (summing impressions),
  impression-sort, and cap (default 8). Same 402 add-on gate as performance.
- **Assumption noted:** none material — both endpoints' paths, params, and
  response shapes are quoted verbatim from the live docs. The ONLY defensive
  hedges are (a) the `{ data: { … } }` wrapper tolerance and (b) the keyword
  field-name aliases, kept so a future schema tweak can't strand the surface.
  The performance `total` is pre-summed by Zernio, but we still sum `values` as a
  fallback in case a metric ever omits `total`.
- **No write-back here** — these are pull-only analytics reads. Per-POST GBP
  analytics are deprecated by Google with no replacement (Zernio's docs say so
  explicitly); the location-level Performance API above is the only GBP
  engagement signal. Phase 2 posting will surface what it can per post, but
  per-post views/clicks no longer exist on Google's side.

## Confirmed create-post REST shape (Phase 2 — docs.zernio.com llms.txt + llms-full.txt + OpenAPI probe, 2026-06-15)
The GENERIC post primitives are **confirmed** from the docs; the GBP-specific
options object is documented in prose only (the rendered `.mdx` API-reference
pages are JS-only, like the reviews/location pages were), so it is coded to the
documented/precedent shape and serialized/parsed DEFENSIVELY.
- **`POST /v1/posts`** — create (publish-now OR schedule). **Confirmed body
  fields:** `profileId` (required, the clinic's Zernio profile), the post text
  (the generic docs use **`content`**; some examples **`text`** — we send BOTH,
  the server ignores the unknown one), the target accounts (**`socialAccountIds:
  string[]`** AND the confirmed **`platforms: [{ platform, accountId }]`** array —
  we send both), **`scheduledAt`** / **`scheduledFor`** (ISO 8601 — Zernio
  PUBLISHES scheduled posts itself, so we run **NO** publish cron), **`mediaUrls`**
  (a public image URL — documented as comma-separated; we send a single URL string
  + a 1-element `media` array for tolerance; GBP allows ONE photo per post),
  **`publishNow: true`** when not scheduling. **GBP options** (prose-documented;
  Google's GBP post model): we attach them under several tolerant keys
  (`options` / `googleBusiness` / `platformOptions.googlebusiness`) so whichever
  Zernio reads wins, with: **`topicType`** (`STANDARD` | `EVENT` | `OFFER`),
  **`callToAction`** (`{ actionType, url }`; action types `LEARN_MORE` / `BOOK` /
  `ORDER` / `SHOP` / `SIGN_UP` / `CALL` — CALL omits `url`, it uses the listing
  phone), **`event`** (`{ title, schedule: { startDate, endDate } }`),
  **`offer`** (`{ couponCode, redeemOnlineUrl, termsConditions }`). The create
  response is parsed for the new post id (`_id`/`id`/`postId`, under a `post`/
  `data` wrapper or at the root) + any live permalink (`permalink`/`searchUrl`/
  `url`, flat or per-account under `results`/`accounts`/`platforms`). See
  `lib/zernio.ts::createGbpPost` + `buildGbpPostOptions`.
- **`GET /v1/posts?page&limit[&status]`** — list posts (newest first; `status` ∈
  `draft` | `scheduled` | `published` | `failed`; post id is `_id`). Tolerated
  array keys `posts` / `data` / a bare array. We primarily track posts in our own
  `gbp_post` table (so the history view never depends on this), but expose the
  wrapper for an optional status reconcile + tests. See `lib/zernio.ts::listPosts`.
- **`DELETE /v1/posts/{postId}`** — delete a post at Zernio (removes a scheduled
  post before it runs, or the published GBP post). Best-effort at the service
  layer (always drops our local row). See `lib/zernio.ts::deletePost`.
- **Assumption noted:** the generic body + list/delete paths are confirmed from
  the docs (`POST/GET /v1/posts`, `DELETE /v1/posts/{id}`, `profileId` /
  `socialAccountIds` / `platforms` / `content` / `scheduledAt` / `mediaUrls` /
  `publishNow`). The GBP `options` field names (`topicType`, `callToAction`,
  `event.schedule`, `offer.*`) follow Google's Business Profile post model (the
  shape Zernio proxies) and are documented in prose, not the JS-only `.mdx`
  schema — so they're SENT under multiple tolerant keys + the create result is
  parsed defensively. If a real connected office reveals a different options key
  at build time, only `buildGbpPostOptions` + the create-body assembly in
  `createGbpPost` need adjusting — the service, schema, and UI are shape-agnostic.
- **No per-post metrics:** Google DEPRECATED per-post insights with no
  replacement (the docs say so explicitly). The history surfaces publish STATUS
  + a permalink, NOT fabricated per-post numbers; location-level performance
  (impressions/calls/directions) lives on `/seo` via `gbp-metrics.ts`.

## Confirmed connection REST shapes (validated against the live OpenAPI spec, 2026-06-15)
- **`GET /v1/connect/{platform}`** — the connect query param is **`redirect_url`**
  (snake_case), and **`profileId` is REQUIRED**. Response `{ authUrl, state }`.
  In standard (hosted) mode Zernio shows its own account-picker UI, then
  redirects to `redirect_url` with **`?connected={platform}&profileId=X&
  accountId=Y&username=Z`** appended (so `redirectUrl` IS supported — we pass
  `${APP_URL}/api/integrations/zernio/callback`). A `headless=true` mode also
  exists (raw OAuth data for a custom UI) — not used. The platform enum slug for
  Google Business is **`googlebusiness`**; the connect enum uses `twitter` for X
  (we translate `x → twitter` at the boundary). Because the `state`'s default
  return is Zernio's own dashboard, the UI also re-syncs on window focus + a
  Refresh button, so a connection completing on Zernio's side is still detected.
- **`GET /v1/accounts`** → `{ accounts: SocialAccount[], hasAnalyticsAccess:
  boolean }`. Accepts optional `?profileId=` (+ `platform`, `status`, `page`,
  `limit`) filters. **`SocialAccount`** fields we parse: `_id`, `platform`
  (enum incl. `googlebusiness`), **`profileId` (string OR an embedded `Profile`
  object — normalized to a string)**, `username`, `displayName`,
  `profilePicture` (nullable), `profileUrl`, `isActive`. We parse defensively
  (tolerate any missing field) + re-filter to the org's profile.
- **`GET /v1/profiles`** → `{ profiles: [{ _id, userId, name, isDefault, color,
  … }] }`. **`POST /v1/profiles`** body `{ name, description?, color? }` → 201
  with a **wrapper** `{ message, profile: { _id, … } }` (NOT the bare profile).
- **`DELETE /v1/accounts/{accountId}`** (`deleteAccount`) — used by disconnect
  (best-effort; we always drop our local rows regardless of the API result).

(Original discovery spec preserved below.)

## What's already done
- `ZERNIO_API_KEY` is live: stored in Secrets Manager `dreamcrm/app-secrets`
  and mapped as an App Runner `RuntimeEnvironmentSecrets` entry, so
  `process.env.ZERNIO_API_KEY` resolves in production. (Validated:
  `GET https://zernio.com/api/v1/profiles` → 200; account has a "Default"
  profile, `hasAnalyticsAccess: true`, zero connected accounts.)

## Zernio API fundamentals (validated against docs.zernio.com + live probe)
- **Base URL:** `https://zernio.com/api/v1`. **Auth:** `Authorization: Bearer sk_…`.
- **Object model:** our single API key owns **profiles** (containers) → each
  holds connected **accounts** (a clinic's GBP / Instagram / Facebook / …) →
  **posts** publish to many accounts at once. Optional **queue** = recurring
  auto-schedule slots.
- **Connection = HOSTED OAuth.** We call the connect endpoint with
  `(platform, profileId)`, get back an `authUrl`, redirect the clinic there;
  after they authorize Google, the account auto-links to their profile; we then
  list accounts to get the `accountId`. **We never run Google OAuth or Google's
  API-access verification ourselves** — Zernio holds the GBP API access. This is
  the core unlock (native GBP API access is otherwise a slow Google approval).
- **Webhooks** exist (real-time review notifications referenced); exact event
  payloads still need confirming against `docs.zernio.com/webhooks` at build time.

## Capability map (what we can genuinely use)
**Google Business Profile:**
- READ: location details (hours, address, phone, categories), attributes,
  media/photos, verification status —
  `/google-business/get-google-business-location-details`, `…-attributes`,
  `…-media`, `…-verifications`.
- REVIEWS: fetch real reviews + ratings (`/reviews/list-inbox-reviews`),
  **reply / delete-reply** (List · Reply · Delete Reply). Real-time webhook.
- POSTS: `/posts/create-post` — types Text / Text+Image / Text+CTA / Event /
  Offer; 1,500 chars; 1 image (JPEG/PNG, ≤5 MB, ≥400×300); no video; CTA
  buttons (Learn More / Book / Order / Shop / Sign Up / Call).
- METRICS: `/analytics/get-google-business-performance` (daily impressions,
  clicks, calls, directions, bookings) + `…-search-keywords`.
- Also: manage services / menus / place-actions.
- **LIMITATION (set expectations):** Zernio exposes **no** endpoint to WRITE
  hours/address/core listing fields back to Google. So the sync is asymmetric:
  **Google → Dream Create = full pull** (hours, address, phone, photos,
  reviews); **Dream Create → Google = posts/offers/events + review replies**,
  NOT listing-field edits. True hours/address write-back would require Google's
  **native** Business Profile API (separate heavy OAuth + Google verification) —
  a possible later phase, out of Zernio's scope.

**Beyond Google (for the future social module):** 15 platforms total — Instagram
(Feed/Stories/Reels/Carousels), Facebook (Page posts/Reels/Stories + **reviews**),
TikTok, LinkedIn (incl. Documents/Company pages), YouTube, Pinterest, Threads,
X, WhatsApp, Reddit, Bluesky, Telegram, Snapchat, Discord. Post/schedule +
per-platform analytics; reviews only on **Facebook + Google Business**; DMs on
FB/IG/etc.

## Connection architecture (when built)
- New `zernio_connection` per org: `{ organizationId, zernioProfileId,
  accounts: [{ platform, accountId, username, connectedAt }], status, lastError,
  createdAt, updatedAt }`. (One Zernio profile per clinic org; accounts hang off it.)
- Connect flow: Settings → Integrations (or a new "Channels"/"Social" area) →
  "Connect Google Business" → server creates the org's Zernio profile if absent →
  fetch `authUrl` → redirect → return URL `/…/zernio/callback` → on return, list
  accounts, persist. Mirrors our GSC/Gmail OAuth UX but simpler (Zernio hosts it).
  Connecting GBP requires the clinic to be an owner/manager of their Google
  listing (standard).
- All Zernio calls use the platform `ZERNIO_API_KEY`; per-clinic scoping is via
  their `zernioProfileId` / `accountId`. Wrap in a lazy client `lib/zernio.ts`
  (mirror `lib/stripe.ts` proxy pattern); client-safe types in `lib/types/zernio.ts`.

## Per-module refactor plan
- **Reviews** (`lib/services/reviews.ts`, `app/(default)/reviews/**`): keep the
  first-party "patient writes the review in Dream Create" flow (we own that
  text). ADD a synced **Google reviews** source: pull real reviews+ratings,
  show them on `/reviews/received`, **reply from the dashboard**, feature genuine
  ones on the public site. Replace the hand-pasted `clinic_review_config.googlePlaceId`
  with the Zernio GBP connection (auto-resolved). New `google_review` table (or
  extend) keyed by org + Google review id; idempotent sync via a cron + webhook.
- **JSON-LD** (`lib/services/clinic-site.ts clinicJsonLd`): once real ratings
  exist, emit a **legitimate `AggregateRating`** (we deliberately withheld it —
  see the FTC note) → star rich-snippets. Source the rating from the synced
  Google reviews, never fabricated.
- **SEO** — ✅ **DONE.** The static "claim your GBP" checklist on `/seo` is
  replaced by a real **connect + live GBP local-metrics card** — when connected:
  impressions / calls / directions / website clicks / bookings KPIs + a
  top-search-terms list (honoring the window); when not connected: a calm
  connect-prompt to `/integrations` (honest — no fabricated numbers). The
  existing GSC web-click surface stays intact. Same numbers feed the Analytics
  Acquisition band (a "Google Business — local actions" tile, honoring the 30/90
  toggle). Service `lib/services/gbp-metrics.ts` (`getGbpLocalMetrics`); client
  wrappers in `lib/zernio.ts`; reuses the shared `resolveGbpAccount`. Pull-only,
  demo-safe, best-effort, NO new migration (live pull like the GSC scoped read).
- **Hours / Location** — ✅ **DONE.** A **"Sync from Google"** on
  Settings → Clinic profile pulls verified hours/address/phone/photos into
  `clinic_profile` (`lib/services/gbp-sync.ts`); the public site, booking
  `getSlotsForDay`, footer "open today", and `clinicJsonLd` then ride the
  clinic's real Google data UNCHANGED (the synced hours map into the exact
  existing `clinic_profile.hours` jsonb shape). Per-field `*_source` flags
  (`{hours,address,phone}_source: 'google' | 'manual'`, **migration 0065**) so a
  sync never silently clobbers a manual edit: auto/background sync only
  overwrites `'google'` fields; an explicit force sync may overwrite a manual
  one + flips its source to `'google'`; editing a field via any editor flips it
  back to `'manual'`. Photos land in a separate `google_photos` column + an
  import-from-Google gallery (never auto-clobbers the curated officePhotos). No
  push-back to Google — pull-only (see limitation).
- **NEW Social module**: compose once → publish/schedule to GBP + IG/FB/… with a
  content calendar + per-platform analytics, reusing the same connection. The
  GBP "Book" CTA deep-links the clinic's `/book`.

## Phased roadmap
- **Phase 1 — Google Business core:**
  - ✅ **DONE (foundation):** `lib/zernio.ts` + `zernio_connection` /
    `zernio_account` (migration 0063) + the hosted-OAuth connect flow + the
    `/integrations` Google Business card (connect / refresh / disconnect) +
    demo seed.
  - ✅ **DONE (reviews + JSON-LD):** GBP reviews pulled via
    `GET /v1/google-business/gmb-reviews` into the `google_review` table
    (migration **0064**, idempotent upsert by org + Google review id; cron
    `/api/cron/sync-google-reviews` + on-demand "Refresh from Google"); a
    "From Google" section on `/reviews/received` with **reply / edit-reply /
    delete-reply** + a Connect-prompt empty state; Google rating/count/needs-
    reply KPIs on `/reviews`; a **legitimate `AggregateRating`** in
    `clinicJsonLd` sourced ONLY from the real synced rating (omitted at zero);
    `clinic_review_config.googlePlaceId` superseded by the auto-resolved Zernio
    GBP connection (column kept as a deprecated fallback). Demo seeds ~6
    synthetic reviews. See `lib/services/google-reviews.ts`.
  - ✅ **DONE (hours/location sync):** pull verified hours/address/phone/photos
    into `clinic_profile` with per-field `*_source` flags (**migration 0065**) +
    a "Sync from Google" card; the public site, booking, footer, and JSON-LD
    ride Google's data unchanged. See `lib/services/gbp-sync.ts` +
    `app/(default)/settings/clinic/gbp-sync-card.tsx` + the cron
    `app/api/cron/sync-gbp/route.ts`.
  - ✅ **DONE (local metrics → SEO + Analytics):** GBP Performance API
    (impressions/calls/directions/website-clicks/bookings via
    `GET /v1/analytics/googlebusiness/performance`) + top search keywords
    (`…/search-keywords`) pulled through the Zernio connection into a real
    connect + live-metrics card on `/seo` (replacing the static "claim your GBP"
    checklist) AND the Analytics Acquisition band ("Google Business — local
    actions" tile, honoring the 30/90 toggle). Client wrappers in `lib/zernio.ts`;
    service `lib/services/gbp-metrics.ts` (demo-safe + best-effort + window-aware);
    reuses the shared `resolveGbpAccount` (factored into `lib/services/zernio.ts`
    this PR). NO new migration — a live pull like the GSC scoped read. Demo
    returns synthetic metrics (no network). **→ Phase 1 (Google Business core) is
    now COMPLETE.**
  - ⬜ **Recommended near-term add: real-time review ingest via Zernio webhooks**
    (`review.new` / `review.updated` — confirm the signature scheme + payload at
    `docs.zernio.com/webhooks` at build time) into the existing `google_review`
    upsert, so reviews land instantly instead of waiting for the hourly cron.
- **Phase 2 — GBP posting:** ✅ **DONE.** Create Updates / Offers / Events to
  GBP from a composer (CTA button + image + schedule) with a post history, via
  `POST /v1/posts` through the Zernio connection. Page `/google-posts` (premium +
  owner/admin, Growth group); client wrappers `createGbpPost` / `listPosts` /
  `deletePost` (`lib/zernio.ts`); service `lib/services/gbp-posts.ts` (validate +
  persist-first + best-effort publish, demo-safe, never throws); schema `gbp_post`
  (**migration 0066**). The "Book" CTA deep-links the clinic's `/book` (via
  `publicSiteUrl`). Zernio publishes scheduled posts itself, so NO publish cron.
  HONEST: no per-post metrics (Google deprecated per-post insights — the
  location-level Performance API from Phase 1 is the durable engagement signal,
  surfaced on `/seo`). Demo seeds 3 posts (published Update + image + Book CTA,
  published Offer + coupon, scheduled Event). See `lib/services/gbp-posts.ts` +
  `app/(default)/google-posts/`. **→ Phase 2 (GBP posting) is now COMPLETE.**
- **Phase 3 PR1 (DONE) — billing + entitlements foundation:** the social-module
  billing is now DECIDED + shipped (see the "Social-module billing — DECIDED"
  table above): per-plan social-connection entitlements
  (`lib/types/social-entitlements.ts`), a flat per-tier Stripe add-on
  (`lib/services/social-billing.ts` + the webhook reconcile + the Settings card),
  `clinic_profile.social_addon` (migration 0067), the cap helper
  `canConnectSocialPlatform` (ready for PR2's connect flow), and **Google Business
  relaxed from Premium-only to all plans** (connect/callback routes, integrations
  Zernio actions, Settings GBP-sync actions, `/reviews` Google actions,
  `/google-posts`). The demo (Premium) is seeded with the add-on on (5 social
  slots).
- **Phase 3 PR2 (NEXT) — multi-platform connect:** generalize the
  `/integrations` Google Business card into a cap-aware multi-platform
  **"Channels"** surface (Instagram / Facebook / TikTok / YouTube / LinkedIn),
  gating each new social connection on `canConnectSocialPlatform` (GBP always
  free + uncounted). Then **PR3 — composer/calendar** (multi-platform compose +
  schedule, generalizing the GBP composer) and **PR4 — social analytics +
  Facebook reviews** (folded into the Reviews module alongside Google). Zernio
  bills ~$6 per connected social account; the entitlement caps (2 free on
  Premium, +add-on to 5) keep that cost bounded.

## Open questions to resolve at build time
- Exact webhook event shapes + signature scheme (`docs.zernio.com/webhooks`).
- Whether Zernio's connect flow returns per-platform `authUrl` we redirect to,
  or a JS SDK call — confirm the REST shape for `getConnectUrl`.
- Plan/rate limits on our Zernio tier (pricing page not yet read).
- Demo-mode story: the demo clinic can't connect a real GBP — seed a synthetic
  "Google reviews" sample set behind `isDemo` so the refactored Reviews/SEO
  surfaces still showcase populated (per the no-fake-content rule, demo-only).
- Native Google Business Profile API as a later add for true hours/address
  write-back (separate OAuth + Google verification) — only if clinics ask.
