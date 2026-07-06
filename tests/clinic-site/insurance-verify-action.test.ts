import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertedRows: Array<{ table: string; values: unknown }> = []

// The action resolves the clinic's (possibly customised) field config from the
// DB; return an empty config so the built-in default fields are used.
let leadFormsRow: { leadForms: unknown } = { leadForms: null }

vi.mock('@/lib/db', async () => {
  const { lead } = await import('@/lib/db/schema/clinic')
  return {
    db: {
      insert: (table: unknown) => ({
        values: async (vals: unknown) => {
          const tableName = table === lead ? 'lead' : 'unknown'
          insertedRows.push({ table: tableName, values: vals })
        },
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [leadFormsRow],
          }),
        }),
      }),
    },
    schema: { lead },
  }
})

// The action resolves the org from the public slug server-side instead of
// trusting a client-posted orgId. Map the test slug → org_1; else → null.
vi.mock('@/lib/services/clinic-site', () => ({
  resolveClinicOrgIdBySlug: async (slug?: string) => (slug && slug !== 'unknown' ? 'org_1' : null),
}))

const { notifyOrgMembersMock } = vi.hoisted(() => ({
  notifyOrgMembersMock: vi.fn(async () => undefined),
}))
vi.mock('@/lib/services/notifications', () => ({
  notifyOrgMembers: notifyOrgMembersMock,
}))

import { submitInsuranceVerifyRequest } from '@/app/site/[slug]/insurance-verify-action'

beforeEach(() => {
  insertedRows.length = 0
  leadFormsRow = { leadForms: null }
  notifyOrgMembersMock.mockResolvedValue(undefined)
  notifyOrgMembersMock.mockClear()
})

function form(fields: Record<string, string | null>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v)
  return fd
}

describe('submitInsuranceVerifyRequest', () => {
  it('returns an error for an unresolvable clinic (missing/unknown slug)', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ email: 'jane@example.com', phone: '5551234567' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/clinic/i)
    expect(insertedRows).toHaveLength(0)
  })

  it('returns an error when email is missing', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ slug: 'acme', phone: '5551234567' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/email/i)
  })

  it('returns an error when email is malformed', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ slug: 'acme', email: 'not-an-email', phone: '5551234567' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/valid email/i)
  })

  it('returns an error when phone is missing', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ slug: 'acme', email: 'jane@example.com' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/phone/i)
  })

  it('returns an error when phone has too few digits', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ slug: 'acme', email: 'jane@example.com', phone: '123' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/valid phone/i)
  })

  it('creates a lead row scoped to the org with sourcePage=insurance_verifier on a happy-path submit', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({
        slug: 'acme',
        email: 'jane@example.com',
        phone: '(555) 123-4567',
        carrier: 'Aetna',
      }),
    )
    expect(result.ok).toBe(true)
    const leadInsert = insertedRows.find((r) => r.table === 'lead')
    expect(leadInsert).toBeDefined()
    expect(leadInsert!.values).toMatchObject({
      organizationId: 'org_1',
      email: 'jane@example.com',
      phone: '(555) 123-4567',
      sourcePage: 'insurance_verifier',
    })
    // The lead's message captures the carrier name verbatim so front
    // desk can see at a glance which plan the patient is asking about.
    expect((leadInsert!.values as { message: string }).message).toContain('Aetna')
  })

  it('omits an empty optional field from the lead message (no "unspecified" filler)', async () => {
    await submitInsuranceVerifyRequest(
      form({
        slug: 'acme',
        email: 'jane@example.com',
        phone: '5551234567',
      }),
    )
    const leadInsert = insertedRows.find((r) => r.table === 'lead')
    const message = (leadInsert!.values as { message: string }).message
    // No carrier/service selected → those lines are simply omitted.
    expect(message).toContain('Insurance verification request')
    expect(message).not.toContain('Insurance carrier')
  })

  it('drops the "Other / not listed" sentinel rather than leaking it into the message', async () => {
    await submitInsuranceVerifyRequest(
      form({
        slug: 'acme',
        email: 'jane@example.com',
        phone: '5551234567',
        carrier: '__other__',
      }),
    )
    const leadInsert = insertedRows.find((r) => r.table === 'lead')
    const message = (leadInsert!.values as { message: string }).message
    // Critical: the synthetic '__other__' marker must NOT leak through to
    // the lead row's notes (front desk would see garbage).
    expect(message).not.toContain('__other__')
  })

  it('maps a clinic-customised field to the lead by its config (label into message, systemKey into a column)', async () => {
    leadFormsRow = {
      leadForms: {
        insurance_verifier: [
          { id: 'name', type: 'text', label: 'Full name', required: true, systemKey: 'name' },
          { id: 'email', type: 'email', label: 'Email', required: true, systemKey: 'email' },
          { id: 'reason', type: 'text', label: 'Reason for visit', required: false },
        ],
      },
    }
    const result = await submitInsuranceVerifyRequest(
      form({ slug: 'acme', name: 'Jane Doe', email: 'jane@example.com', reason: 'Cleaning' }),
    )
    expect(result.ok).toBe(true)
    const leadInsert = insertedRows.find((r) => r.table === 'lead')!
    // systemKey 'name' lands on the lead's name column; the custom 'reason'
    // field is folded into the message under its real label.
    expect(leadInsert.values).toMatchObject({ name: 'Jane Doe', email: 'jane@example.com' })
    expect((leadInsert.values as { message: string }).message).toContain('Reason for visit: Cleaning')
  })

  it('requires a clinic-customised required field by its label', async () => {
    leadFormsRow = {
      leadForms: {
        insurance_verifier: [
          { id: 'email', type: 'email', label: 'Email', required: true, systemKey: 'email' },
          { id: 'dob', type: 'text', label: 'Date of birth', required: true },
        ],
      },
    }
    const result = await submitInsuranceVerifyRequest(
      form({ slug: 'acme', email: 'jane@example.com' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/date of birth/i)
  })

  it('falls back to a clear sentinel name on the lead row (form has no name field)', async () => {
    await submitInsuranceVerifyRequest(
      form({ slug: 'acme', email: 'jane@example.com', phone: '5551234567' }),
    )
    const leadInsert = insertedRows.find((r) => r.table === 'lead')
    expect(leadInsert!.values).toMatchObject({
      name: 'Insurance verification request',
    })
  })

  it('notifies org owners/admins of the new insurance question → /leads', async () => {
    // Use a custom form config that has a name field so the lead carries a real
    // name (the default 2-field insurance form has none → sentinel name).
    leadFormsRow = {
      leadForms: {
        insurance_verifier: [
          { id: 'name', type: 'text', label: 'Full name', required: true, systemKey: 'name' },
          { id: 'email', type: 'email', label: 'Email', required: true, systemKey: 'email' },
        ],
      },
    }
    const result = await submitInsuranceVerifyRequest(
      form({ slug: 'acme', name: 'Jane Doe', email: 'jane@example.com' }),
    )
    expect(result.ok).toBe(true)
    expect(notifyOrgMembersMock).toHaveBeenCalledWith(
      'org_1',
      expect.objectContaining({
        type: 'insurance_question',
        title: expect.stringContaining('Jane Doe'),
        linkPath: '/leads',
      }),
      { roles: ['owner', 'admin'], excludeEmail: 'jane@example.com' },
    )
  })

  it('does NOT notify when the submission is rejected (no lead created)', async () => {
    const result = await submitInsuranceVerifyRequest(form({ slug: 'acme', phone: '5551234567' }))
    expect(result.ok).toBe(false)
    expect(notifyOrgMembersMock).not.toHaveBeenCalled()
  })
})
