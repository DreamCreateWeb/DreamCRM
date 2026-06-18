import { describe, expect, it } from 'vitest'
import {
  renderCampaignEmail,
  resolveMarketingFooterAddress,
  buildUnsubscribeUrl,
  applyMergeFields,
} from '@/lib/marketing/render-email'
import { decodeToken } from '@/lib/marketing/tokens'

describe('renderCampaignEmail', () => {
  const base = {
    campaignId: 42,
    recipientEmail: 'JANE@example.com',
    recipientCustomerId: 7,
    subject: 'Hi Jane',
    bodyHtml: '<p>Hello <a href="https://example.com/cta">click here</a></p>',
  }

  it('wraps body in branded layout with tracking pixel and unsubscribe link', () => {
    const { html } = renderCampaignEmail(base)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Hello <a')
    expect(html).toContain('Unsubscribe')
    // Tracking pixel pointing at our open endpoint
    expect(html).toMatch(/\/api\/track\/open\/[\w.-]+/)
  })

  it('lowercases recipient email when issuing tokens', () => {
    const { html } = renderCampaignEmail(base)
    const m = html.match(/\/api\/track\/open\/([\w.-]+)/)
    expect(m).toBeTruthy()
    const payload = decodeToken(m![1])
    expect(payload?.e).toBe('jane@example.com')
    expect(payload?.c).toBe(42)
    expect(payload?.p).toBe('o')
  })

  it('rewrites http links into tracked click URLs', () => {
    const { html } = renderCampaignEmail(base)
    expect(html).not.toContain('href="https://example.com/cta"')
    const click = html.match(/\/api\/track\/click\/([\w.-]+)/)
    expect(click).toBeTruthy()
    const payload = decodeToken(click![1])
    expect(payload?.p).toBe('k')
    expect(payload?.u).toBe('https://example.com/cta')
  })

  it('leaves mailto and tel links alone', () => {
    const { html } = renderCampaignEmail({
      ...base,
      bodyHtml: '<p><a href="mailto:hi@x.com">email</a> <a href="tel:555">call</a></p>',
    })
    expect(html).toContain('href="mailto:hi@x.com"')
    expect(html).toContain('href="tel:555"')
  })

  it('skips tracking pixel + URL rewrites when tracking=false', () => {
    const { html } = renderCampaignEmail({ ...base, tracking: false })
    expect(html).not.toMatch(/\/api\/track\/open/)
    expect(html).toContain('href="https://example.com/cta"')
    // Unsubscribe still present (always required)
    expect(html).toContain('Unsubscribe')
  })

  it('renders preview text in a hidden preheader', () => {
    const { html } = renderCampaignEmail({ ...base, previewText: 'Sneak peek inside →' })
    expect(html).toContain('display:none')
    expect(html).toContain('Sneak peek inside')
  })

  it('produces a non-empty plain-text fallback', () => {
    const { text } = renderCampaignEmail(base)
    expect(text).toContain('Hello click here')
    expect(text).toContain('Unsubscribe:')
  })

  it('returns the per-recipient unsubscribe URL so the send path can reuse it as a header', () => {
    const { unsubUrl, html } = renderCampaignEmail(base)
    expect(unsubUrl).toMatch(/\/api\/unsub\/[\w.-]+/)
    // Same URL the footer link points at — they must not drift.
    expect(html).toContain(`href="${unsubUrl}"`)
  })

  it('renders the clinic postal address in the footer when supplied', () => {
    const { html, text } = renderCampaignEmail({
      ...base,
      postalAddress: '123 Main St, Austin, TX 78701',
    })
    expect(html).toContain('123 Main St, Austin, TX 78701')
    expect(text).toContain('123 Main St, Austin, TX 78701')
  })

  it('renders a light clinic branding header (wordmark) when clinicName is set', () => {
    const { html } = renderCampaignEmail({ ...base, clinicName: 'Acme Dental' })
    expect(html).toContain('Acme Dental')
  })

  it('renders the clinic logo in the branding header when a logo URL is set', () => {
    const { html } = renderCampaignEmail({
      ...base,
      clinicName: 'Acme Dental',
      clinicLogoUrl: 'https://cdn.example.com/logo.png',
    })
    expect(html).toContain('https://cdn.example.com/logo.png')
  })

  it('substitutes {{firstName}} merge fields in the body + text fallback', () => {
    const { html, text } = renderCampaignEmail({
      ...base,
      bodyHtml: '<p>Hi {{firstName}}, welcome!</p>',
      mergeFields: { firstName: 'Jane' },
    })
    expect(html).toContain('Hi Jane, welcome!')
    expect(html).not.toContain('{{firstName}}')
    expect(text).toContain('Hi Jane, welcome!')
  })

  it('substitutes {{bookingUrl}} BEFORE link rewriting so the merged URL is tracked', () => {
    const { html } = renderCampaignEmail({
      ...base,
      bodyHtml: '<p><a href="{{bookingUrl}}">Book →</a></p>',
      mergeFields: { bookingUrl: 'https://acme.example.com/book' },
    })
    // The merged URL is wrapped in a tracked click redirect, not left raw.
    expect(html).not.toContain('href="{{bookingUrl}}"')
    expect(html).not.toContain('href="https://acme.example.com/book"')
    const click = html.match(/\/api\/track\/click\/([\w.-]+)/)
    expect(click).toBeTruthy()
    expect(decodeToken(click![1])?.u).toBe('https://acme.example.com/book')
  })

  it('strips an unrecognized {{token}} to empty (never ships a raw token)', () => {
    const { html } = renderCampaignEmail({
      ...base,
      bodyHtml: '<p>Hi {{firstName}}{{nope}}!</p>',
      mergeFields: { firstName: 'Jane' },
    })
    expect(html).toContain('Hi Jane!')
    expect(html).not.toContain('{{nope}}')
  })
})

describe('applyMergeFields', () => {
  it('replaces known tokens and tolerates inner whitespace', () => {
    expect(applyMergeFields('Hi {{firstName}} and {{ firstName }}', { firstName: 'Mia' })).toBe(
      'Hi Mia and Mia',
    )
  })

  it('strips unknown / null-valued tokens to empty', () => {
    expect(applyMergeFields('a {{x}} b {{y}} c', { x: null, z: 'z' })).toBe('a  b  c')
  })

  it('leaves text with no tokens untouched', () => {
    expect(applyMergeFields('no tokens here', { firstName: 'Mia' })).toBe('no tokens here')
  })
})

describe('resolveMarketingFooterAddress', () => {
  it('composes the clinic address from clinic_profile fields when a street line exists', () => {
    const addr = resolveMarketingFooterAddress(
      { addressLine1: '123 Main St', city: 'Austin', state: 'TX', postalCode: '78701' },
      'env fallback',
    )
    expect(addr).toBe('123 Main St, Austin, TX 78701')
  })

  it('includes addressLine2 when present', () => {
    const addr = resolveMarketingFooterAddress({
      addressLine1: '123 Main St',
      addressLine2: 'Suite 200',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
    })
    expect(addr).toBe('123 Main St, Suite 200, Austin, TX 78701')
  })

  it('falls back to the env address when the clinic has no street line (incomplete address)', () => {
    const addr = resolveMarketingFooterAddress(
      { addressLine1: null, city: 'Austin', state: 'TX' },
      'Dream Create, 1 Platform Way, NY',
    )
    expect(addr).toBe('Dream Create, 1 Platform Way, NY')
  })

  it('returns null when neither clinic address nor env fallback is usable (caller fails closed)', () => {
    expect(resolveMarketingFooterAddress(null, '')).toBeNull()
    expect(resolveMarketingFooterAddress(null, undefined)).toBeNull()
    expect(resolveMarketingFooterAddress({ city: 'Austin' }, '')).toBeNull()
  })
})

describe('buildUnsubscribeUrl', () => {
  it('encodes a one-click unsubscribe token URL matching the footer link', () => {
    const url = buildUnsubscribeUrl({
      campaignId: 5,
      recipientEmail: 'Jane@Example.com',
      recipientPatientId: 'p9',
    })
    const m = url.match(/\/api\/unsub\/([\w.-]+)/)
    expect(m).toBeTruthy()
    const payload = decodeToken(m![1])
    expect(payload?.e).toBe('jane@example.com')
    expect(payload?.c).toBe(5)
    expect(payload?.pi).toBe('p9')
    expect(payload?.p).toBe('u')
  })
})

describe('signed tokens', () => {
  it('rejects tampered tokens', () => {
    const { html } = renderCampaignEmail({
      campaignId: 1,
      recipientEmail: 'a@b.com',
      subject: 's',
      bodyHtml: '<p>x</p>',
    })
    const m = html.match(/\/api\/track\/open\/([\w.-]+)/)
    const token = m![1]
    const [body, sig] = token.split('.')
    expect(decodeToken(`${body}.${sig.replace(/./, 'A')}`)).toBeNull()
    expect(decodeToken(`${body}AAAA.${sig}`)).toBeNull()
    expect(decodeToken('garbage')).toBeNull()
  })
})
