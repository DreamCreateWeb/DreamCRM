import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  OPERATION_VERDICTS,
  SERVICE_VERDICTS,
  ROLLOUT_OPERATION_TYPE,
  DEFAULTS,
  OUTCOME,
  classifyOperation,
  classifyService,
  isAuthorizationError,
  isRetryableAwsError,
  toMillis,
  parseSince,
  positiveSeconds,
  selectRolloutOperation,
  findOperationById,
  verifyRollout,
  renderSummary,
} from '../../scripts/rollout-check.mjs'

/**
 * A GREEN DEPLOY MUST MEAN THE NEW VERSION IS SERVING (DREAMCRM-86).
 *
 * The check runs against App Runner and cannot be exercised here, so what this
 * file pins is everything it is MADE of: the verdict tables, the rule that
 * decides WHICH rollout is this run's, the one path that is allowed to report
 * green without verifying anything, and the `deploy.yml` wiring that lets a red
 * result reach the run.
 *
 * The end-to-end tests are written as the DEFECT SHAPES rather than as cases —
 * the rollout that was reverted, the rollout that never started, the previous
 * deploy's rollout being mistaken for this one's — because those are what the
 * check has to be right about, and the first of them is the shape that was
 * actually measured in production on 2026-09-21.
 */

const SCRIPT = 'scripts/rollout-check.mjs'
const DEPLOY = '.github/workflows/deploy.yml'

/** LF-normalised, so a CRLF checkout does not change what a regex can see. */
function readLf(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n?/g, '\n')
}

const T0 = Date.parse('2026-09-21T23:00:00Z')
const SINCE = new Date(T0).toISOString()

type Op = { Id: string; Type: string; Status: string; StartedAt: string }

function op(overrides: Partial<Op> = {}): Op {
  return {
    Id: 'op-ours',
    Type: ROLLOUT_OPERATION_TYPE,
    Status: 'IN_PROGRESS',
    StartedAt: new Date(T0 + 10 * 60_000).toISOString(),
    ...overrides,
  }
}

describe('the verdict a rollout status earns', () => {
  it('SUCCEEDED is the only operation status that passes', () => {
    const passing = Object.keys(OPERATION_VERDICTS).filter((status) => classifyOperation(status).ok)
    expect(passing).toEqual(['SUCCEEDED'])
  })

  it('ROLLBACK_SUCCEEDED FAILS, even though its name ends in SUCCEEDED', () => {
    // THE DEFECT'S OWN SHAPE. App Runner reverting after a failed health check
    // is the obvious candidate for what happened on 2026-09-21: the rollout
    // "succeeds" at going back to where it was, and production serves the
    // PREVIOUS commit. Any check written as `status.includes('SUCCEEDED')`, or
    // as `status !== 'FAILED'`, reports this as a good deploy.
    const verdict = classifyOperation('ROLLBACK_SUCCEEDED')
    expect(verdict.terminal).toBe(true)
    expect(verdict.ok).toBe(false)
    expect(verdict.why).toMatch(/PREVIOUS commit/)
  })

  it('a rollback that is still running is already a failure, not something to wait out', () => {
    // App Runner is not finished, but the answer cannot change: the new version
    // failed its health check and will not serve. Polling on would add minutes
    // to a verdict that is already known.
    const verdict = classifyOperation('ROLLBACK_IN_PROGRESS')
    expect(verdict.terminal).toBe(true)
    expect(verdict.ok).toBe(false)
  })

  it('PENDING and IN_PROGRESS keep the poll going', () => {
    expect(classifyOperation('PENDING').terminal).toBe(false)
    expect(classifyOperation('IN_PROGRESS').terminal).toBe(false)
  })

  it('an operation status this check has never heard of is a failure, not a shrug', () => {
    // "We could not tell" and "it served" are different answers, and this whole
    // file exists because they were the same answer for a month.
    const verdict = classifyOperation('SOME_NEW_AWS_STATUS')
    expect(verdict.unknown).toBe(true)
    expect(verdict.terminal).toBe(true)
    expect(verdict.ok).toBe(false)
    expect(verdict.why).toContain('OPERATION_VERDICTS')
  })

  it('a status that is only a PREFIX of a known one does not inherit its verdict', () => {
    // The `_V2` family (dreamcrm-conventions §2d): a prefix is not a name.
    // Exact-key lookup is what makes that true here rather than intended.
    expect(classifyOperation('SUCCEEDED_V2').ok).toBe(false)
    expect(classifyOperation('SUCCEED').ok).toBe(false)
  })

  it('a status inherited from Object.prototype is not a verdict', () => {
    // `OPERATION_VERDICTS['constructor']` is truthy on a plain object literal,
    // and a bare `OPERATION_VERDICTS[status]` lookup would hand back a Function
    // whose `.ok` is undefined — falsy today, and one refactor away from not
    // being. `hasOwnProperty` is what makes the table closed.
    expect(classifyOperation('constructor').unknown).toBe(true)
    expect(classifyOperation('toString').ok).toBe(false)
  })
})

describe('"the rollout finished" is not "the new version is serving"', () => {
  it('RUNNING is the only service status that counts as serving', () => {
    const serving = Object.keys(SERVICE_VERDICTS).filter((status) => classifyService(status).ok)
    expect(serving).toEqual(['RUNNING'])
  })

  it('OPERATION_IN_PROGRESS is the one transient worth waiting on', () => {
    const unsettled = Object.keys(SERVICE_VERDICTS).filter((status) => !classifyService(status).settled)
    expect(unsettled).toEqual(['OPERATION_IN_PROGRESS'])
  })

  it('an unknown service status is settled and NOT serving', () => {
    // Settled so the poll cannot spin forever on a word nobody recognises; not
    // serving for the same reason as the operation table above.
    const verdict = classifyService('WHO_KNOWS')
    expect(verdict.settled).toBe(true)
    expect(verdict.ok).toBe(false)
  })
})

describe('which rollout belongs to THIS run', () => {
  it('picks the START_DEPLOYMENT that started after this build did', () => {
    const ours = op({ Id: 'ours' })
    expect(selectRolloutOperation([ours], T0)?.Id).toBe('ours')
  })

  it('THE PREVIOUS DEPLOY’S ROLLOUT: a SUCCEEDED operation from before this build is not evidence', () => {
    // The false green this check could give itself. Without the baseline, the
    // newest START_DEPLOYMENT on the service passes for ours — including one
    // that finished an hour ago, for a commit that is not this one. That is the
    // 2026-09-21 defect with a green tick and a citation attached.
    const theirs = op({ Id: 'theirs', Status: 'SUCCEEDED', StartedAt: new Date(T0 - 60 * 60_000).toISOString() })
    expect(selectRolloutOperation([theirs], T0)).toBeNull()
  })

  it('a rollout still IN_PROGRESS from the previous deploy is not adopted either', () => {
    // The shape the buildspec's 30x30s start-deployment retry exists for: a
    // back-to-back merge can find the previous rollout still running. Adopting
    // it would report on somebody else's deploy and then exit before ours even
    // started.
    const theirs = op({ Id: 'theirs', StartedAt: new Date(T0 - 5 * 60_000).toISOString() })
    expect(selectRolloutOperation([theirs], T0)).toBeNull()
  })

  it('an operation of another type after the baseline is not a rollout', () => {
    const paused = op({ Id: 'paused', Type: 'PAUSE_SERVICE', Status: 'SUCCEEDED' })
    expect(selectRolloutOperation([paused], T0)).toBeNull()
  })

  it('an operation whose StartedAt cannot be read is skipped rather than assumed ours', () => {
    const undated = op({ Id: 'undated', StartedAt: 'not a date' })
    expect(selectRolloutOperation([undated], T0)).toBeNull()
  })

  it('takes the NEWEST of two rollouts after the baseline', () => {
    // A service with auto-deploy on ECR push can produce a second
    // START_DEPLOYMENT for the same image, and the last one decides what
    // finally serves. The `deploy-main` concurrency group is what makes
    // "newest" safe: the next merge's rollout cannot begin until this job exits.
    const first = op({ Id: 'first', StartedAt: new Date(T0 + 60_000).toISOString() })
    const second = op({ Id: 'second', StartedAt: new Date(T0 + 120_000).toISOString() })
    expect(selectRolloutOperation([first, second], T0)?.Id).toBe('second')
    expect(selectRolloutOperation([second, first], T0)?.Id).toBe('second')
  })

  it('reads App Runner timestamps in both shapes the API hands back', () => {
    expect(toMillis('2026-09-21T23:00:00Z')).toBe(T0)
    // `--output json` on some paths renders these as epoch SECONDS.
    expect(toMillis(T0 / 1000)).toBe(T0)
    expect(toMillis(T0)).toBe(T0)
    expect(toMillis('')).toBeNull()
    expect(toMillis(null)).toBeNull()
  })

  it('finds a latched operation by id and reports honestly when it is gone', () => {
    expect(findOperationById([op({ Id: 'a' }), op({ Id: 'b' })], 'b')?.Id).toBe('b')
    expect(findOperationById([op({ Id: 'a' })], 'b')).toBeNull()
  })
})

describe('the baseline is required, not preferred', () => {
  it('a missing ROLLOUT_SINCE throws rather than matching the newest rollout', () => {
    // Without this the step is a wildcard that certifies whatever it finds. The
    // failure has to be at parse time: a default of "the epoch" would make
    // every operation on the service a candidate and read as working.
    expect(() => parseSince(undefined)).toThrow(/ROLLOUT_SINCE/)
    expect(() => parseSince('')).toThrow(/ROLLOUT_SINCE/)
    expect(() => parseSince('yesterday')).toThrow(/ROLLOUT_SINCE/)
  })

  it('parses the timestamp the workflow actually writes', () => {
    // `date -u +%Y-%m-%dT%H:%M:%SZ` — the exact spelling in deploy.yml.
    expect(parseSince('2026-09-21T23:00:00Z')).toBe(T0)
  })

  it('a bad timeout cannot make the poll immortal', () => {
    // Same trap `scripts/migration-check.mjs` carries: `Number('5m')` is NaN,
    // every `now() >= NaN` is false, and the loop polls App Runner until the
    // job's 6-hour ceiling.
    expect(positiveSeconds('5m', 900, 1800)).toBe(900)
    expect(positiveSeconds('', 900, 1800)).toBe(900)
    expect(positiveSeconds(undefined, 900, 1800)).toBe(900)
    expect(positiveSeconds('0', 900, 1800)).toBe(900)
    expect(positiveSeconds('-30', 900, 1800)).toBe(900)
    expect(positiveSeconds('Infinity', 900, 1800)).toBe(900)
    expect(positiveSeconds('60', 900, 1800)).toBe(60)
    // Capped, so an env var cannot buy more time than the cap allows.
    expect(positiveSeconds('99999', 900, 1800)).toBe(1800)
  })
})

describe('the one path allowed to report green without verifying anything', () => {
  it('recognises the AccessDenied shapes the AWS CLI actually prints', () => {
    expect(
      isAuthorizationError(
        'An error occurred (AccessDeniedException) when calling the ListOperations operation: User: ' +
          'arn:aws:sts::952078552817:assumed-role/DreamCRMGitHubActionsDeploy/x is not authorized to ' +
          'perform: apprunner:ListOperations',
      ),
    ).toBe(true)
    expect(isAuthorizationError('An error occurred (AccessDenied) when calling DescribeService')).toBe(true)
    expect(isAuthorizationError('An error occurred (UnauthorizedException)')).toBe(true)
  })

  it('A THROTTLE IS NOT A MISSING GRANT, so it cannot buy a green tick', () => {
    // The escape hatch is the one thing in this check that can recreate the
    // defect, so every OTHER way an AWS call can fail has to stay a hard
    // failure. A catch-all `if (awsCallFailed) warn()` would pass this test's
    // subject and fail its point.
    expect(isAuthorizationError('An error occurred (ThrottlingException): Rate exceeded')).toBe(false)
    expect(isAuthorizationError('An error occurred (ResourceNotFoundException)')).toBe(false)
    expect(isAuthorizationError('Could not connect to the endpoint URL: "https://apprunner.us-east-1..."')).toBe(false)
    expect(isAuthorizationError('An error occurred (InvalidSignatureException)')).toBe(false)
    expect(isAuthorizationError('')).toBe(false)
    expect(isAuthorizationError(undefined)).toBe(false)
  })

  it('AccessDeniedExceptionV2 is not AccessDeniedException', () => {
    // §2d's `_V2` mutation, applied to the one predicate in this file whose
    // looseness would be a false green rather than a false red.
    expect(isAuthorizationError('An error occurred (AccessDeniedExceptionV2)')).toBe(false)
    expect(isAuthorizationError('AccessDeniedFoo')).toBe(false)
  })

  it('an authorization error is never retried, and a throttle is', () => {
    // Retrying a missing grant burns the window four times over before the
    // warning anybody needs to read appears.
    expect(isRetryableAwsError('An error occurred (AccessDeniedException) ...')).toBe(false)
    expect(isRetryableAwsError('An error occurred (ThrottlingException): Rate exceeded')).toBe(true)
    expect(isRetryableAwsError('Could not connect to the endpoint URL: "https://apprunner..."')).toBe(true)
    expect(isRetryableAwsError('An error occurred (ResourceNotFoundException)')).toBe(false)
  })
})

/**
 * The whole check, driven against a scripted `aws`. Each case is a shape the
 * pipeline has to get right rather than a branch to cover; the first is the one
 * measured in production.
 */
describe('the deploy run, end to end', () => {
  const ARN = 'arn:aws:apprunner:us-east-1:952078552817:service/dreamcrm/abc'

  /**
   * `responses` is read in order per SUBCOMMAND, so a case can say "the third
   * list-operations answers SUCCEEDED" without counting the describe calls.
   */
  function fakeAws(responses: Record<string, unknown[]>) {
    const seen: Record<string, number> = {}
    const calls: string[][] = []
    const aws = async (args: string[]) => {
      calls.push(args)
      const key = args[1]!
      const queue = responses[key]
      if (!queue || queue.length === 0) return { status: 1, stdout: '', stderr: `no scripted ${key}` }
      const index = Math.min(seen[key] ?? 0, queue.length - 1)
      seen[key] = index + 1
      const next = queue[index]
      if (typeof next === 'string') return { status: 255, stdout: '', stderr: next }
      return { status: 0, stdout: JSON.stringify(next), stderr: '' }
    }
    return { aws, calls }
  }

  type Verdict = {
    outcome: string
    message: string
    operationId?: string
    detail?: string
    calls: string[][]
  }

  const run = (responses: Record<string, unknown[]>, env: Record<string, string> = {}): Promise<Verdict> => {
    const { aws, calls } = fakeAws(responses)
    let clock = T0 + 10 * 60_000
    return verifyRollout({
      aws,
      // The fake clock is what keeps a 15-minute deadline from being a
      // 15-minute test: `sleep` advances it instead of waiting.
      sleep: async (ms: number) => {
        clock += ms
      },
      now: () => clock,
      env: { ROLLOUT_SINCE: SINCE, APP_RUNNER_SERVICE_ARN: ARN, AWS_REGION: 'us-east-1', ...env },
    }).then((result: Omit<Verdict, 'calls'>) => ({ ...result, calls }))
  }

  it('a rollout that completes on a RUNNING service is the green case', async () => {
    const result = await run({
      'list-operations': [
        { OperationSummaryList: [op({ Status: 'IN_PROGRESS' })] },
        { OperationSummaryList: [op({ Status: 'SUCCEEDED' })] },
      ],
      'describe-service': [{ Service: { Status: 'RUNNING' } }],
    })
    expect(result.outcome).toBe(OUTCOME.served)
    expect(result.operationId).toBe('op-ours')
  })

  it('THE 2026-09-21 SHAPE: a reverted rollout fails the deploy run', async () => {
    // Everything else in the pipeline is green and the merge did not ship. This
    // is the case the whole issue is about, and before this check it was
    // indistinguishable from the case above in every signal we collected.
    const result = await run({
      'list-operations': [
        { OperationSummaryList: [op({ Status: 'IN_PROGRESS' })] },
        { OperationSummaryList: [op({ Status: 'ROLLBACK_SUCCEEDED' })] },
      ],
      'describe-service': [{ Service: { Status: 'RUNNING' } }],
    })
    expect(result.outcome).toBe(OUTCOME.notServed)
    expect(result.message).toMatch(/ROLLBACK_SUCCEEDED/)
  })

  it('THE ROLLOUT THAT NEVER STARTED: a green build with no START_DEPLOYMENT fails', async () => {
    // The buildspec's POST_BUILD either did not run or did not take. Before
    // this check that was silence; the next signal was an etag somebody
    // happened to compare three hours later.
    const result = await run({ 'list-operations': [{ OperationSummaryList: [] }] })
    expect(result.outcome).toBe(OUTCOME.notServed)
    expect(result.message).toMatch(/no START_DEPLOYMENT started/)
    expect(result.message).toMatch(/NOT serving/)
  })

  it('the previous deploy’s finished rollout does not stand in for a missing one', async () => {
    // The end-to-end form of the selector test above: the service's log is full
    // of SUCCEEDED rollouts and none of them is ours.
    const result = await run({
      'list-operations': [
        {
          OperationSummaryList: [
            op({ Id: 'theirs', Status: 'SUCCEEDED', StartedAt: new Date(T0 - 60 * 60_000).toISOString() }),
          ],
        },
      ],
    })
    expect(result.outcome).toBe(OUTCOME.notServed)
  })

  it('a rollout that never finishes fails on the deadline rather than passing', async () => {
    const result = await run({ 'list-operations': [{ OperationSummaryList: [op({ Status: 'IN_PROGRESS' })] }] })
    expect(result.outcome).toBe(OUTCOME.notServed)
    expect(result.message).toMatch(/still IN_PROGRESS/)
  })

  it('SUCCEEDED on a PAUSED service is not serving', async () => {
    const result = await run({
      'list-operations': [{ OperationSummaryList: [op({ Status: 'SUCCEEDED' })] }],
      'describe-service': [{ Service: { Status: 'PAUSED' } }],
    })
    expect(result.outcome).toBe(OUTCOME.notServed)
    expect(result.message).toMatch(/PAUSED/)
  })

  it('the operation is LATCHED: a newer rollout appearing mid-poll does not answer for ours', async () => {
    // If the check re-selected every tick it would follow the newest operation
    // and report on whatever landed last, which is how a stuck rollout gets
    // certified by its successor.
    const newer = op({ Id: 'newer', Status: 'SUCCEEDED', StartedAt: new Date(T0 + 20 * 60_000).toISOString() })
    const result = await run({
      'list-operations': [
        { OperationSummaryList: [op({ Status: 'IN_PROGRESS' })] },
        { OperationSummaryList: [newer, op({ Status: 'FAILED' })] },
      ],
      'describe-service': [{ Service: { Status: 'RUNNING' } }],
    })
    expect(result.outcome).toBe(OUTCOME.notServed)
    expect(result.operationId).toBe('op-ours')
    expect(result.message).toMatch(/FAILED/)
  })

  it('THE MISSING IAM GRANT degrades loudly and leaves the deploy green', async () => {
    // Hard-failing here would turn every merge to `main` red for a reason
    // nobody in CI can fix, until an owner-side grant lands (DREAMCRM-65). The
    // warning has to name what is unverified and what unblocks it — and it
    // clears itself: the day the grant lands this call succeeds.
    const result = await run({
      'list-operations': [
        'An error occurred (AccessDeniedException) when calling the ListOperations operation: User: ' +
          'arn:aws:sts::952078552817:assumed-role/DreamCRMGitHubActionsDeploy/x is not authorized to ' +
          'perform: apprunner:ListOperations',
      ],
    })
    expect(result.outcome).toBe(OUTCOME.degraded)
    expect(result.message).toMatch(/UNVERIFIED/)
    expect(result.message).toMatch(/apprunner:ListOperations/)
    expect(renderSummary(result)).toMatch(/UNVERIFIED/)
  })

  it('AN AWS ERROR THAT IS NOT A MISSING GRANT FAILS THE RUN', async () => {
    // The degrade path's other half, and the one that keeps it from becoming
    // "any AWS problem is fine". A throttle that never clears is retried and
    // then FAILS.
    const result = await run({
      'list-operations': [
        'An error occurred (ThrottlingException) when calling the ListOperations operation: Rate exceeded',
      ],
    })
    expect(result.outcome).toBe(OUTCOME.notServed)
    expect(result.message).toMatch(/ThrottlingException/)
  })

  it('a zero exit with unreadable output is a failure, not a pass', async () => {
    const { aws } = (() => {
      const impl = async () => ({ status: 0, stdout: '<html>not json</html>', stderr: '' })
      return { aws: impl }
    })()
    const result = await verifyRollout({
      aws,
      sleep: async () => {},
      now: () => T0,
      env: { ROLLOUT_SINCE: SINCE, APP_RUNNER_SERVICE_ARN: ARN, AWS_REGION: 'us-east-1' },
    })
    expect(result.outcome).toBe(OUTCOME.notServed)
    expect(result.message).toMatch(/could not parse/)
  })

  it('a missing ROLLOUT_SINCE fails the step before a single AWS call is made', async () => {
    const { aws, calls } = fakeAws({})
    const result = await verifyRollout({ aws, sleep: async () => {}, now: () => T0, env: {} })
    expect(result.outcome).toBe(OUTCOME.notServed)
    expect(result.message).toMatch(/ROLLOUT_SINCE/)
    expect(calls).toEqual([])
  })

  it('resolves the service ARN by name when none is configured', async () => {
    const result = await run(
      {
        'list-services': [{ ServiceSummaryList: [{ ServiceName: 'dreamcrm', ServiceArn: ARN }] }],
        'list-operations': [{ OperationSummaryList: [op({ Status: 'SUCCEEDED' })] }],
        'describe-service': [{ Service: { Status: 'RUNNING' } }],
      },
      { APP_RUNNER_SERVICE_ARN: '' },
    )
    expect(result.outcome).toBe(OUTCOME.served)
    expect(result.calls.some((args) => args.includes('list-services'))).toBe(true)
  })
})

describe('the wiring that lets a red result reach the deploy run', () => {
  const deploy = readLf(DEPLOY)
  // Comments stripped for the "must NOT contain" assertions: this workflow's
  // own comments discuss `continue-on-error` and `pnpm install` at length, and
  // a guard that reads prose fails on the note explaining the thing it checks
  // for.
  const deployCode = deploy.replace(/^\s*#.*$/gm, '')

  /** The `deploy` job's body, sliced rather than regexed (see migration-check). */
  const deployJob = (() => {
    const start = deployCode.indexOf('\n  deploy:\n')
    if (start < 0) return ''
    const rest = deployCode.slice(start + 1).split('\n').slice(1)
    const end = rest.findIndex((line) => /^ {2}[A-Za-z0-9_-]+:/.test(line))
    return (end === -1 ? rest : rest.slice(0, end)).join('\n')
  })()

  /**
   * The ONE STEP that runs the check, not the job around it.
   *
   * The scope matters here more than usual: the cron-sync step three lines
   * further down carries `continue-on-error: true` deliberately, so a
   * job-wide assertion about that string would be satisfied by somebody else's
   * attribute and could never fail for the reason it exists — §2d's
   * "the right string in the wrong scope".
   */
  const verifyStep = (() => {
    const lines = deployJob.split('\n')
    const at = lines.findIndex((line) => line.includes('node scripts/rollout-check.mjs'))
    if (at < 0) return ''
    let from = at
    while (from > 0 && !/^ {6}- /.test(lines[from]!)) from -= 1
    let to = at + 1
    while (to < lines.length && !/^ {6}- /.test(lines[to]!)) to += 1
    return lines.slice(from, to).join('\n')
  })()

  it('the deploy job runs the check', () => {
    expect(
      deployJob,
      'the deploy job no longer verifies the rollout — a deploy that never serves reports green again',
    ).toContain('node scripts/rollout-check.mjs')
    expect(verifyStep, 'the run: line is not inside a step of the deploy job').toContain('- name:')
  })

  it('the step that runs it cannot be made unable to fail the run', () => {
    // `continue-on-error` here restores the defect while leaving every file in
    // place, every log line printing and the step still listed in the run.
    expect(verifyStep, 'continue-on-error would make this check unable to fail the deploy run').not.toContain(
      'continue-on-error',
    )
  })

  it('installs nothing to run it', () => {
    // An alarm that needs the dependency tree installed has a second way to
    // fail, on the path where something is already wrong.
    expect(deployJob).not.toContain('pnpm install')
  })

  it('the deploy job sets up the Node the step runs on', () => {
    // The `deploy` job has no toolchain of its own — it is AWS CLI and bash.
    // Relying on whatever Node the runner image happens to ship would make
    // this verification depend on an image upgrade nobody in this repo sees.
    expect(deployJob).toContain('actions/setup-node')
  })

  it('the baseline is recorded BEFORE the build starts', () => {
    // Recorded after `start-build`, the mark could land after the buildspec's
    // own start-deployment on a fast build and the check would wait out its
    // appearance window for a rollout it had just excluded. Asserted on ORDER,
    // which is the property, rather than on the line being present.
    const mark = deployCode.indexOf('ROLLOUT_SINCE=')
    const startBuild = deployCode.indexOf('codebuild start-build')
    const verify = deployCode.indexOf('node scripts/rollout-check.mjs')
    expect(mark, 'deploy.yml no longer records ROLLOUT_SINCE').toBeGreaterThan(-1)
    expect(mark).toBeLessThan(startBuild)
    expect(startBuild).toBeLessThan(verify)
  })

  it('the baseline survives the step it is written in', () => {
    // A bare `ROLLOUT_SINCE=...` is a shell local and is gone by the next step.
    expect(deployCode).toMatch(/ROLLOUT_SINCE=[^\n]*>>\s*"?\$GITHUB_ENV"?/)
  })

  it('the check runs before the cron sync, which never blocks the deploy', () => {
    // `continue-on-error: true` sits on the cron sync by design. Putting the
    // verification after it is harmless; putting it INSIDE that step's
    // tolerance would not be, so the order is pinned.
    const verify = deployCode.indexOf('node scripts/rollout-check.mjs')
    const cron = deployCode.indexOf('scripts/setup-cron-schedules.sh')
    expect(cron).toBeGreaterThan(-1)
    expect(verify).toBeLessThan(cron)
  })

  it('the script the workflow names is the one this file tests', () => {
    // Renaming the module and leaving the workflow pointing at the old path
    // fails the deploy on every merge; the reverse leaves an untested script
    // running production's verification.
    expect(() => readLf(SCRIPT)).not.toThrow()
  })

  it('the check is on the review gate as a deploy-path file', async () => {
    // Asked of the classifier rather than grepped out of its source: a `why`
    // string mentioning the filename satisfies a grep and gates nothing
    // (dreamcrm-conventions §2d, "assert the answer, not a proxy for it").
    const { gateFindings } = await import('../../scripts/review-gate.mjs')
    expect(gateFindings([SCRIPT]).map((f: { id: string }) => f.id)).toContain('deploy-path')
  })

  it('carries no shebang, so this file can be imported on a Windows checkout', () => {
    // git hands a Windows working tree CRLF endings and vitest's SSR transform
    // leaves the `\r` behind when it strips `#!...` — every test in this file
    // would then die with a parse error at column 1, on Windows only, while CI
    // stayed green.
    expect(readFileSync(join(process.cwd(), SCRIPT), 'utf8').startsWith('#!')).toBe(false)
  })
})

describe('docs/CI.md describes the check that is actually wired', () => {
  it('the mechanics doc names the script and the grant it needs', () => {
    // `docs/CI.md` is the single home for the mechanics, and the IAM grant is
    // the one part of this check nobody in the repo can supply — an operator
    // reading a red or a warning run has to find it written down somewhere.
    const ci = readLf('docs/CI.md')
    expect(ci).toContain('scripts/rollout-check.mjs')
    expect(ci).toContain('apprunner:ListOperations')
  })
})

describe('the defaults are bounded', () => {
  it('every window has a cap, and the cap is above the default', () => {
    expect(DEFAULTS.timeoutSeconds).toBeLessThan(DEFAULTS.timeoutCapSeconds)
    expect(DEFAULTS.appearanceSeconds).toBeLessThan(DEFAULTS.appearanceCapSeconds)
    expect(DEFAULTS.pollSeconds).toBeLessThan(DEFAULTS.pollCapSeconds)
  })
})
