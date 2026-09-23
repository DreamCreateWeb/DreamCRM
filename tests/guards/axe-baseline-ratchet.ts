/**
 * READING `e2e/axe-baseline.ts` OUT OF A GIT REVISION, AND COMPARING THE TWO.
 *
 * The comparison itself is three lines of arithmetic. Everything hard about
 * this guard is in getting the OLD value at all, and the two traps are both
 * silent ones:
 *
 *  1. **You cannot import the old file.** `origin/main`'s copy exists only as a
 *     blob; there is no module to `import`. So it gets parsed out of source
 *     text — and a parser that quietly returns `{}` when the file's shape moves
 *     would report every ceiling as having been 0 on main, which fails
 *     everything, or (if you write the comparison the other way round) passes
 *     everything. `parseBaseline` therefore THROWS on anything it does not
 *     recognise, and never guesses. `axe-baseline-ratchet.test.ts` parses the
 *     file on disk and deep-equals the result against the real imported
 *     `A11Y_BASELINE`, so the parser cannot drift away from the format without
 *     a named failure.
 *
 *  2. **An absent entry is a ceiling of ZERO, not "no opinion".** That is
 *     `e2e/axe-baseline.ts`'s own rule, stated twice in its header, and it is
 *     the whole reason this guard is not a diff of the numbers that appear in
 *     both revisions. Adding `'staff: some page': { 'color-contrast': 2 }` to a
 *     stop that carried nothing is a raise from 0 to 2 — arguably the LIKELIEST
 *     shape of the defect, because it does not look like editing a number.
 *
 * The comparator is pure and takes both sides as plain objects, so every branch
 * can be exercised from fixtures. The git read and the wiring live in the test.
 */

import { CEILING_RAISES, type CeilingRaise } from '../../e2e/axe-baseline-raises'

export type Baseline = Record<string, Record<string, number>>

/**
 * The export `e2e/axe-baseline.ts` is expected to declare.
 *
 * The lookahead is load-bearing, and it was found by a red run that came back
 * GREEN: a plain `indexOf` for this string also matches `export const
 * A11Y_BASELINE_V2`, so a rename-and-alias parsed the OLD literal happily while
 * the ratchet believed it was reading the new one. Same family as the `\b`
 * traps in docs/GUARD-MUTATION-PASS.md — a prefix is not a name.
 */
const BASELINE_EXPORT = 'export const A11Y_BASELINE'
const BASELINE_EXPORT_RE = /export const A11Y_BASELINE(?![\w$])/

/**
 * The one-line `git fetch` every workflow that runs `pnpm test` has to perform
 * before it does.
 *
 * `actions/checkout@v4` on a `pull_request` event fetches `refs/pull/N/merge`
 * and nothing else, so `origin/main` does not resolve and this guard would have
 * no previous value to read — in the check it exists to defend. It is spelled
 * once, here, and pinned into the workflows by the test: an emitter and a
 * reader that disagree about a string is how the headroom table nearly shipped
 * mute (`tests/guards/axe-headroom-table.test.ts`).
 *
 * THE `--depth=1` CAME OFF ON DREAMCRM-109, and the census below now matches on
 * the REFSPEC rather than on the whole command line. A CASE on this rule, not a
 * new one: nothing about what it asserts moved. The reason is that this guard's
 * subject is "main is in this checkout", and the DEPTH was never part of that
 * — it was one consumer's minimum. A second consumer
 * (`tests/guards/rulebook-state.test.ts`) reads main's HISTORY, so the depth had
 * to grow, and a census keyed on the exact string would have failed three
 * correct workflows for a flag it does not care about. §2d's "a guard's SENTENCE
 * is a claim about a MACHINE" — the sentence said depth and meant presence.
 */
export const FETCH_MAIN_COMMAND =
  'git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main'

/**
 * What the workflow census actually matches.
 *
 * The refspec is the part that makes a line a fetch OF MAIN INTO `origin/main`;
 * the flags around it are the caller's business. Narrow enough that a fetch of
 * some other ref does not count, wide enough that changing a flag is not a
 * four-file edit.
 */
export const FETCH_MAIN_REFSPEC = '+refs/heads/main:refs/remotes/origin/main'

/**
 * The `actions/checkout` input that makes the fetch step below it WORK.
 *
 * THIS CONSTANT EXISTS BECAUSE ITS ABSENCE BLOCKED TWO PRODUCTION DEPLOYS.
 * `FETCH_MAIN_REFSPEC` pinned that a fetch-of-main STEP was present, and it
 * was present, in all four jobs, correctly spelled — and on a `push` event it
 * transferred nothing, because `actions/checkout` had already left main at
 * depth 1 with its tip equal to the remote tip. `origin/main` resolved with
 * ONE commit. The census asserted the step existed; the property it stood for
 * was that main's HISTORY is present, and those came apart exactly where
 * nobody was looking. §2d calls this assert-the-answer-not-the-proxy, and
 * this is the fifth member of that family in this repo.
 *
 * `fetch-depth: 0` makes the shallow state impossible rather than handled, so
 * there is no clone state left to branch on. The alternative — `--unshallow`
 * in the fetch step — is FATAL on a complete repository ("--unshallow on a
 * complete repository does not make sense", measured), so it would have to be
 * guarded by a conditional whose other branch never runs on a given event.
 */
export const CHECKOUT_FULL_HISTORY = 'fetch-depth: 0'

/**
 * Split a workflow file into its jobs, by indentation.
 *
 * A line scanner rather than a YAML parser, following the convention
 * `scripts/rulebook-drift.mjs` and `scripts/schedule-heartbeat.mjs` already
 * set — this repo has no YAML dependency and adding one to read four files is
 * not a trade worth making.
 *
 * Per JOB rather than per FILE, which is the imprecision the fetch census
 * below documents and never closed: it counted occurrences across a whole
 * file, so a job with a fetch and no suite run donated a spare count to a
 * later job with a suite run and no fetch. `deploy.yml` has exactly that
 * shape — two jobs, one of which runs the suite.
 */
export interface WorkflowJob {
  name: string
  lines: string[]
}

export function splitJobs(source: string): WorkflowJob[] {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l))
  if (start === -1) return []

  const jobs: WorkflowJob[] = []
  let current: WorkflowJob | null = null
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (header) {
      current = { name: header[1], lines: [] }
      jobs.push(current)
      continue
    }
    // A non-indented, non-blank line ends the `jobs:` block entirely.
    if (line.trim() !== '' && !/^\s/.test(line)) break
    current?.lines.push(line)
  }
  return jobs
}

/** A `why` shorter than this is a shrug, and a shrug is not an argument. */
export const MIN_WHY_LENGTH = 120

/**
 * Strip comments from `src` without touching anything inside a string.
 *
 * Not a regex. `e2e/axe-baseline.ts` carries comments INSIDE the object literal
 * (`// NO \`portal:\` STOP APPEARS HERE ANY MORE`) and its prose is full of
 * apostrophes, quotes and backticks — the exact characters a naive stripper
 * confuses for string delimiters. One pass, tracking which of the five states
 * we are in, is the only version of this that is correct.
 */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out += c
      i++
      while (i < src.length) {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2)
          i += 2
          continue
        }
        out += src[i]
        if (src[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/** The braced block opening at or after `from`, matched by counting braces. */
function balancedBlock(src: string, from: number, describe: string): string {
  const open = src.indexOf('{', from)
  if (open === -1) throw new Error(`${describe}: no object literal after the declaration`)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i)
  }
  throw new Error(`${describe}: unbalanced braces in the object literal`)
}

const KEY = String.raw`'([^']*)'|"([^"]*)"`
const ENTRY = new RegExp(String.raw`(?:${KEY})\s*:\s*\{([^{}]*)\}`, 'g')
const RULE = new RegExp(String.raw`(?:${KEY})\s*:\s*(\d+)`, 'g')

/**
 * `A11Y_BASELINE` as it is written in `source`, which may be any revision of
 * `e2e/axe-baseline.ts` — including one read out of `git show`.
 *
 * Throws rather than degrades. A baseline that parses to `{}` because the file
 * started spelling itself differently is indistinguishable from a baseline that
 * really is empty, and the two have opposite consequences for a ratchet.
 */
export function parseBaseline(source: string, describe = 'e2e/axe-baseline.ts'): Baseline {
  const clean = stripComments(source)
  const at = clean.search(BASELINE_EXPORT_RE)
  if (at === -1) {
    throw new Error(
      `${describe}: could not find \`${BASELINE_EXPORT}\`. The ratchet reads this file as TEXT ` +
        `(the copy on origin/main is a blob, not a module), so renaming the export or wrapping ` +
        `the literal in a call silently removes the only record of what the ceilings used to be.`,
    )
  }

  const body = balancedBlock(clean, at, describe)
  const baseline: Baseline = {}
  for (const match of Array.from(body.matchAll(ENTRY))) {
    const stop = match[1] ?? match[2]
    const rules: Record<string, number> = {}
    for (const rule of Array.from(match[3].matchAll(RULE))) {
      rules[rule[1] ?? rule[2]] = Number(rule[3])
    }
    const innerLeftover = match[3].replace(RULE, '').replace(/[\s,]/g, '')
    if (innerLeftover) {
      throw new Error(
        `${describe}: stop '${stop}' holds something this parser does not understand ` +
          `(${innerLeftover}). Every value must be a literal \`'rule': <number>\`.`,
      )
    }
    baseline[stop] = rules
  }

  const leftover = body.replace(ENTRY, '').replace(/[\s,]/g, '')
  if (leftover) {
    throw new Error(
      `${describe}: the A11Y_BASELINE literal holds something this parser does not understand ` +
        `(${leftover}). Keep it to literal \`'stop': { 'rule': <number> }\` entries — a spread, a ` +
        `computed key or a helper call would make the previous ceilings unreadable, and an ` +
        `unreadable previous value is a ratchet that has stopped turning.`,
    )
  }

  return baseline
}

/** Every (stop, rule) mentioned by either side, in a stable order. */
function allPairs(...baselines: Baseline[]): Array<[string, string]> {
  const seen = new Set<string>()
  const pairs: Array<[string, string]> = []
  for (const baseline of baselines) {
    for (const stop of Object.keys(baseline)) {
      for (const rule of Object.keys(baseline[stop])) {
        const key = `${stop}\u0000${rule}`
        if (seen.has(key)) continue
        seen.add(key)
        pairs.push([stop, rule])
      }
    }
  }
  return pairs.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
}

/** An unlisted (stop, rule) tolerates ZERO — `e2e/axe-baseline.ts`'s own rule. */
export function ceilingOf(baseline: Baseline, stop: string, rule: string): number {
  return baseline[stop]?.[rule] ?? 0
}

export type RatchetFinding =
  /** A ceiling went up and nothing in `CEILING_RAISES` speaks for it. */
  | { kind: 'unauthorised-raise'; stop: string; rule: string; from: number; to: number }
  /** There IS an entry for this pair, and it does not describe this raise. */
  | {
      kind: 'raise-not-as-written'
      stop: string
      rule: string
      from: number
      to: number
      entry: CeilingRaise
    }
  /** An entry whose premise has expired: the ceiling it describes has moved. */
  | { kind: 'dead-raise'; entry: CeilingRaise; actual: number }
  /** An entry that does not meet the bar an opt-out has to meet. */
  | { kind: 'malformed-raise'; entry: CeilingRaise; problem: string }

function raiseKey(stop: string, rule: string): string {
  return `${stop}\u0000${rule}`
}

/** The shape checks an opt-out entry has to pass before it can authorise anything. */
function malformed(entry: CeilingRaise, duplicate: boolean): string | null {
  if (duplicate) {
    return 'a second entry names the same (stop, rule) — one raise, one entry, or neither can be checked'
  }
  if (!entry.stop.trim()) return 'stop is empty'
  if (!entry.rule.trim()) return 'rule is empty'
  if (!Number.isInteger(entry.from) || entry.from < 0) return `from (${entry.from}) must be a whole number ≥ 0`
  if (!Number.isInteger(entry.to) || entry.to < 0) return `to (${entry.to}) must be a whole number ≥ 0`
  if (entry.to <= entry.from) {
    return `to (${entry.to}) must be greater than from (${entry.from}) — this list authorises RAISES, and a shrink needs no permission`
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return `date '${entry.date}' must be YYYY-MM-DD`
  if (!entry.ref.trim()) return 'ref is empty — name the issue or PR that carries the argument'
  if (entry.why.trim().length < MIN_WHY_LENGTH) {
    return (
      `why is ${entry.why.trim().length} characters; at least ${MIN_WHY_LENGTH} are needed. It has to ` +
      'argue that these violations are PRE-EXISTING — revealed by a new stop, a new rule, or a page ' +
      'nothing had walked — not newly introduced'
    )
  }
  return null
}

/**
 * Everything wrong with `current` given what `previous` said, under `raises`.
 *
 * Empty means the ratchet held.
 */
export function checkRatchet({
  previous,
  current,
  raises = CEILING_RAISES,
}: {
  previous: Baseline
  current: Baseline
  raises?: readonly CeilingRaise[]
}): RatchetFinding[] {
  const findings: RatchetFinding[] = []

  const byPair = new Map<string, CeilingRaise>()
  const usable = new Set<CeilingRaise>()
  for (const entry of raises) {
    const key = raiseKey(entry.stop, entry.rule)
    const problem = malformed(entry, byPair.has(key))
    if (!byPair.has(key)) byPair.set(key, entry)
    if (problem) {
      findings.push({ kind: 'malformed-raise', entry, problem })
      continue
    }
    usable.add(entry)
  }

  // THE RATCHET ITSELF.
  const spokenFor = new Set<CeilingRaise>()
  for (const [stop, rule] of allPairs(previous, current)) {
    const from = ceilingOf(previous, stop, rule)
    const to = ceilingOf(current, stop, rule)
    if (to <= from) continue

    const entry = byPair.get(raiseKey(stop, rule))
    if (!entry || !usable.has(entry)) {
      findings.push({ kind: 'unauthorised-raise', stop, rule, from, to })
      continue
    }
    if (entry.from !== from || entry.to !== to) {
      spokenFor.add(entry)
      findings.push({ kind: 'raise-not-as-written', stop, rule, from, to, entry })
      continue
    }
    spokenFor.add(entry)
  }

  // THE PREMISE, re-asserted. An entry describes one state of the file; once
  // the ceiling moves off `to` the entry is pardoning something that is no
  // longer there, and nothing else in this repo would ever notice.
  for (const entry of Array.from(usable)) {
    if (spokenFor.has(entry)) continue
    const actual = ceilingOf(current, entry.stop, entry.rule)
    if (actual !== entry.to) findings.push({ kind: 'dead-raise', entry, actual })
  }

  return findings
}

/** The findings as the failure message a PR author will actually read. */
export function formatFindings(findings: readonly RatchetFinding[]): string {
  return findings
    .map((f) => {
      switch (f.kind) {
        case 'unauthorised-raise':
          return (
            `RAISED: '${f.stop}' / '${f.rule}' went ${f.from} → ${f.to}.` +
            (f.from === 0
              ? ' It is not listed on origin/main at all, and an unlisted (stop, rule) tolerates ZERO — so this is a raise, not a new line.'
              : '')
          )
        case 'raise-not-as-written':
          return (
            `RAISED BEYOND ITS OPT-OUT: '${f.stop}' / '${f.rule}' went ${f.from} → ${f.to}, but its ` +
            `CEILING_RAISES entry (${f.entry.ref}, ${f.entry.date}) authorises ${f.entry.from} → ${f.entry.to}.`
          )
        case 'dead-raise':
          return (
            `EXPIRED OPT-OUT: the CEILING_RAISES entry for '${f.entry.stop}' / '${f.entry.rule}' ` +
            `(${f.entry.ref}, ${f.entry.date}) describes a ceiling of ${f.entry.to}; the baseline now says ` +
            `${f.actual}. Delete the entry — its argument was about a tree that has moved.`
          )
        case 'malformed-raise':
          return `UNUSABLE OPT-OUT for '${f.entry.stop}' / '${f.entry.rule}': ${f.problem}.`
      }
    })
    .join('\n')
}
