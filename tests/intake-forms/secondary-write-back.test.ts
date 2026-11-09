import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  cards: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<{ org: string; patient: string; rank: string; card: Record<string, unknown> }>,
}))

vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('@/lib/services/insurance-eligibility/plans', () => ({
  listPatientInsurance: async () => h.cards,
  upsertPatientInsurance: async (org: string, patient: string, rank: string, card: Record<string, unknown>) => {
    h.upserts.push({ org, patient, rank, card })
    return true
  },
}))

import { intakeSecondaryInsuranceAnswers, writeBackIntakeSecondaryInsurance } from '@/lib/services/forms'
import { SYSTEM_FIELD_KEYS, SYSTEM_KEY_LABELS, systemKeysFor } from '@/lib/types/forms'

const schema = {
  sections: [
    {
      id: 's',
      title: 'Insurance',
      fields: [
        { id: 'p_member', type: 'text', label: 'Member ID', systemKey: 'insurance_policy_number' },
        { id: 's_carrier', type: 'text', label: 'Second carrier', systemKey: 'insurance_secondary_provider' },
        { id: 's_member', type: 'text', label: 'Second member ID', systemKey: 'insurance_secondary_policy_number' },
        { id: 's_group', type: 'text', label: 'Second group', systemKey: 'insurance_secondary_group_number' },
      ],
    },
  ],
} as never

beforeEach(() => {
  h.cards = []
  h.upserts = []
})

describe('the secondary system keys', () => {
  it('are real, labelled, and offered to text fields', () => {
    for (const k of ['insurance_secondary_provider', 'insurance_secondary_policy_number', 'insurance_secondary_group_number'] as const) {
      expect(SYSTEM_FIELD_KEYS).toContain(k)
      expect(SYSTEM_KEY_LABELS[k]).toMatch(/Secondary/)
      expect(systemKeysFor('text')).toContain(k)
    }
  })
})

describe('writeBackIntakeSecondaryInsurance', () => {
  const data = { s_carrier: ' Cigna ', s_member: 'CG-200', s_group: 'G9', p_member: 'DD-100' } as never

  it('reads only the three secondary answers', () => {
    expect(intakeSecondaryInsuranceAnswers(schema, data)).toEqual({
      insurance_secondary_provider: 'Cigna',
      insurance_secondary_policy_number: 'CG-200',
      insurance_secondary_group_number: 'G9',
    })
  })

  it('fills an empty secondary slot — and never touches the primary', async () => {
    h.cards = [{ rank: 'primary', provider: 'Delta', policyNumber: 'DD-100', groupNumber: null, detail: null }]
    expect(await writeBackIntakeSecondaryInsurance('org_1', 'pat_1', schema, data)).toBe(true)
    expect(h.upserts).toHaveLength(1)
    expect(h.upserts[0]).toMatchObject({ org: 'org_1', patient: 'pat_1', rank: 'secondary', card: { provider: 'Cigna', policyNumber: 'CG-200', groupNumber: 'G9' } })
  })

  it('never overwrites a filled secondary field; a new member id is not accepted over an existing one', async () => {
    h.cards = [{ rank: 'secondary', provider: 'Aetna', policyNumber: 'AE-1', groupNumber: null, detail: null }]
    expect(await writeBackIntakeSecondaryInsurance('org_1', 'pat_1', schema, data)).toBe(true)
    expect(h.upserts[0].card).toMatchObject({ provider: 'Aetna', policyNumber: 'AE-1', groupNumber: 'G9' })
    expect(h.upserts[0].card.detail).toBeUndefined()
  })

  it('does nothing when nothing would change, when the form carries no secondary keys, or when it is the primary typed twice', async () => {
    h.cards = [{ rank: 'secondary', provider: 'Cigna', policyNumber: 'CG-200', groupNumber: 'G9', detail: null }]
    expect(await writeBackIntakeSecondaryInsurance('org_1', 'pat_1', schema, data)).toBe(false)
    expect(await writeBackIntakeSecondaryInsurance('org_1', 'pat_1', schema, { p_member: 'x' } as never)).toBe(false)
    h.cards = [{ rank: 'primary', provider: 'Delta', policyNumber: 'cg-200', groupNumber: null, detail: null }]
    expect(await writeBackIntakeSecondaryInsurance('org_1', 'pat_1', schema, data)).toBe(false)
    expect(h.upserts).toHaveLength(0)
  })
})
