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

## Recommendations (not yet actioned)

1. **Cache the public clinic site.** It is the highest-traffic, lowest-churn
   surface in the product — content changes when a clinic edits it, not per
   request. ISR/revalidate-on-publish (the Draft→Publish flow already gives a
   natural invalidation point) would move this from a per-request render to a
   cache hit. Highest-leverage single change.
2. **Re-run after the Patients-list pagination slice** (R2 deferred item) —
   that surface is not in this baseline because it needs auth; it is the one
   most likely to be worse.
3. **Get a prod-shaped number** before the marketing pivot. Run this against a
   staging deploy on a t4g.micro to learn the real ceiling, then decide whether
   the instance class needs to change for launch.
4. Re-run after any change to public-site rendering and compare the table.
