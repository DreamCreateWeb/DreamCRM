import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

/**
 * Public-site token guard — the derived-palette surface names live ONCE in
 * components/clinic-site/tokens.ts. Re-declaring the var() strings as local
 * consts (the old `const BG = 'var(--c-bg, …)'` per-page pattern, 21 files
 * deep before the consolidation) fails here with the file. Inline `var(--c-*)`
 * usage inside JSX stays allowed — the ban is on parallel LOCAL CONSTANTS,
 * which is where drift starts.
 */

const ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = ['app/site', 'components/clinic-site']
const TOKEN_HOME = 'components/clinic-site/tokens.ts'

const LOCAL_DECL = /^\s*(?:export )?const \w+\s*=\s*'var\(--c-(?:bg|ink|ink-muted|surface|border|deep|deep-ink|deep-muted),[^']*'\s*$/m

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('public-site surface tokens (single source of truth)', () => {
  it('no file re-declares a --c-* surface var as a local const', () => {
    const hits: string[] = []
    for (const base of SCAN_DIRS) {
      for (const file of walk(join(ROOT, base))) {
        const rel = relative(ROOT, file)
        if (rel === TOKEN_HOME) continue
        const src = readFileSync(file, 'utf8')
        const m = src.match(LOCAL_DECL)
        if (m) hits.push(`${rel}: ${m[0].trim()} — import from clinic-site/tokens instead`)
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('the token module defines the full surface set', () => {
    const src = readFileSync(join(ROOT, TOKEN_HOME), 'utf8')
    for (const name of ['SITE_BG', 'SITE_INK', 'SITE_INK_MUTED', 'SITE_SURFACE', 'SITE_BORDER', 'SITE_DEEP', 'SITE_DEEP_INK', 'SITE_DEEP_MUTED']) {
      expect(src).toContain(`export const ${name}`)
    }
  })
})
