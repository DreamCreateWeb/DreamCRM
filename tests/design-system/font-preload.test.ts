import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * A FALLBACK FONT IS NOT PRELOADED ON EVERY PAGE OF THE PLATFORM.
 *
 * Geist Sans sits second in the dashboard's stack, behind Nunito, and no
 * public surface reads it. It came from `geist/font/sans`, whose font object
 * preloads by default; the import lives in the ROOT layout, so a 70 KB
 * high-priority font request rode on every page — the marketing site, every
 * clinic's public site, the patient portal — for a face nobody would see
 * (measured in the built `/pricing` on 2026-11-24: two font preloads, one of
 * them `Geist_Variable`). On a phone that request competes with the page's
 * largest paint.
 *
 * What is held here is the SOURCE of that behaviour, which is the part a unit
 * test can see: the root layout declares the font itself with `preload:
 * false`, keeps the variable on `<html>`, and the stack still names it. The
 * RESULT — that the built page no longer carries the preload, and that the
 * dashboard still renders Nunito — is asserted in a browser, in
 * `e2e/smoke.spec.ts` and `e2e/stranger.spec.ts`.
 */

const ROOT = resolve(__dirname, '../..')
const layout = readFileSync(join(ROOT, 'app/layout.tsx'), 'utf8')
const css = readFileSync(join(ROOT, 'app/css/style.css'), 'utf8')

describe('Geist Sans — declared, not preloaded', () => {
  it('the root layout no longer imports the package’s preloading font object', () => {
    expect(layout).not.toMatch(/from ['"]geist\/font\/sans['"]/)
  })

  it('it declares the same font itself, with the same variable and weights, and preload off', () => {
    const decl = layout.match(/const GeistSans = localFont\(\{([\s\S]*?)\}\)/)
    expect(decl, 'app/layout.tsx no longer declares GeistSans with localFont').toBeTruthy()
    const body = decl![1]
    expect(body).toContain("variable: '--font-geist-sans'")
    expect(body).toContain("weight: '100 900'")
    expect(body).toContain('preload: false')
  })

  it('the file it points at is the one the installed package ships', () => {
    const src = layout.match(/src: '([^']+Geist-Variable\.woff2)'/)
    expect(src, 'the declaration lost its src').toBeTruthy()
    // Relative to app/layout.tsx.
    expect(existsSync(join(ROOT, 'app', src![1])), src![1]).toBe(true)
  })

  it('both variables are still set on <html>, so every stack that reads them resolves', () => {
    expect(layout).toMatch(/className=\{`\$\{GeistSans\.variable\} \$\{GeistMono\.variable\}`\}/)
  })

  it('the dashboard stack is unchanged: Nunito, then Geist Sans as the fallback (DESIGN-SYSTEM.md)', () => {
    expect(css).toContain('--font-sans-dashboard: "Nunito", var(--font-geist-sans), "Inter"')
  })

  it('Geist MONO keeps its preload — it is above the fold on the marketing pages', () => {
    // The marketing eyebrow and trust row are `font-mono-num`, which is this.
    expect(layout).toMatch(/import \{ GeistMono \} from 'geist\/font\/mono'/)
    expect(css).toContain('--font-mono-num: var(--font-geist-mono)')
  })
})
