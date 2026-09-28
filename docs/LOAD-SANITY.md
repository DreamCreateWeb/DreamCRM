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

**Four of the five paths need an app with a database behind it**, and one of
them — `/site/e2e-dental`, the whole point of the exercise — needs a clinic
whose site is published and live. That is why this file went a fortnight
without an after-table while recommendation 1 sat marked ACTIONED: the script
takes ten seconds and standing up what it asks for took a session nobody had.
The harness already builds exactly that, so it can now be asked for the
measurement instead of the browser suite (DREAMCRM-117):

```bash
bash scripts/e2e-harness.sh --load-sanity
bash scripts/e2e-harness.sh --load-sanity --load-level 8x40 --load-level 25x75
```

Postgres, every migration, the seeded live clinic, a production build and a
server on :3100 — then `load-sanity.mjs` against it, at the levels this
document's tables are headed with, and teardown. `--load-level` repeats, and a
repeated level is a repeated PASS: see "One pass is not a number" below for why
every table here is a median of three.

## Baseline — 2026-08-18, local dev container

**This table is PRE-CACHE.** Recommendation 1 below landed after it was
measured (#507, 2026-09-10 and DREAMCRM-90, 2026-09-22). The clinic-site rows
describe an app that rendered every public page from scratch; **the "after"
half is now below** (DREAMCRM-117, 2026-09-23), on a different machine — read
its caveat before comparing any millisecond across the two.

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

## After the clinic-site cache — 2026-09-23, WSL2 Ubuntu 26.04

Taken with `bash scripts/e2e-harness.sh --load-sanity`. **A DIFFERENT MACHINE
from the 2026-08-18 baseline**: WSL2 (Ubuntu 26.04, kernel 6.18) on a Windows
11 desktop, 8 cores / 16 GB, Node 22.23.2, production build, throwaway Postgres
18 from the harness, the `e2e-dental` fixture as the live site.

**So do not compare a millisecond across the two tables.** The control rows are
what carry across: `/api/health` and `/pricing` do the same near-zero work in
both, and they say this box is about **twice** the dev container's speed
(pricing p50 68ms → 34ms, health 42ms → 20ms). Every clinic-site claim below is
therefore made against the control in its OWN table, not against a raw number
in the other one — which is the job `/pricing` has had in this file since the
baseline.

**One pass is not a number.** Three passes per level; each cell is the median
and the bracket is the min–max of the three. A single pass of `clinic site` p50
landed anywhere from 149 to 195ms at concurrency 8 on one build — reporting one
of those as "the number" would be reporting the noise.

**And the control rows are also the ADMISSIBILITY GATE, not just a caveat.**
This is a shared desktop. During one attempt the host sat at 100% CPU on
unrelated work and `/api/health` p50 went 13ms → 117ms with `/pricing` at
252ms — every row moved by far more than the effect being measured. Those
passes were discarded rather than averaged in. If you re-run this and the
control rows are not in the neighbourhood below, you are measuring the
machine's other tabs; wait, or move to a quiet box.

### Concurrency 8, 40 requests/path

| surface | p50 (min–max) | p90 | p99 | req/s | errors |
|---|---|---|---|---|---|
| health | 20ms (20–21) | 39ms | 67ms | 285.7 | 0 |
| marketing home | 189ms (169–242) | 372ms | 376ms | 35.6 | 0 |
| pricing | 34ms (26–42) | 47ms | 47ms | 228.6 | 0 |
| **clinic site** | **169ms (149–195)** | 317ms | **359ms** | **43.1** | 0 |
| clinic booking | 149ms (146–182) | 195ms | 221ms | 51.7 | 0 |

### Concurrency 25, 75 requests/path

| surface | p50 (min–max) | p90 | p99 | req/s | errors |
|---|---|---|---|---|---|
| health | 39ms (36–50) | 53ms | 132ms | 446.4 | 0 |
| marketing home | 435ms (419–491) | 477ms | 480ms | 55.8 | 0 |
| pricing | 81ms (75–102) | 104ms | 105ms | 295.3 | 0 |
| **clinic site** | **492ms (411–514)** | 526ms | **644ms** | **50.1** | 0 |
| clinic booking | 532ms (412–560) | 573ms | 619ms | 46.2 | 0 |

## What the after-numbers say

**Still no errors, at either level, in any pass.** The app degrades by getting
slower, which is the same good failure mode the baseline found.

**The clinic site is no longer the slowest public surface.** That is the
clearest thing in the table and it needs no cross-machine arithmetic: in BOTH
baseline tables `/site/[slug]` was the worst p50 and the lowest throughput. At
concurrency 8 it is now faster than the marketing homepage (169ms vs 189ms) and
carries more throughput (43.1 vs 35.6 req/s), and the slowest tail belongs to
the homepage. Which agrees with `docs/MOBILE-WEIGHT.md`: the homepage is this
site's expensive page now, at both ends of the wire.

**Normalised against the control, the move is real but modest.** Clinic-site
p50 as a multiple of the same table's `/pricing` p50:

| | baseline (pre-cache) | after |
|---|---|---|
| concurrency 8 | 5.7× | 5.0× |
| concurrency 25 | 7.7× | 6.1× |

At concurrency 8 that difference is inside the pass-to-pass spread. Nobody
should read this as "the cache halved the page".

**The queue is still there, and that is the finding.** The baseline's headline
was that tripling concurrency bought no extra throughput — flat req/s with
latency rising in proportion, the signature of a queue rather than of capacity.
That is unchanged: 8 → 25 moves the clinic site 43.1 → 50.1 req/s (+16%) while
p50 goes 169 → 492ms (2.9×). The baseline's own figure was +19% and 2.7×.

### Database round trips per request — the measurement a busy host cannot move

Latency on a shared desktop is noisy. A statement count is not. So the
structural half was measured directly: the throwaway cluster started with
`log_statement=all`, and the statements one request to `/site/e2e-dental`
produces counted between two marks in the log.

| request to `/site/e2e-dental` | statements |
|---|---|
| the FIRST one the server serves, every cache empty | **11** |
| every one after it, warm | **8** |
| `/pricing`, the control | **0** |

**The three the cache removes are exactly the three it owns** — the
`organization`/`clinic_profile` chrome join #654 added, the full published
`clinic_profile` row, and `clinic_location`. #654's claim, "a warm public page
now costs zero uncached profile queries", holds precisely as written.

**The other eight stay, and neither #507 nor #654 ever meant to remove them.**
In the order they run:

1. `organization` by slug — the lookup that turns the URL into a tenant. It
   sits in FRONT of the cache rather than inside it, so every public request
   pays it.
2. `review_request` — a `count(*)` for the review-count line.
3. `membership_plan` — the membership cards.
4. `job_posting` — the careers section.
5. `platform_review` — the star-rating aggregate.
6. `clinic_review_config` — the "which reviews may be featured" threshold.
7. `blog_post` — the latest published posts.
8. `platform_review` again — the testimonial list.

So a warm public clinic site is not a cache hit with a render on top. It is a
full dynamic render that still opens eight queries, six of them for CONTENT
SECTIONS whose churn is exactly as low as the profile's — they change when a
clinic edits them, which is the argument recommendation 1 was written on.
Recommendation 1 said "cache the public clinic site"; what landed cached the
chrome of it.

**That, and not the render alone, is why the latency barely moved.** The
warm path shed 3 of 11 round trips and kept the other 8 plus a dynamic React
render, so the per-request cost fell by a fraction of itself — which is what
both after-tables show. It also means the next lever has two halves, and the
cheaper one is the six content sections. See recommendation 5.

**What could not be settled on this box.** A same-tree control arm was built
and run — the identical build with the two `unstable_cache` wrappers in
`lib/services/clinic-site-cache.ts` bypassed, so `/site/[slug]` resolves its
published payload and theme per request as it did before #507 and #654, with
the request-scoped React `cache()` above them untouched so the arm isolates
exactly what those two PRs added. Its LATENCY difference was smaller than the
pass-to-pass spread, and the host went to 100% CPU partway through, so the
latency A/B is reported as UNRESOLVED rather than as a null result: an effect
this size needs a quiet machine. The statement counts above are the same
comparison made on an instrument the host's other tabs cannot move, and they
are the ones to trust.

## Recommendations

1. **Cache the public clinic site.** · **PARTLY ACTIONED, AND NOW MEASURED**
   (DREAMCRM-117, 2026-09-23 — the after-table above). It is no longer a
   prediction, and the measurement is smaller than this entry promised: the
   clinic site stopped being the slowest public surface, but the SATURATION it
   was picked to fix is unchanged, and a warm public page still runs eight
   queries. What landed cached the chrome — three round trips of eleven. See
   "Database round trips per request" and recommendation 5, which carries the
   rest.

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

   **The re-measured table is above**, and what it cost to get one is the
   reason `--load-sanity` now exists on the harness: honouring point 4 needs
   the app running against a database with a published clinic site on it, and
   assembling that by hand is what two sessions in a row declined to do.

2. **Re-run after the Patients-list pagination slice** (R2 deferred item) —
   that surface is not in this baseline because it needs auth; it is the one
   most likely to be worse.
3. **Get a prod-shaped number** before the marketing pivot. Run this against a
   staging deploy on a t4g.micro to learn the real ceiling, then decide whether
   the instance class needs to change for launch.
4. Re-run after any change to public-site rendering and compare the table.
   `bash scripts/e2e-harness.sh --load-sanity` is that run; three passes per
   level and the control-row gate above are what make the comparison mean
   anything.
5. **Recommendation 1 is only a third done, and the rest of it is cheap**
   (DREAMCRM-117, 2026-09-23, from the statement counts above). A warm public
   clinic site still runs **eight** queries per visitor. Two levers, in the
   order they are worth doing:

   - **The six content-section reads** — `blog_post`, `platform_review` twice,
     `clinic_review_config`, `membership_plan`, `job_posting`. Same churn
     profile as the profile columns already cached (they change when a clinic
     edits them), same tag, same invalidation points that already exist in
     `lib/services/clinic-site-cache.ts`. This is more of the change that
     landed, not a new design, and it takes the warm page from eight queries
     to two.
   - **The slug→`organization` lookup**, which every public request pays in
     front of the cache. Worth its own thought because it is the one read that
     resolves the tenant, so §5's scoping rules apply to anything cached
     there.

   Neither removes the dynamic React render, which is the other half of the
   per-request cost and the reason `/pricing` (prerendered) scales while this
   page queues. Full-route caching / ISR on the PUBLISHED site would take both
   at once — but that is a design change rather than a defect fix, so it goes
   in front of the owner beside recommendation 3 rather than being made here.

## The other half

This file measures what the SERVER does under load. It says nothing about what
a page costs the device that opened it, and on the marketing homepage that is
the larger question — the living stage costs the server nothing at all.
`docs/MOBILE-WEIGHT.md` (DREAMCRM-101, 2026-09-22) is the client half, with the
first mid-range-phone numbers this site has ever had. `/pricing` is the control
in both, deliberately, so the two files talk about the same page.
