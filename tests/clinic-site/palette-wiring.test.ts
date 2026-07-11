import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Source-level guards for the brand-derived palette wiring. The whole clinic
 * site now themes off ONE brand color via CSS custom properties the site layout
 * sets on :root (lib/clinic-site-theme.ts → clinicPaletteCss). These checks pin
 * the two ends that must not drift:
 *   1. the layout actually injects the derived palette, and
 *   2. the signature "deep band" / "strip" / neutral surfaces read the vars
 *      (not the old hardcoded forest-teal / chartreuse / beige).
 * Cheap to check in source, awkward to assert through the iframe in happy-dom.
 */
const ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

describe('site layout injects the derived palette', () => {
  const layout = read('app/site/[slug]/layout.tsx')
  it('derives the palette from the clinic brand THROUGH the active template recipe', () => {
    expect(layout).toMatch(/getClinicThemeBySlug/)
    expect(layout).toMatch(/resolveActiveSiteTemplate/)
    expect(layout).toMatch(/def\.buildPalette\(brand\)/)
    expect(layout).toMatch(/paletteCss\(palette\)/)
  })
})

describe('the deep "rhythm-break" band reads var(--c-deep), not a fixed teal', () => {
  it('footer background derives from the brand', () => {
    const footer = read('components/clinic-site/site-footer.tsx')
    expect(footer).toMatch(/var\(--c-deep/)
    // The forest-teal only survives as the var() fallback, never as a bare value.
    expect(footer).not.toMatch(/const FOOTER_BG = '#36514c'/)
  })
  it('testimonial cards derive from the brand', () => {
    const t = read('components/clinic-site/testimonials-carousel.tsx')
    expect(t).toMatch(/var\(--c-deep/)
    expect(t).not.toMatch(/TESTIMONIAL_CARD_BG = '#36514c'/)
  })
  it('ClosingCTA teal variant derives from the brand', () => {
    const c = read('components/clinic-site/closing-cta.tsx')
    expect(c).toMatch(/var\(--c-deep/)
  })
})

describe('the announcement strip reads var(--c-strip), not a fixed chartreuse', () => {
  it('header strip derives from the brand', () => {
    const h = read('components/clinic-site/site-header.tsx')
    expect(h).toMatch(/var\(--c-strip/)
    expect(h).not.toMatch(/STRIP_BG = '#E7FB7E'/)
  })
})

describe('neutral surfaces read the brand-tinted vars', () => {
  it('modern template grounds/ink derive from the brand', () => {
    const m = read('components/clinic-site/modern-template.tsx')
    // Post-consolidation the var() strings come in via the token module.
    expect(m).toMatch(/from '@\/components\/clinic-site\/tokens'/)
    expect(m).toMatch(/SITE_BG/)
    expect(m).toMatch(/SITE_INK/)
    // No bare destructure of the fixed CLINIC_THEME constants anymore.
    expect(m).not.toMatch(/= CLINIC_THEME/)
  })
})

describe('OG image uses real derived hexes (Satori can not read CSS vars)', () => {
  const og = read('app/site/[slug]/opengraph-image.tsx')
  it('builds the palette through the STORED template recipe and uses p.bg (not var())', () => {
    // Stored template only — scrapers carry no preview cookie, so share
    // cards stay deterministic.
    expect(og).toMatch(/getSiteTemplate\(data\?\.profile\.template\)\.buildPalette\(brand\)/)
    expect(og).toMatch(/backgroundColor: p\.bg/)
    // Must NOT emit CSS custom properties into the image markup.
    expect(og).not.toMatch(/var\(--c-/)
  })
})

describe('no clinic-site surface still hardcodes the old fixed palette anchors', () => {
  // The forest-teal + chartreuse were the two biggest clashes when brand≠teal.
  // They may appear ONLY as a var() fallback now — never as a standalone value.
  const FILES = [
    'components/clinic-site/site-footer.tsx',
    'components/clinic-site/testimonials-carousel.tsx',
    'components/clinic-site/site-header.tsx',
    'components/clinic-site/modern-template.tsx',
  ]
  for (const f of FILES) {
    it(`${f}: forest-teal/chartreuse only survive as var() fallbacks`, () => {
      const src = read(f)
      for (const hex of ['#36514c', '#E7FB7E']) {
        // Any line mentioning the legacy hex must do so ONLY as a var() fallback
        // (e.g. `var(--c-deep, #36514c)`). Comment lines are exempt.
        const offending = src.split('\n').filter((line) => {
          const trimmed = line.trim()
          if (!line.toLowerCase().includes(hex.toLowerCase())) return false
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('{/*'))
            return false
          return !new RegExp(`var\\(--c-[a-z-]+,\\s*${hex}`, 'i').test(line)
        })
        expect(offending, `bare ${hex} (not a var() fallback) in ${f}`).toEqual([])
      }
    })
  }
})
