import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture state for the intake-send orchestrator.
const state = {
  patient: null as Record<string, unknown> | null,
  org: null as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  defaultForm: null as Record<string, unknown> | null,
  formById: null as Record<string, unknown> | null,
  sentEmails: [] as Array<{ to: string; data: Record<string, unknown> }>,
}

let selectCall = 0
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            // Order of selects in sendIntakeRequestToPatient:
            // 1) patient, 2) organization, 3) clinic_profile
            selectCall += 1
            if (selectCall === 1) return state.patient ? [state.patient] : []
            if (selectCall === 2) return state.org ? [state.org] : []
            if (selectCall === 3) return state.profile ? [state.profile] : []
            return []
          },
        }),
      }),
    }),
  },
  schema: {
    patient: { id: 'id', organizationId: 'organizationId', firstName: 'firstName', email: 'email' },
    clinicProfile: { organizationId: 'organizationId', displayName: 'displayName', websiteDomain: 'websiteDomain' },
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _kind: 'and' })),
  eq: vi.fn(() => ({ _kind: 'eq' })),
}))

vi.mock('@/lib/db/schema/auth', () => ({ organization: { id: 'id', slug: 'slug' } }))

vi.mock('@/lib/email', () => ({
  sendIntakeRequestEmail: vi.fn(async (to: string, data: Record<string, unknown>) => {
    state.sentEmails.push({ to, data })
  }),
}))

vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({
    from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
    replyTo: 'front@acmedental.com',
    name: 'Acme Dental',
  })),
}))

vi.mock('@/lib/services/forms', () => ({
  getDefaultFormTemplate: vi.fn(async () => state.defaultForm),
  getFormTemplate: vi.fn(async () => state.formById),
}))

vi.mock('@/lib/services/clinic-site', () => ({
  publicSiteUrl: vi.fn(({ slug }: { slug: string }) => `https://dreamcreatestudio.com/site/${slug}`),
}))

import { sendIntakeRequestToPatient } from '@/lib/services/patient-intake-send'

beforeEach(() => {
  selectCall = 0
  state.patient = null
  state.org = null
  state.profile = null
  state.defaultForm = null
  state.formById = null
  state.sentEmails = []
})

describe('sendIntakeRequestToPatient', () => {
  it('throws when the patient is not found', async () => {
    state.patient = null
    await expect(sendIntakeRequestToPatient('org_1', 'pat_missing')).rejects.toThrow(/not found/i)
    expect(state.sentEmails).toHaveLength(0)
  })

  it('throws a friendly error when the patient has no email on file', async () => {
    state.patient = { id: 'pat_1', firstName: 'Mia', email: null }
    await expect(sendIntakeRequestToPatient('org_1', 'pat_1')).rejects.toThrow(/no email/i)
    expect(state.sentEmails).toHaveLength(0)
  })

  it('throws when no default intake form is configured', async () => {
    state.patient = { id: 'pat_1', firstName: 'Mia', email: 'mia@example.com' }
    state.defaultForm = null
    await expect(sendIntakeRequestToPatient('org_1', 'pat_1')).rejects.toThrow(/default intake form/i)
    expect(state.sentEmails).toHaveLength(0)
  })

  it('sends the intake email with a public form URL when everything is configured', async () => {
    state.patient = { id: 'pat_1', firstName: 'Mia', email: 'mia@example.com' }
    state.org = { slug: 'acme-dental-demo' }
    state.profile = { displayName: 'Acme Dental', websiteDomain: null }
    state.defaultForm = { id: 'form_1', slug: 'new-patient-intake', title: 'New Patient Intake' }

    const result = await sendIntakeRequestToPatient('org_1', 'pat_1')

    expect(result.sentTo).toBe('mia@example.com')
    expect(result.formTitle).toBe('New Patient Intake')
    expect(state.sentEmails).toHaveLength(1)
    const sent = state.sentEmails[0]
    expect(sent.to).toBe('mia@example.com')
    expect(sent.data.patientFirstName).toBe('Mia')
    expect(sent.data.clinicName).toBe('Acme Dental')
    expect(sent.data.intakeFormUrl).toBe(
      'https://dreamcreatestudio.com/site/acme-dental-demo/intake/new-patient-intake',
    )
  })

  it('sends the SELECTED form (by id) instead of the default when formId is given', async () => {
    state.patient = { id: 'pat_1', firstName: 'Mia', email: 'mia@example.com' }
    state.org = { slug: 'acme-dental-demo' }
    state.profile = { displayName: 'Acme Dental', websiteDomain: null }
    state.defaultForm = { id: 'form_default', slug: 'new-patient-intake', title: 'New Patient Intake' }
    state.formById = { id: 'form_perio', slug: 'perio-history', title: 'Perio History' }

    const result = await sendIntakeRequestToPatient('org_1', 'pat_1', 'form_perio')

    expect(result.formTitle).toBe('Perio History')
    expect(state.sentEmails[0].data.intakeFormUrl).toBe(
      'https://dreamcreatestudio.com/site/acme-dental-demo/intake/perio-history',
    )
  })

  it('rejects when the chosen form is missing or archived', async () => {
    state.patient = { id: 'pat_1', firstName: 'Mia', email: 'mia@example.com' }
    state.formById = { id: 'form_x', slug: 'x', title: 'X', archivedAt: new Date() }
    await expect(sendIntakeRequestToPatient('org_1', 'pat_1', 'form_x')).rejects.toThrow(/no longer available/i)
    expect(state.sentEmails).toHaveLength(0)
  })
})
