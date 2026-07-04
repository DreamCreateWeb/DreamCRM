import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard against the drift that silently left prospecting discovery (+ several
 * other jobs) un-fired: a cron ROUTE existed in the app but had no EventBridge
 * SCHEDULE. Every app/api/cron/<name> route must either be scheduled by
 * scripts/setup-cron-schedules.sh (its JOBS array) or be explicitly listed as
 * out-of-band (managed elsewhere). A new route with neither fails here — long
 * before it can ship dead. The deploy also re-runs the (idempotent) script, so
 * this test + that step together make the "forgot to schedule it" class
 * impossible.
 */

// Scheduled by a different mechanism, deliberately NOT in setup-cron-schedules.sh.
const OUT_OF_BAND = new Set(['gmail-watch-renew', 'publish-scheduled-posts'])

function cronRoutes(): string[] {
  const dir = join(process.cwd(), 'app/api/cron')
  return readdirSync(dir).filter((n) => {
    try {
      return statSync(join(dir, n)).isDirectory()
    } catch {
      return false
    }
  })
}

function scheduledJobs(): string[] {
  const script = readFileSync(join(process.cwd(), 'scripts/setup-cron-schedules.sh'), 'utf8')
  // JOBS entries look like:  "name|route|rate(...)"  — capture the route (2nd field).
  const out: string[] = []
  for (const m of script.matchAll(/"[a-z0-9-]+\|([a-z0-9-]+)\|[^"]+"/g)) out.push(m[1])
  return out
}

describe('cron schedule parity', () => {
  it('every cron route is scheduled (or explicitly out-of-band)', () => {
    const scheduled = new Set(scheduledJobs())
    const unscheduled = cronRoutes().filter((r) => !scheduled.has(r) && !OUT_OF_BAND.has(r))
    expect(
      unscheduled,
      `These /api/cron routes have NO EventBridge schedule. Add each to the JOBS array in ` +
        `scripts/setup-cron-schedules.sh (or to OUT_OF_BAND if scheduled elsewhere):\n  ${unscheduled.join('\n  ')}`,
    ).toEqual([])
  })

  it('every scheduled job points at a real cron route', () => {
    const routes = new Set(cronRoutes())
    const orphans = scheduledJobs().filter((j) => !routes.has(j))
    expect(orphans, `setup-cron-schedules.sh schedules routes that don't exist: ${orphans.join(', ')}`).toEqual([])
  })

  it('finds a sane number of jobs (the parser didn\'t silently break)', () => {
    expect(scheduledJobs().length).toBeGreaterThanOrEqual(10)
  })
})
