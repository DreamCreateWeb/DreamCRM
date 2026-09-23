import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE HARNESS TOOK NO ARGUMENTS, AND NOW IT TAKES TWO (DREAMCRM-105).
 *
 * `scripts/e2e-harness.sh` grew `--spec` and `--repeat` so a flake can be given
 * a RATE instead of an anecdote — `e2e/portal-billing.spec.ts` has failed twice
 * in a week and every sentence anybody could write about it ("about once a
 * day", "can't reproduce") was a guess. `.github/workflows/e2e-flake-hunt.yml`
 * is how you ask for that run without a local Postgres.
 *
 * What is graded here, and why each is written against rather than trusted:
 *
 *   1. THE REFUSALS ACTUALLY REFUSE. Every validation in that script is
 *      reachable before the Postgres check, so this drives the REAL file as a
 *      process and watches it exit non-zero on a bad value. §2d: a guard whose
 *      predicate nobody has watched fail is indistinguishable from one that
 *      always passes, and the ceiling on `--repeat` in particular has exactly
 *      one chance to work — the run where somebody typed 500 instead of 50.
 *   2. THE TWO FILES AGREE ON THE ENV NAMES. The workflow hands `E2E_SPEC` and
 *      `E2E_REPEAT` over in `env:`; the harness reads those two spellings.
 *      Rename either side and the feature becomes DECORATIVE — the dispatch box
 *      accepts a spec, the harness never sees it, and the run happily greens
 *      over the whole suite while the reader believes they measured one file.
 *      That is the same failure `tests/guards/e2e-flaky-summary.test.ts` exists
 *      to refuse between `playwright.config.ts` and the reporter, and it is
 *      quiet in the same way.
 *   3. THE HUNT GATES NOTHING AND PUBLISHES NEITHER REQUIRED NAME. `test` and
 *      `e2e` are the required status-check contexts on main; a second producer
 *      of either can satisfy branch protection with a tick the real suite never
 *      made. Pinned the same way the review-gate, review-sweep and
 *      rulebook-drift guards pin theirs.
 *   4. NO STRING DISPATCH INPUT IS INTERPOLATED INTO A `run:` BLOCK — and this
 *      one is graded over the WHOLE directory, not over the file that prompted
 *      it. `${{ inputs.spec }}` inside a `run:` is substituted into the script
 *      TEXT before bash parses it, so a spec of `x"; curl … | sh; "` executes
 *      as the workflow's own shell with the checkout and the job token in front
 *      of it. Until this issue the repo had no string-typed dispatch input at
 *      all, so the rule costs nothing today and exists for the second one —
 *      which is the only moment it could ever have been added cheaply.
 *
 *      Deliberately narrowed to STRING inputs. `review-sweep.yml` interpolates
 *      its boolean `ping` into a `run:` line and is correct to: a `type:
 *      boolean` input is `true` or `false` by the time it reaches the
 *      expression, and widening this rule to catch it would buy a false
 *      positive and cost §2d's own remedy — narrow the predicate, never
 *      register the file.
 */

const WORKFLOW_DIR = join(process.cwd(), '.github/workflows')
const HARNESS = 'scripts/e2e-harness.sh'
const HUNT = 'e2e-flake-hunt.yml'
const LOAD_SCRIPT = 'scripts/load-sanity.mjs'
const LOAD_DOC = 'docs/LOAD-SANITY.md'

const harnessSource = readFileSync(join(process.cwd(), HARNESS), 'utf8')

/**
 * Run the real harness and return how it exited.
 *
 * Every case below dies in the argument parser, which sits ABOVE the Postgres
 * lookup — so this needs no database, no build and no browser. `bash` is
 * already a hard dependency of this repo (`pnpm test:e2e` is literally
 * `bash scripts/e2e-harness.sh`), and Git for Windows ships one, so this runs
 * on both supported dev platforms rather than skipping on one of them. A guard
 * that runs on one OS is half a guard — the lesson `scripts/e2e-flaky-summary.mjs`
 * carries in its first line.
 */
function runHarness(args: string[], env: Record<string, string> = {}) {
  const res = spawnSync('bash', [HARNESS, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30_000,
  })
  if (res.error) {
    throw new Error(
      `could not run \`bash ${HARNESS}\` (${res.error.message}). bash is a dependency of this ` +
        'repo — `pnpm test:e2e` is a bash script — and Git for Windows installs one. Put it on ' +
        'PATH rather than skipping this file: these refusals are the only thing standing between ' +
        'a mistyped dispatch input and an hour of the wrong tests.',
    )
  }
  return { status: res.status, stderr: res.stderr ?? '', stdout: res.stdout ?? '' }
}

describe('the e2e harness refuses an argument it cannot trust', () => {
  it('refuses a --repeat that is not a whole number', () => {
    const { status, stderr } = runHarness(['--repeat', 'fifty'])
    expect(status, 'a non-numeric repeat must stop the run, not become a playwright argument').toBe(2)
    expect(stderr).toMatch(/not a whole number/)
  })

  it('refuses a --repeat above the ceiling', () => {
    // THE CASE THE CEILING EXISTS FOR. A hunt is dispatched by hand with a
    // number typed into a box; 500 instead of 50 is one keystroke and most of a
    // runner-day with nobody watching. The refusal happens at second zero
    // instead of as a timeout at minute sixty.
    const { status, stderr } = runHarness(['--repeat', '5000'])
    expect(status).toBe(2)
    expect(stderr).toMatch(/ceiling/)
  })

  it('refuses a --repeat of zero', () => {
    const { status } = runHarness(['--repeat', '0'])
    expect(status, '`--repeat 0` would run nothing and report green').toBe(2)
  })

  it('refuses a --spec carrying anything a shell would react to', () => {
    const { status, stderr } = runHarness(['--spec', 'e2e/x.spec.ts; rm -rf /'])
    expect(status).toBe(2)
    expect(stderr).toMatch(/not a test path/)
  })

  it('refuses a --spec that is really a flag — the ceiling bypass, Sentinel on #680', () => {
    // THE CASE THE LEADING-DASH RULE EXISTS FOR. `E2E_SPEC` is word-split, so
    // `E2E_SPEC='--repeat-each 500'` used to become two accepted spec tokens
    // and plan as `playwright test --repeat-each 500`, exit 0, with REPEAT_MAX
    // never consulted. Not a shell hole — nothing here is eval'd — but the
    // harness header promises a bounded run and that promise was not true.
    const viaEnv = runHarness(['--print-plan'], { E2E_SPEC: '--repeat-each 500' })
    expect(viaEnv.status, 'the repeat ceiling must not be reachable through the spec box').toBe(2)
    expect(viaEnv.stderr).toMatch(/not a test path/)

    // Same refusal on the flag spelling, so the env path is not the only one
    // closed.
    expect(runHarness(['--spec', '--retries=0']).status).toBe(2)
    expect(runHarness(['--spec', '-g']).status).toBe(2)
  })

  it('refuses the same value arriving through the environment', () => {
    // The workflow's own path. Validating the FLAG and trusting the env var
    // would leave the dispatch route — the only untrusted one — ungraded.
    const { status, stderr } = runHarness([], { E2E_SPEC: 'e2e/x.spec.ts && whoami' })
    expect(status).toBe(2)
    expect(stderr).toMatch(/not a test path/)
  })

  it('treats an empty env value as unset, because that is what a dispatch sends', () => {
    // `workflow_dispatch` sends '' for an input nobody filled in. Refusing that
    // would make every default-valued dispatch fail before it started.
    const { status } = runHarness(['--repeat', 'nope'], { E2E_SPEC: '', E2E_REPEAT: '' })
    // It still dies — on the bad FLAG, not on the empty env vars.
    expect(status).toBe(2)
  })
})

/**
 * The plan a set of arguments resolves to, without standing anything up.
 *
 * `--print-plan` stops above the Postgres lookup. Without it the acceptance
 * half of this file could not exist: on a runner that HAS Postgres — which is
 * every runner that matters — driving the real script with a good `--repeat`
 * would initdb a cluster, build the app and run the browser suite from inside
 * `pnpm test`.
 */
function plan(args: string[], env: Record<string, string> = {}) {
  const { status, stdout, stderr } = runHarness(['--print-plan', ...args], env)
  expect(status, `--print-plan should exit 0; stderr was: ${stderr}`).toBe(0)
  return stdout.trim()
}

describe('the arguments resolve to the playwright invocation they claim', () => {
  it('turns --spec and --repeat into a filter and --repeat-each', () => {
    expect(plan(['--spec', 'e2e/portal-billing.spec.ts', '--repeat', '50'])).toBe(
      'playwright test e2e/portal-billing.spec.ts --repeat-each=50',
    )
  })

  it('carries the same values in through the environment', () => {
    // THE WORKFLOW'S OWN PATH, end to end. Without this the two files could
    // agree on the STRINGS `E2E_SPEC`/`E2E_REPEAT` (graded below) while the
    // harness read them into something playwright never sees.
    expect(
      plan([], { E2E_SPEC: 'e2e/portal-billing.spec.ts', E2E_REPEAT: '50' }),
    ).toBe('playwright test e2e/portal-billing.spec.ts --repeat-each=50')
  })

  it('reads a zero-padded repeat as base ten', () => {
    // `08` is octal to bash arithmetic. Without the `10#` the run dies with a
    // syntax error nobody typed — the kind of refusal that teaches people the
    // flag is broken rather than that their input was.
    expect(plan(['--repeat', '08'])).toBe('playwright test --repeat-each=8')
  })

  it('keeps a dash INSIDE a path, which is most of the suite', () => {
    // The leading-dash refusal must not become "no dashes": half the specs in
    // `e2e/` are hyphenated, and a rule that rejected them would be reverted
    // the first time somebody hunted `portal-billing`.
    expect(plan(['--spec', 'e2e/portal-reschedule.spec.ts'])).toBe(
      'playwright test e2e/portal-reschedule.spec.ts',
    )
  })

  it('takes two specs from one space-separated dispatch box', () => {
    expect(plan([], { E2E_SPEC: 'e2e/portal.spec.ts e2e/portal-billing.spec.ts' })).toBe(
      'playwright test e2e/portal.spec.ts e2e/portal-billing.spec.ts',
    )
  })

  it('passes everything after -- to playwright untouched', () => {
    expect(plan(['--repeat', '2', '--', '--retries=0'])).toBe(
      'playwright test --repeat-each=2 --retries=0',
    )
  })

  it('leaves the no-argument run exactly as it was', () => {
    // Every existing caller — `pnpm test:e2e`, ci.yml, nightly.yml,
    // post-merge-e2e.yml — invokes this script bare. Adding flags must not
    // change what a bare run does, or three green checks start meaning
    // something new without anybody deciding that.
    expect(plan([])).toBe('playwright test')
    expect(plan([], { E2E_SPEC: '', E2E_REPEAT: '' })).toBe('playwright test')
  })

  it('still understands --skip-build, and no longer only as the first argument', () => {
    // `pnpm test:e2e:quick` is `bash scripts/e2e-harness.sh --skip-build`, and
    // the old parser only looked at `$1` — so `--skip-build` after a spec would
    // have been forwarded to playwright as a test filter matching nothing.
    expect(plan(['--skip-build'])).toBe('playwright test')
    expect(plan(['--spec', 'e2e/portal.spec.ts', '--skip-build'])).toBe(
      'playwright test e2e/portal.spec.ts',
    )
  })
})

/* ------------------------------------------------------------------------ */
/* The load mode (DREAMCRM-117).                                             */
/* ------------------------------------------------------------------------ */

describe('the harness refuses to measure a server it did not start', () => {
  /** Hold a port the way a stale `next-server` holds one, and hand back its
   *  number. */
  async function occupied(): Promise<{ port: string; release: () => Promise<void> }> {
    const server = createServer(() => {})
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    return {
      port: String((server.address() as AddressInfo).port),
      release: () => new Promise<void>((resolve) => server.close(() => resolve())),
    }
  }

  it('stops when something is already listening on the port it needs', async () => {
    // THE DEFECT THIS WAS WRITTEN AGAINST, watched on 2026-09-23 rather than
    // imagined. `kill $SERVER_PID` reached `pnpm`, not the `next-server`
    // grandchild that owns the socket, so a finished run left one listening.
    // The next run could not bind — and did not notice, because the readiness
    // probe is `curl /api/health` and the STALE server answers it. It then
    // measured a build it had not made, with a Next in-memory cache the
    // previous run had warmed, and said nothing.
    //
    // A wrong answer with a green exit code is the one outcome this harness
    // may not produce, so the port is refused rather than shared.
    const { port, release } = await occupied()
    try {
      const { status, stderr } = runHarness([], { E2E_PORT: port })
      expect(status, 'a busy port must stop the run above the database').toBe(2)
      expect(stderr).toMatch(/already serving/)
    } finally {
      await release()
    }
  })

  it('tears down the whole server tree, not just the process it spawned', () => {
    // The other half, and it is graded on the SOURCE because the defect is a
    // process-tree fact no argument can reach: `kill "$SERVER_PID"` reached
    // one of three processes. If this reverts to a bare `kill`, the refusal
    // above turns from a backstop into the thing everybody trips over on
    // every second run.
    expect(harnessSource, 'the teardown must walk the process tree').toMatch(
      /kill_tree\(\)\s*\{[\s\S]*pgrep -P/,
    )
    for (const pid of ['SERVER_PID', 'WEBHOOK_PID']) {
      expect(
        harnessSource,
        `${pid} must be torn down with kill_tree, not a bare kill`,
      ).toMatch(new RegExp(String.raw`kill_tree "\$${pid}"`))
    }
  })
})

describe('the harness refuses a load level it cannot trust', () => {
  it('refuses --load-level without --load-sanity', () => {
    // Accepting it would run the WHOLE BROWSER SUITE and report green on a
    // command whose author asked for a measurement — a success that measured
    // nothing, which is the failure this whole file is about.
    const { status, stderr } = runHarness(['--load-level', '8x40'])
    expect(status).toBe(2)
    expect(stderr).toMatch(/needs --load-sanity/)
  })

  it('refuses a level that is not <concurrency>x<requests>', () => {
    expect(runHarness(['--load-sanity', '--load-level', '9']).status).toBe(2)
    expect(runHarness(['--load-sanity', '--load-level', '8x']).status).toBe(2)
    expect(runHarness(['--load-sanity', '--load-level', 'eight x forty']).status).toBe(2)
  })

  it('refuses a concurrency or a request count outside the ceilings', () => {
    // Same argument as REPEAT_MAX: the digit that turns 50 into 500 is one
    // keystroke, and past a couple of hundred sockets the p99 in the table is
    // the local kernel's accept queue rather than the application.
    const conc = runHarness(['--load-sanity', '--load-level', '500x40'])
    expect(conc.status).toBe(2)
    expect(conc.stderr).toMatch(/concurrency 500 is outside/)

    const reqs = runHarness(['--load-sanity', '--load-level', '8x5000'])
    expect(reqs.status).toBe(2)
    expect(reqs.stderr).toMatch(/requests 5000 is outside/)

    expect(runHarness(['--load-sanity', '--load-level', '0x40']).status).toBe(2)
    expect(runHarness(['--load-sanity', '--load-level', '8x0']).status).toBe(2)
  })

  it('refuses a browser argument instead of quietly dropping it', () => {
    // None of these reaches `load-sanity.mjs`. Ignoring one would produce a
    // full green run whose table measured something other than what was asked
    // for — the same silent shape the `E2E_SPEC` agreement guard below refuses.
    for (const args of [
      ['--load-sanity', '--spec', 'e2e/portal.spec.ts'],
      ['--load-sanity', '--repeat', '3'],
      ['--load-sanity', '--', '--retries=0'],
    ]) {
      const { status, stderr } = runHarness(args)
      expect(status, `\`${args.join(' ')}\` must be refused, not ignored`).toBe(2)
      expect(stderr).toMatch(/no meaning under --load-sanity|takes no playwright arguments/)
    }
  })

  it('still accepts the one flag that DOES mean something here', () => {
    // `--skip-build` is how you re-measure against a build you already have.
    // A refusal that swept it up with the browser flags would make the second
    // run of a comparison cost a full build for nothing.
    expect(runHarness(['--print-plan', '--load-sanity', '--skip-build']).status).toBe(0)
  })
})

/** The levels `--load-sanity` resolves to, as `[concurrency, requests]` pairs. */
function loadPlan(args: string[]): Array<[number, number]> {
  const { status, stdout, stderr } = runHarness(['--print-plan', '--load-sanity', ...args])
  expect(status, `--print-plan should exit 0; stderr was: ${stderr}`).toBe(0)
  return stdout
    .trim()
    .split('\n')
    .map((line) => {
      const m = /^load-sanity --conc (\d+) --reqs (\d+)$/.exec(line.trim())
      expect(m, `unreadable plan line: ${line}`).not.toBeNull()
      return [Number(m![1]), Number(m![2])] as [number, number]
    })
}

describe('the load mode resolves to the measurement it claims', () => {
  it('defaults to the two levels the baseline table was measured at', () => {
    expect(loadPlan([])).toEqual([
      [8, 40],
      [25, 75],
    ])
  })

  it('takes levels in order, and only the ones asked for', () => {
    expect(loadPlan(['--load-level', '12x60', '--load-level=4x20'])).toEqual([
      [12, 60],
      [4, 20],
    ])
  })

  it('reads a zero-padded level as base ten', () => {
    // `08` is octal to bash arithmetic, exactly as in `--repeat`. Without the
    // `10#` this dies with a syntax error nobody typed.
    expect(loadPlan(['--load-level', '08x040'])).toEqual([[8, 40]])
  })

  it('leaves the browser plan untouched when the mode is off', () => {
    // The whole point of a mode: every existing caller — `pnpm test:e2e`,
    // ci.yml, nightly.yml, post-merge-e2e.yml, the flake hunt — must plan
    // exactly what it planned before.
    expect(plan([])).toBe('playwright test')
    expect(plan(['--spec', 'e2e/portal.spec.ts'])).toBe('playwright test e2e/portal.spec.ts')
  })
})

describe('the harness and the load script agree on the flag names', () => {
  const loadSource = readFileSync(join(process.cwd(), LOAD_SCRIPT), 'utf8')

  /** Every `--name` `scripts/load-sanity.mjs` actually reads, via its own
   *  `flag('name', …)` helper. */
  const accepted = Array.from(loadSource.matchAll(/\bflag\(\s*'([a-z-]+)'/g)).map((m) => m[1])

  it('reads its own arguments through flag() at all — the population check', () => {
    // A scanner that found nothing to look at reports exactly as clean as a
    // script with no defects in it.
    expect(accepted.length).toBeGreaterThan(2)
  })

  it('passes --base, --conc and --reqs, which are the three the script parses', () => {
    // THE DECORATIVE FAILURE THIS REFUSES. Rename `--conc` on either side and
    // nothing breaks: `load-sanity.mjs` falls back to its own defaults (10
    // concurrent, 100 requests) and prints a perfectly healthy table, which
    // then gets pasted into `docs/LOAD-SANITY.md` under a heading claiming a
    // level it never ran at. Same shape as the `E2E_SPEC` agreement below, and
    // quiet in the same way.
    for (const name of ['base', 'conc', 'reqs']) {
      expect(accepted, `${LOAD_SCRIPT} must still read --${name}`).toContain(name)
      expect(
        harnessSource,
        `${HARNESS} must pass --${name} to the load script`,
      ).toMatch(new RegExp(`--${name}\\s`))
    }
  })

  it('invokes the load script by the path it lives at', () => {
    expect(harnessSource).toContain(`node ${LOAD_SCRIPT}`)
  })
})

describe('the default levels are the ones the document can be compared against', () => {
  const doc = readFileSync(join(process.cwd(), LOAD_DOC), 'utf8')

  /** Every `### Concurrency C, N requests/path` heading in the document. */
  const documented = Array.from(
    doc.matchAll(/^###\s+Concurrency\s+(\d+),\s+(\d+)\s+requests\/path/gm),
  ).map((m) => `${m[1]}x${m[2]}`)

  it('finds the level headings in the document — a rule over an empty set is not a rule', () => {
    expect(documented.length).toBeGreaterThan(0)
  })

  it('defaults to levels the document has a table for', () => {
    // WHY THIS DIRECTION AND NOT THE OTHER. The default exists so that a
    // re-measurement lands beside the 2026-08-18 baseline row for row; a
    // default the document has never used produces an after-table that cannot
    // be compared with anything, which is the entire purpose of running it.
    // Adding a THIRD table at some new level is fine and does not fail here —
    // only moving the default off the levels the document records does.
    const missing = loadPlan([])
      .map(([c, r]) => `${c}x${r}`)
      .filter((level) => !documented.includes(level))

    expect(
      missing,
      `${HARNESS} defaults to a load level ${LOAD_DOC} has no table for. An after-table measured ` +
        'at a level the before-table never used is not a comparison.',
    ).toEqual([])
  })
})

describe('the harness and the hunt workflow agree on the env names', () => {
  const hunt = readFileSync(join(WORKFLOW_DIR, HUNT), 'utf8')

  it('hands the dispatch inputs over under the names the harness reads', () => {
    for (const name of ['E2E_SPEC', 'E2E_REPEAT']) {
      expect(
        hunt,
        `${HUNT} must set ${name} — it is how the dispatch box reaches the harness`,
      ).toContain(`${name}:`)
      expect(
        harnessSource,
        `${HARNESS} must read ${name}. If one side is renamed and the other is not, the ` +
          'dispatch box keeps accepting a spec, the harness never sees it, and the hunt reports a ' +
          'clean 50 over the whole suite instead of over the file somebody asked about.',
      ).toContain(`${name}:-`)
    }
  })

  it('turns the retries off, which is the only reason the ratio means anything', () => {
    // `playwright.config.ts` sets `retries: 1` under CI. At 1, a spec failing
    // eight times in fifty and passing on each second attempt reports GREEN.
    // The hunt exists to produce "8 of 50", so it must ask for the raw rate.
    expect(hunt).toMatch(/--retries=0/)
  })
})

describe('the hunt cannot gate a merge or mint a required check', () => {
  const hunt = readFileSync(join(WORKFLOW_DIR, HUNT), 'utf8')

  it('is dispatch-only — no pull_request, no push, no schedule', () => {
    // A `pull_request` trigger would put a 50x browser run in front of every
    // PR; a `schedule` would pay for a hunt on mornings nobody is hunting.
    expect(hunt).not.toMatch(/^\s{2}pull_request:/m)
    expect(hunt).not.toMatch(/^\s{2}push:/m)
    expect(hunt).not.toMatch(/^\s{2}schedule:/m)
    expect(hunt).toMatch(/^\s{2}workflow_dispatch:/m)
  })

  it('publishes neither required status-check context', () => {
    // Both spellings: the job KEY is the context when there is no `name:`.
    for (const required of ['test', 'e2e']) {
      expect(
        hunt,
        `a job called \`${required}\` here would report onto a commit under a name branch ` +
          'protection trusts, from a run the real suite never made',
      ).not.toMatch(new RegExp(`^\\s{2}${required}:\\s*$`, 'm'))
      expect(hunt).not.toMatch(new RegExp(`^\\s+name:\\s*${required}\\s*$`, 'm'))
    }
  })

  it('caps its own wall time', () => {
    // Without this the job inherits GitHub's 6-hour default, and a wedged hunt
    // is a wedged hunt on a runner nobody is watching.
    expect(hunt).toMatch(/^\s+timeout-minutes:\s*\d+/m)
  })
})

/* ------------------------------------------------------------------------ */
/* Rule 4 — derived over the whole directory.                                */
/* ------------------------------------------------------------------------ */

/** Every `workflow_dispatch` input declared `type: string`, per file. */
/**
 * The three declared types that are NOT a string by the time they reach an
 * expression, and are therefore out of scope.
 *
 * `boolean` and `number` are coerced by GitHub before substitution, so
 * `review-sweep.yml` interpolating its `ping` input into a `run:` line is safe
 * and correct. `choice` is safe for a different reason worth stating rather
 * than leaving implied: its value is constrained to the `options:` list the
 * workflow itself declares, so the dispatcher cannot supply a value the author
 * did not write.
 */
const NON_STRING_TYPES = ['boolean', 'number', 'choice']

/**
 * Every `workflow_dispatch` input that reaches an expression AS A STRING.
 *
 * ---------------------------------------------------------------------------
 * DEFAULT-IN, NOT DEFAULT-OUT — and the first version had this backwards
 * (Forge, reviewing #680).
 *
 * It required a literal `type: string` line. **GitHub Actions defaults a
 * `workflow_dispatch` input to string when `type:` is omitted**, so an untyped
 * input is fully interpolatable and was completely invisible here: this
 * returned `[]` for the file, and the caller's `if (!strings.length) continue`
 * then skipped the *whole workflow*. A quoted `type: "string"` walked through
 * the same gap.
 *
 * Nothing in the tree was unguarded — all thirteen workflow files happen to
 * declare a bare `type: string` — which is also why the repo could never have
 * suggested the mutation. But this rule exists for the SECOND string input,
 * the one nobody has written yet, and the blind spot landed precisely on it.
 *
 * So the predicate is inverted: an input is a string unless it declares
 * otherwise. The two forms agree on every file in the repo today and disagree
 * on every file nobody has written yet — which is the only place a guard about
 * future inputs can earn anything.
 *
 * §2d records the general shape as the identity-looseness family's ninth
 * member: **when a guard keys on an OPTIONAL declaration, the mutation to
 * reach for is omitting it, not misspelling it.**
 */
export function stringInputs(source: string): string[] {
  const lines = source.split('\n').map((l) => l.replace(/\r$/, ''))
  const names: string[] = []

  let inputsIndent: number | null = null
  let current: { name: string; indent: number; type: string | null } | null = null

  // An input is only decided once its block ends, because the `type:` line (if
  // there is one at all) comes after the key.
  const settle = () => {
    if (current && !NON_STRING_TYPES.includes(current.type ?? 'string')) names.push(current.name)
    current = null
  }

  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    const indent = line.length - line.trimStart().length

    if (/^\s*inputs:\s*$/.test(line)) {
      settle()
      inputsIndent = indent
      continue
    }
    if (inputsIndent == null) continue
    if (indent <= inputsIndent) {
      settle()
      inputsIndent = null
      continue
    }

    // A key one level under `inputs:` starts a new input.
    const key = /^\s*([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (key && (current == null || indent <= current.indent)) {
      settle()
      current = { name: key[1], indent, type: null }
      continue
    }
    // Quotes are stripped: `type: "string"` is the same declaration as
    // `type: string`, and reading only the bare spelling was half the gap.
    const declared = /^\s*type:\s*['"]?([A-Za-z]+)['"]?\s*$/.exec(line)
    if (current && declared) current.type = declared[1].toLowerCase()
  }
  settle()
  return names
}

/**
 * Every line that is part of a `run:` step body — the text GitHub substitutes
 * expressions into before any shell sees it.
 */
export function runBlockLines(source: string): string[] {
  const lines = source.split('\n').map((l) => l.replace(/\r$/, ''))
  const out: string[] = []
  let blockIndent: number | null = null

  for (const line of lines) {
    const indent = line.length - line.trimStart().length

    if (blockIndent != null) {
      if (!line.trim()) continue
      if (indent > blockIndent) {
        out.push(line)
        continue
      }
      blockIndent = null
    }

    // `- run: |` is as legal as a `run: |` under a `- name:`, and a scanner
    // that only knew the second spelling would report a file it could not read
    // as a file with nothing in it.
    const block = /^(\s*)(?:-\s+)?run:\s*[|>][-+]?\s*$/.exec(line)
    if (block) {
      blockIndent = block[1].length
      continue
    }
    // A one-line `run:` is just as substitutable.
    if (/^\s*(?:-\s+)?run:\s*\S/.test(line)) out.push(line)
  }
  return out
}

describe('no string dispatch input is interpolated into a run: block', () => {
  const files = readdirSync(WORKFLOW_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()

  it('has workflow files to grade — a rule over an empty set is not a rule', () => {
    // The population check §2d asks for: a scanner that silently found nothing
    // to look at reports exactly as clean as a tree with no defects in it.
    expect(files.length).toBeGreaterThan(5)
  })

  it('finds no shell-substituted string input anywhere in .github/workflows', () => {
    const offenders: string[] = []

    for (const file of files) {
      const source = readFileSync(join(WORKFLOW_DIR, file), 'utf8')
      const strings = stringInputs(source)
      if (!strings.length) continue

      for (const line of runBlockLines(source)) {
        for (const name of strings) {
          const expr = new RegExp(
            String.raw`\$\{\{\s*(?:github\.event\.)?inputs\.${name}\b[^}]*\}\}`,
          )
          if (expr.test(line)) offenders.push(`${file}: ${line.trim()}`)
        }
      }
    }

    expect(
      offenders,
      'a `type: string` workflow_dispatch input written inside a `run:` block is substituted ' +
        'into the SCRIPT TEXT before bash parses it, so anyone with repo write can execute ' +
        "arbitrary commands as the workflow, with the checkout and the job's token in front of " +
        'them. Hand the value over in `env:` and quote it at the point of use. ' +
        'Boolean inputs are deliberately out of scope — `review-sweep.yml` interpolates one and ' +
        'is right to.',
    ).toEqual([])
  })

  it('would catch one — the ringer rings', () => {
    // §2d: watching the PREDICATE fail is not optional, and this rule's whole
    // value is that nobody has ever seen it fire.
    const fixture = [
      'on:',
      '  workflow_dispatch:',
      '    inputs:',
      '      spec:',
      '        type: string',
      '      ping:',
      '        type: boolean',
      'jobs:',
      '  x:',
      '    steps:',
      '      - run: |',
      '          bash scripts/e2e-harness.sh --spec ${{ inputs.spec }}',
      '          echo ${{ inputs.ping }}',
    ].join('\n')

    expect(stringInputs(fixture)).toEqual(['spec'])

    const hits = runBlockLines(fixture).filter((l) => /\$\{\{\s*inputs\.spec\b/.test(l))
    expect(hits).toHaveLength(1)

    // And the boolean beside it is NOT a hit — the narrowing is load-bearing,
    // not incidental.
    const booleanHits = runBlockLines(fixture).filter(
      (l) => /\$\{\{\s*inputs\.ping\b/.test(l) && stringInputs(fixture).includes('ping'),
    )
    expect(booleanHits).toEqual([])
  })

  it('catches an UNTYPED input, which GitHub treats as a string — Forge, on #680', () => {
    // THE BLIND SPOT THE FIRST VERSION HAD, and it landed precisely on the case
    // this rule exists for. `type:` is OPTIONAL and defaults to string, so an
    // author who simply omits it gets a fully interpolatable input that the
    // old matcher could not see — and because the caller skips a file with no
    // string inputs, the WHOLE workflow went ungraded.
    //
    // Nothing in the tree was ever unguarded, which is exactly why the tree
    // could not have suggested this mutation. §2d: when a guard keys on an
    // optional declaration, the mutation to reach for is OMITTING it.
    const fixture = [
      'on:',
      '  workflow_dispatch:',
      '    inputs:',
      '      untyped:',
      '        description: no type at all, so GitHub makes it a string',
      '        required: false',
      '      quoted:',
      '        type: "string"',
      '      ping:',
      '        type: boolean',
      '      count:',
      '        type: number',
      '      lane:',
      '        type: choice',
      '        options:',
      '          - a',
      '          - b',
    ].join('\n')

    expect(stringInputs(fixture).sort()).toEqual(['quoted', 'untyped'])
  })

  it('still lets a boolean, a number and a choice through — the narrowing is not a blanket', () => {
    // If this ever starts failing, the repair above has over-corrected into
    // "every input is a string", which would flag `review-sweep.yml`'s `ping`
    // and make the rule's own remedy (narrow the predicate) unavailable.
    const sweep = readFileSync(join(WORKFLOW_DIR, 'review-sweep.yml'), 'utf8')
    expect(
      stringInputs(sweep),
      'review-sweep.yml declares exactly one input, `ping: boolean`, and interpolates it into a ' +
        '`run:` line. It is right to. A rule that flags it is a rule somebody will delete.',
    ).toEqual([])
  })

  it('reads the real hunt workflow as clean, through the same scanner', () => {
    const source = readFileSync(join(WORKFLOW_DIR, HUNT), 'utf8')
    expect(stringInputs(source).sort()).toEqual(['repeat', 'spec'])
    // Its `run:` bodies mention the env NAMES, never the expressions.
    for (const line of runBlockLines(source)) {
      expect(line).not.toMatch(/\$\{\{\s*(?:github\.event\.)?inputs\./)
    }
  })
})
