import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Routing tests for the Resend-inbound → /messages handler: known patient →
 * recordInboundMessage; unknown sender → forward to the clinic inbox; replays
 * (same Resend email_id) are no-ops; unconfigured/foreign traffic is ignored.
 */

const state: {
  org: { id: string; name: string } | null
  patient: { id: string } | null
  dupe: { id: string } | null
  profileEmail: string | null
} = { org: null, patient: null, dupe: null, profileEmail: null }

const recordMock = vi.fn(async (..._a: unknown[]) => ({ threadId: 't1', messageId: 'm1' }))
const sendMock = vi.fn(async (..._a: unknown[]) => {})
const platformOrgMock = vi.fn(async (): Promise<string | null> => 'org_platform')
const notifyMock = vi.fn(async (..._a: unknown[]) => {})

vi.mock('@/lib/services/patient-messaging', () => ({
  recordInboundMessage: (...a: unknown[]) => recordMock(...(a as [])),
}))
vi.mock('@/lib/email', () => ({
  sendNotificationEmail: (...a: unknown[]) => sendMock(...(a as [])),
}))
vi.mock('@/lib/services/gsc', () => ({
  getPlatformOrgId: () => platformOrgMock(),
}))
vi.mock('@/lib/services/notifications', () => ({
  notifyOrgMembers: (...a: unknown[]) => notifyMock(...(a as [])),
}))
vi.mock('@/lib/db', async () => {
  const { organization } = await import('@/lib/db/schema/auth')
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { patient, patientMessage } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      select: () => ({
        from: (t: unknown) => ({
          where: () => ({
            limit: async () => {
              if (t === organization) return state.org ? [state.org] : []
              if (t === patientMessage) return state.dupe ? [state.dupe] : []
              if (t === patient) return state.patient ? [state.patient] : []
              if (t === clinicProfile) return state.profileEmail ? [{ email: state.profileEmail }] : []
              return []
            },
          }),
        }),
      }),
    },
    schema: { organization, clinicProfile, patient, patientMessage },
  }
})

import { handleInboundReply } from '@/lib/services/inbound-reply'

const PAYLOAD = {
  email_id: 're_abc123',
  from: '"Mia Torres" <mia@example.com>',
  to: ['acme-dental@in.dreamcreatestudio.com'],
  subject: 'Re: your visit',
  text: 'Yes please, 3pm works!\n\nOn Tue wrote:\n> old thread',
}

beforeEach(() => {
  process.env.INBOUND_REPLY_DOMAIN = 'in.dreamcreatestudio.com'
  state.org = { id: 'org_1', name: 'Acme Dental' }
  state.patient = { id: 'pat_1' }
  state.dupe = null
  state.profileEmail = 'frontdesk@acmedental.com'
  recordMock.mockClear()
  sendMock.mockClear()
  platformOrgMock.mockClear().mockResolvedValue('org_platform')
  notifyMock.mockClear()
})
afterEach(() => {
  delete process.env.INBOUND_REPLY_DOMAIN
})

describe('handleInboundReply', () => {
  it('routes a known patient reply into their thread (quoted history stripped)', async () => {
    expect(await handleInboundReply(PAYLOAD)).toBe('recorded')
    expect(recordMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      patientId: 'pat_1',
      body: 'Yes please, 3pm works!',
      channel: 'email',
      externalId: 're_abc123',
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('forwards an unknown sender to the clinic inbox instead of dropping it', async () => {
    state.patient = null
    expect(await handleInboundReply(PAYLOAD)).toBe('forwarded')
    expect(recordMock).not.toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0][0] as { to: string; title: string; body: string }
    expect(arg.to).toBe('frontdesk@acmedental.com')
    expect(arg.title).toBe('Fwd: Re: your visit')
    expect(arg.body).toContain('mia@example.com')
    expect(arg.body).toContain('Yes please, 3pm works!')
  })

  it('replays with the same Resend email id are no-ops', async () => {
    state.dupe = { id: 'm_old' }
    expect(await handleInboundReply(PAYLOAD)).toBe('duplicate')
    expect(recordMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('ignores traffic when the feature is unconfigured', async () => {
    delete process.env.INBOUND_REPLY_DOMAIN
    expect(await handleInboundReply(PAYLOAD)).toBe('ignored:not_configured')
  })

  it('ignores recipients not on our inbound domain', async () => {
    expect(
      await handleInboundReply({ ...PAYLOAD, to: ['someone@elsewhere.com'] }),
    ).toBe('ignored:not_our_domain')
  })

  it('ignores an unknown clinic slug', async () => {
    state.org = null
    expect(await handleInboundReply(PAYLOAD)).toBe('ignored:unknown_clinic')
  })

  it('unknown sender with no clinic email on file → explicit ignore (nowhere to forward)', async () => {
    state.patient = null
    state.profileEmail = null
    expect(await handleInboundReply(PAYLOAD)).toBe('ignored:no_clinic_email')
    expect(sendMock).not.toHaveBeenCalled()
  })

  // ── The sending domain itself accepts mail too (apex MX, 2026-07-23) ──────

  it('routes mail composed fresh to the visible From address (slug@sending-domain)', async () => {
    const res = await handleInboundReply({
      ...PAYLOAD,
      to: ['acme-dental@dreamcreatestudio.com'],
    })
    expect(res).toBe('recorded')
    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org_1', patientId: 'pat_1' }),
    )
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('forwards platform aliases (hello@) to the platform owners/admins with a forced email', async () => {
    state.org = null // 'hello' matches no clinic slug
    const res = await handleInboundReply({
      ...PAYLOAD,
      to: ['hello@dreamcreatestudio.com'],
      subject: 'Question about pricing',
    })
    expect(res).toBe('forwarded:platform')
    expect(recordMock).not.toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledTimes(1)
    const [orgId, input, opts] = notifyMock.mock.calls[0] as [
      string,
      { type: string; title: string; body: string; forceEmail: boolean },
      { roles: string[] },
    ]
    expect(orgId).toBe('org_platform')
    expect(input.type).toBe('platform_inbound_email')
    expect(input.forceEmail).toBe(true)
    expect(input.title).toContain('hello@dreamcreatestudio.com')
    expect(input.title).toContain('Question about pricing')
    expect(input.body).toContain('mia@example.com')
    expect(opts.roles).toEqual(['owner', 'admin'])
  })

  it('an unknown slug on the REPLY domain still ignores (no platform forward there)', async () => {
    state.org = null
    expect(await handleInboundReply(PAYLOAD)).toBe('ignored:unknown_clinic')
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('sending-domain mail with no platform org → explicit ignore', async () => {
    state.org = null
    platformOrgMock.mockResolvedValue(null)
    expect(
      await handleInboundReply({ ...PAYLOAD, to: ['support@dreamcreatestudio.com'] }),
    ).toBe('ignored:no_platform_org')
  })
})
