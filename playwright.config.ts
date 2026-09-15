import { defineConfig, devices } from '@playwright/test'

/**
 * E2E browser suite (release program R3).
 *
 * The rest of the suite is happy-dom, which cannot catch what actually breaks
 * in a browser: middleware rewrites, server/client boundary slips, real
 * navigation, real form posts. These specs walk the golden paths in Chromium
 * against a real Next build and a real Postgres.
 *
 * Not part of `pnpm test` on purpose — that gate must stay fast. Run with
 * `pnpm test:e2e` (see docs/E2E.md for the one-command local harness that
 * starts Postgres, applies migrations, seeds, builds and serves the app).
 *
 * Browsers are pre-installed in this environment at PLAYWRIGHT_BROWSERS_PATH
 * (/opt/pw-browsers) — never run `playwright install` here.
 */
import { existsSync } from 'node:fs'

/** The pre-installed Chromium in this environment, when present. */
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const chromiumPath =
  process.env.E2E_CHROMIUM_PATH ?? (existsSync(PINNED_CHROMIUM) ? PINNED_CHROMIUM : undefined)

const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

/**
 * Where the CI json reporter writes the machine-readable run result.
 *
 * `scripts/e2e-flaky-summary.mjs` reads this file, and it has to agree with
 * this literal or the flaky reporting silently becomes decorative — it would
 * find no report, say so quietly in a log nobody opens, and every run would
 * keep looking clean. `tests/guards/e2e-flaky-summary.test.ts` pins the two
 * together so a rename fails at the merge gate instead.
 */
const E2E_RESULTS_JSON = 'e2e-results.json'

/**
 * The end-of-run table naming every axe ceiling with room left in it
 * (`e2e/axe-headroom.ts`).
 *
 * In BOTH reporter lists on purpose. The information it prints is most useful
 * to whoever just fixed an accessibility defect, and that person is at a local
 * `pnpm test:e2e` long before they are at a CI log — a stale ceiling that only
 * ever shows up on CI gets found a PR later than it needed to be.
 *
 * It is reporting and nothing else: it reads test annotations, prints a table,
 * and cannot fail a run. `tests/guards/axe-headroom-table.test.ts` pins both
 * that direction and this wiring, because a reporter that quietly stops being
 * registered goes on looking exactly like a run with no headroom to report.
 */
const AXE_HEADROOM_REPORTER = './e2e/axe-headroom.ts'

export default defineConfig({
  testDir: './e2e',
  // A golden-path spec that needs a retry is a flaky spec — and a flaky E2E
  // suite is worse than none, because people learn to ignore red. One retry in
  // CI only, to absorb genuine infrastructure noise.
  //
  // The retry stays at 1 DELIBERATELY (DREAMCRM-33). `retries: 0` would turn
  // every piece of harness noise into a red required check, and a gate that is
  // red for reasons nobody caused is a gate people route around. What changed
  // instead is that a retry no longer happens in silence: the json reporter
  // below feeds `scripts/e2e-flaky-summary.mjs`, which names every flaky test
  // on the run's job summary and makes CI keep the Playwright report for a
  // GREEN run too. Absorbing the noise and erasing the evidence were never the
  // same decision; this file only ever meant the first one.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  // The json report sits OUTSIDE `playwright-report/` on purpose: the html
  // reporter clears that folder when it generates, which would delete a
  // sibling file written by a reporter earlier in this list.
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never' }],
        ['json', { outputFile: E2E_RESULTS_JSON }],
        [AXE_HEADROOM_REPORTER],
      ]
    : [['list'], [AXE_HEADROOM_REPORTER]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // This environment ships a pre-installed Chromium whose build number
        // is pinned to ITS Playwright version, which will not always match the
        // @playwright/test we depend on. Point straight at the binary rather
        // than downloading (downloads are blocked here). E2E_CHROMIUM_PATH
        // overrides; when unset and the pinned path is absent, Playwright's
        // own resolution takes over — so a normal CI image with matching
        // browsers still works untouched.
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],
  // The harness script owns the server lifecycle (it must also start Postgres
  // and seed), so webServer is opt-in: set E2E_MANAGE_SERVER=1 to let
  // Playwright boot `next start` itself against an already-migrated database.
  ...(process.env.E2E_MANAGE_SERVER
    ? {
        webServer: {
          command: `pnpm start --port ${PORT}`,
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
})
