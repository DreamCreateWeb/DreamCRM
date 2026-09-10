import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

// The prod server's clock is UTC (see CLAUDE.md timezone rules). Tests that
// bucket timestamps into local days flip results on a developer machine in a
// US timezone, so the suite runs pinned to the clock it was written against.
// Set here (before any Date use) so vitest workers inherit it on every OS.
process.env.TZ = 'UTC'

// Attachment URLs are host-allowlisted against the storage env the blob driver
// reads (lib/attachment-hosts.ts). Pin the prod-shaped values so fixtures use a
// realistic upload host instead of a placeholder the gate would (correctly)
// drop. Tests that exercise the gate itself set these themselves.
process.env.S3_BUCKET ??= 'dreamcrm-uploads-test'
process.env.S3_REGION ??= 'us-east-1'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws on client import. Stub it for unit tests.
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    // Unit tests must not touch the network. happy-dom otherwise treats an
    // <iframe src> as a real navigation and fetches it: the website hub and
    // template-gallery specs render preview frames, so every run fired real
    // requests at http://localhost:3000/site/acme/tf/* (happy-dom's default
    // origin). On CI that only fails fast and litters unrelated files' output
    // with NetworkError traces, but on a dev box with `pnpm dev` up it silently
    // hits the RUNNING app, and behind a proxy/firewall that drops connections
    // it hangs until the test times out. Child-frame navigation off makes the
    // frames inert, which is all the specs assert about them anyway.
    environmentOptions: {
      happyDOM: {
        settings: { navigation: { disableChildFrameNavigation: true } },
      },
    },
    globals: true,
    // A timeout is a HANG detector, not an assertion — raising it relaxes no
    // check. vitest's 5s default was too tight for this suite's shape: 111 test
    // files load the module under test with `await import()` INSIDE the first
    // it() (usually required, because they pair it with vi.resetModules()), so
    // that one test is billed for a cold module graph — next + drizzle + the
    // schema barrels — while its siblings report 0ms. With 691 files across
    // parallel workers, which file eats the scheduler's bad luck is a lottery,
    // and the loser fails with a timeout that looks like a real regression in
    // whatever change happens to be in flight.
    //
    // Measured on a full local run (2026-09-09): the slowest such first-test
    // spent 4619ms of the 5000ms budget AND PASSED (tests/reviews/auto-send),
    // with six more between 2.1s and 3.5s. Two different files tipped over on
    // two consecutive runs of the same green tree. 20s keeps a genuine hang
    // caught quickly while putting ~4x headroom over the worst real load.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
