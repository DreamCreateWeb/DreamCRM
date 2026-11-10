import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const actions = vi.hoisted(() => ({
  request: vi.fn(),
  check: vi.fn(),
}))
vi.mock('@/app/(default)/website/domain/email-domain-actions', () => ({
  requestEmailDomainAction: (...a: unknown[]) => actions.request(...a),
  checkEmailDomainAction: (...a: unknown[]) => actions.check(...a),
}))

import EmailDomainCard from '@/app/(default)/website/domain/email-domain-card'
import type { EmailDomainState } from '@/lib/services/email-domain'

const rec = (over: Record<string, unknown> = {}) => ({
  purpose: 'DKIM',
  type: 'TXT',
  host: 'resend._domainkey',
  name: 'resend._domainkey.acme.com',
  value: 'p=MIGfMA0',
  status: 'not_started',
  ...over,
})
const st = (over: Partial<EmailDomainState> = {}): EmailDomainState => ({
  domain: 'acme.com',
  status: 'pending',
  records: [rec(), rec({ purpose: 'SPF', host: 'send', name: 'send.acme.com', value: 'v=spf1 include:amazonses.com ~all' })],
  checkedAt: '2026-11-09T15:00:00Z',
  verifiedAt: null,
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('EmailDomainCard', () => {
  it('renders nothing until the site is live on its own domain', () => {
    const { container } = render(<EmailDomainCard initialState={null} siteDomain={null} timeZone="America/Chicago" />)
    expect(container.textContent).toBe('')
  })

  it('offers the request, then shows the records and the 15-minute promise', async () => {
    actions.request.mockResolvedValue({ ok: true, state: st() })
    render(<EmailDomainCard initialState={null} siteDomain="acme.com" timeZone="America/Chicago" />)
    expect(screen.getByText(/hello@acme\.com/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Send email from acme\.com/ }))
    await waitFor(() => expect(screen.getByText('resend._domainkey')).toBeTruthy())
    expect(screen.getByText('v=spf1 include:amazonses.com ~all')).toBeTruthy()
    expect(screen.getByText(/Checking every 15 minutes/)).toBeTruthy()
    expect(screen.getByText(/these 2 records/)).toBeTruthy()
    expect(screen.queryByText(/coming soon/i)).toBeNull()
  })

  it('says exactly which records are still missing', () => {
    render(
      <EmailDomainCard
        initialState={st({ records: [rec({ status: 'verified' }), rec({ purpose: 'SPF', host: 'send', value: 'v=spf1', status: 'pending' })] })}
        siteDomain="acme.com"
        timeZone="America/Chicago"
      />,
    )
    expect(screen.getByText(/Add this record/)).toBeTruthy()
    expect(screen.getByText(/DKIM · verified/)).toBeTruthy()
    expect(screen.getByText(/SPF · missing/)).toBeTruthy()
  })

  it('Check now flips to verified and says so', async () => {
    actions.check.mockResolvedValue({ ok: true, state: st({ status: 'verified', verifiedAt: '2026-11-09T16:00:00Z', records: [rec({ status: 'verified' })] }) })
    render(<EmailDomainCard initialState={st()} siteDomain="acme.com" timeZone="America/Chicago" />)
    fireEvent.click(screen.getByRole('button', { name: /Check now/ }))
    await waitFor(() => expect(screen.getByText(/Sending from your domain/)).toBeTruthy())
    expect(screen.getByText(/now comes from your domain/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Check now/ })).toBeNull()
  })

  it('a failed action shows its words', async () => {
    actions.check.mockResolvedValue({ ok: false, error: 'We couldn’t reach our email provider just now.' })
    render(<EmailDomainCard initialState={st()} siteDomain="acme.com" timeZone="America/Chicago" />)
    fireEvent.click(screen.getByRole('button', { name: /Check now/ }))
    await waitFor(() => expect(screen.getByText(/couldn’t reach our email provider/)).toBeTruthy())
  })

  it('failed: Try again re-runs the request, shows found values, and says when it checks daily', async () => {
    actions.request.mockResolvedValue({ ok: true, state: st({ status: 'pending', failedChecks: 0 }) })
    render(
      <EmailDomainCard
        initialState={st({ status: 'failed', failedChecks: 3, records: [rec({ status: 'failed', found: 'p=OLD' })] })}
        siteDomain="acme.com"
        timeZone="America/Chicago"
      />,
    )
    expect(screen.getByText(/We found: p=OLD/)).toBeTruthy()
    expect(screen.getByText(/check once a day/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await waitFor(() => expect(actions.request).toHaveBeenCalled())
    expect(actions.check).not.toHaveBeenCalled()
  })
})
