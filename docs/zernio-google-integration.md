# Zernio × Google Business integration — plan

**Status: FOUNDATION SHIPPED (2026-06-15); Phase 1 features pending.** The
connection architecture is built and live: the lazy client (`lib/zernio.ts`),
client-safe types (`lib/types/zernio.ts`), the `zernio_connection` +
`zernio_account` schema (migration **0063**), the connection service
(`lib/services/zernio.ts`), the hosted-OAuth connect + callback routes
(`app/api/integrations/zernio/{connect,callback}/route.ts`), and the
**Google Business Profile card** on `/integrations` (connect / refresh /
disconnect). Demo seeds a synthetic connected GBP (isDemo, no network). What's
NOT built yet: review pull/reply + AggregateRating, hours/address/photos sync,
GBP local metrics, posting, and the full social module — those are the next PRs
per the phased roadmap below.

## Confirmed REST shapes (validated against the live OpenAPI spec, 2026-06-15)
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
- **SEO** (`app/(default)/seo/**`, `lib/services/seo.ts`): the static
  "claim your GBP" checklist → a real **connect + live GBP local metrics**
  (calls/directions/bookings + top keywords) alongside GSC web-click data.
  Feeds the Analytics module's Acquisition band too.
- **Hours / Location** (`clinic_profile.hours` + `clinic_location` +
  `lib/services/clinic-site.ts` + the hours editor): a **"Sync from Google"**
  that pulls verified hours/address/phone/photos into `clinic_profile` with a
  "from Google" indicator + manual override; the public site, booking slot
  generation, footer "open today", and JSON-LD then ride the clinic's real
  Google data. Add `*_source` flags (e.g. `hoursSource: 'google' | 'manual'`)
  so a sync never silently clobbers a deliberate manual edit. (No push-back —
  see limitation.)
- **NEW Social module**: compose once → publish/schedule to GBP + IG/FB/… with a
  content calendar + per-platform analytics, reusing the same connection. The
  GBP "Book" CTA deep-links the clinic's `/book`.

## Phased roadmap
- **Phase 1 — Google Business core:**
  - ✅ **DONE (foundation):** `lib/zernio.ts` + `zernio_connection` /
    `zernio_account` (migration 0063) + the hosted-OAuth connect flow + the
    `/integrations` Google Business card (connect / refresh / disconnect) +
    demo seed.
  - ⬜ **NEXT (recommended first follow-up PR):** pull GBP reviews
    (`/reviews/list-inbox-reviews`) into a new `google_review` table keyed by
    org + Google review id (idempotent sync via cron + the existing
    `syncConnectedAccounts` plumbing), surface them on `/reviews/received`,
    **reply from the dashboard** (`/reviews` reply + delete-reply), and emit a
    **legitimate `AggregateRating`** in `clinicJsonLd` from the real synced
    rating (deliberately withheld until now — see the FTC note). Replace the
    hand-pasted `clinic_review_config.googlePlaceId` with the Zernio GBP
    connection (auto-resolved).
  - ⬜ Then: pull hours/address/photos into the profile/site with `*_source`
    flags; GBP local metrics into SEO/Analytics. Refactor Reviews + SEO + hours
    to route through the connection.
- **Phase 2 — GBP posting:** create posts/offers/events to GBP from a composer;
  surface performance per post.
- **Phase 3 — Full social module:** multi-platform compose/schedule/publish +
  analytics across the 15 platforms; Facebook reviews folded into the Reviews
  module alongside Google.

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
