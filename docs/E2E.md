# The E2E browser suite

Built in release-program **R3** to close what `docs/RELEASE.md` Part 1 named
"the biggest single gap": ~6,500 unit/integration tests, and **zero** browser
coverage. happy-dom cannot see middleware rewrites and redirects, real
navigation, real form posts, or server/client boundary slips — the failures
that actually reach a customer.

## Running it

```bash
pnpm test:e2e          # full: postgres + migrations + build + serve + playwright
pnpm test:e2e:quick    # same, reusing the existing .next build
```

`scripts/e2e-harness.sh` does everything and tears down after itself (trap on
exit, including failure):

1. **A throwaway Postgres cluster** on `:55432`. Prod RDS is VPC-only and
   unreachable from a dev box or CI, so the suite brings its own.
2. **Every migration applied from scratch.** This is not just setup — it is a
   rehearsal of the deploy path, which auto-applies migrations on boot. A
   migration that cannot build a database from zero fails here instead of
   wedging a deploy. (This caught nothing on 0149/0150 — both verified clean.)
3. **A production build + `next start`** on `:3100`, then a health poll.
4. **Playwright** against that server.

Nothing here touches the real database, Stripe, Resend, or any vendor.

## Deliberately NOT part of `pnpm test`

The merge gate must stay fast (~4 min for the unit suite). The E2E suite needs
a build and a server, so it is a separate command. Wire it into CI as its own
job, not into the unit gate.

## Environment notes

- **Browsers are pre-installed** at `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
  Never run `playwright install` — downloads are blocked.
- The installed `@playwright/test` may not match the pre-installed browser
  build (it expects its own pinned revision). `playwright.config.ts` therefore
  points `executablePath` at the on-disk Chromium when it exists, and falls
  back to Playwright's own resolution when it doesn't — so a normal CI image
  with matching browsers works untouched. Override with `E2E_CHROMIUM_PATH`.
- Ports/paths are overridable: `E2E_PORT`, `E2E_PGPORT`, `E2E_PGDIR`,
  `E2E_BASE_URL`.

## What the specs cover today (`e2e/smoke.spec.ts`, 10 passing)

Seed-free by design, so they run against a freshly migrated database:

- **Health** — the service answers.
- **The marketing site** — the home page renders real content (not an error
  shell) with a title and a heading; `/pricing` shows the `$200` founding rate,
  guarding the one-purchasable-plan decision against a legacy tier resurfacing.
- **The auth gate** — `/dashboard`, `/patients`, `/appointments`, `/settings`
  are each unreachable signed-out and redirect to `/signin` carrying the
  intended destination. This is *middleware behaviour*, structurally invisible
  to happy-dom, and it is a security property worth a real browser check.
- **Sign-in** — the form renders usable, and a bad sign-in surfaces a
  `role="alert"`, pinning the R2 accessibility fix so a screen-reader user
  hears the failure instead of the form appearing to do nothing.
- **Unknown clinic slug** — 404s rather than crashing.

## The next specs to write (seeded journeys)

These need a seeded clinic, so they want a fixture that creates an org +
public site + patient before the run:

1. **Public booking** — pick a day/slot, submit, land on the confirmation.
   The highest-value conversion path in the product.
2. **Portal** — magic-link sign-in → next visit → reschedule inside the notice
   window → cancel outside it.
3. **Staff day** — confirm / complete / cancel from the appointments drawer.
4. **Sign-here stack** — approve a proposal and see the artifact update.
5. **Onboarding path B + the go-live lever** — the R4 stranger test, scripted.
