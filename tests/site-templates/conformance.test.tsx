import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type React from 'react'
import { render, cleanup } from '@testing-library/react'
import { listSiteTemplates } from '@/lib/site-templates/registry'
import { SITE_TEMPLATE_MANIFEST } from '@/lib/site-templates/manifest'
import { copyKeysForTemplate } from '@/lib/services/ai-website-edit'
import { PALETTE_VARS, type ClinicPalette } from '@/lib/clinic-site-theme'
import { intakeStartHref } from '@/lib/clinic-site-helpers'
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

function homeProps(
  data: ClinicSiteData,
  def: (typeof TEMPLATES)[number],
  selfBooking = data.profile.selfBookingEnabled !== false,
): HomePageProps {
  const staff = (data.profile.staff as unknown[] | null) ?? []
  return {
    data,
    basePath: '/site/fixture-dental',
    signInUrl: 'https://www.example.com/site/fixture-dental/portal',
    gates: {
      hasBlog: false,
      hasTeam: staff.length > 0,
      hasCareers: false,
      hasDentalPlans: false,
      hasColoringPages: false,
      selfBooking,
    },
    bookHref: selfBooking ? '/site/fixture-dental/book' : '/site/fixture-dental#contact',
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

  it('the hero photo slot is a Studio door with or without a photo', () => {
    // A practice with no photo yet must still have somewhere to click: the
    // first client's hero wall rendered its crest alone, so the owner could
    // not put a picture in the grey square. Empty → the region is there and
    // says so (data-edit-empty); filled → the same region, not flagged empty.
    const empty = render(<def.pages.Home {...homeProps(FIXTURES.empty(), def)} />)
    const door = empty.container.querySelector('[data-edit-field="heroImageUrl"][data-edit-kind="image"]')
    expect(door, 'empty clinic has no hero photo door').toBeTruthy()
    expect(door!.getAttribute('data-edit-empty')).toBe('true')
    cleanup()
    const rich = render(<def.pages.Home {...homeProps(FIXTURES.rich(), def)} />)
    const filled = rich.container.querySelectorAll('[data-edit-field="heroImageUrl"][data-edit-kind="image"]')
    expect(filled.length, 'rich clinic lost its hero photo door').toBeGreaterThan(0)
    for (const el of Array.from(filled)) expect(el.getAttribute('data-edit-empty')).toBeNull()
    cleanup()
  })

  it('the booking CTA carries the template voice (bookLabel)', () => {
    const { container } = render(<def.pages.Home {...homeProps(FIXTURES.rich(), def)} />)
    expect(container.textContent).toContain(def.bookLabel)
    cleanup()
  })

  it('with self-booking off, Home hosts the #contact anchor its bookHref targets', () => {
    // With self-booking off, homeProps points bookHref at `…#contact` — a
    // template that forgets the section strands its own CTA.
    const { container } = render(<def.pages.Home {...homeProps(FIXTURES.empty(), def, false)} />)
    expect(container.querySelector('#contact'), 'missing #contact section when self-booking is off').toBeTruthy()
    cleanup()
  })

  it('chrome: Footer carries the sitewide #site-footer-contact anchor + Header/Mobile render', () => {
    // Every template's "Contact" nav entry targets #site-footer-contact; a
    // footer without the anchor dead-ends that link on all 20 pages at once.
    const data = FIXTURES.rich()
    const chromeProps = {
      data,
      basePath: '/site/fixture-dental',
      navLinks: [
        { label: 'Services', href: '/site/fixture-dental/services' },
        { label: 'Contact', href: '#site-footer-contact' },
      ],
      bookHref: '/site/fixture-dental#contact',
      bookLabel: def.bookLabel,
      signInUrl: 'https://www.example.com/site/fixture-dental/portal',
    }
    const footer = render(<def.chrome.Footer {...chromeProps} />)
    expect(footer.container.querySelector('#site-footer-contact')).toBeTruthy()
    expect(footer.container.textContent).toContain(def.bookLabel)
    cleanup()
    const header = render(<def.chrome.Header {...chromeProps} />)
    expect(header.container.textContent).toContain(data.profile.displayName as string)
    expect(header.container.textContent).toContain(def.bookLabel)
    cleanup()
    const mobile = render(
      <def.chrome.MobileActions
        data={data}
        basePath="/site/fixture-dental"
        bookHref="/site/fixture-dental/book"
        bookLabel={def.bookLabel}
      />,
    )
    expect(mobile.container.textContent).toContain(def.bookLabel)
    cleanup()
  })

  it('chrome: the "New patient forms" door is an ABSOLUTE www URL when intake is open', () => {
    // The /intake-start gate signs the patient in (a relative better-auth POST
    // to /api/auth/*) and lands them in /patient/* — both exist only on the
    // www host. A relative `${basePath}/intake-start` on a subdomain or a
    // custom domain renders the gate in place and its submit is rewritten to
    // /site/<slug>/api/auth/… (a 404 on the practice's own domain). Every
    // template's Header + Footer must route the door through intakeStartHref.
    const data = FIXTURES.rich()
    data.profile.intakeFormsEnabledAt = new Date('2026-10-01T00:00:00Z')
    const chromeProps = {
      data,
      basePath: '',
      navLinks: [{ label: 'Contact', href: '#site-footer-contact' }],
      bookHref: '/book',
      bookLabel: def.bookLabel,
      signInUrl: 'https://www.example.com/site/fixture-dental/portal',
    }
    // Where the door sits is the template's call (five footers, the hometown
    // header, the modern home hero); that it is offered SOMEWHERE when open,
    // and absolute EVERYWHERE, is not.
    let doors = 0
    const surfaces: Array<() => React.ReactElement> = [
      () => <def.chrome.Footer {...chromeProps} />,
      () => <def.chrome.Header {...chromeProps} />,
      () => <def.pages.Home {...homeProps(data, def)} basePath="" bookHref="/book" />,
    ]
    for (const make of surfaces) {
      const { container } = render(make())
      const intakeLinks = Array.from(container.querySelectorAll('a[href*="intake-start"]'))
      doors += intakeLinks.length
      for (const a of intakeLinks) {
        expect(a.getAttribute('href')).toBe(intakeStartHref(data.slug))
      }
      cleanup()
    }
    expect(doors, 'the template offers no intake door at all while the door is open').toBeGreaterThan(0)
  })

  it('declared extra marketing pages resolve to real routes and honor their gates', () => {
    for (const page of def.extraMarketingPages) {
      // The route must exist — a declared page that 404s would poison nav +
      // sitemap for every clinic on this template.
      const routeFile = `app/site/[slug]${page.path}/page.tsx`
      expect(() => read(routeFile), `${routeFile} missing for declared page ${page.path}`).not.toThrow()
      // Gated pages must not surface on the empty clinic's Home nav.
      if (page.gate) {
        const emptyGates = {
          hasBlog: false, hasTeam: false, hasCareers: false, hasDentalPlans: false,
          hasColoringPages: false, selfBooking: false,
        }
        if (!page.gate(emptyGates)) {
          const { container } = render(<def.pages.Home {...homeProps(FIXTURES.empty(), def)} />)
          const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
          expect(
            hrefs.filter((h) => h?.endsWith(page.path)),
            `gated page ${page.path} leaked into the empty clinic's Home`,
          ).toEqual([])
          cleanup()
        }
      }
    }
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
