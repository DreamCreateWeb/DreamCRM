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
3. **The fixture** (`scripts/e2e-seed.mjs`) — two clinics, in SQL so it cannot
   drift with service-layer refactors and stays readable as a description of
   the world under test:
   - `e2e-dental` — published (`site_live_at` set): the normal public journey.
   - `e2e-prelive` — operating but NOT published: the go-live lever under test,
     including the portal door it must *not* lock.
   Idempotent, so re-running is safe.
4. **A production build + `next start`** on `:3100`, then a health poll.
5. **Playwright** against that server.

Nothing here touches the real database, Stripe, Resend, or any vendor.

## Deliberately NOT part of `pnpm test`

The merge gate must stay fast (~4 min for the unit suite). The E2E suite needs
a build and a server, so it is a separate command. Wired into CI 2026-09-09:
the `e2e` job in `.github/workflows/ci.yml` runs the harness on every PR (the
runner image's own Postgres binaries stand up the throwaway cluster). The
push-to-main deploy gate in `deploy.yml` stays typecheck + unit only.

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

## Seeded specs (`e2e/clinic-site.spec.ts`)

- **A published clinic** — the home page serves the clinic's own branding with
  no error shell and no pre-live gate; the booking page renders; and the
  booking fields are reachable **by name** (`Visit type`, `First name`,
  `Last name`, `Phone number`), pinning the R2 accessibility fix that replaced
  placeholder-only inputs.
- **The go-live lever** — an unpublished clinic shows coming-soon on its
  marketing pages, **but its portal door still opens** with a working sign-in
  form. That is the R2 slice-4 fix verified in a real browser: a practice that
  is operating but hasn't published was previously handing out portal links and
  QR codes that dead-ended on a page with no navigation.

## The booking journey (`e2e/booking.spec.ts`)

The product's top conversion path, and the one flow where a silent failure
costs a practice a real patient. This is a genuine **write** test: it drives
slot selection, fills the form, submits, and asserts the confirmation the
patient sees — then leaves a real `patient` and `appointment` row behind. It
exercises the server action, slot re-validation and the atomic claim, none of
which happy-dom can reach.

It also pins the guard that the submit button stays **disabled until a time is
picked**, so a half-filled form can never post a booking with no slot.

## The journey specs (added 2026-09-09, DREAMCRM-7)

The list that used to live here is written:

1. **Portal reschedule/cancel** (`e2e/portal-reschedule.spec.ts`) — a second
   portal patient (Morgan) moves a consultation to a new open time (the new
   visit comes back unconfirmed, the original retires), cancels a filling, and
   sees the notice window honestly close self-serve changes on a visit 20
   hours out. (The doc's old phrasing had the window backwards: the code
   offers changes OUTSIDE the window and the call-us fallback INSIDE it; and
   the portal door is email + password, not magic link — the specs mint the
   signed session cookie either way.)
2. **Staff day** (`e2e/staff-day.spec.ts`) — Dana at the desk confirms,
   completes (a past visit, via the Past 30 days chip), and cancels (through
   the confirm dialog) from the appointments drawer, with the durable status
   pills asserted past the optimistic flips.
3. **Sign-here stack** (`e2e/sign-here.spec.ts`) — approve a seeded
   inquiry-reply proposal on /dream-team and watch the lead flip to Contacted
   on the Leads board. inquiry_response is the one capability whose executor
   completes keyless (deliver() silently succeeds for @example.com
   recipients), so it is the capability the fixture seeds.
4. **Onboarding path B** — already covered: path B IS the self-serve flow,
   and `e2e/stranger.spec.ts` walks it end to end.

**Row ownership matters**: spec files run in parallel workers, so every spec
file owns its seeded rows outright (Casey belongs to portal + token specs,
Morgan to portal-reschedule, Riley to staff-day, Robin/the proposal to
sign-here). Add new journeys on their own rows, and make the seed reset any
state a journey consumes.

Since DREAMCRM-19 that ownership is **named in the seed itself**, as a scope
(`scripts/e2e-seed.mjs`). Two kinds:

- **`base`** is structure — clinics, patients, auth users, sessions. No spec
  consumes any of it, so the harness seeds it once per run and nothing
  re-runs it.
- Every other scope is one spec file's **consumable** rows, and the scopes are
  row-disjoint by construction.

A spec declares the scope it owns at the top of the file, and that scope is
restored before each of its tests:

```ts
import { restoresSeedScope } from './reseed'
restoresSeedScope('sign-here')
```

Name only your OWN scope. Restoring one you don't own resets rows another
worker may be halfway through spending — which trades a retry-only trap for a
genuine cross-worker race. Adding a journey means adding a scope, not widening
an existing one.

You can restore a scope by hand too:

```bash
node scripts/e2e-seed.mjs sign-here     # just that spec's rows
node scripts/e2e-seed.mjs               # everything (what the harness runs)
```

## Traps these specs already fell into (DREAMCRM-10)

**A retry cannot fix a test that consumes its fixture — FIXED in DREAMCRM-19,
and worth knowing about because the shape recurs.** The harness seeds once per
RUN, not once per attempt. `portal-reschedule` cancels a visit and `sign-here`
approves a proposal, so a Playwright retry started with those rows already
spent and died at its FIRST assertion — long before reaching whatever actually
broke. The retry's error was an artifact of the retry, and it was the error a
reader saw first: it buried the real failure under a fixture complaint. That is
a test lying about WHY it failed, which is worse than a test that simply fails.
It also meant `retries: 1` could not do its job for half the suite, because the
second attempt could never pass.

`e2e/reseed.ts` now restores the owning spec's scope before every attempt (see
"Row ownership matters" above), so a retry starts from the same world attempt
#1 did. **Keep the property when you add a journey**: if a spec spends a row,
its scope has to put that row back, and the scope has to stay disjoint from
every other spec's.

**Do not assert which side of a revalidate race won.** After a portal action
succeeds, `components/patient-portal/visit-card.tsx` sets an in-card confirmation
and deliberately never calls `router.refresh()` — the patient is meant to read
it. The server action's own revalidate may re-render the list without the row
anyway. Both outcomes are correct and which lands first depends on CI load, so
an assertion that the card disappeared is exactly as flaky as an assertion that
the confirmation is showing. The cancel spec flaked both ways before it settled
on accepting either and letting a reload assert the durable truth. Assert what is
unconditionally true — usually the state after a fresh load.

**A "durable" assertion that would also pass if nothing happened is not one.**
The reschedule spec closed with "after a reload, a Consultation card exists and
needs confirming" — but the SEEDED consultation is unconfirmed too, so that held
whether or not the move ever ran. The only thing actually proving the journey was
the in-card success notice, i.e. the raciest line in the test. It now asserts the
seeded appointment id is gone from the page and the surviving card carries the
time the patient picked. When you write the durable half, ask what it would do if
the button did nothing.

**A signal a PENDING action already satisfies is not a settled signal
(DREAMCRM-21).** The durable half above only means anything if the reload
underneath it happens AFTER the action landed, so between the two sits a wait.
The reschedule spec's wait was "the 'Move my visit' button is gone" — which
looks exactly like "the action finished" and is not: `visit-card.tsx` renders
that pill as `{pending ? 'Moving…' : 'Move my visit'}`, so its accessible name
disappears on the CLICK, with the request still in the air. The reload then
raced the server action, and under parallel load on the shared throwaway
Postgres the reload won: the page re-rendered from a database where the move had
not landed, and the durable assertion — the line furthest from the cause —
reported a working journey red. Three full-suite runs failed, three isolated
runs passed, and each failure spent ~10s re-polling a post-reload DOM that could
never change. `retries: 1` absorbed it, which is how it survived.

The wait now polls for the reschedule PANEL to close, which `run()` does only on
`res.ok` — so it stays true while "Moving…" shows, and on a refusal it reports
the server's own words (the action re-checks the slot at submit, and the
e2e-dental chairs are shared with `booking.spec.ts`) instead of a bare timeout.
Two rules fall out of this, and they generalise past this one spec:

- **Before waiting on the absence of something, ask what it does while the
  request is in flight.** A disabled button, a relabelled pill, a spinner
  swapping out the label — all of them make an element "gone" the instant you
  click it.
- **A wait before a reload is load-bearing.** `tests/guards/e2e-reschedule-settled-signal.test.tsx`
  pins both halves in the normal vitest suite: it proves in happy-dom that the
  pill loses its name mid-flight while the panel does not, and it fails if the
  spec drifts back to waiting on that name. The E2E job is the wrong place to
  find out an E2E assertion was vacuous.

**A fixture pinned in UTC against a window bounded in clinic time goes red on
the clock.** `staff-day`'s past visit was seeded one UTC day back while the
`past_30d` chip ends at the clinic-local day start (`America/New_York`), so for
the four hours after UTC midnight the visit was in the past but outside the
window — deterministic nightly red that looked intermittent because nobody
opened a PR at 1 AM. It is `CLAUDE.md`'s timezone rule seen from the fixture
side: product code obeys clinic-local day boundaries, so fixtures must clear
those boundaries at every hour, not just the hour you ran it.
`tests/guards/e2e-past-visit-window.test.ts` pins this in the normal vitest
suite — it reads the offset out of the seed and the window definition out of
`lib/services/appointments.ts`, so tidying either one fails before merge instead
of at 1 AM.
