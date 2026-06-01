import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertedRows: Array<{ table: string; values: unknown }> = []

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
    },
    schema: { lead },
  }
})

import { submitInsuranceVerifyRequest } from '@/app/site/[slug]/insurance-verify-action'

beforeEach(() => {
  insertedRows.length = 0
})

function form(fields: Record<string, string | null>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.set(k, v)
  return fd
}

describe('submitInsuranceVerifyRequest', () => {
  it('returns an error when orgId is missing', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ email: 'jane@example.com', phone: '5551234567' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/organization/i)
    expect(insertedRows).toHaveLength(0)
  })

  it('returns an error when email is missing', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ orgId: 'org_1', phone: '5551234567' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/email/i)
  })

  it('returns an error when email is malformed', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ orgId: 'org_1', email: 'not-an-email', phone: '5551234567' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/valid email/i)
  })

  it('returns an error when phone is missing', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ orgId: 'org_1', email: 'jane@example.com' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/phone/i)
  })

  it('returns an error when phone has too few digits', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({ orgId: 'org_1', email: 'jane@example.com', phone: '123' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/valid phone/i)
  })

  it('creates a lead row scoped to the org with sourcePage=insurance_verifier on a happy-path submit', async () => {
    const result = await submitInsuranceVerifyRequest(
      form({
        orgId: 'org_1',
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

  it('records carrier as "unspecified" when no carrier is selected', async () => {
    await submitInsuranceVerifyRequest(
      form({
        orgId: 'org_1',
        email: 'jane@example.com',
        phone: '5551234567',
      }),
    )
    const leadInsert = insertedRows.find((r) => r.table === 'lead')
    expect((leadInsert!.values as { message: string }).message).toContain('unspecified')
  })

  it('records carrier as "unspecified" when carrier is the "Other / not listed" sentinel', async () => {
    await submitInsuranceVerifyRequest(
      form({
        orgId: 'org_1',
        email: 'jane@example.com',
        phone: '5551234567',
        carrier: '__other__',
      }),
    )
    const leadInsert = insertedRows.find((r) => r.table === 'lead')
    expect((leadInsert!.values as { message: string }).message).toContain('unspecified')
    // Critical: the synthetic '__other__' marker must NOT leak through to
    // the lead row's notes (front desk would see garbage). The sentinel
    // is a UI implementation detail; the persisted message is human copy.
    expect((leadInsert!.values as { message: string }).message).not.toContain('__other__')
  })

  it('falls back to a clear sentinel name on the lead row (form has no name field)', async () => {
    await submitInsuranceVerifyRequest(
      form({ orgId: 'org_1', email: 'jane@example.com', phone: '5551234567' }),
    )
    const leadInsert = insertedRows.find((r) => r.table === 'lead')
    expect(leadInsert!.values).toMatchObject({
      name: 'Insurance verification request',
    })
  })
})
