# Ops — what the production watch sweep checks

The recurring production watch sweep runs every 30 minutes against the live
product after each auto-deploy. This file pins the URLs it loads. It exists
because one of them is production *data* rather than code: clinic sites serve at
`/site/<slug>`, and until now no real slug was written down anywhere the sweep
could find, so it could only ever check the marketing homepage.

## The pinned URLs

| What | URL | Expected |
| --- | --- | --- |
| Marketing homepage | `https://www.dreamcreatestudio.com` | 200 |
| Clinic site — **canonical for the sweep** | `https://www.dreamcreatestudio.com/site/acme-dental-demo` | 200, titled `Dream Dental — Gentle, judgment-free dentistry in Austin` |
| Clinic site — subdomain form of the same page | `https://acme-dental-demo.dreamcreatestudio.com` | 200, same page (middleware rewrites the subdomain to `/site/<slug>`) |

The host is the same production base URL pinned as `BASE_URL` in
`scripts/setup-cron-schedules.sh`. Check the canonical row; the subdomain row is
listed because it is the form a patient actually types, and because a
subdomain-only failure is a middleware/DNS fault rather than an app fault.

## Why the demo clinic, and not a real one

`acme-dental-demo` is the singleton Acme Dental Demo org (branded "Dream
Dental"), and it is the one clinic site the deploy itself guarantees:
`scripts/resync-demo.mjs` runs in the container `CMD` after migrations on every
boot and re-seeds it idempotently, so it is published after every deploy or the
deploy is already broken. Its slug is a constant in code —
`DEMO_CLINIC_SLUG` in `lib/services/demo-constants.ts` — not a row someone can
rename. It is also already public: the marketing site links it as "Live demo
practice" (`DEMO_URL` in `lib/marketing/site.ts`) from the homepage, `/product`
and the comparison pages.

A real paying clinic is the wrong pin in both directions: its slug is customer
data, and a clinic that renames, unpublishes, or churns turns the sweep red for
a reason that has nothing to do with the deploy. (Yes, a published real clinic
existing at all is the better signal of product health — but that belongs in
business metrics, not in a per-deploy liveness check.)

## Reading a failure

A 404 on the pinned clinic URL is a **real failure, not a skip.** The route
renders a clean 404 for an unknown slug — verified 2026-09-13,
`/site/no-such-clinic-xyz` returns 404 with the generic `DreamCRM` title — so a
404 on `acme-dental-demo` means the demo org is missing from production, i.e.
`resync-demo` failed on the last boot. The route itself is fine in that case;
the seed is not.

Both clinic-site rows and the homepage were verified 200 in production on
2026-09-13, after deploy run 34777469967.

## Keeping this true

`tests/guards/ops-clinic-site-url.test.ts` fails if the slug in the table above
drifts from `DEMO_CLINIC_SLUG`, or if its host drifts from the `BASE_URL` pinned
in `scripts/setup-cron-schedules.sh`. Change either constant and the guard tells
you to change this file in the same PR.
