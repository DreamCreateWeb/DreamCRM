import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * EVERY `var(--token)` A DASHBOARD SURFACE PAINTS WITH MUST EXIST.
 *
 * WHY THIS GUARD EXISTS. `bg-[color:var(--color-primary)] text-white` on a
 * token nobody ever defined does not fail, does not warn, and does not fall
 * back to anything: CSS drops the declaration, so the element keeps whatever
 * is behind it and the white text lands on it. The failure is INVISIBLE to
 * types, to the build, and to every test that asserts on text — and it is
 * only visible to a person if they happen to look at that one state.
 *
 * Three of these were live at once when this guard was written: the selected
 * star-threshold segment in the review settings, the PRIMARY outcome button
 * in Call Mode, and the identity swatch for a clinic with no brand colour —
 * plus two more that named a token with a `sky` fallback, silently painting
 * a hue v3 retired. All five spelled a brand token that had never existed.
 *
 * SCOPE: the dashboard/app tree only. The public clinic sites emit their own
 * `--c-*` palette at runtime from `lib/site-templates`, and the site fonts
 * and a few per-request chrome variables are set on the element rather than
 * in a stylesheet — those are listed as runtime-provided rather than
 * silently skipped, so adding one is a deliberate act.
 */

const CSS_FILES = ['app/css/style.css']

/** Tokens set at RUNTIME (inline style / a template's palette recipe / the
 *  Tailwind theme), not in a stylesheet. Each needs a reason. */
const RUNTIME_PROVIDED: Array<{ prefix: string; why: string }> = [
  { prefix: '--c-', why: 'public-site palette, emitted per template by lib/site-templates' },
  { prefix: '--demo-accent', why: 'presenter mode paints the prospect’s own colour inline' },
  { prefix: '--tm-step', why: 'set inline per template-gallery card' },
  { prefix: '--site-header-h', why: 'measured and set by the public site’s header' },
  { prefix: '--font-display', why: 'public-site font, set on the site layout element' },
  { prefix: '--font-sans', why: 'public-site font, set on the site layout element' },
  { prefix: '--color-amber-', why: 'Tailwind 4 theme colour' },
  { prefix: '--color-teal-', why: 'Tailwind 4 theme colour' },
  { prefix: '--color-rose-', why: 'Tailwind 4 theme colour' },
  { prefix: '--color-emerald-', why: 'Tailwind 4 theme colour' },
  { prefix: '--color-violet-', why: 'Tailwind 4 theme colour' },
  { prefix: '--color-gray-', why: 'Tailwind 4 theme colour' },
]

/** Strip comments before scanning: a token named in PROSE (this guard's own
 *  explanation, for one) is a description of a bug, not one. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('CSS custom properties referenced in code are defined', () => {
  const root = process.cwd()
  const css = CSS_FILES.map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n')
  const defined = new Set(Array.from(css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)).map((m) => m[1]))

  const files = ['app', 'components', 'lib'].flatMap((d) => walk(resolve(root, d)))

  it('names no token that will silently drop the declaration', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const m of Array.from(text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g))) {
        const token = m[1]
        if (defined.has(token)) continue
        if (RUNTIME_PROVIDED.some((r) => token.startsWith(r.prefix))) continue
        // A trailing-dash capture from a template literal (`--c-${name}`) is
        // a construction, not a reference.
        if (token.endsWith('-')) continue
        offenders.push(`${file.slice(root.length + 1)}: var(${token})`)
      }
    }
    expect(
      offenders,
      `These paint with a CSS variable nothing defines. CSS drops the whole\n` +
        `declaration, so the element keeps the colour behind it — white text on\n` +
        `an invisible button. Define the token, use a Tailwind class, or add it\n` +
        `to RUNTIME_PROVIDED with a reason:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('the brand tokens that caused this guard stay gone', () => {
    // If somebody reintroduces one of these spellings, the guard above will
    // catch it — but naming them here says WHY out loud.
    for (const dead of ['--color-brand-600', '--color-brand', '--color-primary']) {
      expect(defined.has(dead)).toBe(false)
    }
  })
})
