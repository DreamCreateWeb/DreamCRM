import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clinicSenderFrom, deliverableReplyTo } from '@/lib/email-identity'

/**
 * Tier 1 sender identity: patient-facing clinic email goes out as
 * "{Clinic Name}" <{slug}@dreamcreatestudio.com> + Reply-To = the clinic inbox.
 */

const state = {
  org: null as null | { slug: string | null; name: string | null },
  profile: null as null | { senderName: string | null; displayName: string | null; email: string | null },
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            if (t === 'organization') return state.org ? [state.org] : []
            if (t === 'clinicProfile') return state.profile ? [state.profile] : []
            return []
          },
        }),
      }),
    }),
  },
  schema: { organization: 'organization', clinicProfile: 'clinicProfile' },
}))

vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({ _: 'eq' })) }))

import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'

beforeEach(() => {
  state.org = { slug: 'acme-dental', name: 'Acme Dental Org' }
  state.profile = { senderName: null, displayName: 'Acme Dental', email: 'front@acmedental.com' }
})

describe('clinicSenderFrom', () => {
  it('formats "Name <slug@domain>"', () => {
    expect(clinicSenderFrom('Acme Dental', 'acme-dental', 'dreamcreatestudio.com')).toBe(
      'Acme Dental <acme-dental@dreamcreatestudio.com>',
    )
  })
  it('sanitizes header-injection chars in the name and cleans the local-part', () => {
    expect(clinicSenderFrom('Acme\r\n"Dental"', 'Acme Dental!', 'dreamcreatestudio.com')).toBe(
      'AcmeDental <acmedental@dreamcreatestudio.com>',
    )
  })
  it('falls back to safe defaults on empty input', () => {
    expect(clinicSenderFrom('', '', 'dreamcreatestudio.com')).toBe('Your dental office <clinic@dreamcreatestudio.com>')
  })
})

describe('getClinicSenderIdentity', () => {
  it('uses the clinic-set sender name when present (highest precedence)', async () => {
    state.profile = { senderName: 'Acme Dental Care', displayName: 'Acme Dental', email: 'front@acmedental.com' }
    const s = await getClinicSenderIdentity('org_1')
    expect(s.name).toBe('Acme Dental Care')
    expect(s.from).toBe('Acme Dental Care <acme-dental@dreamcreatestudio.com>')
    expect(s.replyTo).toBe('front@acmedental.com')
  })

  it('falls back to the clinic display name when no sender name is set', async () => {
    const s = await getClinicSenderIdentity('org_1')
    expect(s.name).toBe('Acme Dental')
    expect(s.from).toBe('Acme Dental <acme-dental@dreamcreatestudio.com>')
  })

  it('falls back to the org name, then a safe default', async () => {
    state.profile = { senderName: null, displayName: null, email: null }
    expect((await getClinicSenderIdentity('org_1')).name).toBe('Acme Dental Org')
    state.org = { slug: null, name: null }
    const s = await getClinicSenderIdentity('org_1')
    expect(s.name).toBe('Your dental office')
    expect(s.from).toBe('Your dental office <clinic@dreamcreatestudio.com>')
  })

  it('drops a non-deliverable clinic email from Reply-To (no reply bounce)', async () => {
    state.profile = { senderName: null, displayName: 'Acme Dental', email: 'hello@acme-dental.example' }
    expect((await getClinicSenderIdentity('org_1')).replyTo).toBeNull()
  })
})

describe('deliverableReplyTo (sanity — full coverage in messaging suite)', () => {
  it('rejects the .example placeholder, accepts a real address', () => {
    expect(deliverableReplyTo('hello@acme-dental.example')).toBeNull()
    expect(deliverableReplyTo('front@acmedental.com')).toBe('front@acmedental.com')
  })
})
