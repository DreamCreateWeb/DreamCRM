// NO SHEBANG, DELIBERATELY — the same lesson `scripts/review-gate.mjs`,
// `scripts/rulebook-drift.mjs`, `scripts/review-sweep.mjs` and
// `scripts/error-scan.mjs` all carry. The workflow runs `node
// scripts/schedule-heartbeat.mjs`, so it was never load-bearing, and git hands
// this file to a Windows working tree with CRLF endings: vitest's SSR transform
// leaves the `\r` behind when it strips `#!…` and every test importing this
// module dies with a parse error at column 1.
/**
 * IS EVERY ALARM IN THIS REPOSITORY STILL FIRING?
 *
 * WIDENED 2026-09-23 (DREAMCRM-115). This file was "is every SCHEDULED
 * workflow still firing" because a cron was the only way an alarm ran here.
 * `push-alarm.yml` is the first that runs on another workflow's completion,
 * and it inherits the exact property below, so it is watched by the same job —
 * with a different QUESTION, because an alarm with no cadence cannot be late.
 * See "THE OTHER KIND OF ALARM" further down for the pairing rule; the rest of
 * this docblock is about the schedules and is unchanged.
 *
 * This repo has six scheduled workflows and, until now, **nothing checked that
 * any of them ran**. Every one of them is an alarm — the production error scan,
 * the nightly suite, the production read check, the post-merge review sweep,
 * the rulebook drift check, the migration check. An alarm that has stopped
 * firing is indistinguishable, from every surface anybody looks at, from an
 * alarm reporting that everything is fine. Both are silence.
 *
 * That is not a hypothetical property of schedules in general, it is a
 * documented property of THIS platform: `nightly.yml`'s own header records that
 * **GitHub disables scheduled workflows in a repository with 60 days of no
 * activity**, and its advice is "check the Actions tab for the re-enable banner
 * before assuming the suite is fine" — advice that only works while somebody
 * chooses to look. On DREAMCRM-99 all six were verified by hand, which is the
 * point: a hand check is what you do when nothing else is checking.
 *
 * So: one small daily job that asks, of every scheduled workflow in
 * `.github/workflows/`, whether it has a `schedule`-triggered run inside the
 * window its own cron implies.
 *
 * ------------------------------------------------------------------------
 * THE LIST IS DERIVED FROM THE TREE, NEVER TYPED HERE.
 *
 * `declaredSchedules` reads the workflow files and takes every `cron:` under
 * `on.schedule`. A workflow added tomorrow is watched tomorrow, with no edit to
 * this file and no second list to fall out of date — the mistake
 * `docs/E2E.md` made against `e2e/axe-baseline.ts` (36 against 18, two batches
 * apart) and the one `scripts/rulebook-drift.mjs` exists because of. The
 * heartbeat is one more restated number away from being exactly the thing it
 * was built to catch.
 *
 * ------------------------------------------------------------------------
 * THE WINDOW IS GENEROUS ON PURPOSE, AND THE NUMBER IS MEASURED.
 *
 *   expected = max(2 x nominal interval, nominal interval + SLIP_ALLOWANCE)
 *
 * GitHub runs `schedule` on a best-effort queue and this repository's crons are
 * nowhere near punctual. Measured on 2026-09-22, the five daily jobs nominally
 * scheduled for 06:17, 06:37, 06:47 and 08:20 UTC actually fired at 11:34,
 * 11:59, 12:01, 12:03 and 13:26 — **five to five and a half hours late, on an
 * ordinary day**. The half-hourly error scan's gap between consecutive fires
 * has a median of 239 minutes and a maximum of 412 (DREAMCRM-99 deliverable 1).
 *
 * This check therefore has exactly one job and must not be mistaken for a
 * second: it answers **"has this stopped?"**, not "did this run on time". A
 * tighter window would spend its credibility on GitHub's queue and be muted
 * inside a fortnight, and a muted alarm-watcher is worse than none — it is the
 * silence with a tick on it.
 *
 * ------------------------------------------------------------------------
 * WHY THIS ONE DOES GO RED, WHEN `error-scan.yml` DELIBERATELY DOES NOT.
 *
 * §2a's lesson is that a permanently red alarm is a disabled alarm — six red
 * review-sweep mornings became wallpaper, and #636 merged into them. That
 * lesson bites when the red state has a QUEUE behind it that somebody has to
 * work through entry by entry, so the alarm stays red for days through no fault
 * of the next reader.
 *
 * This one has no queue. Its findings are binary and single-action: a workflow
 * is disabled (click Enable), or it has not fired inside a window twice its own
 * cadence (which in this repo means it is disabled, deleted, or its cron no
 * longer parses). The red clears the same day it is dealt with. So red is the
 * right signal here and exit 0 would be the wrong one — a heartbeat that cannot
 * fail is the thing it was written to detect.
 *
 * ------------------------------------------------------------------------
 * WHAT WATCHES THE WATCHER — stated, because a blind-spot list that omits a
 * known blind spot spends the credibility it exists for:
 *
 *   * **Itself, partially.** This workflow has a cron, so it is in its own
 *     derived list and reports on its own lateness like any other.
 *   * **Nothing, if it stops entirely.** If GitHub disables THIS workflow, it
 *     does not run, so it does not report that it did not run. That is not
 *     solvable by adding a second heartbeat — it is the same problem one level
 *     up — and the honest mitigation is that inactivity-disabling hits every
 *     schedule in the repository at once, so the other five going quiet is the
 *     same event.
 *   * **A workflow that fires and does nothing.** This grades that a run
 *     EXISTS, not what it did. `tests/guards/…` and each workflow's own exit
 *     status own that. The distinction is the one §2c records: a guard
 *     asserting a call exists has asserted nothing about whether it runs.
 *   * **A cron this parser cannot read.** Rather than skipping it, an
 *     unparseable expression is reported as a finding of its own, because a
 *     schedule nobody can grade is exactly the state this file exists to refuse.
 *   * **One inbox deep**, the same honest answer `post-merge-e2e.yml` and
 *     `review-sweep.yml` both give: nothing in `.github/` routes a workflow
 *     failure anywhere, so delivery is GitHub's default failed-run notification
 *     plus the Actions tab. If this starts getting ignored, give it a real
 *     addressee; do not delete it.
 *   * **A `workflow_run` alarm whose upstream has been quiet.** Graded
 *     `no-upstream-activity` and NOT a finding: there is genuinely nothing to
 *     pair against, and reporting a quiet week of merges as a dead alarm is
 *     how a check gets muted. The cost is real and stated — such an alarm can
 *     be disconnected for as long as nobody merges, which in this repository
 *     is hours rather than days.
 *
 * Usage:
 *   node scripts/schedule-heartbeat.mjs --runs runs.json --workflows workflows.json
 *     [--added added.json] [--watcher-runs watcher-runs.json] [--recent-runs recent-runs.json]
 */
import { readdirSync, readFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * How much lateness is forgiven on top of one nominal interval, in minutes.
 *
 * TWELVE HOURS, and the number is measured rather than picked. The worst
 * observed gap between consecutive fires of the half-hourly error scan is 412
 * minutes; the daily jobs were observed 5h26m late on an ordinary Tuesday; and
 * `docs/CI.md` ("When it really runs") carries a sample of a `0 7` schedule
 * landing +6h34m late. 720 gives ~75% headroom over the worst thing this repo
 * has actually seen.
 *
 * Lower it and this check starts reporting GitHub's queue as a defect, which is
 * how an alarm gets muted. Raise it much and a stopped half-hourly job goes
 * unnoticed for a day.
 */
export const SLIP_ALLOWANCE_MINUTES = 720

/** Where the workflow files live, relative to the repo root. */
export const WORKFLOW_DIR = '.github/workflows'

/* ------------------------------------------------------------------ cron -- */

/** Expand one cron field into the set of values it matches. */
function fieldValues(spec, min, max) {
  const out = new Set()
  for (const part of String(spec).split(',')) {
    const [range, stepRaw] = part.split('/')
    const step = stepRaw === undefined ? 1 : Number(stepRaw)
    if (!Number.isInteger(step) || step < 1) return null

    let lo
    let hi
    if (range === '*') {
      lo = min
      hi = max
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map(Number)
      if (!Number.isInteger(a) || !Number.isInteger(b)) return null
      lo = a
      hi = b
    } else {
      const n = Number(range)
      if (!Number.isInteger(n)) return null
      lo = n
      // A bare value with a step means "from here to the end of the field",
      // which is how `5/15` is read — not a single value stepped by 15.
      hi = stepRaw === undefined ? n : max
    }
    if (lo < min || hi > max || lo > hi) return null
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out.size ? out : null
}

/**
 * Parse a 5-field cron expression into matchers, or null if it cannot be read.
 *
 * Deliberately narrow: GitHub Actions accepts POSIX cron and nothing else — no
 * `L`, no `#`, no `@daily`, no seconds field. An expression this returns null
 * for is one GitHub would also refuse, and an ungradeable schedule is reported
 * rather than skipped.
 */
export function parseCron(expr) {
  const parts = String(expr ?? '').trim().split(/\s+/)
  if (parts.length !== 5) return null
  const minute = fieldValues(parts[0], 0, 59)
  const hour = fieldValues(parts[1], 0, 23)
  const dom = fieldValues(parts[2], 1, 31)
  const month = fieldValues(parts[3], 1, 12)
  // 7 is Sunday in several cron dialects; normalise so `0-7` behaves.
  const dowRaw = fieldValues(parts[4], 0, 7)
  if (!minute || !hour || !dom || !month || !dowRaw) return null
  const dow = new Set([...dowRaw].map((d) => (d === 7 ? 0 : d)))
  return {
    minute,
    hour,
    dom,
    month,
    dow,
    domRestricted: parts[2] !== '*',
    dowRestricted: parts[4] !== '*',
  }
}

/** Does this cron fire at this UTC instant (minute resolution)? */
function fires(cron, date) {
  if (!cron.minute.has(date.getUTCMinutes())) return false
  if (!cron.hour.has(date.getUTCHours())) return false
  if (!cron.month.has(date.getUTCMonth() + 1)) return false

  const domHit = cron.dom.has(date.getUTCDate())
  const dowHit = cron.dow.has(date.getUTCDay())
  // Standard cron: when BOTH day fields are restricted they are ORed, not
  // ANDed. Getting this backwards would under-report fires and so overstate
  // every interval — the direction that makes this check blind.
  if (cron.domRestricted && cron.dowRestricted) return domHit || dowHit
  if (cron.domRestricted) return domHit
  if (cron.dowRestricted) return dowHit
  return true
}

/**
 * The SHORTEST gap between two consecutive fires, in minutes — the cadence the
 * schedule promises at its most frequent.
 *
 * Measured by walking the calendar rather than pattern-matching the
 * expression, because the interesting expressions are the irregular ones:
 * `0 9 * * 1-5` promises daily on weekdays and 72 hours across a weekend, and
 * the honest nominal interval is the smaller one. Taking the MINIMUM is the
 * conservative direction for a cadence, and the window doubles it anyway.
 *
 * Returns null for a schedule that fires at most once in the span looked at —
 * reported as ungradeable rather than guessed.
 */
export function nominalIntervalMinutes(expr, { spanDays = 28, from = Date.UTC(2026, 0, 1) } = {}) {
  const cron = parseCron(expr)
  if (!cron) return null

  let previous = null
  let shortest = null
  const total = spanDays * 24 * 60
  for (let i = 0; i < total; i++) {
    const at = from + i * 60_000
    if (!fires(cron, new Date(at))) continue
    if (previous != null) {
      const gap = (at - previous) / 60_000
      if (shortest == null || gap < shortest) shortest = gap
    }
    previous = at
  }
  // A monthly or annual schedule needs a longer look before it has two fires.
  if (shortest == null && spanDays < 800) {
    return nominalIntervalMinutes(expr, { spanDays: 800, from })
  }
  return shortest
}

/** How stale a schedule's newest run may be before this check calls it stopped. */
export function expectedWindowMinutes(intervalMinutes) {
  return Math.max(2 * intervalMinutes, intervalMinutes + SLIP_ALLOWANCE_MINUTES)
}

/* ------------------------------------------------------- the derived list -- */

/**
 * Every `cron:` under `on.schedule` in every workflow file.
 *
 * Read with a scanner rather than a YAML parser because this repo has no YAML
 * dependency and adding one to a guard would put a parser between the check and
 * the bytes GitHub actually reads. The scanner is deliberately literal: it
 * finds the `schedule:` key, then takes `- cron: '…'` lines while the
 * indentation stays deeper than the key's.
 */
export function declaredSchedules(dir = join(process.cwd(), WORKFLOW_DIR)) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(name)) continue
    const text = readFileSync(join(dir, name), 'utf8')
    const crons = cronsIn(text)
    if (crons.length) out.push({ file: name, crons })
  }
  return out
}

/** The scanner above, split out so the guard test can drive it with a string. */
export function cronsIn(text) {
  const lines = String(text ?? '').split('\n')
  const crons = []
  let depth = null
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (/^\s*#/.test(line) || !line.trim()) continue
    const indent = line.length - line.trimStart().length

    if (depth != null && indent <= depth) depth = null
    if (/^\s*schedule:\s*$/.test(line)) {
      depth = indent
      continue
    }
    if (depth == null) continue

    const m = /^\s*-\s*cron:\s*(.+?)\s*$/.exec(line)
    if (m) crons.push(m[1].replace(/^['"]|['"]$/g, ''))
  }
  return crons
}

/* ------------------------------------------------ the OTHER kind of alarm -- */

/**
 * THE SECOND SUBJECT, ADDED DREAMCRM-115.
 *
 * This file started as "is every SCHEDULED workflow still firing", and that
 * was the whole set of alarms the repository had. `push-alarm.yml` is the
 * first that runs on another workflow's completion instead of on a clock, and
 * it inherits the property this file exists for exactly: an alarm that has
 * stopped firing is indistinguishable from one reporting that everything is
 * fine. Both are silence.
 *
 * IT NEEDED A DIFFERENT QUESTION, not a bigger window. A `workflow_run` alarm
 * has no cadence to be late against — it is precisely as punctual as the
 * workflow it watches, and `deploy.yml` fires when somebody merges. Asking
 * "has it run in the last N hours" would report a quiet Sunday as a dead
 * alarm. The honest question is PAIRING: for the newest settled run of the
 * workflow it watches, is there a run of the alarm at or after it?
 *
 * That catches every way this can break — the file deleted, GitHub disabling
 * it, and the sharp one: `workflow_run.workflows:` matches the upstream's
 * DISPLAY NAME, so editing the first line of `deploy.yml` disconnects the
 * alarm with no error anywhere. `unknown-upstream` below is that case, and it
 * is graded from the tree rather than from a list kept here.
 */

/**
 * How long after an upstream run settles before a missing alarm run is a
 * finding, in minutes.
 *
 * TWO HOURS. `workflow_run` dispatch is usually seconds, but it rides the same
 * best-effort queue as everything else here and this file's whole argument is
 * that GitHub's queue must never be graded as a defect — the daily crons were
 * measured five and a half hours late on an ordinary day. Two hours is far
 * more headroom than any observed `workflow_run` delay and still means a
 * disconnected alarm is reported by the next morning's heartbeat, which is the
 * cadence this check has anyway.
 */
export const PAIRING_GRACE_MINUTES = 120

/**
 * Every workflow that runs on another workflow's completion, and which
 * upstream NAMES it watches.
 *
 * Same scanner shape as `cronsIn` and for the same reason: this repo has no
 * YAML dependency, and adding one to a guard would put a parser between the
 * check and the bytes GitHub actually reads.
 */
export function watchersIn(text) {
  const lines = String(text ?? '').split('\n')
  const names = []
  let depth = null
  let inList = false
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (/^\s*#/.test(line) || !line.trim()) continue
    const indent = line.length - line.trimStart().length

    if (depth != null && indent <= depth) {
      depth = null
      inList = false
    }
    if (/^\s*workflow_run:\s*$/.test(line)) {
      depth = indent
      continue
    }
    if (depth == null) continue

    // Flow style: `workflows: ['A', "B"]` — one line, which is how
    // `push-alarm.yml` writes it.
    const flow = /^\s*workflows:\s*\[(.*)\]\s*$/.exec(line)
    if (flow) {
      for (const part of flow[1].split(',')) {
        const v = part.trim().replace(/^['"]|['"]$/g, '')
        if (v) names.push(v)
      }
      continue
    }
    // Block style: `workflows:` then `- A` on following lines.
    if (/^\s*workflows:\s*$/.test(line)) {
      inList = true
      continue
    }
    if (inList) {
      const item = /^\s*-\s*(.+?)\s*$/.exec(line)
      if (item) {
        names.push(item[1].replace(/^['"]|['"]$/g, ''))
        continue
      }
      inList = false
    }
  }
  return names
}

/** The top-level `name:` of a workflow file — what `workflow_run` matches on. */
export function workflowName(text) {
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (/^\s*#/.test(line) || !line.trim()) continue
    const m = /^name:\s*(.+?)\s*$/.exec(line)
    if (m) return m[1].replace(/^['"]|['"]$/g, '')
    // Only the first top-level key can be `name:`; anything else at column 0
    // means this file does not declare one.
    if (/^\S/.test(line)) return null
  }
  return null
}

/**
 * Read the tree once: which files watch which upstream NAMES, and which file
 * answers to each name.
 */
export function declaredWatchers(dir = join(process.cwd(), WORKFLOW_DIR)) {
  const watchers = []
  const byName = {}
  for (const name of readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(name)) continue
    const text = readFileSync(join(dir, name), 'utf8')
    const declared = workflowName(text)
    if (declared) byName[declared] = name
    const upstream = watchersIn(text)
    if (upstream.length) watchers.push({ file: name, upstream })
  }
  return { watchers, byName }
}

/**
 * Grade one `workflow_run` alarm.
 *
 * `run` is its newest `workflow_run`-triggered run (or null). `upstreamRuns`
 * maps upstream FILE name to that workflow's recent runs, newest first.
 * `byName` maps an upstream display name to the file that declares it.
 */
export function assessWatcher({ file, upstream, run, upstreamRuns = {}, byName = {}, state, addedAt, now }) {
  const unknown = upstream.filter((n) => !(n in byName))
  if (unknown.length) {
    return {
      file,
      kind: 'watcher',
      verdict: 'unknown-upstream',
      detail:
        `it watches ${unknown.map((n) => `\`${n}\``).join(', ')}, and no workflow file in ` +
        '`.github/workflows/` declares that `name:`. `workflow_run` matches the upstream\'s DISPLAY ' +
        'NAME rather than its filename, so this alarm currently fires for nothing — and a trigger ' +
        'that matches nothing is not an error anywhere, it is a workflow that never runs.',
    }
  }

  if (state && state !== 'active') {
    return {
      file,
      kind: 'watcher',
      verdict: 'disabled',
      detail:
        `GitHub reports this workflow as \`${state}\`, so it is not firing at all. ` +
        (state === 'disabled_inactivity'
          ? 'That is the 60-day-quiet-repository case `nightly.yml` warns about — re-enable it from ' +
            'the Actions tab.'
          : 'Someone disabled it by hand. Re-enable it, or delete the workflow so this check stops ' +
            'expecting it.'),
    }
  }

  // The newest upstream run that has SETTLED and has had the grace period to
  // dispatch this alarm. `status === 'completed'` is load-bearing: a run still
  // rolling out has not triggered anything yet, and grading against it would
  // report every alarm as missing during every deploy.
  const cutoff = now - PAIRING_GRACE_MINUTES * 60_000
  let newest = null
  for (const name of upstream) {
    for (const r of upstreamRuns[byName[name]] ?? []) {
      if (!r || r.status !== 'completed') continue
      const at = Date.parse(r.createdAt ?? '')
      if (!Number.isFinite(at) || at > cutoff) continue
      if (!newest || at > newest.at) newest = { at, run: r, upstream: name }
    }
  }

  if (!newest) {
    return {
      file,
      kind: 'watcher',
      verdict: 'no-upstream-activity',
      detail:
        `${upstream.map((n) => `\`${n}\``).join(', ')} has no settled run older than the ` +
        `${PAIRING_GRACE_MINUTES}-minute grace period, so there is nothing to pair against. A quiet ` +
        'week of merges is not a dead alarm, and reporting it as one is how a check gets muted.',
    }
  }

  const lastAt = run?.createdAt ? Date.parse(run.createdAt) : NaN
  const paired = Number.isFinite(lastAt) && lastAt >= newest.at

  if (paired) {
    return {
      file,
      kind: 'watcher',
      verdict: 'ok',
      ageMinutes: Math.round((now - lastAt) / 60_000),
      lastAt,
      conclusion: run?.conclusion ?? null,
      upstream: newest.upstream,
    }
  }

  const added = addedAt ? Date.parse(addedAt) : NaN
  if (Number.isFinite(added) && added > newest.at) {
    return {
      file,
      kind: 'watcher',
      verdict: 'not-yet-due',
      ageMinutes: null,
      detail:
        'this workflow file is newer than the upstream run being paired against, so it could not ' +
        'have run for it. Not a finding until the next one. Note that GitHub only dispatches ' +
        '`workflow_run` from the DEFAULT branch — an alarm that has only ever existed on a feature ' +
        'branch has never been registered.',
    }
  }

  return {
    file,
    kind: 'watcher',
    verdict: 'unpaired',
    ageMinutes: Number.isFinite(lastAt) ? Math.round((now - lastAt) / 60_000) : null,
    detail:
      `\`${newest.upstream}\` run ${newest.run.databaseId} settled at ${newest.run.createdAt} and ` +
      'this alarm has no `workflow_run` run at or after it' +
      (Number.isFinite(lastAt) ? `; its newest is ${run.createdAt}` : ' — it has never fired at all') +
      `. That is past the ${PAIRING_GRACE_MINUTES}-minute grace period, so it is not the queue. ` +
      'The alarm is disconnected: check it still exists on the default branch, that GitHub has not ' +
      'disabled it, and that its `workflows:` list still matches the upstream\'s `name:`.',
  }
}

/* --------------------------------------------------------------- verdict -- */

/**
 * Grade one workflow.
 *
 * `run` is the newest `schedule`-triggered run GitHub has for it (or null).
 * `state` is what `gh workflow list` says — `active`, `disabled_manually` or
 * `disabled_inactivity`. `addedAt` is when the FILE first appeared, so a
 * workflow merged this morning is not reported as stopped before its first
 * fire is even due.
 */
export function assessWorkflow({ file, crons, run, state, addedAt, now }) {
  const intervals = crons.map((c) => ({ cron: c, minutes: nominalIntervalMinutes(c) }))
  const unreadable = intervals.filter((i) => i.minutes == null)
  if (unreadable.length) {
    return {
      file,
      verdict: 'unreadable-cron',
      detail:
        `${unreadable.map((i) => `\`${i.cron}\``).join(', ')} — this check cannot work out how often ` +
        'that fires, so it cannot tell whether it stopped. A schedule nobody can grade is the ' +
        'state this whole job exists to refuse; fix the expression or widen `parseCron`.',
    }
  }

  const interval = Math.min(...intervals.map((i) => /** @type {number} */ (i.minutes)))
  const window = expectedWindowMinutes(interval)

  if (state && state !== 'active') {
    return {
      file,
      verdict: 'disabled',
      interval,
      window,
      detail:
        `GitHub reports this workflow as \`${state}\`, so it is not firing at all. ` +
        (state === 'disabled_inactivity'
          ? 'That is the 60-day-quiet-repository case `nightly.yml` warns about — re-enable it from ' +
            'the Actions tab.'
          : 'Someone disabled it by hand. Re-enable it, or delete the `schedule:` block so this ' +
            'check stops expecting it.'),
    }
  }

  const lastAt = run?.createdAt ? Date.parse(run.createdAt) : NaN
  const ageMinutes = Number.isFinite(lastAt) ? Math.round((now - lastAt) / 60_000) : null

  if (ageMinutes == null) {
    const added = addedAt ? Date.parse(addedAt) : NaN
    const youngMinutes = Number.isFinite(added) ? Math.round((now - added) / 60_000) : null
    if (youngMinutes != null && youngMinutes < window) {
      return {
        file,
        verdict: 'not-yet-due',
        interval,
        window,
        ageMinutes: null,
        detail:
          `no \`schedule\` run yet, and the file is only ${youngMinutes} minutes old — inside its ` +
          `${window}-minute window. Not a finding until it is.`,
      }
    }
    return {
      file,
      verdict: 'never-fired',
      interval,
      window,
      ageMinutes: null,
      detail:
        'GitHub has no `schedule`-triggered run for this workflow at all' +
        (youngMinutes == null
          ? ", and this run could not read when the file was first committed, so it cannot tell a " +
            'schedule added minutes ago from one that has never worked. That lookup is `git log ' +
            '--diff-filter=A`, which needs `fetch-depth: 0` on the checkout — check that first.'
          : `, and the file is older than its ${window}-minute window.`) +
        ' Note that GitHub only runs `schedule` from the DEFAULT branch — a cron that has only ' +
        'ever existed on a feature branch has never been registered.',
    }
  }

  if (ageMinutes > window) {
    return {
      file,
      verdict: 'stopped',
      interval,
      window,
      ageMinutes,
      detail:
        `newest \`schedule\` run was ${ageMinutes} minutes ago (${run.createdAt}); the window is ` +
        `${window} minutes, which is already twice its own ${interval}-minute cadence plus ` +
        `${SLIP_ALLOWANCE_MINUTES} minutes of GitHub's queue. This is not lateness.`,
    }
  }

  return { file, verdict: 'ok', interval, window, ageMinutes, lastAt, conclusion: run?.conclusion ?? null }
}

/**
 * Grade every alarm in the tree — both kinds.
 *
 * Findings are everything that is not `ok`, `not-yet-due` or
 * `no-upstream-activity`. The third is a watcher with nothing to pair against
 * yet, which is a quiet week rather than a dead alarm.
 *
 * @param {{
 *   declared: { file: string, crons: string[] }[],
 *   runs?: Record<string, any>,
 *   states?: Record<string, string>,
 *   added?: Record<string, string>,
 *   watchers?: { file: string, upstream: string[] }[],
 *   watcherRuns?: Record<string, any>,
 *   upstreamRuns?: Record<string, any[]>,
 *   byName?: Record<string, string>,
 *   now?: number,
 * }} input
 */
export function assess({
  declared,
  runs = {},
  states = {},
  added = {},
  watchers = [],
  watcherRuns = {},
  upstreamRuns = {},
  byName = {},
  now = Date.now(),
}) {
  const scheduled = declared.map((d) => ({
    kind: 'schedule',
    ...assessWorkflow({
      file: d.file,
      crons: d.crons,
      run: runs[d.file] ?? null,
      state: states[d.file] ?? null,
      addedAt: added[d.file] ?? null,
      now,
    }),
  }))
  const watched = watchers.map((w) =>
    assessWatcher({
      file: w.file,
      upstream: w.upstream,
      run: watcherRuns[w.file] ?? null,
      upstreamRuns,
      byName,
      state: states[w.file] ?? null,
      addedAt: added[w.file] ?? null,
      now,
    }),
  )
  const results = [...scheduled, ...watched]
  const clean = new Set(['ok', 'not-yet-due', 'no-upstream-activity'])
  const findings = results.filter((r) => !clean.has(r.verdict))
  return { results, findings }
}

/* --------------------------------------------------------------- report -- */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * The job summary.
 *
 * LEADS WITH WHAT IT LOOKED AT, never with a tick — the same shape
 * `renderObligation` in `scripts/review-sweep.mjs` uses. A heartbeat that
 * examined zero workflows and printed "all good" is this file's own failure
 * mode wearing its own uniform.
 *
 * @param {{ results: any[], findings: any[] }} graded
 * @param {{ lookupFailures?: string[] }} [opts]
 */
export function renderSummary({ results, findings }, { lookupFailures = [] } = {}) {
  const lines = ['### Scheduled-workflow heartbeat', '']

  const scheduled = results.filter((r) => r.kind !== 'watcher')
  const watched = results.filter((r) => r.kind === 'watcher')

  lines.push(
    `Asked GitHub about **${plural(scheduled.length, 'scheduled workflow', 'scheduled workflows')}**` +
      (watched.length
        ? ` and **${plural(watched.length, 'alarm', 'alarms')}** triggered by another workflow's ` +
          'completion'
        : '') +
      ', derived from the `cron:` and `workflow_run:` entries in `.github/workflows/` rather than ' +
      'from a list kept here.',
    '',
  )

  if (!results.length) {
    lines.push(
      '#### This run graded nothing',
      '',
      'No workflow file in `.github/workflows/` declares a `schedule:` or a `workflow_run:`. Either ' +
        'every alarm was deleted, or the scanners in `scripts/schedule-heartbeat.mjs` stopped ' +
        'matching the file format. A heartbeat that looked at nothing is not a clean heartbeat.',
      '',
    )
    return lines.join('\n')
  }

  if (lookupFailures.length) {
    lines.push(
      '#### Some lookups did not come back',
      '',
      ...lookupFailures.map((f) => `- ${f}`),
      '',
      'Counted and named rather than dropped: a workflow this run could not ask about is not a ' +
        'workflow this run cleared.',
      '',
    )
  }

  if (findings.length) {
    lines.push(`#### ${plural(findings.length, 'alarm has', 'alarms have')} stopped firing`, '')
    for (const f of findings) {
      lines.push(`- **\`${f.file}\`** — ${f.verdict}`, `  - ${f.detail}`)
    }
    lines.push(
      '',
      'Every one of these workflows is an alarm. An alarm that has stopped firing looks exactly ' +
        'like an alarm reporting that everything is fine — both are silence, and that is the whole ' +
        'reason this job exists.',
      '',
    )
  }

  lines.push('#### What fired, and how late', '')
  lines.push('| workflow | cadence | window | last run | |', '|---|---|---|---|---|')
  for (const r of results) {
    const cadence = r.kind === 'watcher' ? 'on upstream' : r.interval ? `${r.interval}m` : '—'
    const win = r.kind === 'watcher' ? `${PAIRING_GRACE_MINUTES}m grace` : r.window ? `${r.window}m` : '—'
    const age = r.ageMinutes == null ? 'never' : `${r.ageMinutes}m ago`
    const mark = r.verdict === 'ok' ? 'ok' : r.verdict === 'not-yet-due' ? 'new' : `**${r.verdict}**`
    lines.push(`| \`${r.file}\` | ${cadence} | ${win} | ${age} | ${mark} |`)
  }
  lines.push('')

  if (!findings.length) {
    lines.push(
      '_Every scheduled workflow has a run inside the window its own cron implies. The window is ' +
        `twice each cadence plus ${SLIP_ALLOWANCE_MINUTES} minutes, because this check answers ` +
        '"has it stopped", not "did it run on time" — GitHub\'s scheduler is hours late on an ' +
        'ordinary day and a tighter window would report the queue as a defect._',
      '',
    )
    if (watched.length) {
      lines.push(
        '_And every `workflow_run` alarm has a run at or after the newest settled run of the ' +
          'workflow it watches. That one is PAIRING rather than age: such an alarm is exactly as ' +
          'punctual as its upstream, so a quiet week of merges is not a dead alarm and must never ' +
          'be graded as one._',
        '',
      )
    }
  }

  return lines.join('\n')
}

/* ----------------------------------------------------------------- main -- */

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}

function readJson(path) {
  if (!path || !existsSync(path)) return { value: null, why: `the file \`${path}\` was not written` }
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), why: null }
  } catch (err) {
    return { value: null, why: `the file \`${path}\` is not JSON (${err.message})` }
  }
}

function main() {
  const declared = declaredSchedules()
  const { watchers, byName } = declaredWatchers()

  const runsFile = readJson(argValue('--runs'))
  const wfFile = readJson(argValue('--workflows'))
  const addedFile = readJson(argValue('--added'))
  // OPTIONAL, and that is a decision rather than an oversight. These two
  // arrive with DREAMCRM-115 and a workflow file is deployed a moment before
  // or after the script it calls; a missing file with NO watchers in the tree
  // is nothing to report, while a missing file WITH watchers is a lookup
  // failure named below. The distinction is made against the tree, not against
  // the argv.
  const watcherRunsFile = readJson(argValue('--watcher-runs'))
  const recentRunsFile = readJson(argValue('--recent-runs'))

  const lookupFailures = []
  if (runsFile.why) lookupFailures.push(`the run lookup produced nothing usable — ${runsFile.why}`)
  if (wfFile.why) lookupFailures.push(`the workflow-state lookup produced nothing usable — ${wfFile.why}`)
  if (watchers.length && watcherRunsFile.why) {
    lookupFailures.push(
      `${watchers.length} workflow(s) run on another workflow's completion and the \`workflow_run\` ` +
        `run lookup produced nothing usable — ${watcherRunsFile.why}`,
    )
  }
  if (watchers.length && recentRunsFile.why) {
    lookupFailures.push(
      `${watchers.length} workflow(s) run on another workflow's completion and the upstream run ` +
        `lookup produced nothing usable — ${recentRunsFile.why}, so there is nothing to pair against`,
    )
  }

  const runs = runsFile.value ?? {}
  const added = addedFile.value ?? {}
  const watcherRuns = watcherRunsFile.value ?? {}
  const upstreamRuns = recentRunsFile.value ?? {}
  const states = {}
  for (const wf of Array.isArray(wfFile.value) ? wfFile.value : []) {
    const file = String(wf?.path ?? '').split('/').pop()
    if (file) states[file] = wf.state
  }

  const graded = assess({
    declared,
    runs,
    states,
    added,
    watchers,
    watcherRuns,
    upstreamRuns,
    byName,
    now: Date.now(),
  })
  const summary = renderSummary(graded, { lookupFailures })

  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')

  for (const f of graded.findings) {
    console.log(`::error title=${f.file} has stopped firing::${f.detail}`)
  }
  for (const f of lookupFailures) {
    console.log(`::error title=The schedule heartbeat could not ask its question::${f}`)
  }

  // RED IS THE RIGHT SIGNAL HERE. See the docblock: this check's findings are
  // binary and single-action, so there is no queue to keep it red for days —
  // unlike the review sweep, whose exit status had to be narrowed for exactly
  // that reason. A heartbeat that cannot fail is the thing it was written to
  // detect.
  //
  // A FAILED LOOKUP ALSO REDDENS. Fail closed: the alternative lets one
  // throttled API call print a quiet morning over a schedule that died.
  process.exitCode = graded.findings.length || lookupFailures.length ? 1 : 0
}

// Direct invocation only, so the guard test can import the pure halves.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
