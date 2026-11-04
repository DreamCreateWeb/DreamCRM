import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EmailsHub from '@/app/(default)/settings/automations/emails/emails-hub'
import { resolveEmailAutomations } from '@/lib/types/email-automations'
import { REMINDER_DEFAULTS } from '@/lib/types/reminders'

/**
 * The hub's preview IS the server-rendered email (sandboxed iframe srcdoc), has
 * a plain-text toggle, and "Send me a test" calls the action once.
 */

const preview = vi.fn(async (_key: string, draft: { body?: string }) => ({
  ok: true as const,
  subject: 'Subject from server',
  html: `<!DOCTYPE html><html><body><p>${draft.body ?? ''}</p><a href="https://x.test">Go</a></body></html>`,
  text: 'Plain twin\nGo (https://x.test)',
}))
const sendTest = vi.fn(async (): Promise<{ ok: true; to: string } | { ok: false; error: string }> => ({ ok: true, to: 'me@clinic.test' }))
vi.mock('@/app/(default)/settings/automations/emails/actions', () => ({
  saveEmailAutomationAction: vi.fn(async () => ({ ok: true as const })),
  saveReminderSettingsAction: vi.fn(async () => ({ ok: true as const })),
  previewEmailAutomationAction: (k: string, d: { body?: string }) => preview(k, d),
  sendTestEmailAction: () => sendTest(),
}))

const CONFIG = resolveEmailAutomations(null)

function mount(canManage = true) {
  render(<EmailsHub config={CONFIG} reminder={REMINDER_DEFAULTS} canManage={canManage} focusKey="contact_ack" />)
}

beforeEach(() => {
  preview.mockClear()
  sendTest.mockClear()
  document.body.innerHTML = ''
})

describe('EmailsHub real preview', () => {
  it('renders the action html in a titled, fully sandboxed iframe', async () => {
    mount()
    const frame = (await waitFor(() => {
      const f = document.querySelector('iframe')
      expect(f).not.toBeNull()
      return f
    })) as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('')
    expect(frame.getAttribute('title')).toMatch(/Preview of the .* email/)
    expect(frame.getAttribute('srcdoc')).toContain('<!DOCTYPE html>')
    expect(document.querySelector('[data-preview-subject]')?.textContent).toBe('Subject from server')
  })

  it('re-renders for the typed draft, debounced', async () => {
    mount()
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1))
    const body = screen.getByLabelText('Message') as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'a' } })
    fireEvent.change(body, { target: { value: 'ab' } })
    await waitFor(() => expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('<p>ab</p>'))
    // The two quick edits collapsed into one call.
    expect(preview).toHaveBeenCalledTimes(2)
  })

  it('the Text version toggle shows the plain-text twin instead of the iframe', async () => {
    mount()
    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Text version' }))
    expect(document.querySelector('[data-preview-text]')?.textContent).toContain('Go (https://x.test)')
    expect(document.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Email' }))
    expect(document.querySelector('iframe')).not.toBeNull()
  })

  it('"Send me a test" calls the action once and toasts the address', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Send me a test/ }))
    await waitFor(() => expect(screen.getByText('Test sent to me@clinic.test.')).toBeTruthy())
    expect(sendTest).toHaveBeenCalledTimes(1)
  })

  it('shows the rate-limit message the action returns', async () => {
    sendTest.mockResolvedValueOnce({ ok: false, error: 'You’ve sent 5 test emails in the last hour. Try again a little later.' })
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Send me a test/ }))
    await waitFor(() => expect(screen.getByText(/5 test emails in the last hour/)).toBeTruthy())
  })

  it('a read-only member sees the preview but no test button', async () => {
    mount(false)
    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull())
    expect(screen.queryByRole('button', { name: /Send me a test/ })).toBeNull()
  })
})
