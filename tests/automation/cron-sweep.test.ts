import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The durable half of the budgeted sweep: where the cursor lives, and the one
 * rule that keeps two crons from eating each other's.
 */

let config: Record<string, unknown> = {}
let readThrows = false
let writeThrows = false
const writes: Record<string, unknown>[] = []

vi.mock('@/lib/services/platform-config', () => ({
  readPlatformConfig: async () => {
    if (readThrows) throw new Error('database unreachable')
    return config
  },
  writePlatformConfig: async (patch: Record<string, unknown>) => {
    if (writeThrows) throw new Error('database unreachable')
    writes.push(patch)
    // Mirror the real SHALLOW top-level merge — the behaviour the key-per-job
    // rule depends on.
    config = { ...config, ...patch }
  },
}))

import { sweepClinics, readSweepCursor, writeSweepCursor, SWEEP_BUDGET_MS } from '@/lib/services/cron-sweep'

const orgs = (...names: string[]) => names.map((id) => ({ id }))

beforeEach(() => {
  config = {}
  writes.length = 0
  readThrows = false
  writeThrows = false
})

describe('the sweep cursor', () => {
  it('is a separate TOP-LEVEL key per job', async () => {
    await writeSweepCursor('daily-digest', 'org_a')
    await writeSweepCursor('generate-proposals', 'org_z')
    expect(config).toEqual({
      'cronCursor:daily-digest': 'org_a',
      'cronCursor:generate-proposals': 'org_z',
    })
  })

  it('one job finishing cannot drop another job’s cursor', async () => {
    // writePlatformConfig merges SHALLOWLY, so a shared `cronCursors` object
    // would be a read-modify-write across concurrent crons: the hourly
    // generator finishing mid-way through the daily digest's write would
    // silently wipe the digest's place in the list, and the digest would
    // restart from the top every night — the exact starvation this whole
    // change exists to stop, reintroduced by a data-shape choice.
    await writeSweepCursor('daily-digest', 'org_m')
    await writeSweepCursor('generate-proposals', 'org_c')
    await writeSweepCursor('retention-automations', null)
    expect(await readSweepCursor('daily-digest')).toBe('org_m')
    expect(await readSweepCursor('generate-proposals')).toBe('org_c')
  })

  it('reads null for a job that has never run', async () => {
    expect(await readSweepCursor('daily-digest')).toBeNull()
  })

  it('floors a malformed stored value to null rather than trusting it', async () => {
    for (const junk of [42, '', null, { id: 'x' }, []]) {
      config = { 'cronCursor:daily-digest': junk }
      expect(await readSweepCursor('daily-digest')).toBeNull()
    }
  })

  it('floors an unreadable config to null — never worse than today’s behaviour', async () => {
    readThrows = true
    expect(await readSweepCursor('daily-digest')).toBeNull()
  })
})

describe('sweepClinics', () => {
  it('walks everyone and writes no cursor when there was none and the pass finished', async () => {
    const seen: string[] = []
    const p = await sweepClinics('daily-digest', orgs('b', 'a'), (o) => o.id, async (o) => {
      seen.push(o.id)
    })
    expect(seen).toEqual(['a', 'b'])
    expect(p.completed).toBe(true)
    // Nothing changed, so nothing is written.
    expect(writes).toHaveLength(0)
  })

  it('records where it stopped when the budget runs out', async () => {
    // 40ms per clinic against a 100ms budget: the third starts inside it, the
    // fourth is refused. (The clock starts at 40 because the budget is checked
    // BEFORE each clinic after the first.)
    let t = 40
    const p = await sweepClinics('daily-digest', orgs('a', 'b', 'c', 'd'), (o) => o.id, async () => {}, {
      budgetMs: 100,
      now: () => {
        const n = t
        t += 40
        return n
      },
    })
    expect(p).toMatchObject({ swept: 3, remaining: 1, completed: false, resumeAt: 'c' })
    expect(config['cronCursor:daily-digest']).toBe('c')
  })

  it('resumes after the recorded clinic on the next run', async () => {
    config = { 'cronCursor:daily-digest': 'b' }
    const seen: string[] = []
    await sweepClinics('daily-digest', orgs('a', 'b', 'c', 'd'), (o) => o.id, async (o) => {
      seen.push(o.id)
    })
    expect(seen).toEqual(['c', 'd', 'a', 'b'])
  })

  it('CLEARS the cursor after a full pass, so the next run starts from the top', async () => {
    config = { 'cronCursor:daily-digest': 'b' }
    await sweepClinics('daily-digest', orgs('a', 'b', 'c'), (o) => o.id, async () => {})
    expect(config['cronCursor:daily-digest']).toBeNull()
    expect(await readSweepCursor('daily-digest')).toBeNull()
  })

  it('a failed cursor write costs a delayed tick, never the run', async () => {
    writeThrows = true
    let t = 40
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const seen: string[] = []
    const p = await sweepClinics('daily-digest', orgs('a', 'b', 'c'), (o) => o.id, async (o) => {
      seen.push(o.id)
    }, {
      budgetMs: 10,
      now: () => {
        const n = t
        t += 40
        return n
      },
    })
    // The work that DID happen still happened, and the caller still gets a result.
    expect(seen).toEqual(['a'])
    expect(p.completed).toBe(false)
    warn.mockRestore()
  })

  it('every job has a budget that fits inside its route’s maxDuration', () => {
    const routes: Record<keyof typeof SWEEP_BUDGET_MS, string> = {
      'daily-digest': 'app/api/cron/daily-digest/route.ts',
      'generate-proposals': 'app/api/cron/generate-proposals/route.ts',
      'retention-automations': 'app/api/cron/retention-automations/route.ts',
    }
    for (const [job, route] of Object.entries(routes)) {
      const src = readFileSync(join(process.cwd(), route), 'utf8')
      const m = /export const maxDuration = (\d+)/.exec(src)
      expect(m, `${route} declares no maxDuration`).toBeTruthy()
      const maxMs = Number(m![1]) * 1000
      const budget = SWEEP_BUDGET_MS[job as keyof typeof SWEEP_BUDGET_MS]
      // Strictly inside, with room for the work that runs after the walk —
      // a budget at or above maxDuration is the same as having none.
      expect(budget, `${job}: budget ${budget}ms vs route ${maxMs}ms`).toBeLessThan(maxMs)
    }
  })
})
