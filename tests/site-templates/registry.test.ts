import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getSiteTemplate, listSiteTemplates } from '@/lib/site-templates/registry'
import { SITE_TEMPLATE_CATALOG, isSiteTemplateId } from '@/lib/site-templates/catalog'
import { modernTemplate } from '@/lib/site-templates/modern'
import { buildClinicPalette, paletteCss, clinicPaletteCss, PALETTE_VARS } from '@/lib/clinic-site-theme'
import type { ClinicPalette } from '@/lib/clinic-site-theme'

const PALETTE_ROLES = Object.keys(PALETTE_VARS) as (keyof ClinicPalette)[]

// Representative brand inputs: strong dark, pale sage, screaming yellow
// (contrast-raising edge), null (un-branded clinic), junk.
const BRANDS = ['#1D4ED8', '#9CAF9F', '#FFE900', null, 'not-a-color'] as const

describe('getSiteTemplate', () => {
  it('resolves every catalog id to a def with a matching id', () => {
    for (const entry of SITE_TEMPLATE_CATALOG) {
      expect(getSiteTemplate(entry.id).id).toBe(entry.id)
    }
  })

  it('falls back to modern for unknown / null / legacy junk ids', () => {
    expect(getSiteTemplate('does-not-exist').id).toBe('modern')
    expect(getSiteTemplate(null).id).toBe('modern')
    expect(getSiteTemplate(undefined).id).toBe('modern')
    expect(getSiteTemplate('').id).toBe('modern')
    // Prototype-chain names must not resolve to anything.
    expect(getSiteTemplate('toString').id).toBe('modern')
    expect(getSiteTemplate('__proto__').id).toBe('modern')
  })
})

describe('isSiteTemplateId', () => {
  it('accepts registered ids, rejects everything else', () => {
    expect(isSiteTemplateId('modern')).toBe(true)
    expect(isSiteTemplateId('off')).toBe(false)
    expect(isSiteTemplateId('')).toBe(false)
    expect(isSiteTemplateId(null)).toBe(false)
  })
})

describe('every registered template def', () => {
  it('returns a complete palette (all roles, valid hex) for every brand input', () => {
    for (const def of listSiteTemplates()) {
      for (const brand of BRANDS) {
        const p = def.buildPalette(brand)
        for (const role of PALETTE_ROLES) {
          expect(p[role], `${def.id} ${role} for brand ${brand}`).toMatch(/^#[0-9a-fA-F]{6}$/)
        }
      }
    }
  })

  it('declares fonts with ids + google-hosted hrefs and a font-display line', () => {
    for (const def of listSiteTemplates()) {
      expect(def.fonts.length).toBeGreaterThan(0)
      for (const f of def.fonts) {
        expect(f.id).toMatch(/^[a-z0-9-]+$/)
        expect(f.href).toMatch(/^https:\/\/fonts\.googleapis\.com\//)
      }
      expect(def.fontCss).toContain('--font-display')
      expect(def.bookLabel.length).toBeGreaterThan(0)
    }
  })
})

describe('modern wraps the founding implementation with zero drift', () => {
  it('uses buildClinicPalette verbatim — layout CSS is byte-identical to the pre-registry output', () => {
    for (const brand of BRANDS) {
      expect(paletteCss(modernTemplate.buildPalette(brand))).toBe(clinicPaletteCss(brand))
    }
    expect(modernTemplate.buildPalette).toBe(buildClinicPalette)
  })

  it('keeps the original Fraunces link id + weights', () => {
    expect(modernTemplate.fonts[0].id).toBe('dc-fraunces')
    expect(modernTemplate.fonts[0].href).toContain('Fraunces')
    expect(modernTemplate.extraMarketingPages).toEqual([])
  })
})

describe('settings mega-form cannot stomp the template choice', () => {
  it('the Business-profile form no longer touches template at all (footgun retired)', () => {
    // The historical bug: a hidden value="modern" here reverted every
    // non-default design on the next profile save. Post-carve the form has NO
    // template input AND the action's identity-only payload ignores one even
    // if a stale client submits it (clinic-actions.test.ts pins the payload).
    const src = readFileSync(
      resolve(__dirname, '../..', 'app/(default)/settings/clinic/clinic-profile-panel.tsx'),
      'utf8',
    )
    expect(src).not.toMatch(/name="template"/)
    const actions = readFileSync(
      resolve(__dirname, '../..', 'app/(default)/settings/clinic/actions.ts'),
      'utf8',
    )
    // No template read (clean('template'…)) and no template payload key.
    expect(actions).not.toMatch(/clean\('template'/)
    expect(actions).not.toMatch(/\btemplate\s*[,:]/)
  })
})
