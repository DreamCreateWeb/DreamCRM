// NO SHEBANG, DELIBERATELY — the same lesson `scripts/review-sweep.mjs`,
// `scripts/schedule-heartbeat.mjs` and four others carry in their first line.
// Git hands this file to a Windows working tree with CRLF endings, and vitest's
// SSR transform leaves the `\r` behind when it strips `#!…`, so every test
// importing this module dies with a parse error at column 1.
/**
 * THE MEETING DIGEST — compiled once, read by everyone.
 *
 * `team-operating-model` §7: "where a script can assemble the 'since last
 * meeting' digest — merged PRs, ledger delta, sweep status — agents read the
 * digest rather than each of them separately re-reading two weeks of threads."
 * §4 sanctions it on the first of the two grounds, usage-negative, and the
 * measurement is on the record rather than assumed: at weekly direction meeting
 * 1 (DREAMCRM-120) **six agents each re-derived the same window from `git log`,
 * and the Part 5 count was hand-verified twice** — Quinn and Rio independently,
 * against `main` at `66d087dc`, to establish that the ledger held THIRTEEN OPEN
 * verdicts rather than the twenty-five a naive `grep OPEN` returns.
 *
 * `openVerdicts` below reproduces those thirteen exactly, same thirteen line
 * numbers, from the same SHA. That is the whole argument for this file: the
 * expensive half of meeting pre-work was two agents doing arithmetic a regex
 * does in a millisecond, and the cheap half was five agents doing it again
 * because nobody could see that it had been done.
 *
 * ===========================================================================
 * WHAT THIS IS NOT
 * ===========================================================================
 *
 * **IT IS NOT AN ALARM AND IT NEVER GOES RED ON ITS FINDINGS.** Every number
 * here is a reading, not a verdict; the instruments that go red on these
 * subjects already exist (`review-sweep`, `schedule-heartbeat`, `rulebook-drift`,
 * the `test` suite) and this file deliberately does not become a fourteenth
 * opinion about them. It exits non-zero for exactly one reason — it could not
 * COLLECT something it was asked for — because a digest that prints a section
 * header over missing data is the `Graded N/8` failure
 * `scripts/rulebook-drift.mjs` names, and a meeting is precisely where a
 * confidently-empty table does harm.
 *
 * **IT IS NOT A SECOND COPY OF ANYTHING.** Every section is derived at read
 * time from the tree, from `git`, or from the GitHub API. There is no stored
 * list to fall out of date, which is the defect this office keeps rediscovering
 * one hand-kept list at a time.
 *
 * ===========================================================================
 * THE BOUNDARY IS RFC3339 WITH AN EXPLICIT OFFSET, AND THIS FILE REFUSES
 * ANYTHING ELSE
 * ===========================================================================
 *
 * This is the one place the digest is stricter than its callers expect, and it
 * is a never-again guard rather than pedantry
 * (`tests/guards/meeting-digest.test.ts`).
 *
 * `git log --after='<date> 00:00'` and `git log --since=<YYYY-MM-DD>` are both
 * interpreted in the RUNTIME's local zone. On the box this office runs on
 * (UTC-5) a boundary written as midnight really starts at 05:00Z and silently
 * drops everything before it. Run on 2026-09-15 that form returned ZERO while
 * fourteen commits, a new workflow file and three new zero-tolerance guards sat
 * on `main`; at 23:43 on 2026-09-13 the `--since=<date>` spelling returned zero
 * over three gate-file commits by filling the missing hour in from the current
 * clock. Both were read as "nothing happened".
 *
 * A digest is the worst possible place for that failure, because its whole
 * value is that nobody re-derives the window by hand afterwards. So a boundary
 * with no offset is REFUSED at the door with the corrected spelling printed —
 * never silently interpreted, and never quietly widened to be safe. Widening
 * would be the same mistake in the kinder direction: a window nobody can state
 * exactly is a window nobody can check.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/**
 * AN OPEN VERDICT, AS OPPOSED TO THE WORD "OPEN".
 *
 * `docs/RELEASE.md` Part 5 writes an entry's verdict after a middot: `· OPEN.`,
 * `· **OPEN — written, parked…**`, `· OPEN (owner).` The same document uses the
 * bare word a dozen other times in prose — "fails OPEN", "read OPEN for a
 * week", "left reading OPEN here until" — and every one of those is a sentence
 * about a defect rather than a defect's verdict.
 *
 * `grep -c OPEN` returns 25 on the tree this was written against. Twelve of
 * those are prose. The planning meeting that first needed this number spent two
 * agents establishing it by hand.
 *
 * The middot is load-bearing and it is the ledger's own convention, not one
 * invented here: it is the separator Part 5 puts before every verdict,
 * including `· FIXED`, `· DONE` and `· RUNBOOK`. Optional asterisks follow it
 * because a verdict is often bolded.
 *
 * VALIDATED AGAINST THE HAND COUNT: at `66d087dc` this returns exactly the
 * thirteen lines DREAMCRM-121 names — 712, 788, 1047, 1092, 1148, 1382, 1840,
 * 1987, 3018, 3520, 3559, 3629, 3643 — no more and no fewer, and
 * `tests/guards/meeting-digest.test.ts` pins both directions of that against
 * specimens drawn from the real document. If the ledger's verdict convention
 * ever moves, re-run the comparison rather than trusting this sentence.
 */
export const OPEN_VERDICT = /·\s*\**\s*OPEN\b/

/** Where Part 5 lives. */
const LEDGER_PATH = 'docs/RELEASE.md'

/**
 * Read every OPEN verdict out of a RELEASE.md, each tagged with its LANE.
 *
 * The lane is the enclosing `###` heading — "R1 · S2 sweep — Money paths",
 * "Deliverable 4 — error aggregation" — because that is the only grouping the
 * document actually carries. It is NOT an agent name: a lane belongs to a
 * surface, agents rotate across surfaces, and a delta reported per agent would
 * be a number explained by naming an agent, which `owner-communication` §6
 * forbids for the scorecard and which is no better here.
 *
 * Entries are keyed by their TEXT rather than by line number, because the delta
 * below compares two revisions of a document that moves under edits. A line
 * number is an address in one revision and means nothing in the other — which
 * is exactly why DREAMCRM-121's thirteen line numbers no longer resolve against
 * today's `main` and had to be re-derived to be used.
 */
export function openVerdicts(text) {
  const out = []
  let part = '(before any part)'
  let lane = '(no lane)'
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('## ')) part = line.slice(3).trim()
    if (line.startsWith('### ')) lane = line.slice(4).trim()
    if (OPEN_VERDICT.test(line)) out.push({ line: i + 1, part, lane, text: line.trim() })
  }
  return out
}

/**
 * The Part 5 OPEN delta BY LANE — the instrument for "nothing carried silently".
 *
 * Two readings of the same document, grouped by lane, reported as three numbers
 * per lane: what was open before, what is open now, and the signed change. A
 * lane that appears in only one of the two readings still gets a row with a
 * zero on the missing side — a lane that emptied is the single most interesting
 * row on the table, and dropping it because it has nothing left to report would
 * be the table's own failure mode.
 *
 * CLOSED AND OPENED ARE COUNTED SEPARATELY AND BOTH ARE PRINTED. A lane that
 * closed two entries and opened two nets to zero, and a net of zero read as "no
 * movement" is precisely the silent carry this section exists to make
 * impossible. The matching is on entry TEXT; an entry whose wording was edited
 * in the window therefore reads as one closed and one opened, which OVERSTATES
 * churn and never understates it. That direction is deliberate — see the
 * standing rule in `scripts/review-sweep.mjs`, where being loose buys false
 * negatives and being tight costs the instrument.
 */
export function ledgerDelta(beforeText, afterText) {
  const before = openVerdicts(beforeText)
  const after = openVerdicts(afterText)
  const lanes = [...new Set([...before, ...after].map((e) => e.lane))].sort()
  // A NUL separator, written as an ESCAPE: a lane name and an entry line can each
  // contain anything, and a raw control byte in a tracked file is what
  // `tests/guards/control-bytes.ts` exists to refuse -- it caught this one.
  const key = (e) => `${e.lane}\u0000${e.text}`
  const beforeKeys = new Set(before.map(key))
  const afterKeys = new Set(after.map(key))

  const rows = lanes.map((lane) => {
    const b = before.filter((e) => e.lane === lane)
    const a = after.filter((e) => e.lane === lane)
    return {
      lane,
      before: b.length,
      after: a.length,
      delta: a.length - b.length,
      closed: b.filter((e) => !afterKeys.has(key(e))).map((e) => e.text),
      opened: a.filter((e) => !beforeKeys.has(key(e))).map((e) => e.text),
    }
  })

  return {
    rows: rows.filter((r) => r.before || r.after),
    totalBefore: before.length,
    totalAfter: after.length,
    open: after,
  }
}

/**
 * THE BOUNDARY PARSER, and the one thing in this file that throws.
 *
 * Accepts RFC3339 with an explicit offset — `2026-09-23T18:05:24Z` or
 * `2026-09-23T13:05:24-05:00`. Refuses a bare date, a date with a space instead
 * of a `T`, and a zoneless timestamp, because each of those is read in the
 * RUNTIME's local zone by `git log` and by `Date.parse` alike, and the header of
 * this file records what that cost twice.
 *
 * It REFUSES rather than corrects, on purpose. The obvious kindness — assume
 * UTC when no offset is given — produces a window that is right on CI and wrong
 * on the author's box, which is the same defect with a longer fuse.
 */
export function parseBoundary(value, flag = '--since') {
  const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
  if (typeof value !== 'string' || !RFC3339.test(value)) {
    throw new Error(
      `${flag} must be RFC3339 with an EXPLICIT offset, e.g. 2026-09-23T18:05:24Z or ` +
        `2026-09-23T13:05:24-05:00. Got ${JSON.stringify(value)}. A bare date or a zoneless ` +
        `timestamp is read in this machine's local zone (UTC-5 here), which on 2026-09-15 ` +
        `silently dropped fourteen commits, a new workflow file and three new guards from a ` +
        `sweep that then reported zero. Not widened, not assumed — restate the boundary.`,
    )
  }
  const at = Date.parse(value)
  if (!Number.isFinite(at)) throw new Error(`${flag} is not a parseable instant: ${value}`)
  return at
}

/**
 * IS THIS PR PRODUCT OR PROCESS — and the third answer, which is the honest one.
 *
 * The owner scorecard (`owner-communication` §6) asks for the product-vs-process
 * split, and the chair reported it by hand at meeting 1. Derived here from the
 * changed paths, with MIXED as a first-class bucket rather than a tie-break.
 *
 * §2d's rule applies directly: **when CLASSIFICATION is the risky half of a
 * ladder rule, grade the DISTRIBUTION of values first and NAME the half left
 * ungraded.** So a PR is PROCESS only when EVERY changed path is process, and
 * PRODUCT only when NONE is; anything else is MIXED and is printed as its own
 * column. Folding mixed into either side would let the split be tuned by
 * whichever fold flattered the week, and it is the fold — not the paths — that
 * a reader cannot check.
 *
 * `docs/` is deliberately split rather than taken whole: `docs/rulebook/**`,
 * `docs/CI.md`, `docs/E2E.md` and `docs/RELEASE.md` are this team's process
 * record, and the rest of `docs/` is product documentation.
 */
export const PROCESS_PATHS = [
  /^\.github\//,
  /^scripts\//,
  /^tests\/guards\//,
  /^docs\/rulebook\//,
  /^docs\/(?:CI|E2E|RELEASE|GUARD-MUTATION-PASS)\.md$/,
  /^CLAUDE\.md$/,
]

export function classifyFiles(files) {
  const paths = (files ?? []).filter((f) => typeof f === 'string' && f.length)
  if (!paths.length) return 'unknown'
  const isProcess = (p) => PROCESS_PATHS.some((re) => re.test(p))
  const processCount = paths.filter(isProcess).length
  if (processCount === paths.length) return 'process'
  if (processCount === 0) return 'product'
  return 'mixed'
}

export function splitPrs(prs) {
  const buckets = { product: [], process: [], mixed: [], unknown: [] }
  for (const pr of prs) buckets[classifyFiles(pr.files)].push(pr)
  return buckets
}

/**
 * THE FIRST-TRY MERGE RATE, and what it is actually measuring.
 *
 * A PR merged first-try when **no run of a required check failed on any of its
 * commits.** Not "the last run was green" — every merged PR's last run is
 * green, so that number would be a constant — and not "it had one commit",
 * because a PR that pushed a second commit for a review note merged first-try
 * as far as CI is concerned.
 *
 * `checkRuns` is the flattened list of check runs across the PR's commits,
 * `{ name, conclusion }`. Only checks named in `required` are counted: a red
 * advisory job never blocked anything, and counting it would make the metric
 * drift every time a non-blocking job is added.
 *
 * A PR WITH NO CHECK RUNS AT ALL IS NOT COUNTED AS A PASS. It goes in
 * `ungradeable` and is reported as a count, because the whole lesson of
 * `scripts/rulebook-drift.mjs` is that a thing which was not checked is never
 * reported as a thing that passed — and a rate whose denominator silently
 * includes PRs nobody could grade flatters itself exactly when the collection
 * is broken.
 */
export function firstTryRate(prs, required = ['test']) {
  const wanted = new Set(required)
  const firstTry = []
  const retried = []
  const ungradeable = []
  for (const pr of prs) {
    const runs = (pr.checkRuns ?? []).filter((r) => wanted.has(r.name))
    if (!runs.length) {
      ungradeable.push(pr)
      continue
    }
    if (runs.some((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out')) retried.push(pr)
    else firstTry.push(pr)
  }
  const graded = firstTry.length + retried.length
  return {
    firstTry,
    retried,
    ungradeable,
    graded,
    rate: graded ? firstTry.length / graded : null,
  }
}

/**
 * THE ALARM LAST-FIRED TABLE — the census column the retirement docket reads.
 *
 * `dreamcrm-conventions` §2d: an ALARM that has fired on nothing for three
 * weeks is docketed for the weekly meeting, and **"has it fired?" has to be a
 * lookup rather than a memory, or the docket becomes an argument about what
 * people remember.** Forge owns that column; this is it.
 *
 * FIRED means a FAILED run. An alarm's whole shape is that it is quiet until it
 * has something to say, so its last failure is the last time it said anything —
 * `conclusion === 'failure'`, the same signal `lastGreenAt` in
 * `scripts/review-sweep.mjs` reads from the other end.
 *
 * FOUR THINGS THIS TABLE REFUSES TO DECIDE, because §2d's carve-outs are
 * judgement calls a lookup cannot make and this column exists to INFORM the
 * docket rather than to pre-empt it:
 *
 *   * **Whether the thing is an alarm or a ratchet** (Vesper). Never docket a
 *     ratchet: its silence is the product. The timer below is reported as a
 *     timer and labelled as one.
 *   * **Whether its subject can still change** (Neon) and **whether what it
 *     guards can recur** (Rio). Neither is derivable from a run history.
 *   * **Whether it is blocked rather than idle** (Quinn). A workflow whose runs
 *     are all failures is not quiet at all, and `error-scan` and `read-check`
 *     are the live cases — their silence is a story about credentials. `state`
 *     names those rather than folding them into "quiet".
 *
 * `never ran` is separate from `quiet` for the same reason `unreadable` is
 * separate in `review-sweep`: a workflow with no run history at all has not
 * been SILENT, it has been ABSENT, and the two answers want opposite actions.
 */
export const DOCKET_QUIET_DAYS = 21

export function alarmTable(workflows, runsByWorkflow, now = Date.now()) {
  const day = 86_400_000
  return workflows
    .map((wf) => {
      const runs = (runsByWorkflow[wf.file] ?? [])
        .filter((r) => Number.isFinite(Date.parse(r.createdAt ?? '')))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      const lastRun = runs[0] ?? null
      const lastFired = runs.find((r) => r.conclusion === 'failure') ?? null
      const lastGreen = runs.find((r) => r.conclusion === 'success') ?? null
      const quietDays = lastFired ? Math.floor((now - Date.parse(lastFired.createdAt)) / day) : null
      const state = !runs.length
        ? 'never ran'
        : lastRun.conclusion === 'failure' && !lastGreen
          ? 'red since its first run'
          : lastRun.conclusion === 'failure'
            ? 'red now'
            : 'quiet'
      return {
        file: wf.file,
        name: wf.name ?? wf.file,
        crons: wf.crons ?? [],
        runs: runs.length,
        state,
        lastRunAt: lastRun?.createdAt ?? null,
        lastRunConclusion: lastRun?.conclusion ?? null,
        lastFiredAt: lastFired?.createdAt ?? null,
        quietDays,
        // THE TIMER ONLY. Not a recommendation — see the carve-outs above.
        docketEligible: state === 'quiet' && (quietDays === null || quietDays >= DOCKET_QUIET_DAYS),
      }
    })
    .sort((a, b) => (b.quietDays ?? Number.MAX_SAFE_INTEGER) - (a.quietDays ?? Number.MAX_SAFE_INTEGER))
}

/**
 * THE GUARD CENSUS WITH AGES.
 *
 * Every file in `tests/guards/`, with the date its first commit landed and its
 * age in days. The listing is the DIRECTORY, unfiltered, for the reason
 * `guards-census` in `scripts/rulebook-drift.mjs` spells out at length: a
 * filtered reading of a directory is an absence assertion, and a reader that
 * narrows partially makes every count downstream of it greener with nothing
 * going red.
 *
 * AGE IS NOT "HAS IT FIRED", AND THE DIFFERENCE IS THE WHOLE POINT. A guard
 * fires as a red `test` run, and a red `test` run does not name the guard that
 * reddened it — Actions records the JOB's conclusion, not the assertion's. So
 * there is no run history to read here and this column does not pretend there
 * is. §2d's retirement timer applies to ALARMS, and `alarmTable` above is where
 * that lookup lives; for a guard, §2d's answer is a MUTATION, not a date. What
 * age buys the meeting is a different and smaller thing: which guards are new
 * enough that nobody has watched them fail yet.
 */
export function guardCensus(entries, now = Date.now()) {
  const day = 86_400_000
  return entries
    .map((e) => ({
      file: e.file,
      addedAt: e.addedAt ?? null,
      ageDays: e.addedAt ? Math.floor((now - Date.parse(e.addedAt)) / day) : null,
    }))
    .sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1))
}

// ===========================================================================
// RENDERING
// ===========================================================================

const iso = (s) => (s ? String(s).replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '—')
const pct = (r) => (r === null ? 'not gradeable' : `${Math.round(r * 100)}%`)
const cell = (s) => String(s).replace(/\|/g, '\\|')

export function renderDigest(model) {
  const { since, until, prs, split, firstTry, ledger, alarms, guards, sweep, collectionErrors } = model
  const out = []

  out.push(`## Meeting digest — ${iso(new Date(since).toISOString())} to ${iso(new Date(until).toISOString())}`)
  out.push('')
  out.push(
    'Compiled by `scripts/meeting-digest.mjs` (`team-operating-model` §7). Every number below is ' +
      'derived at read time from the tree, from `git`, or from the GitHub API — nothing here is a ' +
      'stored list that can go stale. **It is a reading, not a verdict: this script never goes ' +
      'red on a finding.**',
  )
  out.push('')

  if (collectionErrors?.length) {
    out.push('### Collected incompletely — read everything below against this')
    out.push('')
    for (const e of collectionErrors) out.push(`- ${e}`)
    out.push('')
  }

  out.push(`### 1. Merged PRs — ${prs.length} in the window`)
  out.push('')
  if (!prs.length) {
    out.push('_Nothing merged in this window._')
  } else {
    out.push('| PR | merged | kind | title |')
    out.push('|---|---|---|---|')
    for (const pr of prs) {
      out.push(`| #${pr.number} | ${iso(pr.mergedAt)} | ${classifyFiles(pr.files)} | ${cell(pr.title)} |`)
    }
  }
  out.push('')

  out.push(`### 2. Part 5 OPEN delta by lane — ${ledger.totalBefore} to ${ledger.totalAfter}`)
  out.push('')
  out.push(
    '_An OPEN **verdict**, not the word "OPEN" — see `OPEN_VERDICT`. Closed and opened are ' +
      'counted separately on purpose: a lane that closed two and opened two nets to zero, and a ' +
      'net of zero read as "no movement" is the silent carry this table exists to prevent._',
  )
  out.push('')
  out.push('| lane | before | now | delta | closed | opened |')
  out.push('|---|---|---|---|---|---|')
  for (const r of ledger.rows) {
    const d = r.delta > 0 ? `+${r.delta}` : String(r.delta)
    out.push(`| ${cell(r.lane)} | ${r.before} | ${r.after} | ${d} | ${r.closed.length} | ${r.opened.length} |`)
  }
  out.push('')

  out.push('### 3. Alarms — last fired')
  out.push('')
  out.push(
    '_The census column `dreamcrm-conventions` §2d\'s retirement docket reads. **`timer` is the ' +
      `${DOCKET_QUIET_DAYS}-day clock and nothing else** — the room still answers §2d's four ` +
      'carve-outs (a ratchet is not an alarm; a live subject means the guard is working; a ' +
      'recurrable defect class is still held shut; blocked is not idle)._',
  )
  out.push('')
  out.push('| workflow | state | last run | last FIRED | quiet (days) | timer |')
  out.push('|---|---|---|---|---|---|')
  for (const a of alarms) {
    out.push(
      `| \`${a.file}\` | ${a.state} | ${iso(a.lastRunAt)} (${a.lastRunConclusion ?? '—'}) | ` +
        `${iso(a.lastFiredAt)} | ${a.quietDays ?? 'never fired'} | ${a.docketEligible ? '**eligible**' : '—'} |`,
    )
  }
  out.push('')

  out.push(`### 4. Guard census — ${guards.length} files in \`tests/guards/\``)
  out.push('')
  out.push(
    "_Age only. A guard fires as a red `test` run, and Actions records the JOB's conclusion rather " +
      "than the assertion's, so there is no last-fired lookup to do here and this table does not " +
      "pretend otherwise — §2d's answer for a guard is a mutation, not a date. What age buys the " +
      'meeting is which guards are new enough that nobody has watched them fail yet._',
  )
  out.push('')
  out.push('| guard | added | age (days) |')
  out.push('|---|---|---|')
  for (const g of guards) out.push(`| \`${g.file}\` | ${iso(g.addedAt)} | ${g.ageDays ?? '—'} |`)
  out.push('')

  out.push('### 5. Scorecard inputs')
  out.push('')
  out.push(
    `- **Product vs process split:** ${split.product.length} product, ${split.process.length} process, ` +
      `${split.mixed.length} mixed` +
      (split.unknown.length ? `, ${split.unknown.length} unclassifiable (no file list collected)` : '') +
      '. _Mixed is a bucket, not a tie-break — folding it either way would let the split be tuned ' +
      'by whichever fold flattered the week._',
  )
  out.push(
    `- **First-try merge rate:** ${pct(firstTry.rate)} (${firstTry.firstTry.length} of ${firstTry.graded} graded` +
      (firstTry.ungradeable.length
        ? `; ${firstTry.ungradeable.length} had no \`test\` run to read and are NOT counted as passes`
        : '') +
      "). _First-try means no run of a required check failed on any of the PR's commits._",
  )
  if (sweep) out.push(`- **Review sweep:** ${sweep}`)
  out.push('')
  out.push(
    '_`owner-communication` §6: a metric that moved the wrong way is reported at the same size as ' +
      'one that moved the right way, and a number is never explained by naming an agent._',
  )

  return out.join('\n')
}

// ===========================================================================
// COLLECTION
// ===========================================================================

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const firstLine = (e) => String(e?.message ?? e).split('\n')[0]

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

/** Every file under `tests/guards/`, with the commit that ADDED it. */
function collectGuards() {
  const files = sh('git', ['ls-files', 'tests/guards/']).split('\n').filter(Boolean)
  return files.map((path) => ({
    file: path.replace(/^tests\/guards\//, ''),
    addedAt: sh('git', ['log', '--diff-filter=A', '--format=%aI', '-1', '--', path]).trim() || null,
  }))
}

async function main() {
  const repo = argValue('--repo', 'DreamCreateWeb/DreamCRM')
  const sinceRaw = argValue('--since')
  if (!sinceRaw) {
    console.error(
      'usage: node scripts/meeting-digest.mjs --since <RFC3339 with offset> [--repo owner/name] ' +
        '[--base <sha>] [--out <path>]\n' +
        '  --since  the last meeting, e.g. 2026-09-23T16:00:00Z. An offset is REQUIRED — see the\n' +
        '           header for the two windows a zoneless boundary silently emptied.\n' +
        '  --base   the SHA the Part 5 ledger delta is read against (default: the newest commit\n' +
        '           on origin/main before --since)',
    )
    process.exitCode = 2
    return
  }
  const since = parseBoundary(sinceRaw)
  const until = Date.now()
  const collectionErrors = []

  let base = argValue('--base')
  if (!base) {
    base = sh('git', ['log', 'origin/main', '--before', new Date(since).toISOString(), '--format=%H', '-1']).trim()
  }
  let ledger = { rows: [], totalBefore: 0, totalAfter: 0, open: [] }
  try {
    ledger = ledgerDelta(sh('git', ['show', `${base}:${LEDGER_PATH}`]), readFileSync(LEDGER_PATH, 'utf8'))
  } catch (e) {
    collectionErrors.push(`Part 5 ledger delta could not be read against \`${base}\`: ${firstLine(e)}`)
  }

  let prs = []
  try {
    const raw = JSON.parse(
      sh('gh', [
        'pr', 'list', '--repo', repo, '--state', 'merged', '--limit', '200',
        '--json', 'number,title,mergedAt,url,labels,author',
      ]),
    )
    prs = raw
      .filter((pr) => Date.parse(pr.mergedAt ?? '') >= since)
      .sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt))
    for (const pr of prs) {
      try {
        pr.files = sh('gh', ['pr', 'diff', String(pr.number), '--repo', repo, '--name-only']).split('\n').filter(Boolean)
      } catch (e) {
        collectionErrors.push(`#${pr.number}: file list unavailable (${firstLine(e)})`)
        pr.files = []
      }
      try {
        const commits = JSON.parse(
          sh('gh', ['pr', 'view', String(pr.number), '--repo', repo, '--json', 'commits']),
        ).commits.map((c) => c.oid)
        pr.checkRuns = commits.flatMap((sha) =>
          JSON.parse(
            sh('gh', [
              'api', `repos/${repo}/commits/${sha}/check-runs`,
              '--jq', '[.check_runs[] | {name, conclusion}]',
            ]),
          ),
        )
      } catch (e) {
        collectionErrors.push(`#${pr.number}: check runs unavailable (${firstLine(e)})`)
        pr.checkRuns = []
      }
    }
  } catch (e) {
    collectionErrors.push(`merged PR list unavailable: ${firstLine(e)}`)
  }

  let alarms = []
  try {
    const { declaredSchedules } = await import('./schedule-heartbeat.mjs')
    const workflows = declaredSchedules()
    const runsByWorkflow = {}
    for (const wf of workflows) {
      const file = wf.file.split('/').pop()
      try {
        runsByWorkflow[wf.file] = JSON.parse(
          sh('gh', [
            'run', 'list', '--repo', repo, '--workflow', file,
            '--limit', '60', '--json', 'conclusion,createdAt,databaseId',
          ]),
        )
      } catch (e) {
        collectionErrors.push(`${file}: run history unavailable (${firstLine(e)})`)
        runsByWorkflow[wf.file] = []
      }
    }
    alarms = alarmTable(workflows, runsByWorkflow, until)
  } catch (e) {
    collectionErrors.push(`alarm table unavailable: ${firstLine(e)}`)
  }

  let guards = []
  try {
    guards = guardCensus(collectGuards(), until)
  } catch (e) {
    collectionErrors.push(`guard census unavailable: ${firstLine(e)}`)
  }

  const split = splitPrs(prs)
  const firstTry = firstTryRate(prs)
  const sweepRow = alarms.find((a) => a.file.endsWith('review-sweep.yml'))
  const sweep = sweepRow
    ? `last run ${iso(sweepRow.lastRunAt)} (${sweepRow.lastRunConclusion}); last FIRED ${iso(sweepRow.lastFiredAt)}`
    : null

  const text = renderDigest({ since, until, prs, split, firstTry, ledger, alarms, guards, sweep, collectionErrors })
  const out = argValue('--out')
  if (out) writeFileSync(out, `${text}\n`, 'utf8')
  console.log(text)

  // THE ONLY NON-ZERO EXIT: collection failed. Never a finding — see the header.
  if (collectionErrors.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
