import { describe, it, expect } from 'vitest'
import { authEmailShell, patientEmailShell, patientButtonColors } from '@/lib/email'
import type { ClinicSender } from '@/lib/email-identity'

const base: ClinicSender = {
  from: 'Bright <b@x.com>',
  replyTo: null,
  name: 'Bright Smiles',
  timeZone: 'America/Chicago',
}

describe('patientEmailShell', () => {
  it('names the clinic, never the platform', () => {
    const html = patientEmailShell({ sender: base, title: 'Hello', body: '<p>x</p>' })
    expect(html).toContain('Bright Smiles')
    expect(html).not.toMatch(/Dream Create/i)
  })

  it('renders the logo (alt = clinic name, max-height 40) when set', () => {
    const html = patientEmailShell({
      sender: { ...base, logoUrl: 'https://cdn.example.com/logo.png' },
      title: 'Hi',
      body: 'b',
    })
    expect(html).toContain('<img src="https://cdn.example.com/logo.png" alt="Bright Smiles"')
    expect(html).toContain('max-height:40px')
  })

  it('uses a brand button with white text when contrast clears 4.5:1', () => {
    const html = patientEmailShell({
      sender: { ...base, brandColor: '#1F6E7E' },
      title: 'Hi',
      body: 'b',
      cta: { url: 'https://x.test/a', label: 'Go' },
    })
    expect(html).toContain('background:#1F6E7E')
    expect(html).toContain('color:#ffffff')
  })

  it('falls back to ink on a tint when white-on-brand fails WCAG', () => {
    const c = patientButtonColors('#FFE066')
    expect(c.fg).toBe('#1C1A17')
    expect(c.bg).not.toBe('#FFE066')
    expect(c.border).toBe('#FFE066')
    expect(patientButtonColors(null)).toEqual({ bg: '#1C1A17', fg: '#ffffff', border: '#1C1A17' })
    expect(patientButtonColors('not-a-colour').bg).toBe('#1C1A17')
  })

  it('footer is name, address, phone with no unsubscribe line', () => {
    const html = patientEmailShell({
      sender: { ...base, address: '1 Main St, Austin TX 78701', phone: '(555) 123-4567' },
      title: 'Hi',
      body: 'b',
    })
    expect(html).toContain('Bright Smiles · 1 Main St, Austin TX 78701 · (555) 123-4567')
    expect(html).not.toMatch(/unsubscribe/i)
  })

  it('escapes every user-supplied value', () => {
    const html = patientEmailShell({
      sender: { ...base, name: '<b>Evil</b>', address: '<i>a</i>', logoUrl: 'https://x.test/"onerror="y' },
      title: '<script>t</script>',
      body: 'ok',
      cta: { url: 'https://x.test/?a=1&b="2', label: '<u>L</u>' },
      preheader: '<p>pre</p>',
    })
    expect(html).not.toContain('<b>Evil</b>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<u>L</u>')
    expect(html).not.toContain('<i>a</i>')
    expect(html).not.toContain('"onerror="y')
    expect(html).toContain('&lt;b&gt;Evil&lt;/b&gt;')
  })
})

describe('authEmailShell (platform sends)', () => {
  it('keeps the Dream Create footer', () => {
    expect(authEmailShell({ heading: 'h', introHtml: 'i' })).toContain('Dream Create')
  })
})
