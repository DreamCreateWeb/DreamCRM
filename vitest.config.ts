import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

// The prod server's clock is UTC (see CLAUDE.md timezone rules). Tests that
// bucket timestamps into local days flip results on a developer machine in a
// US timezone, so the suite runs pinned to the clock it was written against.
// Set here (before any Date use) so vitest workers inherit it on every OS.
//
// TEST_TZ is the ONE deliberate way past the pin, and it exists for exactly
// one caller: the non-blocking `tz-canary` job in .github/workflows/nightly.yml.
// Pinning UTC is correct AND it makes CI structurally blind to the bug class
// where a mapper buckets timestamps into LOCAL days — in a UTC process the
// local day and the UTC day are the same day, so the bug cannot show
// (DREAMCRM-13, #500/#509). The canary runs the suite once a night under
// America/New_York, where those two days genuinely disagree, as an early
// warning. Note it must be TEST_TZ and not ambient TZ: an inherited TZ from a
// dev box or a runner image must never silently unpin the suite.
process.env.TZ = process.env.TEST_TZ || 'UTC'

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
    // check, and lowering it tightens none. The 20s here was a BANDAGE over a
    // structural problem; DREAMCRM-19 went after the problem.
    //
    // The problem: a test file that loads the module under test with `await
    // import()` INSIDE a test bills that ONE test for a cold module graph —
    // next + drizzle + the schema barrels — while its siblings report 0ms.
    // Across ~710 files on parallel workers, which file eats the scheduler's
    // bad luck is a lottery, and the loser failed with a timeout that read as
    // a real regression in whatever change happened to be in flight. Two
    // different files tipped over on two consecutive runs of the same green
    // tree.
    //
    // What changed: 43 files actually did this — the old note's "111" counted
    // `await import()` inside vi.mock factories, which are hoisted and cost a
    // test nothing. 35 of them had no reason to defer the load (no
    // vi.resetModules(), no vi.doMock(), no env set before the import) and now
    // pre-load during collection via tests/prewarm.ts. So the set of files
    // that CAN be the unlucky one went from 43 to 8.
    //
    // Measured back-to-back on one machine, same load, full runs:
    //                          worst first-test   over 2s   over 1s
    //   before                       6125ms           9        12
    //   after                   2383-4342ms         1-3       3-5
    // (Absolute numbers here move ~2.5x with machine load, which is why these
    // are same-session comparisons and not the 4619ms in the note this
    // replaces. Compare shapes, not milliseconds.)
    //
    // What this does NOT do is make the suite faster in wall clock. The module
    // graph still has to load; it is billed to collection and a beforeAll
    // instead of to one unlucky assertion. The win is that a test's budget is
    // no longer a lottery.
    //
    // AND THE TIMEOUT STAYS AT 20s, deliberately. The whole remaining tail is
    // the 8 files that still defer on purpose — tests/automation/cron-auth
    // (8 route graphs behind a describe.each), tests/inbox/gmail-parser and
    // tests/inbox/classification lead it — and under load their first test
    // still reaches ~4.3s. Cutting to 10s would leave those barely 2x
    // headroom, which trades a rare flake for a more likely one; that is not
    // a win, it is a different bandage. Lowering this is earned by pre-loading
    // those 8 too, and each needs its own judgement about whether the module
    // reads its env at IMPORT time or at CALL time — a per-file product
    // question, not a mechanical edit. Until someone does that work and
    // re-measures, 20s is the honest number.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
