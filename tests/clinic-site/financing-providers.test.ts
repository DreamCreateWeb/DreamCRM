import { describe, it, expect } from 'vitest'
import {
  CHERRY_FULL_PAGE_SECTIONS,
  CHERRY_WIDGET_SRC,
  FINANCING_PROVIDERS,
  cherryApplyUrl,
  cherryFloatingFrom,
  cherryWidgetConfig,
  financingProvider,
  parseConnectValue,
  resolveFinancingPartner,
  resolveFinancingPartners,
  sunbitApplyUrl,
} from '@/lib/financing-providers'
import { parseFinancingPartners } from '@/lib/clinic-content-parse'

/**
 * FINANCING WIDGETS — the pure registry. Pins: every provider's connect
 * contract (a slug or a host-checked link, never HTML); the parser's
 * tolerance (a bare slug, the full link, a wrong host refused); the apply
 * links in the exact shapes the providers hand out; Cherry's init object
 * from the clinic's brand; the floating-button derivation the layout reads;
 * and the form-post parser that re-validates on the wire.
 */

describe('the catalog', () => {
  it('names the providers a US dental desk actually meets, each with one way to connect', () => {
    expect(FINANCING_PROVIDERS.map((p) => p.id)).toEqual(['cherry', 'carecredit', 'sunbit', 'proceed', 'alphaeon', 'lendingclub', 'scratchpay', 'other'])
    for (const p of FINANCING_PROVIDERS) {
      expect(['slug', 'link']).toContain(p.connect.kind)
      expect(p.connect.where.length).toBeGreaterThan(10)
      if (p.connect.kind === 'link' && p.id !== 'other') expect(p.connect.hosts.length).toBeGreaterThan(0)
    }
    expect(financingProvider('cherry')?.widget).toBe('cherry')
    expect(financingProvider('sunbit')?.widget).toBe('sunbit')
    expect(financingProvider('carecredit')?.widget).toBeNull()
    expect(financingProvider('nope')).toBeNull()
  })
})

describe('parseConnectValue', () => {
  it('Cherry: a bare slug, the pay link with its UTM tail, or the portal host — all become the slug; a stranger’s host is refused', () => {
    expect(parseConnectValue('cherry', 'ted-pinney-dds-pa')).toEqual({ ok: true, slug: 'ted-pinney-dds-pa' })
    expect(parseConnectValue('cherry', 'https://pay.withcherry.com/ted-pinney-dds-pa?utm_source=merchant&utm_medium=website')).toEqual({ ok: true, slug: 'ted-pinney-dds-pa' })
    expect(parseConnectValue('cherry', 'pay.withcherry.com/Ted-Pinney-DDS-PA/')).toEqual({ ok: true, slug: 'ted-pinney-dds-pa' })
    expect(parseConnectValue('cherry', 'https://evil.example/ted-pinney-dds-pa').ok).toBe(false)
    expect(parseConnectValue('cherry', '<script>alert(1)</script>').ok).toBe(false)
    expect(parseConnectValue('cherry', '').ok).toBe(false)
  })

  it('Sunbit: the apply.sunbit.com link or the slug', () => {
    expect(parseConnectValue('sunbit', 'https://apply.sunbit.com/bright-smiles-dental')).toEqual({ ok: true, slug: 'bright-smiles-dental' })
    expect(parseConnectValue('sunbit', 'bright-smiles-dental')).toEqual({ ok: true, slug: 'bright-smiles-dental' })
    expect(parseConnectValue('sunbit', 'https://pay.withcherry.com/x').ok).toBe(false)
  })

  it('link providers: https on the provider’s own domain; "other" takes any https link; http is refused', () => {
    expect(parseConnectValue('carecredit', 'https://www.carecredit.com/apply/confirm.html?encm=abc')).toEqual({ ok: true, url: 'https://www.carecredit.com/apply/confirm.html?encm=abc' })
    expect(parseConnectValue('carecredit', 'https://www.sunbit.com/x').ok).toBe(false)
    expect(parseConnectValue('proceed', 'https://app.proceedfinance.com/apply/123').ok).toBe(true)
    expect(parseConnectValue('alphaeon', 'https://www.myalphaeoncredit.com/apply?pid=1').ok).toBe(true)
    expect(parseConnectValue('lendingclub', 'https://www.lendingclub.com/patient-solutions/apply/x').ok).toBe(true)
    expect(parseConnectValue('scratchpay', 'https://scratchpay.com/consumer/abc/practice').ok).toBe(true)
    expect(parseConnectValue('other', 'https://anything.example/apply').ok).toBe(true)
    expect(parseConnectValue('other', 'http://anything.example/apply').ok).toBe(false)
    expect(parseConnectValue('other', 'javascript:alert(1)').ok).toBe(false)
  })
})

describe('resolving a stored partner', () => {
  it('a Cherry slug builds the apply link Cherry hands out, the standard line, the button wording, and the widget only when turned on', () => {
    const r = resolveFinancingPartner({ id: 'a', name: 'Cherry', provider: 'cherry', slug: 'ted-pinney-dds-pa', showWidget: true, floatingButton: true })
    expect(r.applyUrl).toBe('https://pay.withcherry.com/ted-pinney-dds-pa?utm_source=merchant&utm_medium=website')
    expect(cherryApplyUrl('x')).toBe('https://pay.withcherry.com/x?utm_source=merchant&utm_medium=website')
    expect(r.widget).toBe('cherry')
    expect(r.floating).toBe(true)
    expect(r.cta).toBe('Apply with Cherry')
    expect(r.description).toContain('soft credit check')
    const off = resolveFinancingPartner({ id: 'a', name: 'Cherry', provider: 'cherry', slug: 'ted-pinney-dds-pa', showWidget: false })
    expect(off.widget).toBeNull()
    expect(off.floating).toBe(false)
    // No slug: no link, no widget, whatever the toggles say.
    const bare = resolveFinancingPartner({ id: 'a', name: 'Cherry', provider: 'cherry', slug: null, showWidget: true, floatingButton: true })
    expect(bare.applyUrl).toBeNull()
    expect(bare.widget).toBeNull()
    expect(bare.floating).toBe(false)
  })

  it('a Sunbit slug frames apply.sunbit.com; a link provider keeps its link; a legacy free-form row still renders as it did', () => {
    expect(resolveFinancingPartner({ id: 's', name: 'Sunbit', provider: 'sunbit', slug: 'bright-smiles', showWidget: true })).toMatchObject({ applyUrl: sunbitApplyUrl('bright-smiles'), widget: 'sunbit', floating: false })
    expect(resolveFinancingPartner({ id: 'c', name: 'CareCredit', provider: 'carecredit', applyUrl: 'https://www.carecredit.com/apply/x' })).toMatchObject({ applyUrl: 'https://www.carecredit.com/apply/x', widget: null, cta: 'Apply with CareCredit' })
    expect(resolveFinancingPartner({ id: 'l', name: 'Local Credit Union', description: 'Our neighbours.', applyUrl: 'https://cu.example' })).toMatchObject({ provider: null, name: 'Local Credit Union', description: 'Our neighbours.', applyUrl: 'https://cu.example', cta: 'Learn more', widget: null })
  })

  it('the list keeps the clinic’s order (first = primary), drops nameless rows, and the layout finds the floating button', () => {
    const list = [
      { id: '1', name: 'Cherry', provider: 'cherry', slug: 'ted-pinney-dds-pa', floatingButton: true },
      { id: '2', name: '', applyUrl: 'https://x.example' },
      { id: '3', name: 'CareCredit', provider: 'carecredit', applyUrl: 'https://www.carecredit.com/apply/x' },
    ]
    expect(resolveFinancingPartners(list).map((p) => p.name)).toEqual(['Cherry', 'CareCredit'])
    expect(cherryFloatingFrom(list)).toEqual({ slug: 'ted-pinney-dds-pa', name: 'Cherry' })
    expect(cherryFloatingFrom([{ id: '1', name: 'Cherry', provider: 'cherry', slug: 'x', floatingButton: false }])).toBeNull()
    expect(cherryFloatingFrom(null)).toBeNull()
    expect(resolveFinancingPartners('junk')).toEqual([])
  })
})

describe('Cherry’s init object', () => {
  it('is the generator’s shape with the clinic’s brand: primary + the 10-alpha secondary, dental imagery, the floating estimator bottom-right only when asked', () => {
    const page = cherryWidgetConfig({ slug: 'ted-pinney-dds-pa', name: 'Ted Pinney DDS', brandHex: '#1F6F8B', fontFamily: 'inherit' })
    expect(page).toEqual({
      debug: false,
      variables: { slug: 'ted-pinney-dds-pa', name: 'Ted Pinney DDS', images: [21], customLogo: '', defaultPurchaseAmount: 2000, customImage: '', imageCategory: 'dental', language: 'en' },
      styles: { primaryColor: '#1F6F8B', secondaryColor: '#1F6F8B10', fontFamily: 'inherit', headerFontFamily: 'inherit' },
    })
    const floating = cherryWidgetConfig({ slug: 'x', name: 'X', brandHex: 'not-a-hex', fontFamily: '', floating: true })
    expect(floating.styles.primaryColor).toBe('#596FD4')
    expect(floating.styles.floatingEstimator).toMatchObject({ position: 'bottom-right', zIndex: 9999, ctaColor: '#596FD4', ctaTextColor: '#FFFFFF' })
    expect(CHERRY_WIDGET_SRC).toBe('https://files.withcherry.com/widgets/widget.js')
    expect([...CHERRY_FULL_PAGE_SECTIONS]).toEqual(['hero', 'calculator', 'howitworks', 'faq'])
  })
})

describe('parseFinancingPartners — the form post, re-validated', () => {
  it('keeps a catalog provider’s slug or host-checked link, drops what fails, and never a widget without a slug', () => {
    const out = parseFinancingPartners(
      JSON.stringify([
        { id: 'a', name: 'Cherry', provider: 'cherry', slug: 'https://pay.withcherry.com/ted-pinney-dds-pa', showWidget: true, floatingButton: true },
        { id: 'b', name: 'CareCredit', provider: 'carecredit', applyUrl: 'https://www.carecredit.com/apply/x', showWidget: true, floatingButton: true },
        { id: 'c', name: 'Sunbit', provider: 'sunbit', slug: 'https://evil.example/x', showWidget: true },
        { id: 'd', name: 'Cherry', provider: 'nonsense', applyUrl: 'https://x.example' },
        { id: 'e', name: 'Local', applyUrl: 'https://cu.example' },
      ]),
    )!
    expect(out[0]).toMatchObject({ provider: 'cherry', slug: 'ted-pinney-dds-pa', applyUrl: null, showWidget: true, floatingButton: true })
    expect(out[1]).toMatchObject({ provider: 'carecredit', slug: null, applyUrl: 'https://www.carecredit.com/apply/x', showWidget: false, floatingButton: false })
    expect(out[2]).toMatchObject({ provider: 'sunbit', slug: null, applyUrl: null, showWidget: false })
    expect(out[3]).not.toHaveProperty('provider')
    expect(out[4]).toMatchObject({ name: 'Local', applyUrl: 'https://cu.example' })
    expect(out[4]).not.toHaveProperty('provider')
  })
})
