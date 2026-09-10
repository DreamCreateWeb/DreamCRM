import { test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Restore a spec file's own seeded rows before every attempt (DREAMCRM-19).
 *
 * The trap this removes, previously only DOCUMENTED in docs/E2E.md: the
 * harness seeds once per RUN, not once per attempt. A spec that CONSUMES its
 * fixture — portal-reschedule cancels a visit, sign-here approves a proposal,
 * portal confirms one — therefore started its Playwright retry with the rows
 * already spent, and died on its FIRST assertion. The retry's error was an
 * artifact of the retry, and it was the error a reader saw first: it buried
 * whatever actually broke under a fixture complaint. That is a test lying
 * about WHY it failed, which is worse than a test that simply fails.
 *
 * `retries: 1` exists to absorb genuine infrastructure noise. For half the
 * suite it could not do that, because the second attempt could never pass.
 * Now it can.
 *
 * Usage — at the top level of a spec file, naming ONLY the scope that file
 * owns:
 *
 *     import { restoresSeedScope } from './reseed'
 *     restoresSeedScope('sign-here')
 *
 * The scope names are defined in `scripts/e2e-seed.mjs`, and they are
 * row-DISJOINT by construction (docs/E2E.md, "Row ownership matters"). That
 * matters here more than anywhere else in the suite: spec files run in
 * parallel workers, so a spec restoring a scope it does not own would reset
 * rows another worker is halfway through spending — trading a retry-only trap
 * for a genuine cross-worker race. Name your own scope, only your own scope.
 *
 * Deliberately before EVERY test, not just retries. A file's second test would
 * otherwise inherit whatever its first test spent, which is the same trap one
 * level down, and the restore is a handful of idempotent upserts.
 */

/**
 * Where `scripts/e2e-seed.mjs` lives, and the directory to run it from.
 *
 * Not computed from this file's own location: spec files are transpiled to
 * CJS, so `import.meta` is a syntax error here. And NOT `config.rootDir`,
 * which was the first attempt and was wrong — Playwright derives rootDir from
 * `testDir`, so it is `<repo>/e2e`, not the repo root. `configFile` is the
 * absolute path of playwright.config.ts, which does sit at the root.
 *
 * The existsSync check is the point of the function. Guessing wrong the first
 * way produced a MODULE_NOT_FOUND from a subprocess, nested inside a hook
 * failure, in every seeded spec at once — true, but three layers away from
 * "the helper looked in the wrong directory". Fail here instead, naming what
 * was tried.
 */
function locateSeed(): { repoRoot: string; seedScript: string } {
  const { configFile } = test.info().config
  const candidates = configFile
    ? [path.dirname(configFile), process.cwd()]
    : [process.cwd(), path.resolve(test.info().config.rootDir, '..')]

  for (const root of candidates) {
    const script = path.join(root, 'scripts', 'e2e-seed.mjs')
    if (existsSync(script)) return { repoRoot: root, seedScript: script }
  }
  throw new Error(
    'could not find scripts/e2e-seed.mjs, so the seeded rows cannot be restored. Looked under: ' +
      candidates.join(', '),
  )
}

/** Declare the seed scope a spec file owns, restored before each of its tests. */
export function restoresSeedScope(...scopes: string[]): void {
  test.beforeEach(async () => {
    if (!process.env.DATABASE_URL) {
      // Loud on purpose. Silently skipping would put the retry trap straight
      // back, and the whole point of this file is that the suite stops lying
      // about why it failed. `scripts/e2e-harness.sh` exports DATABASE_URL; if
      // you are driving Playwright by hand, export it yourself.
      throw new Error(
        'DATABASE_URL is not set, so the seeded rows cannot be restored between attempts. ' +
          'Run the suite through `pnpm test:e2e` (scripts/e2e-harness.sh), or export DATABASE_URL ' +
          'pointing at the already-migrated E2E database.',
      )
    }

    const { repoRoot, seedScript } = locateSeed()

    // Run the seed as the harness runs it — a subprocess, same script, same
    // arguments — rather than importing it. Two reasons: what a retry restores
    // is then provably identical to what the run seeded, and the Playwright
    // workers never hold a Postgres pool open across a spec they might fail
    // inside.
    try {
      execFileSync(process.execPath, [seedScript, ...scopes], {
        cwd: repoRoot,
        stdio: 'pipe',
        env: process.env,
      })
    } catch (err) {
      // execFileSync's default message is "Command failed" and nothing else —
      // the seed's actual complaint (a renamed column, an unknown scope) sits
      // unread on the captured stderr. Re-throw WITH it: a fixture that cannot
      // restore itself must say why, or we are back to a test lying about its
      // failure.
      const stderr = String((err as { stderr?: Buffer }).stderr ?? '').trim()
      throw new Error(
        `restoring seed scope(s) [${scopes.join(', ')}] failed${stderr ? `:\n${stderr}` : ''}`,
      )
    }
  })
}
