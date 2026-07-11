import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { COLORING_LIBRARY, coloringLibraryUrl } from '@/lib/types/coloring-library'

/**
 * Guards for the platform coloring library (public/images/coloring-library):
 *  1. Registry ↔ assets parity — an entry without a file 404s in the picker
 *     and on every clinic that added it; a file without an entry is dead
 *     weight nobody can add.
 *  2. Provenance discipline — every entry carries a source URL + a CC0/PD
 *     license string (these are REDISTRIBUTED on commercial clinic sites).
 *  3. Sanitization — the SVGs are served from clinic origins, so a script
 *     or event handler inside one would be an XSS on every clinic domain.
 *  4. The /images/ prefix — anything else re-enters the middleware's
 *     subdomain rewrite and 404s on clinic domains.
 */

const ASSET_DIR = resolve(__dirname, '../..', 'public/images/coloring-library')

describe('coloring library registry ↔ assets', () => {
  it('every registry entry has its SVG on disk (and it is a real file)', () => {
    for (const e of COLORING_LIBRARY) {
      const p = resolve(ASSET_DIR, `${e.slug}.svg`)
      expect(() => statSync(p), `missing asset for ${e.slug}`).not.toThrow()
      expect(statSync(p).size, `${e.slug}.svg is empty`).toBeGreaterThan(200)
      expect(statSync(p).size, `${e.slug}.svg too large`).toBeLessThan(2 * 1024 * 1024)
    }
  })

  it('every asset on disk has a registry entry (no orphan files)', () => {
    const slugs = new Set(COLORING_LIBRARY.map((e) => e.slug))
    for (const f of readdirSync(ASSET_DIR)) {
      expect(f.endsWith('.svg'), `non-svg file in the library: ${f}`).toBe(true)
      expect(slugs.has(f.replace(/\.svg$/, '')), `orphan asset ${f} — add a registry entry`).toBe(true)
    }
  })

  it('slugs are stable kebab-case, unique, alphabetized', () => {
    const slugs = COLORING_LIBRARY.map((e) => e.slug)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs).toEqual([...slugs].sort())
  })

  it('every entry records CC0/public-domain provenance', () => {
    for (const e of COLORING_LIBRARY) {
      expect(e.sourceUrl, e.slug).toMatch(/^https:\/\//)
      expect(e.license.toLowerCase(), `${e.slug} license`).toMatch(/cc0|public domain/)
      expect(e.title.trim().length, e.slug).toBeGreaterThan(2)
      expect(e.themes.length, e.slug).toBeGreaterThan(0)
    }
  })

  it('urls resolve under /images/ (middleware static exclusion)', () => {
    expect(coloringLibraryUrl('happy-tooth')).toBe('/images/coloring-library/happy-tooth.svg')
  })
})

describe('coloring library SVGs are sanitized (served from clinic origins)', () => {
  it.each(COLORING_LIBRARY.map((e) => e.slug))('%s.svg: no scripts / handlers / external refs', (slug) => {
    const src = readFileSync(resolve(ASSET_DIR, `${slug}.svg`), 'utf8')
    expect(src).toMatch(/<svg[^>]*viewBox=/i)
    expect(src).not.toMatch(/<script/i)
    expect(src).not.toMatch(/\son[a-z]+\s*=/i)
    expect(src).not.toMatch(/<foreignObject/i)
    expect(src).not.toMatch(/javascript:/i)
    // No external fetches — everything must render offline from the one file.
    expect(src).not.toMatch(/(?:xlink:href|href)\s*=\s*["']https?:/i)
  })
})

describe('demo clinic coloring seed', () => {
  it('every seeded slug exists in the library (seed source-scan)', () => {
    const seeder = readFileSync(resolve(__dirname, '../..', 'lib/services/demo-clinic.ts'), 'utf8')
    const block = seeder.match(/const DEMO_COLORING_PAGES = \[([\s\S]*?)\]\.map/)
    expect(block, 'DEMO_COLORING_PAGES missing from the seeder').toBeTruthy()
    const slugs = Array.from(block![1].matchAll(/'([a-z0-9-]+)'/g)).map((m) => m[1])
    expect(slugs.length).toBeGreaterThanOrEqual(4)
    const lib = new Set(COLORING_LIBRARY.map((e) => e.slug))
    for (const s of slugs) expect(lib.has(s), `demo seeds unknown slug ${s}`).toBe(true)
  })
})
