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
 *
 * THREE WAYS THE OLD PATTERN MISSED ITS OWN DEFECT (DREAMCRM-50 mutation
 * pass — reintroduce the declaration, watch the guard stay green):
 *
 *     /^\s*(?:export )?const \w+\s*=\s*'var\(--c-(?:bg|ink|…),[^']*'\s*$/m
 *
 *   - `\s*$` demanded the line END right after the closing quote, so
 *     `const BG = 'var(--c-bg, #FAF7F2)' // page ground` was invisible. A
 *     trailing comment is the most ordinary thing in the world to write.
 *   - the quote was hard-coded to `'`, so the same declaration in double
 *     quotes or a template literal walked past.
 *   - the token names were ENUMERATED, so a surface added to tokens.ts later
 *     would be re-declarable freely until somebody remembered to extend the
 *     list here. They are now DERIVED from the token module, which is the
 *     single home the guard exists to defend — add a token there and it is
 *     covered the same commit.
 *
 * It also matched with `/m` but no `/g`, so only the FIRST offending line in
 * a file was ever reported. The 21-file version of this defect averaged five
 * consts per page; a fixer would have been told about one of them at a time.
 */

const ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = ['app/site', 'components/clinic-site']
const TOKEN_HOME = 'components/clinic-site/tokens.ts'

/** The `--c-*` names the token module owns, read from the module itself. */
function ownedTokens(): string[] {
  const src = readFileSync(join(ROOT, TOKEN_HOME), 'utf8')
  return Array.from(new Set(Array.from(src.matchAll(/var\(\s*(--c-[a-z-]+)/g)).map((m) => m[1])))
}

/**
 * `const NAME = <quote>var(--c-token…<quote>` in any quote style, with
 * anything at all after the closing quote.
 *
 * The terminator is `(?![\w-])`, NOT `\b`. A hyphen is a non-word character,
 * so `\b` after `surface` matches inside `--c-surface-alt` — a DIFFERENT
 * token, owned by the template palettes rather than by tokens.ts, and the
 * first draft of this rule reported two of them as offenders. The same trap
 * would fire on any future `--c-bg-*` or `--c-ink-*`.
 */
function localDeclPattern(tokens: string[]): RegExp {
  const names = tokens.map((t) => t.slice(2)).join('|')
  return new RegExp(
    String.raw`^\s*(?:export\s+)?const\s+\w+\s*[:=][^\n]*?['"\`]\s*var\(\s*--(?:${names})(?![\w-])`,
    'gm',
  )
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('public-site surface tokens (single source of truth)', () => {
  const tokens = ownedTokens()
  const LOCAL_DECL = localDeclPattern(tokens)

  it('no file re-declares a --c-* surface var as a local const', () => {
    const hits: string[] = []
    for (const base of SCAN_DIRS) {
      for (const file of walk(join(ROOT, base))) {
        const rel = relative(ROOT, file).split('\\').join('/')
        if (rel === TOKEN_HOME) continue
        const src = readFileSync(file, 'utf8')
        // Every offending line, not just the first — a page that re-declared
        // the palette re-declared all of it.
        for (const m of Array.from(src.matchAll(LOCAL_DECL))) {
          hits.push(`${rel}: ${m[0].trim()} — import from clinic-site/tokens instead`)
        }
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('the token module defines the full surface set', () => {
    const src = readFileSync(join(ROOT, TOKEN_HOME), 'utf8')
    for (const name of [
      'SITE_BG',
      'SITE_INK',
      'SITE_INK_MUTED',
      'SITE_SURFACE',
      'SITE_BORDER',
      'SITE_DEEP',
      'SITE_DEEP_INK',
      'SITE_DEEP_MUTED',
    ]) {
      expect(src).toContain(`export const ${name}`)
    }
  })

  it('derives the banned names from the token module rather than a copy', () => {
    // If this list went empty or stale, the rule above would match nothing and
    // report a clean tree forever.
    expect(tokens).toContain('--c-bg')
    expect(tokens).toContain('--c-deep-muted')
    expect(tokens.length).toBeGreaterThanOrEqual(8)
  })

  it('catches the declaration however it is written', () => {
    const banned = [
      `const BG = 'var(--c-bg, #FAF7F2)'`,
      `const BG = 'var(--c-bg, #FAF7F2)' // page ground`,
      `const BG = "var(--c-bg, #FAF7F2)"`,
      'const BG = `var(--c-bg, #FAF7F2)`',
      `export const INK = 'var(--c-ink, #1C1A17)';`,
      `const DEEP_MUTED = 'var(--c-deep-muted)'`,
      `const BG: string = 'var(--c-bg, #FAF7F2)'`,
    ]
    for (const line of banned) {
      expect(Array.from(line.matchAll(LOCAL_DECL)), `${line} should be caught`).not.toEqual([])
    }
    const allowed = [
      // Inline use in JSX is the sanctioned escape hatch, not a parallel const.
      `<div style={{ background: 'var(--c-bg, #FAF7F2)' }} />`,
      `  color: 'var(--c-ink, #1C1A17)',`,
      // A local const of something that is NOT an owned surface token.
      `const RING = 'var(--c-ring, #000)'`,
      `import { SITE_BG } from './tokens'`,
      // …including the near-misses a `\b` terminator would have swallowed.
      // `--c-surface-alt` and `--c-brand-soft` belong to the template
      // palettes, not to tokens.ts, and re-declaring them locally is fine.
      `const rightPortraitBg = 'var(--c-surface-alt, #F0D9BD)'`,
      `const ground = 'var(--c-brand-soft, #EFEAE1)'`,
    ]
    for (const line of allowed) {
      expect(Array.from(line.matchAll(LOCAL_DECL)), `${line} should be allowed`).toEqual([])
    }
  })
})
