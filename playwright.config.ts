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

export default defineConfig({
  testDir: './e2e',
  // A golden-path spec that needs a retry is a flaky spec — and a flaky E2E
  // suite is worse than none, because people learn to ignore red. One retry in
  // CI only, to absorb genuine infrastructure noise.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
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
