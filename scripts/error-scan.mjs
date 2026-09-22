// NO SHEBANG, DELIBERATELY — the same lesson `scripts/review-gate.mjs`,
// `scripts/rulebook-drift.mjs` and `scripts/review-sweep.mjs` all carry. The
// workflow runs `node scripts/error-scan.mjs`, so it was never load-bearing,
// and git hands this file to a Windows working tree with CRLF endings:
// vitest's SSR transform leaves the `\r` behind when it strips `#!…` and every
// test importing this module dies with a parse error at column 1.
/**
 * HOW FAR BACK SHOULD THE PRODUCTION ERROR SCAN LOOK, AND WHAT DID IT SEE?
 *
 * `.github/workflows/error-scan.yml` declares `cron: '*\/30 * * * *'` and used
 * to scan a fixed 35-minute window, with a comment promising that the extra
 * five minutes meant "nothing can fall between two runs".
 *
 * THAT PROMISE WAS FALSE BY AN ORDER OF MAGNITUDE, and it was measured rather
 * than suspected. Over the last 40 scheduled fires the gap between consecutive
 * runs had a **median of 239 minutes, a minimum of 117 and a maximum of 412** —
 * GitHub runs `schedule` on a best-effort queue and this repo's half-hourly
 * cron is nowhere near half-hourly in practice. A 35-minute window on a
 * 239-minute cadence scans about **15%** of production wall-clock and reports
 * "No errors in the window" about the other 85%, in the same words, on the same
 * green tick. That is the failure this repo keeps writing down in other files:
 * a check that could not do its job looking exactly like a check that found
 * nothing.
 *
 * It was latent only because the read-only IAM role does not exist yet, so
 * every run currently takes the "not configured yet" branch. Fixing it before
 * the role lands is the cheap moment.
 *
 * ------------------------------------------------------------------------
 * THE WINDOW IS NOW ANCHORED ON RUNS, NOT ON A DURATION.
 *
 *   window = [ previous successful run's createdAt , this run's createdAt )
 *
 * Consecutive windows are then CONTIGUOUS BY CONSTRUCTION — run N ends exactly
 * where run N+1 begins — so the cadence can be 30 minutes or 7 hours and
 * neither a gap nor an overlap is possible. No margin is needed, and a margin
 * would be actively wrong: it is the thing that produces duplicates.
 *
 * WHY BOTH ENDS ARE `createdAt`. Using "now" as the upper bound would leave
 * each window ending later than the next one begins, by however long the job
 * waited in GitHub's queue — a sliver that gets scanned twice. Using the run's
 * own `createdAt` costs one thing and buys one thing: the newest few minutes of
 * log wait for the next run, and the two windows join exactly. `lastGreenAt` in
 * `scripts/review-sweep.mjs` makes the same choice for the same reason, and the
 * conservative end is the one that cannot lose an event.
 *
 * WHY THE PREVIOUS RUN THAT ACTUALLY SCANNED — and not merely the previous
 * SUCCESSFUL one, which is what the first draft of this file said and got
 * wrong (Sentinel, reviewing #664).
 *
 * The reasoning was: this workflow exits 0 on every path that looked, so
 * `success` means "this run scanned its window". That is true of a run that
 * goes RED, and **false of the single most likely non-scan path**, which is the
 * branch built specifically so it does not go red: `configure-aws-credentials`
 * is `continue-on-error`, the "Not configured yet" step prints a warning, and
 * the job concludes `success` having read nothing. Filtering on `conclusion`
 * alone would let that run close a window over logs nothing ever looked at —
 * the exact defect the 35-minute window had, arriving through a different door.
 *
 * Latent while the role does not exist, because every run takes that branch and
 * there is nothing to miss. It opens the day the role lands and STS, OIDC or
 * the role itself has a bad five minutes, which is precisely the day a real
 * error is likely to be in the logs.
 *
 * So "did this run scan" is asked of the RUN'S OWN STEPS rather than inferred
 * from its conclusion: `didScan` grades the jobs payload for
 * `SCAN_STEP_NAME` concluding `success` rather than `skipped`. The workflow
 * walks candidates newest-first and anchors on the first one that did. A run
 * that failed, and a run that was never configured, are now both correctly
 * incapable of closing a window — and the next run simply covers both.
 *
 * ------------------------------------------------------------------------
 * THE CAP, AND WHY IT DOES NOT MAKE THE RUN RED.
 *
 * `MAX_LOOKBACK_MINUTES` bounds the query. Without it, a workflow that GitHub
 * disabled for inactivity (nightly.yml's header records that this happens after
 * 60 days) comes back and asks CloudWatch for two months of logs.
 *
 * When the cap binds, the minutes before it were NEVER SCANNED, and this file's
 * whole argument is that an unscanned stretch must not read as a clean one — so
 * the summary opens with a named hole, and an `::error` annotation carries it
 * into the run's annotation list.
 *
 * It is still EXIT 0, and that is deliberate rather than timid. Exit 1 here
 * would be self-defeating: a red run is not a successful run, so the next run
 * would anchor even further back, cap again, and redden again — a permanent red
 * alarm, which is a disabled alarm (§2a records six of those mornings and the
 * PR that merged into the silence they became). Exiting 0 means the hole is
 * reported exactly once, on the run it happened on, and the window is normal
 * again the next morning.
 *
 * ------------------------------------------------------------------------
 * DEDUPE: WHAT IT IS FOR, AND WHAT IT IS NOT.
 *
 * A 239-minute window over a service that is unhappy does not return 50 errors;
 * it returns one error 50 times. The old scan printed the first 50 raw lines,
 * so one noisy exception could push every OTHER distinct error out of the
 * summary — the window got bigger and the report got less informative.
 *
 * `groupEvents` fingerprints each message with the parts that vary between
 * repetitions removed (timestamps, uuids, hex ids, long digit runs, ports,
 * durations, paths' numeric segments) and reports one row per distinct shape,
 * with a count and a first/last seen. The raw sample is kept verbatim so
 * nobody has to trust the normaliser to read the error.
 *
 * It is NOT cross-run memory, and that limit is stated rather than implied: an
 * error that is still happening is reported again in the next window, because
 * it is still happening. The contiguous window above is what stops the SAME
 * OCCURRENCE being reported twice; the fingerprint is what stops one occurrence
 * repeated 400 times from being 400 rows.
 *
 * Usage:
 *   node scripts/error-scan.mjs window --last-green last-green.json --this-run this-run.json
 *   node scripts/error-scan.mjs report --events events.json --window window.json
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * The widest stretch one run will ask CloudWatch for, in minutes.
 *
 * 24 hours. Chosen against the MEASURED distribution rather than a round
 * number that felt safe: the worst observed gap between consecutive scheduled
 * fires is 412 minutes (6h52m), so this is over three times the worst real
 * cadence and cannot bind in normal operation. What it bounds is the abnormal
 * case — a workflow disabled for inactivity, a long outage, a repository that
 * sat quiet — where the alternative is a query for weeks of logs.
 *
 * Raising it is cheap and lowering it is not: below the worst real gap it
 * starts punching holes in ordinary mornings, and a hole is the exact defect
 * this file exists to close.
 */
export const MAX_LOOKBACK_MINUTES = 24 * 60

/**
 * The window used when nothing dates the previous run.
 *
 * FAILS TOWARDS SCANNING MORE. An error scan's two failure directions are not
 * symmetric — the file's own words, kept from the original: "A repeated error
 * is noise; a missed one is the whole point." So a failed lookup asks for the
 * cap rather than for a cautious half hour, and says in the summary that it is
 * doing so.
 */
export const FALLBACK_MINUTES = MAX_LOOKBACK_MINUTES

/** Below this, treat a computed window as nonsense and use the fallback. */
const MIN_SANE_MINUTES = 1

/**
 * The step whose conclusion answers "did this run actually read the logs".
 *
 * Exported and pinned by `tests/guards/error-scan.test.ts` against the workflow
 * file, because the whole anchor hangs off this string matching a step that
 * exists. Rename the step without renaming this and every run reads as
 * not-scanned — which fails safe (the window widens) but loudly, in the
 * summary, rather than silently.
 */
export const SCAN_STEP_NAME = 'Scan App Runner logs for errors'

/**
 * DID THIS RUN ACTUALLY SCAN, or did it only conclude `success`?
 *
 * Fed a `gh api repos/{repo}/actions/runs/{id}/jobs` payload. Returns true only
 * when a step named `SCAN_STEP_NAME` concluded `success`.
 *
 * `skipped` is the case this exists for and it is not an edge: when the OIDC
 * role cannot be assumed, `configure-aws-credentials` is `continue-on-error`,
 * the scan step's `if:` is false, and the JOB concludes `success` having read
 * nothing. Only the step knows.
 *
 * Unreadable input returns false — a run this cannot interrogate is one that
 * must not close a window, and erring that way widens the next window rather
 * than punching a hole in it.
 */
export function didScan(jobsPayload) {
  const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : []
  for (const job of jobs) {
    for (const step of Array.isArray(job?.steps) ? job.steps : []) {
      if (step?.name === SCAN_STEP_NAME && step?.conclusion === 'success') return true
    }
  }
  return false
}

/**
 * WHEN DID THIS SCAN LAST COMPLETE?
 *
 * Fed the rows the workflow selected — runs it has ALREADY established actually
 * scanned, via `didScan` against each candidate's jobs payload. Returns
 * `{ at, run, why }` — `at` is the epoch ms of the most recent one, or `null`
 * with a `why` that says which way the lookup failed.
 *
 * It re-filters on `conclusion === 'success'` here rather than trusting the
 * `--status success` flag the workflow passes. The flag and the filter are the
 * same assertion written twice on purpose — dropping the flag is a one-token
 * YAML edit. `lastGreenAt` in `scripts/review-sweep.mjs` is pinned the same
 * way, for the same reason.
 *
 * THE CONCLUSION FILTER IS NOT THE LOAD-BEARING ONE, and that is the correction
 * from #664's review. A run that took the "not configured yet" branch concludes
 * `success` and scanned nothing, so `conclusion` alone would let it close a
 * window over unread logs. The step-level check in `didScan` is what actually
 * decides; this filter is the belt behind it.
 */
export function lastScanAt(runs) {
  if (!Array.isArray(runs)) {
    return { at: null, run: null, why: 'the run history was not a JSON array, so the lookup returned nothing usable' }
  }
  const greens = runs
    .filter((r) => r && r.conclusion === 'success')
    .map((r) => ({ at: Date.parse(r.createdAt ?? ''), id: r.databaseId ?? null }))
    .filter((r) => Number.isFinite(r.at))

  if (!greens.length) {
    return {
      at: null,
      run: null,
      why:
        'none of the recent runs of this scan actually READ the logs — each either failed, or ' +
        'took the "not configured yet" branch, which concludes `success` having scanned nothing. ' +
        'There is therefore no completed scan to start this window at',
    }
  }
  const newest = greens.reduce((a, b) => (b.at > a.at ? b : a))
  return { at: newest.at, run: newest.id, why: null }
}

/**
 * The window this run should scan.
 *
 * `end` is this run's own `createdAt`; `start` is the previous completed scan's,
 * clamped by `MAX_LOOKBACK_MINUTES`. `holes` is the list of reasons this run
 * cannot claim to have covered everything — empty is the only clean answer, and
 * it is what the summary leads with.
 *
 * `overrideMinutes` is the `workflow_dispatch` input: an explicit human ask for
 * a fixed lookback. It is honoured exactly (still capped), and recorded in the
 * summary as an override so a dispatched run is never mistaken for a scheduled
 * one that found a small window.
 *
 * @param {{
 *   lastScan?: { at: number | null, run: number | null, why: string | null } | null,
 *   endAt?: number,
 *   overrideMinutes?: number | null,
 * }} [args]
 */
export function resolveWindow({ lastScan, endAt, overrideMinutes = null } = {}) {
  const holes = []
  const notes = []

  const end = Number.isFinite(endAt) ? Number(endAt) : Date.now()
  if (!Number.isFinite(endAt)) {
    notes.push(
      'this run\'s own `createdAt` could not be read, so the window ends at the current instant ' +
        'instead. The next run starts where this one was CREATED, so the queue wait is scanned ' +
        'twice rather than skipped — duplicated, never dropped.',
    )
  }

  if (Number.isFinite(overrideMinutes) && overrideMinutes > 0) {
    const minutes = Math.min(overrideMinutes, MAX_LOOKBACK_MINUTES)
    if (minutes < overrideMinutes) {
      holes.push(
        `the dispatched lookback of ${overrideMinutes} minutes was capped at ${MAX_LOOKBACK_MINUTES} ` +
          `(MAX_LOOKBACK_MINUTES). The ${overrideMinutes - minutes} minutes before that were not scanned.`,
      )
    }
    return {
      start: end - minutes * 60_000,
      end,
      minutes,
      source: 'override',
      anchorRun: null,
      holes,
      notes: [
        `Lookback set explicitly to ${minutes} minutes by the \`workflow_dispatch\` input. This is ` +
          'not the scheduled window: it does not join up with the previous run, and it does not ' +
          'advance anything.',
        ...notes,
      ],
    }
  }

  const anchored = Number.isFinite(lastScan?.at)
  let start = anchored ? Number(lastScan?.at) : end - FALLBACK_MINUTES * 60_000

  if (!anchored) {
    holes.push(
      `${lastScan?.why ?? 'no run history was supplied to this invocation'}. Falling back to ` +
        `${FALLBACK_MINUTES} minutes, which is the widest this scan will ask for — so anything ` +
        'older than that, if the last completed scan was older still, was NOT looked at.',
    )
  }

  const capAt = end - MAX_LOOKBACK_MINUTES * 60_000
  if (start < capAt) {
    const missed = Math.round((capAt - start) / 60_000)
    holes.push(
      `the previous completed scan was ${Math.round((end - start) / 60_000)} minutes ago, past this ` +
        `scan's ${MAX_LOOKBACK_MINUTES}-minute ceiling. **${missed} minutes of production were never ` +
        'scanned by anything** — the stretch from ' +
        `${new Date(start).toISOString()} to ${new Date(capAt).toISOString()}. If this is a ` +
        'workflow GitHub disabled for inactivity, re-enable it from the Actions tab; the window is ' +
        'normal again from the next run.',
    )
    start = capAt
  }

  let minutes = Math.round((end - start) / 60_000)
  if (!(minutes >= MIN_SANE_MINUTES)) {
    // A clock skew, a duplicated run, or two runs created in the same minute.
    // Scanning a negative or zero window would report "no errors" over no time
    // at all, which is the whole defect in miniature.
    notes.push(
      `the computed window was ${minutes} minutes, which is not a window. Scanning the last ` +
        `${MIN_SANE_MINUTES} minute(s) instead; the stretch is covered by the run either side.`,
    )
    minutes = MIN_SANE_MINUTES
    start = end - minutes * 60_000
  }

  return {
    start,
    end,
    minutes,
    source: anchored ? 'previous-scan' : 'fallback',
    anchorRun: anchored ? (lastScan.run ?? null) : null,
    holes,
    notes,
  }
}

/**
 * Strip the parts of a log line that change between repetitions of the SAME
 * error, so two occurrences fingerprint identically.
 *
 * Ordered widest-first on purpose: a uuid is also a run of hex, and a
 * timestamp is also a run of digits, so the specific shapes have to be
 * consumed before the generic ones or the generic rule eats them and two
 * genuinely different errors collapse into one row.
 *
 * Over-normalising costs a merged pair of distinct errors; under-normalising
 * costs a summary full of the same line. Both are visible in the output — the
 * count and the verbatim sample are printed together — which is why this is a
 * readable heuristic rather than a strict parser.
 */
export function fingerprint(message) {
  return String(message ?? '')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<ts>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<hex>')
    .replace(/\b\d+(?:\.\d+)?\s?ms\b/gi, '<dur>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Group raw CloudWatch events into distinct error shapes.
 *
 * Input is `aws logs filter-log-events --output json` events —
 * `{ eventId, timestamp, message }` — from every scanned group, tagged with
 * the group they came from.
 *
 * Identical `eventId`s are dropped first: overlapping `--next-token` pages and
 * a log group listed twice both produce them, and they are the one duplicate
 * class that is never a real repetition.
 */
export function groupEvents(events) {
  const seenIds = new Set()
  const groups = new Map()
  let duplicateIds = 0
  let unreadable = 0

  for (const e of Array.isArray(events) ? events : []) {
    if (!e || typeof e.message !== 'string') {
      unreadable++
      continue
    }
    if (e.eventId != null) {
      if (seenIds.has(e.eventId)) {
        duplicateIds++
        continue
      }
      seenIds.add(e.eventId)
    }
    const key = fingerprint(e.message)
    const at = Number.isFinite(e.timestamp) ? e.timestamp : null
    const existing = groups.get(key)
    if (existing) {
      existing.count++
      if (at != null) {
        existing.firstAt = existing.firstAt == null ? at : Math.min(existing.firstAt, at)
        existing.lastAt = existing.lastAt == null ? at : Math.max(existing.lastAt, at)
      }
      if (e.logGroup) existing.logGroups.add(e.logGroup)
    } else {
      groups.set(key, {
        key,
        count: 1,
        sample: e.message,
        firstAt: at,
        lastAt: at,
        logGroups: new Set(e.logGroup ? [e.logGroup] : []),
      })
    }
  }

  const distinct = [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  const total = distinct.reduce((n, g) => n + g.count, 0)
  return { distinct, total, duplicateIds, unreadable }
}

/**
 * How many raw events came back per log group, for the truncation check.
 *
 * Counts the RAW list rather than the grouped one on purpose: `--max-items` is
 * a ceiling on what the query returned, and dedupe happens afterwards.
 */
export function countPerGroup(events) {
  const counts = new Map()
  for (const e of Array.isArray(events) ? events : []) {
    const g = e?.logGroup ?? 'unknown'
    counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  return [...counts.entries()]
}

/** How many distinct shapes the summary prints before it says "and N more". */
const MAX_ROWS = 25
/** How many characters of a sample line survive into the summary. */
const MAX_SAMPLE = 600

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : 'unknown')

/**
 * The whole job summary.
 *
 * LEADS WITH WHAT IT LOOKED AT, and with any hole in it, never with a tick —
 * the same shape `renderObligation` in `scripts/review-sweep.mjs` uses, for the
 * same reason: a clean report from an alarm that examined nothing is the exact
 * thing this rewrite exists to make impossible.
 */
export function renderSummary(window, grouped, extra = {}) {
  const { scannedGroups = [], truncated = null, unreadableGroups = null, notConfigured = false } = extra
  const lines = ['### Production error scan', '']

  if (notConfigured) {
    lines.push(
      'Not configured yet — the read-only role could not be assumed, so **nothing was scanned**. ' +
        'See `docs/PROD-READ-ACCESS.md`. Skipped, not passed.',
      '',
    )
    return lines.join('\n')
  }

  lines.push(
    `Window: **${iso(window.start)} → ${iso(window.end)}** (${window.minutes} minutes), ` +
      (window.source === 'previous-scan'
        ? `starting exactly where run \`${window.anchorRun ?? 'unknown'}\` — the previous completed ` +
          'scan — started, so the two windows join with no gap and no overlap.'
        : window.source === 'override'
          ? 'set by hand on a dispatched run.'
          : 'sized by the fallback, because the previous scan could not be dated.'),
    '',
  )

  const holes = [
    ...(window.holes ?? []),
    ...(truncated ? [truncated] : []),
    ...(unreadableGroups ? [unreadableGroups] : []),
  ]
  if (holes.length) {
    lines.push(
      '#### This run did not see its whole window',
      '',
      ...holes.map((h) => `- ${h}`),
      '',
      'This is stated first because a scan with a hole in it and a scan that found nothing look ' +
        'identical from the outside. The run still exits 0 — it does not gate, and a red run here ' +
        'would anchor the next window even further back and redden it too, which is how an alarm ' +
        'becomes wallpaper.',
      '',
    )
  }

  for (const n of window.notes ?? []) lines.push(`_${n}_`, '')

  lines.push(
    `Scanned **${scannedGroups.length}** application log ${scannedGroups.length === 1 ? 'group' : 'groups'}` +
      (scannedGroups.length ? `: ${scannedGroups.map((g) => `\`${g}\``).join(', ')}` : ' — nothing to scan') +
      '.',
    '',
  )

  if (!grouped.total) {
    lines.push('No error lines in the window.', '')
    return lines.join('\n')
  }

  lines.push(
    `#### ${grouped.distinct.length} distinct ${grouped.distinct.length === 1 ? 'error' : 'errors'}, ` +
      `${grouped.total} ${grouped.total === 1 ? 'line' : 'lines'} in total`,
    '',
    'Grouped by the shape of the message rather than listed raw: a long window over an unhappy ' +
      'service returns one error many times, and printing those raw pushes every OTHER distinct ' +
      'error out of the report.',
    '',
  )

  for (const g of grouped.distinct.slice(0, MAX_ROWS)) {
    const span =
      g.firstAt != null && g.lastAt != null && g.firstAt !== g.lastAt
        ? `${iso(g.firstAt)} → ${iso(g.lastAt)}`
        : iso(g.firstAt)
    lines.push(
      `<details><summary><strong>×${g.count}</strong> — ${span}</summary>`,
      '',
      '```',
      g.sample.slice(0, MAX_SAMPLE) + (g.sample.length > MAX_SAMPLE ? ' …[truncated]' : ''),
      '```',
      '',
      `Log group(s): ${[...g.logGroups].map((n) => `\`${n}\``).join(', ') || 'unknown'}`,
      '',
      '</details>',
    )
  }
  if (grouped.distinct.length > MAX_ROWS) {
    lines.push('', `…and ${grouped.distinct.length - MAX_ROWS} more distinct error(s) not shown.`)
  }

  // Counted and named rather than silently dropped.
  if (grouped.duplicateIds) {
    lines.push('', `_${grouped.duplicateIds} event(s) arrived twice with the same \`eventId\` and were dropped._`)
  }
  if (grouped.unreadable) {
    lines.push('', `_${grouped.unreadable} event(s) carried no readable message and were not graded._`)
  }

  lines.push('')
  return lines.join('\n')
}

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Read a JSON file, saying which way it failed rather than pretending it was empty. */
function readJson(path) {
  if (!path) return { value: null, why: 'no path was given' }
  if (!existsSync(path)) return { value: null, why: `the file \`${path}\` was not written` }
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), why: null }
  } catch (err) {
    return { value: null, why: `the file \`${path}\` is not JSON (${err.message})` }
  }
}

function emit(text) {
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
}

function output(pairs) {
  if (!process.env.GITHUB_OUTPUT) return
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(pairs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')
}

/** `window` — resolve the window and hand it to the shell that runs the AWS query. */
function cmdWindow() {
  const runs = readJson(argValue('--last-green'))
  const lastScan = runs.value ? lastScanAt(runs.value) : { at: null, run: null, why: runs.why }

  const thisRun = readJson(argValue('--this-run'))
  const createdAt = Array.isArray(thisRun.value) ? thisRun.value[0]?.createdAt : thisRun.value?.createdAt
  const endAt = Date.parse(createdAt ?? '')

  const overrideRaw = argValue('--minutes')
  const overrideMinutes = overrideRaw ? Number(overrideRaw) : null

  const win = resolveWindow({ lastScan, endAt, overrideMinutes })
  const path = argValue('--out', 'window.json')
  writeFileSync(path, JSON.stringify(win, null, 2))
  output({ start: String(win.start), end: String(win.end), minutes: String(win.minutes) })
  console.log(`[error-scan] window ${iso(win.start)} → ${iso(win.end)} (${win.minutes}m, ${win.source})`)
  for (const h of win.holes) console.log(`::error title=The error scan could not see its whole window::${h}`)
}

/** `report` — group what the AWS query returned and write the summary. */
function cmdReport() {
  const win = readJson(argValue('--window'))
  if (!win.value) {
    // Without a window there is nothing to claim, so claim nothing loudly.
    emit(
      '### Production error scan\n\n#### This run produced no report\n\n' +
        `${win.why} — the window step did not hand this one anything, so **nothing was graded**. ` +
        'Skipped, not passed.\n',
    )
    console.log('::error title=The error scan produced no report::the window file was missing or unreadable')
    return
  }

  if (process.argv.includes('--not-configured')) {
    emit(renderSummary(win.value, groupEvents([]), { notConfigured: true }))
    return
  }

  const events = readJson(argValue('--events'))
  const grouped = groupEvents(events.value ?? [])
  const scannedRaw = argValue('--groups', '')
  const scannedGroups = scannedRaw ? scannedRaw.split(/\s+/).filter(Boolean) : []

  // A LOG GROUP WHOSE QUERY FAILED IS A HOLE, NOT A QUIET GROUP (Sentinel,
  // reviewing #664). The loop keeps going so one throttled call does not lose
  // the whole scan, and the group it could not read is named here instead of
  // being reported as scanned and clean — the same defect as the 35-minute
  // window, one scale down, inside this PR's own new code.
  const failedRaw = argValue('--failed-groups', '')
  const failedGroups = failedRaw ? failedRaw.split(/\s+/).filter(Boolean) : []

  // TRUNCATION IS GRADED PER LOG GROUP, not on the combined list. `--max-items`
  // is a per-query ceiling, so comparing the aggregate against it would report
  // a hole the moment two quiet groups add up to the limit between them — a
  // false alarm on an instrument whose entire value is being believed.
  const limit = Number(argValue('--limit', '0'))
  const atCeiling = limit ? countPerGroup(events.value).filter(([, n]) => n >= limit) : []
  const truncated = atCeiling.length
    ? `${atCeiling.map(([g, n]) => `\`${g}\` returned ${n} events`).join('; ')} — the per-group ` +
      `ceiling is ${limit}, so ${atCeiling.length === 1 ? 'that list was' : 'those lists were'} ` +
      'TRUNCATED and the tail of this window was never read. Raise `MAX_EVENTS` in ' +
      '`.github/workflows/error-scan.yml`.'
    : null

  const unreadable = failedGroups.length
    ? `the CloudWatch query failed for ${failedGroups.map((g) => `\`${g}\``).join(', ')} — that log ` +
      'group was NOT read over this window, and is reported here rather than counted as quiet. A ' +
      'throttle, an expired token mid-loop or a malformed filter all look like an empty result ' +
      'from the outside, which is the whole failure this scan exists to refuse.'
    : null

  const summary = renderSummary(win.value, grouped, {
    scannedGroups,
    truncated,
    unreadableGroups: unreadable,
  })
  emit(summary)

  for (const h of [
    ...(win.value.holes ?? []),
    ...(truncated ? [truncated] : []),
    ...(unreadable ? [unreadable] : []),
  ]) {
    console.log(`::error title=The error scan could not see its whole window::${h}`)
  }
  if (grouped.total) {
    // A warning, not a failure. This job reports; it does not gate, and a red
    // tick here would train people to ignore it — kept verbatim from the
    // workflow this logic moved out of.
    console.log(
      `::warning title=${grouped.distinct.length} distinct error(s) in production::` +
        `${grouped.total} error line(s) over ${win.value.minutes} minutes — see the job summary.`,
    )
  }
}

/**
 * `scanned` — exit 0 if the run whose jobs payload this is actually READ the
 * logs, non-zero otherwise. The workflow walks candidate runs newest-first and
 * anchors its window on the first one this says yes to.
 *
 * It is a separate command rather than a flag on `window` because the workflow
 * has to ask it once per candidate, inside a loop, before it knows which run to
 * pass to `window` at all.
 */
function cmdScanned() {
  const jobs = readJson(argValue('--jobs'))
  if (!jobs.value) {
    console.log(`[error-scan] ${jobs.why} — treating this run as one that did not scan`)
    process.exitCode = 2
    return
  }
  const scanned = didScan(jobs.value)
  console.log(`[error-scan] ${scanned ? 'scanned' : 'did NOT scan'} (looking for step "${SCAN_STEP_NAME}")`)
  process.exitCode = scanned ? 0 : 1
}

function main() {
  const cmd = process.argv[2]
  if (cmd === 'window') return cmdWindow()
  if (cmd === 'report') return cmdReport()
  if (cmd === 'scanned') return cmdScanned()
  console.log('[error-scan] usage: node scripts/error-scan.mjs (window|report|scanned) [flags]')
  process.exitCode = 1
}

// Direct invocation only, so the guard test can import the pure halves.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
