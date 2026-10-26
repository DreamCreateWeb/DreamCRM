import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * docs/ACTIVATION.md law 3 — "coming soon" is retired from the dashboard.
 * A door that depends on something outside the practice says the real
 * state in the feature's own words with the next step named. This scans
 * every dashboard source tree — AND the public clinic sites + the patient
 * portal, where the reader is least able to tell a promise from a
 * placeholder — for the phrase in RENDERED text (comments stripped) and
 * holds it at zero, with the allowed mentions listed: the public site's
 * "coming soon" page is what visitors see before the go-live lever (that
 * page itself, and the dashboard sentences that NAME it, are describing it,
 * not promising a feature).
 */

const ROOTS = [
  'app/(default)',
  'app/(double-sidebar)',
  'app/(onboarding)',
  // The patient-facing trees. The team page's empty branch read "Our team
  // page is coming soon" to a visitor on a direct link, and the membership
  // form carried a zero-plans "plans are coming soon" that nothing could
  // reach — both unseen while this guard stopped at the dashboard.
  'app/site',
  'app/(portal)',
  'components/clinic-site',
  'components/patient-portal',
  'components/ui',
  'components/feature-switch',
  'lib/integrations',
  'lib/feature-switches.ts',
  'lib/pms-connect.ts',
]

/** Files whose only "coming soon" is the NAME of the public site's pre-live page. */
const NAMES_THE_PUBLIC_PAGE = new Set(['app/(default)/website/go-live-card.tsx'])

/** The go-live gate ITSELF — the one public page that is, by design, the
 *  "coming soon" page a visitor sees before the lever is pulled. */
const IS_THE_PUBLIC_PAGE = new Set(['components/clinic-site/coming-soon.tsx'])

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(p)
  }
}

/** The promise in every coat it has worn: "coming soon", "coming next",
 *  "coming later", "arriving soon". The Reviews page's "Text-message requests
 *  are coming next" slipped past the first spelling for months. */
const COMING_SOON = /coming[\s-](soon|next|later)|arriv(e|es|ing)[\s-](soon|next)/i

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    // A module path is not rendered text: the site layout imports the
    // go-live gate from '…/coming-soon' and must not read as a promise.
    .replace(/^\s*import\b[^\n]*$/gm, '')
    .replace(/^\s*\}?\s*from\s+['"][^'"]*['"];?\s*$/gm, '')
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
      if (NAMES_THE_PUBLIC_PAGE.has(rel) || IS_THE_PUBLIC_PAGE.has(rel)) continue
      const code = stripComments(readFileSync(file, 'utf8'))
      if (COMING_SOON.test(code)) offenders.push(rel)
    }
    expect(offenders, 'a surface says "coming soon" (or next / later / arriving soon) — say the real state and name the next step (docs/ACTIVATION.md law 3)').toEqual([])
  })

  it('the exempt public page is still the go-live gate (the exemption is not a hiding place)', () => {
    for (const rel of Array.from(IS_THE_PUBLIC_PAGE)) {
      const code = stripComments(readFileSync(join(process.cwd(), rel), 'utf8'))
      expect(/coming[\s-]soon/i.test(code), `${rel} no longer says "coming soon" — drop its exemption`).toBe(true)
    }
  })

  it('the allowed file only NAMES the public pre-live page', () => {
    for (const rel of Array.from(NAMES_THE_PUBLIC_PAGE)) {
      const code = stripComments(readFileSync(join(process.cwd(), rel), 'utf8'))
      const hits = code.match(/.{0,40}coming soon.{0,40}/gi) ?? []
      expect(hits.length, rel).toBeGreaterThan(0)
      for (const h of hits) expect(h, `${rel}: ${h}`).toMatch(/page|see|sees/i)
    }
  })
})
