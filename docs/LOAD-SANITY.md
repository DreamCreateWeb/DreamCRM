# Load sanity

Release program **R3**. `docs/RELEASE.md` Part 1 lists performance/load as
"Never run", with the pointed note *(t4g.micro RDS!)*. The goal is not a
capacity certificate — it is to find which surface falls over first, and to
have a repeatable number to compare against after a change.

```bash
node scripts/load-sanity.mjs --conc 10 --reqs 100          # local app
node scripts/load-sanity.mjs --base https://staging... --conc 25 --reqs 200
```

No dependencies (Node's own `fetch`). Read-only public paths only — a load
script must never be able to fabricate bookings or send email. It reports
**p50/p90/p99**, not averages: an average hides the tail, and the tail is what
a patient experiences.

## Baseline — 2026-08-18, local dev container

**This table is PRE-CACHE.** Recommendation 1 below landed after it was
measured (#507, 2026-09-10 and DREAMCRM-90, 2026-09-22), and nothing has
re-run the script since. The clinic-site rows describe an app that rendered
every public page from scratch; they are the "before" half of a comparison
whose "after" half does not exist yet.

**Read this caveat first.** These numbers are from the development container,
not production. They characterise the **application** (render cost, query
shape, queueing); they do **not** predict the prod t4g.micro's ceiling, which
has different CPU/memory and a network hop to RDS. Expect production to be
*worse*, not better. For a real ceiling, point `--base` at a staging deploy on
prod-shaped hardware.

### Concurrency 8, 40 requests/path

| surface | p50 | p90 | p99 | req/s | errors |
|---|---|---|---|---|---|
| health | 42ms | 99ms | 163ms | 104.4 | 0 |
| marketing home | 363ms | 454ms | 548ms | 22.6 | 0 |
| pricing | 68ms | 72ms | 74ms | 125.4 | 0 |
| **clinic site** | **387ms** | 501ms | **553ms** | **19.6** | 0 |
| clinic booking | 302ms | 340ms | 401ms | 27.1 | 0 |

### Concurrency 25, 75 requests/path

| surface | p50 | p90 | p99 | req/s | errors |
|---|---|---|---|---|---|
| health | 152ms | 196ms | 528ms | 107.8 | 0 |
| marketing home | 913ms | 1198ms | 1203ms | 25.9 | 0 |
| pricing | 137ms | 146ms | 151ms | 185.6 | 0 |
| **clinic site** | **1054ms** | 1256ms | **1410ms** | **23.4** | 0 |
| clinic booking | 979ms | 1054ms | 1057ms | 25.3 | 0 |

## What the numbers say

**No errors at either level.** Nothing fell over, and nothing 5xx'd — the app
degrades by getting slower, which is the good failure mode.

**The dynamic public pages are already saturated at concurrency 8.** Tripling
concurrency (8 → 25) bought **no additional throughput** — clinic site went
19.6 → 23.4 req/s while p50 went 387ms → 1054ms. Flat throughput with latency
rising in proportion to concurrency is the signature of a queue, not of
capacity. The server is doing all it can at ~20–26 req/s for these pages;
everything beyond that just waits.

**`/pricing` is the control.** It scaled cleanly (125 → 186 req/s, p50 68 →
137ms), which tells us the ceiling is not the HTTP layer or the container — it
is the per-request work the clinic/marketing pages do.

**The slowest tail is the page that sells.** `/site/[slug]` is both the
slowest surface and the lowest throughput. A marketing push that drives real
traffic to clinic sites is the exact scenario that would expose this, and on
prod hardware these numbers get worse.

## Recommendations

1. **Cache the public clinic site.** · **ACTIONED — the table above predates
   it and has not been re-measured.**

   It is the highest-traffic, lowest-churn surface in the product — content
   changes when a clinic edits it, not per request. Revalidate-on-publish (the
   Draft→Publish flow already gives a natural invalidation point) moves this
   from a per-request render to a cache hit. Highest-leverage single change,
   and it landed in two parts:

   - **#507 (2026-09-10)** — `lib/services/clinic-site-cache.ts`: the
     published site payload and the published theme, cached per clinic behind
     a module that structurally cannot read the session, with a 60s TTL as the
     contract and explicit `revalidateTag` on the writers a human is watching
     (publish, staging a draft, the go-live lever, the identity save).
   - **#654 (2026-09-22, DREAMCRM-90)** — the residual: `app/site/[slug]/
     layout.tsx` still opened its OWN `clinic_profile` select for eleven chrome
     columns on every public page, three lines below the cached theme read.
     Those columns moved into the cached payload (`PublishedSiteChrome`), so a
     warm public page now costs zero uncached profile queries.
     `tests/clinic-site/layout-reads-the-cache.test.ts` keeps it that way.

   **Which reads deliberately stay uncached**, since the recommendation did
   not say and the design has to:

   - the **template-frame preview route** and the owner's preview cookie
     (`resolveActiveSiteTemplate`) — the whole answer is chosen by a request
     header and a cookie, so there is no published half to lift out. Caching
     it would serve one owner's preview as the live design for every visitor.
   - the **draft overlay** — a verified editor's unpublished words are merged
     per request, outside the cache boundary, and the draft CONTENT never
     enters a shared entry at all.
   - the **shut-down wall's verdict** — `trialEndsAt` is cached, but
     `resolveTrialState` runs per request against that request's clock, so a
     trial expiring mid-TTL walls the site immediately. The write in the other
     direction (a clinic PAYS and should stop being walled) invalidates from
     the Stripe subscription webhook.
   - the **go-live lever** writes `siteLiveAt`, which IS cached — and the
     lever invalidates explicitly, because "taking my site offline takes a
     minute to happen" is the wrong direction to be slow in.

   **And one read that cannot invalidate even though it would like to.**
   Stripe's checkout-success landing (`app/(default)/settings/billing/
   page.tsx`) runs the subscription sync in a Server Component BODY, so it
   exists precisely to beat webhook timing. Next forbids `revalidateTag`
   during a render and THROWS — which on #654 did not merely skip the
   invalidation, it truncated the billing sync and stopped the code that
   disconnects over-cap social channels from running. That path now tolerates
   the refusal (`invalidateClinicSiteForOrgUnlessRendering`) and relies on
   Stripe delivering the same event to the webhook moments later, or on the
   60s TTL. So the paying direction is instant via the webhook and
   TTL-bounded via the landing page — not closed everywhere.
   `tests/clinic-site/no-render-phase-invalidation.test.ts` fails if any
   other render-reachable module reaches for the strict invalidator.

   **No re-measured table yet.** Point 4 below still applies to this change,
   and honouring it needs the app running against a database — which the
   development session that made the change did not have. Re-run the script
   and add a post-cache table before treating the numbers above as current.

2. **Re-run after the Patients-list pagination slice** (R2 deferred item) —
   that surface is not in this baseline because it needs auth; it is the one
   most likely to be worse.
3. **Get a prod-shaped number** before the marketing pivot. Run this against a
   staging deploy on a t4g.micro to learn the real ceiling, then decide whether
   the instance class needs to change for launch.
4. Re-run after any change to public-site rendering and compare the table.
