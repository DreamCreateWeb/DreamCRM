import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { selectQueue: unknown[][]; updates: unknown[] } = { selectQueue: [], updates: [] }

vi.mock('@/lib/db', async () => {
  const chain = () => {
    const o: any = {}
    o.from = () => o
    o.where = () => o
    o.limit = async () => state.selectQueue.shift() ?? []
    return o
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: (set: unknown) => ({
          where: () => {
            state.updates.push(set)
            const r: any = { returning: async () => state.selectQueue.shift() ?? [] }
            r.then = (resolve: (v: unknown) => void) => resolve(undefined)
            return r
          },
        }),
      }),
    },
  }
})

import { attachSubmissionToPatient, writeBackIntakeAnswers } from '@/lib/services/forms'

const schema = {
  sections: [
    {
      id: 's',
      title: 'S',
      fields: [
        { id: 'dob', type: 'date', label: 'DOB', required: false, systemKey: 'date_of_birth' },
        { id: 'ph', type: 'tel', label: 'Phone', required: false, systemKey: 'phone' },
        { id: 'fn', type: 'text', label: 'First', required: false, systemKey: 'first_name' },
      ],
    },
  ],
} as never

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
})

describe('attachSubmissionToPatient', () => {
  it('refuses a patient that is not this org’s', async () => {
    state.selectQueue.push([])
    expect(await attachSubmissionToPatient('org_1', 'sub_1', 'pat_x')).toBe(false)
    expect(state.updates).toHaveLength(0)
  })
  it('does nothing when the submission is already linked (NULL only)', async () => {
    state.selectQueue.push([{ id: 'pat_1' }], [])
    expect(await attachSubmissionToPatient('org_1', 'sub_1', 'pat_1')).toBe(false)
  })
})

describe('writeBackIntakeAnswers', () => {
  it('fills empty columns only and never names', async () => {
    state.selectQueue.push([
      { dateOfBirth: null, email: null, phone: '+15551230000', addressLine1: null, city: null, state: null, postalCode: null },
    ])
    const filled = await writeBackIntakeAnswers('org_1', 'pat_1', schema, { dob: '1990-02-03', ph: '(555) 999-8888', fn: 'Zed' } as never)
    expect(filled).toEqual(['date of birth'])
    const set = state.updates[0] as Record<string, unknown>
    expect(set.dateOfBirth).toBe('1990-02-03')
    expect(set.phone).toBeUndefined()
    expect(set.firstName).toBeUndefined()
  })
})
