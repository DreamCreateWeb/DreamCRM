import { describe, expect, it } from 'vitest'
import { renderCampaignEmail } from '@/lib/marketing/render-email'
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
