/**
 * THE DEMO SEEDER'S PUBLIC SURFACE.
 *
 * `lib/services/demo-clinic` was one 6,535-line file and is now a directory:
 * `createDemoClinic` plus a sibling module per thing it seeds, with the entry
 * point re-exporting everything the single file exported so no import site had
 * to change.
 *
 * That re-export list is the seam. A future extraction that moves a symbol
 * into a new sibling and forgets to re-export it would not fail typecheck at
 * the seeder — it would fail at whichever caller imports it, and the callers
 * here are a cron route, a platform admin action and the boot-time resync,
 * two of which nothing else covers. So the surface is pinned directly.
 *
 * Adding an export is fine; this only fails when one goes MISSING.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

vi.mock('@/lib/db', () => ({
  db: { select: () => ({}), insert: () => ({}), update: () => ({}) },
  schema: new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }),
}))

import * as demoClinic from '@/lib/services/demo-clinic'

/** Each name, and the caller that would break if it vanished. */
const SURFACE: Array<[string, string]> = [
  ['createDemoClinic', 'the resync cron, the platform admin action, and boot'],
  ['seedDemoNotificationsForUser', 'the platform admin action'],
  ['seedDemoSiteAnalytics', 'the site-analytics seeder test'],
  ['getPersonaAlignedPatientIds', 'the prospecting admin action'],
  ['cleanupMisattributedDemoArtifacts', 'the self-heal path'],
  ['upgradeLegacyDemoStats', 'the legacy-stats upgrade'],
  ['DEMO_SERVICES', 'the customized-blob drift guard'],
]

describe('the demo-clinic module keeps its public surface', () => {
  it.each(SURFACE)('exports %s — %s depends on it', (name) => {
    expect(demoClinic).toHaveProperty(name)
    expect((demoClinic as Record<string, unknown>)[name]).toBeDefined()
  })

  it('still exports functions, not accidental re-export objects', () => {
    for (const [name] of SURFACE) {
      if (name === 'DEMO_SERVICES') continue
      expect(typeof (demoClinic as Record<string, unknown>)[name], name).toBe('function')
    }
  })

  it('DEMO_SERVICES is still the built catalog, not an empty barrel', () => {
    expect(Array.isArray(demoClinic.DEMO_SERVICES)).toBe(true)
    expect(demoClinic.DEMO_SERVICES.length).toBeGreaterThan(0)
  })
})

/**
 * THE SPLIT STAYS A SPLIT.
 *
 * A directory whose files import each other in a ring is one file with extra
 * steps: nothing in it can be read, moved or deleted on its own again, and the
 * next person to reach for "wherever seems related" rebuilds the 6,535-line
 * file a module at a time. The graph is acyclic today; these pin it there.
 *
 * `services-catalog.ts` runs `buildDemoServices()` at module load, so a cycle
 * would not merely be untidy — it would evaluate a half-initialized module and
 * hand the demo an empty catalog.
 */
const MODULE_DIR = resolve(process.cwd(), 'lib/services/demo-clinic')

function moduleFiles(): string[] {
  return readdirSync(MODULE_DIR)
    .filter((f) => f.endsWith('.ts'))
    .sort()
}

describe('the demo-clinic module keeps its shape', () => {
  it('is actually looking at the seeder', () => {
    // A guard whose directory read comes back empty passes forever.
    expect(moduleFiles()).toContain('index.ts')
    expect(moduleFiles().length).toBeGreaterThan(10)
  })

  it('has no import cycles between its files', () => {
    const graph = new Map(
      moduleFiles().map((f) => [
        f,
        Array.from(readFileSync(join(MODULE_DIR, f), 'utf8').matchAll(/from '\.\/([\w-]+)'/g)).map(
          (m) => `${m[1]}.ts`,
        ),
      ]),
    )

    const seen = new Map<string, 'open' | 'closed'>()
    const cycles: string[] = []
    const walk = (file: string, trail: string[]) => {
      if (seen.get(file) === 'closed') return
      if (seen.get(file) === 'open') {
        cycles.push([...trail.slice(trail.indexOf(file)), file].join(' → '))
        return
      }
      seen.set(file, 'open')
      for (const dep of graph.get(file) ?? []) walk(dep, [...trail, file])
      seen.set(file, 'closed')
    }
    for (const file of moduleFiles()) walk(file, [])

    expect(cycles, `import cycle inside the demo seeder:\n${cycles.join('\n')}`).toEqual([])
  })

  it('no sibling reaches its neighbours through the barrel', () => {
    // `from '@/lib/services/demo-clinic'` inside the directory resolves back to
    // index.ts, loading createDemoClinic and everything it calls to reach one
    // constant — and it is how a cycle gets introduced without looking like one.
    const offenders = moduleFiles().filter((f) =>
      readFileSync(join(MODULE_DIR, f), 'utf8').includes("from '@/lib/services/demo-clinic'"),
    )
    expect(offenders).toEqual([])
  })
})
