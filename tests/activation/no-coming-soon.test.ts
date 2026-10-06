import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * docs/ACTIVATION.md law 3 — "coming soon" is retired from the dashboard.
 * A door that depends on something outside the practice says the real
 * state in the feature's own words with the next step named. This scans
 * every dashboard source tree for the phrase in RENDERED text (comments
 * stripped) and holds it at zero, with the one allowed mention listed:
 * the public site's "coming soon" page is what visitors see before the
 * go-live lever, and the dashboard sentences that NAME that page are
 * describing it, not promising a feature.
 */

const ROOTS = ['app/(default)', 'app/(double-sidebar)', 'app/(onboarding)', 'components/ui', 'components/feature-switch', 'lib/integrations', 'lib/feature-switches.ts', 'lib/pms-connect.ts']

/** Files whose only "coming soon" is the NAME of the public site's pre-live page. */
const NAMES_THE_PUBLIC_PAGE = new Set(['app/(default)/website/go-live-card.tsx'])

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(p)
  }
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
}

describe('law 3 — no "coming soon" in the dashboard', () => {
  it('holds the phrase at zero in rendered text across the dashboard trees', () => {
    const files: string[] = []
    for (const root of ROOTS) {
      const p = join(process.cwd(), root)
      if (statSync(p).isDirectory()) walk(p, files)
      else files.push(p)
    }
    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(process.cwd(), file)
      if (NAMES_THE_PUBLIC_PAGE.has(rel)) continue
      const code = stripComments(readFileSync(file, 'utf8'))
      if (/coming[\s-]soon/i.test(code)) offenders.push(rel)
    }
    expect(offenders, 'a dashboard surface says "coming soon" — say the real state and name the next step (docs/ACTIVATION.md law 3)').toEqual([])
  })

  it('the allowed file only NAMES the public pre-live page', () => {
    for (const rel of NAMES_THE_PUBLIC_PAGE) {
      const code = stripComments(readFileSync(join(process.cwd(), rel), 'utf8'))
      const hits = code.match(/.{0,40}coming soon.{0,40}/gi) ?? []
      expect(hits.length, rel).toBeGreaterThan(0)
      for (const h of hits) expect(h, `${rel}: ${h}`).toMatch(/page|see|sees/i)
    }
  })
})
