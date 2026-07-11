import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, cleanup } from '@testing-library/react'
import { listSiteTemplates } from '@/lib/site-templates/registry'
import { SITE_TEMPLATE_MANIFEST } from '@/lib/site-templates/manifest'
import { copyKeysForTemplate } from '@/lib/services/ai-website-edit'
import { PALETTE_VARS, type ClinicPalette } from '@/lib/clinic-site-theme'
import { FIXTURES } from '../fixtures/clinic-site-fixtures'
import type { HomePageProps } from '@/lib/site-templates/page-props'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

/**
 * The template conformance harness — the "connects to the CMS, guaranteed"
 * suite. It iterates every REGISTERED template (lib/site-templates/registry),
 * so adding a def + manifest entry auto-enrolls a new template in all of
 * these checks; none of them are template-specific.
 *
 * What it proves, per template:
 *  1. Home + chrome render every canonical fixture (day-0 empty, rich, edge)
 *     without throwing — the universal content canon is the contract.
 *  2. Content gates are respected (no Team/Blog/Careers/Dental-Plans nav
 *     links for a clinic with none of that content).
 *  3. The booking CTA carries the template's own voice (bookLabel).
 *  4. The palette recipe emits every role, WCAG-floored, for tame AND
 *     hostile brand inputs.
 *  5. Its copy keys resolve through the AI bar's per-template registry.
 *  6. Source hygiene on the template's own files: tokens only (no local
 *     --c-* re-declaration), no forbidden literals, and PURITY — a template
 *     never imports the DB or a service's runtime (import type is fine).
 */

const ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

// WCAG relative-luminance contrast (self-contained; mirrors the site theme's
// internal math so the floor here can't drift with implementation changes).
function lum(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`not a hex color: ${hex}`)
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

function homeProps(data: ClinicSiteData, def: (typeof TEMPLATES)[number]): HomePageProps {
  const staff = (data.profile.staff as unknown[] | null) ?? []
  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  return {
    data,
    basePath: '/site/fixture-dental',
    signInUrl: 'https://www.example.com/site/fixture-dental/portal',
    gates: {
      hasBlog: false,
      hasTeam: staff.length > 0,
      hasCareers: false,
      hasDentalPlans: false,
      isPro,
      selfBooking: data.profile.selfBookingEnabled !== false,
    },
    bookHref: isPro ? '/site/fixture-dental/book' : '/site/fixture-dental#contact',
    bookLabel: def.bookLabel,
    recentPosts: [],
    reviewCount: 0,
    featuredGoogleReviews: [],
    googleRating: null,
  }
}

const TEMPLATES = listSiteTemplates()
const BRANDS = ['#1D4ED8', '#9CAF9F', '#FFE900', '#FFFFFF', null] as const
const PALETTE_ROLES = Object.keys(PALETTE_VARS) as (keyof ClinicPalette)[]

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('template conformance [%s]', (tid, def) => {
  describe.each(Object.entries(FIXTURES))('fixture: %s', (_name, make) => {
    it('renders Home without throwing and shows the clinic name', () => {
      const data = make()
      const { container } = render(<def.pages.Home {...homeProps(data, def)} />)
      expect(container.textContent).toContain(data.profile.displayName as string)
      cleanup()
    })
  })

  it('respects content gates on the empty clinic (no dead nav links)', () => {
    const { container } = render(<def.pages.Home {...homeProps(FIXTURES.empty(), def)} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    for (const dead of ['/team', '/blog', '/careers', '/dental-plans']) {
      expect(
        hrefs.filter((h) => h?.endsWith(dead)),
        `empty clinic must not link to ${dead}`,
      ).toEqual([])
    }
    cleanup()
  })

  it('the booking CTA carries the template voice (bookLabel)', () => {
    const { container } = render(<def.pages.Home {...homeProps(FIXTURES.rich(), def)} />)
    expect(container.textContent).toContain(def.bookLabel)
    cleanup()
  })

  it('palette recipe: all roles present + WCAG floors for every brand input', () => {
    for (const brand of BRANDS) {
      const p = def.buildPalette(brand)
      for (const role of PALETTE_ROLES) {
        expect(p[role], `${role} for brand ${brand}`).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
      // The floors every template must clear regardless of recipe philosophy.
      expect(contrast(p.ink, p.bg), `ink/bg @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.heading, p.bg), `heading/bg @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.deepInk, p.deep), `deepInk/deep @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.brandInk, p.brand), `brandInk/brand @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.stripInk, p.strip), `stripInk/strip @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      // No pure-white / pure-black grounds (DESIGN.md forbids them).
      expect(p.bg.toLowerCase()).not.toBe('#ffffff')
      expect(p.ink.toLowerCase()).not.toBe('#000000')
    }
  })

  it('its copy keys + copyDefaults resolve through the per-template registry', () => {
    const keys = copyKeysForTemplate(tid)
    const keySet = new Set(keys.map((k) => k.key))
    for (const k of def.copyKeys) {
      expect(keySet.has(k.key), `template copyKey ${k.key} missing`).toBe(true)
    }
    for (const key of Object.keys(def.copyDefaults)) {
      const entry = keys.find((k) => k.key === key)
      expect(entry, `copyDefault for unknown base key ${key}`).toBeTruthy()
      expect(entry!.fallback).toBe(def.copyDefaults[key])
    }
  })

  describe('source hygiene on the template’s own files', () => {
    const files = SITE_TEMPLATE_MANIFEST.byTemplate[tid] ?? []

    it('has a manifest entry (may be empty only while unshipped)', () => {
      expect(SITE_TEMPLATE_MANIFEST.byTemplate).toHaveProperty(tid)
    })

    it.each(files.length > 0 ? files : ['(none)'])('%s: tokens-only, no forbidden literals, pure', (rel: string) => {
      if (rel === '(none)') return
      const src = read(rel)
      // No local re-declaration of the --c-* surface vars (tokens.ts is the home).
      expect(src).not.toMatch(/const \w+ = 'var\(--c-(bg|ink|ink-muted|surface|border|deep|deep-ink|deep-muted)[,)]/)
      // Forbidden literals: corporate medical blue; pure white/black backgrounds.
      expect(src).not.toMatch(/#0066CC/i)
      expect(src).not.toMatch(/background(?:Color)?:\s*'#(?:fff(?:fff)?|000(?:000)?)'/i)
      // Purity: presentation only — no DB or service RUNTIME imports
      // (`import type` is erased at compile time and stays allowed), no
      // server-only marker.
      expect(src).not.toMatch(/^import (?!type )[^\n]*from '@\/lib\/db/m)
      expect(src).not.toMatch(/^import (?!type )[^\n]*from '@\/lib\/services\//m)
      expect(src).not.toMatch(/import 'server-only'/)
      // Legibility floor (mirror of tests/a11y/legibility-floor.test.ts).
      expect(src).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/)
    })
  })
})
