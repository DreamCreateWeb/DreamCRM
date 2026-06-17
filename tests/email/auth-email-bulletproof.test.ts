import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The invite/magic-link/password-reset emails must render in OLD OUTLOOK
 * (Word engine) — where a `<div max-width>` + `inline-block` link-button
 * collapses to broken, often un-clickable text. The first real clinic hit
 * exactly this. These pin the bulletproof shell: a fixed-width table, a VML
 * button for Outlook, and — critically — a VISIBLE copy-pasteable URL fallback
 * (the manual copy-paste is what actually rescued the first onboarding). We
 * capture the HTML handed to the provider via a mocked Resend client.
 */

const { sent } = vi.hoisted(() => ({
  sent: [] as Array<{ html?: string; subject?: string; to?: unknown }>,
}))

vi.mock('resend', () => ({
  // A class so `new Resend(key)` reliably returns an instance with `.emails.send`
  // (a `vi.fn(() => obj)` doesn't always honor its return value under `new`).
  Resend: class {
    emails = {
      send: async (payload: { html?: string; subject?: string; to?: unknown }) => {
        sent.push(payload)
        return { data: { id: 'mail_1' }, error: null }
      },
    }
  },
}))

import { sendInvitationEmail, sendMagicLinkEmail, sendPasswordResetEmail } from '@/lib/email'

beforeEach(() => {
  sent.length = 0
  process.env.EMAIL_DRIVER = 'resend'
  process.env.RESEND_API_KEY = 're_test_key'
})

describe('auth emails are Outlook-bulletproof', () => {
  const INVITE_URL = 'https://www.dreamcreatestudio.com/accept-invite?token=abc123'

  it('the invitation email carries a clickable VML button + a visible copy-paste link', async () => {
    await sendInvitationEmail('owner@clinic.com', {
      inviterName: 'Dustin',
      orgName: 'Bright Smiles Dental',
      role: 'owner',
      inviteUrl: INVITE_URL,
    })
    expect(sent).toHaveLength(1)
    const html = sent[0].html ?? ''
    // Fixed-width table container (Outlook ignores max-width on a div).
    expect(html).toMatch(/<table[^>]*width="480"/)
    // VML roundrect so Outlook renders a real, clickable button.
    expect(html).toContain('v:roundrect')
    expect(html).toContain(`href="${INVITE_URL}"`)
    // THE fix: a visible, copy-pasteable URL fallback (what saved the first clinic).
    expect(html).toMatch(/Copy and paste this link/i)
    // The URL appears as visible TEXT, not only inside an href attribute.
    expect(html).toContain(`>${INVITE_URL}</a>`)
  })

  it('escapes a malicious clinic name (no HTML injection through orgName)', async () => {
    await sendInvitationEmail('owner@clinic.com', {
      inviterName: 'Dustin',
      orgName: '<script>alert(1)</script> Dental',
      role: 'owner',
      inviteUrl: INVITE_URL,
    })
    const html = sent[0].html ?? ''
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('the magic-link + password-reset emails use the same bulletproof shell', async () => {
    await sendMagicLinkEmail('jane@x.com', 'https://app.example.com/magic?t=1')
    await sendPasswordResetEmail('jane@x.com', 'https://app.example.com/reset?t=2')
    expect(sent).toHaveLength(2)
    for (const m of sent) {
      const html = m.html ?? ''
      expect(html).toContain('v:roundrect')
      expect(html).toMatch(/Copy and paste this link/i)
      expect(html).toMatch(/<table[^>]*width="480"/)
    }
  })
})
