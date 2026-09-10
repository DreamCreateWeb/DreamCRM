import { beforeAll } from 'vitest'

/**
 * Start loading a module at COLLECTION time instead of inside a test
 * (DREAMCRM-19). The reasoning lives beside `testTimeout` in vitest.config.ts;
 * the short version:
 *
 * A file that loads the module under test with `await import()` INSIDE a test
 * bills that ONE test for a cold module graph — next + drizzle + the schema
 * barrels — while its siblings report 0ms. Across ~710 files on parallel
 * workers, which file eats the scheduler's bad luck is a lottery, and the
 * loser failed with a timeout that read as a real regression in whatever
 * change happened to be in flight. That is what the 20s `testTimeout` was
 * papering over.
 *
 * Called at the top level of a test file, this kicks the load off during
 * collection. The tests below it keep their `await import(...)` exactly as
 * written — that call now hits vitest's module cache, or joins the in-flight
 * load, either way costing the test nothing.
 *
 *     prewarm(() => import('@/lib/services/reviews'))
 *
 * Pass a THUNK rather than a specifier: the `import()` has to be written in
 * the test file itself so vitest resolves it against that file's own mock
 * registry, exactly as the in-test call does.
 *
 * NOT for a file that calls `vi.resetModules()`, `vi.doMock()`, or sets
 * `process.env` before importing — those defer the load ON PURPOSE, and
 * pre-loading would either be thrown away or capture the wrong environment.
 * Eight files in this suite are in that category and keep their late load.
 *
 * Two steps, and both matter:
 *
 *   1. The loads START at collection, so they overlap with the rest of the
 *      run rather than sitting in the critical path of one test.
 *   2. A `beforeAll` waits for them to SETTLE. Without that the load might
 *      still be in flight when the first test runs, and how much of it that
 *      test pays would depend on scheduler luck — which is the lottery this
 *      whole change exists to remove. Time spent here is billed to the hook,
 *      where `hookTimeout` covers it and no assertion is competing with it.
 *
 * Rejections are swallowed on purpose. This is a warm-up, not a check: if the
 * module genuinely cannot load, the test's own `await import()` rejects and
 * reports the failure where a reader can act on it. Failing the hook instead
 * would replace a precise error with "beforeAll failed", and letting the
 * floating promise reject would take the worker down with an unhandled
 * rejection that names no test at all.
 */
export function prewarm(...loads: Array<() => Promise<unknown>>): void {
  const settled = loads.map((load) => load().then(noop, noop))
  beforeAll(async () => {
    await Promise.all(settled)
  })
}

function noop(): void {}
