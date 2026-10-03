import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Op {
  kind: 'insert' | 'update'
  table: string
  values?: unknown
  set?: unknown
}

const state: {
  selectQueue: unknown[][]
  ops: Op[]
} = { selectQueue: [], ops: [] }

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema/clinic')
  const tableName = (t: unknown) => {
    if (t === schema.formTemplate) return 'form_template'
    if (t === schema.formSubmission) return 'form_submission'
    if (t === schema.patient) return 'patient'
    return 'unknown'
  }
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.groupBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: (vals: unknown) => ({
          returning: async () => {
            state.ops.push({ kind: 'insert', table: tableName(t), values: vals })
            const row = Array.isArray(vals) ? vals[0] : vals
            return [{ id: 'newrow', ...(row as object) }]
          },
          then: (resolve: (v: unknown) => void) => {
            state.ops.push({ kind: 'insert', table: tableName(t), values: vals })
            resolve(undefined)
          },
        }),
      }),
      update: (t: unknown) => ({
        set: (set: unknown) => ({
          where: () => {
            const tn = tableName(t)
            return {
              returning: async () => {
                state.ops.push({ kind: 'update', table: tn, set })
                return [{ id: 'updated', ...(set as object) }]
              },
              then: (resolve: (v: unknown) => void) => {
                state.ops.push({ kind: 'update', table: tn, set })
                resolve(undefined)
              },
            }
          },
        }),
      }),
    },
  }
})

import {
  createFormTemplate,
  updateFormTemplate,
  archiveFormTemplate,
  submitForm,
  seedDefaultIntakeForm,
  getFormTemplateBySlug,
  getDefaultFormTemplate,
  getSubmissionStatsForTemplates,
  intakeInsuranceAnswers,
  writeBackIntakeInsurance,
} from '@/lib/services/forms'

beforeEach(() => {
  state.selectQueue.length = 0
  state.ops.length = 0
})

const sampleSchema = {
  sections: [
    {
      id: 'sec1',
      title: 'Patient info',
      fields: [
        { id: 'first_name', type: 'text', label: 'First name', required: true },
      ],
    },
  ],
}

describe('createFormTemplate', () => {
  it('writes a template with a unique slug derived from the title', async () => {
    state.selectQueue.push([]) // uniqueSlug lookup — no collision
    await createFormTemplate('org_1', {
      title: 'New Patient Intake',
      description: 'Standard form',
      schema: sampleSchema,
    })
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_template')!
    expect(insert).toBeDefined()
    const vals = insert.values as { slug: string; organizationId: string; title: string }
    expect(vals.slug).toBe('new-patient-intake')
    expect(vals.organizationId).toBe('org_1')
    expect(vals.title).toBe('New Patient Intake')
  })

  it('appends -2 to slug when one already exists', async () => {
    state.selectQueue.push([{ id: 'existing' }]) // first slug taken
    state.selectQueue.push([]) // -2 free
    await createFormTemplate('org_1', { title: 'New Patient Intake', schema: sampleSchema })
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_template')!
    const vals = insert.values as { slug: string }
    expect(vals.slug).toBe('new-patient-intake-2')
  })

  it('clears the default flag on other templates when this one is marked default', async () => {
    state.selectQueue.push([]) // slug free
    await createFormTemplate('org_1', {
      title: 'X',
      schema: sampleSchema,
      isDefault: true,
    })
    const clearDefault = state.ops.find((o) => o.kind === 'update' && o.table === 'form_template')
    expect(clearDefault).toBeDefined()
    expect((clearDefault!.set as { isDefault: number }).isDefault).toBe(0)
  })

  it('rejects malformed input', async () => {
    await expect(
      createFormTemplate('org_1', { title: '', schema: sampleSchema } as never),
    ).rejects.toThrow()
  })
})

describe('updateFormTemplate', () => {
  it('updates title + schema + updatedAt', async () => {
    await updateFormTemplate('org_1', 'form_x', {
      title: 'Renamed',
      schema: sampleSchema,
    })
    const upd = state.ops.find((o) => o.kind === 'update' && o.table === 'form_template')
    expect(upd).toBeDefined()
    const set = upd!.set as { title: string; updatedAt: Date }
    expect(set.title).toBe('Renamed')
    expect(set.updatedAt).toBeInstanceOf(Date)
  })

  it('clears other defaults when setting isDefault=true', async () => {
    await updateFormTemplate('org_1', 'form_x', {
      title: 'Renamed',
      schema: sampleSchema,
      isDefault: true,
    })
    const updates = state.ops.filter((o) => o.kind === 'update' && o.table === 'form_template')
    // One UPDATE to clear other defaults, one UPDATE for the target row.
    expect(updates.length).toBeGreaterThanOrEqual(2)
  })
})

describe('archiveFormTemplate', () => {
  it('sets archivedAt to now and clears the default flag', async () => {
    await archiveFormTemplate('org_1', 'form_x')
    const upd = state.ops.find((o) => o.kind === 'update' && o.table === 'form_template')
    expect(upd).toBeDefined()
    const set = upd!.set as { archivedAt: Date; isDefault: number }
    expect(set.archivedAt).toBeInstanceOf(Date)
    expect(set.isDefault).toBe(0)
  })
})

describe('submitForm', () => {
  it('inserts a submission with the supplied data + org', async () => {
    await submitForm({
      organizationId: 'org_1',
      formTemplateId: 'tmpl_1',
      data: { first_name: 'Jane', signature: 'Jane Doe' },
      submitterName: 'Jane Doe',
      submitterEmail: 'jane@example.com',
      submitterPhone: '555-1234',
    })
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_submission')!
    const vals = insert.values as {
      organizationId: string
      formTemplateId: string
      data: Record<string, unknown>
      submitterName: string
    }
    expect(vals.organizationId).toBe('org_1')
    expect(vals.formTemplateId).toBe('tmpl_1')
    expect(vals.data.first_name).toBe('Jane')
    expect(vals.submitterName).toBe('Jane Doe')
  })

  it('tolerates missing optional submitter fields', async () => {
    await submitForm({
      organizationId: 'org_1',
      formTemplateId: 'tmpl_1',
      data: { x: 'y' },
    })
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_submission')!
    const vals = insert.values as {
      submitterName: string | null
      submitterEmail: string | null
    }
    expect(vals.submitterName).toBeNull()
    expect(vals.submitterEmail).toBeNull()
  })

  it('auto-links a public submission to a patient when the submitter email matches', async () => {
    state.selectQueue.push([{ id: 'pat_match' }]) // patient lookup by email
    await submitForm({
      organizationId: 'org_1',
      formTemplateId: 'tmpl_1',
      data: { x: 'y' },
      submitterEmail: 'jane@example.com',
    })
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_submission')!
    expect((insert.values as { patientId: string | null }).patientId).toBe('pat_match')
  })

  it('leaves patientId null when no patient matches the submitter email', async () => {
    state.selectQueue.push([]) // no patient match
    await submitForm({
      organizationId: 'org_1',
      formTemplateId: 'tmpl_1',
      data: { x: 'y' },
      submitterEmail: 'nobody@example.com',
    })
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_submission')!
    expect((insert.values as { patientId: string | null }).patientId).toBeNull()
  })

  it('does NOT override an explicitly-supplied patientId with an email lookup', async () => {
    await submitForm({
      organizationId: 'org_1',
      formTemplateId: 'tmpl_1',
      patientId: 'pat_explicit',
      data: { x: 'y' },
      submitterEmail: 'jane@example.com',
    })
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_submission')!
    expect((insert.values as { patientId: string | null }).patientId).toBe('pat_explicit')
  })
})

describe('getFormTemplateBySlug', () => {
  it('returns the matching template', async () => {
    state.selectQueue.push([{ id: 'tmpl_1', slug: 'new-patient-intake', title: 'X' }])
    const out = await getFormTemplateBySlug('org_1', 'new-patient-intake')
    expect(out?.id).toBe('tmpl_1')
  })

  it('returns null when no match', async () => {
    state.selectQueue.push([])
    const out = await getFormTemplateBySlug('org_1', 'missing')
    expect(out).toBeNull()
  })
})

describe('getDefaultFormTemplate', () => {
  it('returns the default-flagged form for the org', async () => {
    state.selectQueue.push([{ id: 'tmpl_default', isDefault: 1 }])
    const out = await getDefaultFormTemplate('org_1')
    expect(out?.id).toBe('tmpl_default')
  })

  it('returns null when no default is set', async () => {
    state.selectQueue.push([])
    const out = await getDefaultFormTemplate('org_1')
    expect(out).toBeNull()
  })
})

describe('getSubmissionStatsForTemplates', () => {
  it('rolls up count + last submission date per template', async () => {
    // Dates, because that is what the query hands back: the aggregate is
    // drizzle's `max(column)`, which carries `submitted_at`'s driver mapper,
    // so the raw `2026-06-01 09:00:00` text is decoded as UTC before it
    // reaches this code. This mock sits ABOVE that layer.
    //
    // The previous version pushed a string here and asserted it was "coerced
    // to a Date too" — the service did that with `new Date(r.lastSubmittedAt)`,
    // which parsed the driver's zone-less text in the HOST's zone. On a UTC
    // runner that read the same as the mapper, so the case looked like
    // tolerance and was really the bug. `tests/guards/timestamp-aggregate-
    // mapping.test.ts` pins the mapper at the decoder, where a mock can't
    // reach.
    state.selectQueue.push([
      { formTemplateId: 'tmpl_a', count: 3, lastSubmittedAt: new Date('2026-06-18T10:00:00Z') },
      { formTemplateId: 'tmpl_b', count: 1, lastSubmittedAt: new Date('2026-06-01T09:00:00Z') },
    ])
    const map = await getSubmissionStatsForTemplates('org_1')
    expect(map.get('tmpl_a')?.count).toBe(3)
    expect(map.get('tmpl_a')?.lastSubmittedAt).toBeInstanceOf(Date)
    expect(map.get('tmpl_b')?.count).toBe(1)
    expect(map.get('tmpl_b')?.lastSubmittedAt).toBeInstanceOf(Date)
    expect(map.get('tmpl_b')?.lastSubmittedAt?.toISOString()).toBe('2026-06-01T09:00:00.000Z')
  })

  it('coerces a bigint-string count and tolerates a null last date', async () => {
    state.selectQueue.push([{ formTemplateId: 'tmpl_a', count: '5', lastSubmittedAt: null }])
    const map = await getSubmissionStatsForTemplates('org_1')
    expect(map.get('tmpl_a')?.count).toBe(5)
    expect(map.get('tmpl_a')?.lastSubmittedAt).toBeNull()
  })

  it('returns an empty map when the org has no submissions', async () => {
    state.selectQueue.push([])
    const map = await getSubmissionStatsForTemplates('org_1')
    expect(map.size).toBe(0)
  })
})

describe('seedDefaultIntakeForm', () => {
  it('inserts the standard template when none exists for that slug', async () => {
    state.selectQueue.push([]) // no existing form
    await seedDefaultIntakeForm('org_1')
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_template')
    expect(insert).toBeDefined()
    const vals = insert!.values as { isDefault: number; slug: string }
    expect(vals.isDefault).toBe(1)
    expect(vals.slug).toBe('new-patient-intake')
  })

  it('is a no-op when a form with that slug already exists (idempotent)', async () => {
    state.selectQueue.push([{ id: 'existing' }])
    await seedDefaultIntakeForm('org_1')
    expect(
      state.ops.find((o) => o.kind === 'insert' && o.table === 'form_template'),
    ).toBeUndefined()
  })
})

describe('the intake insurance write-back (polish phase 5)', () => {
  const insuranceSchema = {
    sections: [
      {
        id: 's',
        title: 'Insurance',
        fields: [
          { id: 'f_carrier', type: 'text', label: 'Carrier', required: false, systemKey: 'insurance_provider' },
          { id: 'f_member', type: 'text', label: 'Member ID', required: false, systemKey: 'insurance_policy_number' },
          { id: 'f_group', type: 'text', label: 'Group', required: false, systemKey: 'insurance_group_number' },
          { id: 'f_card', type: 'insurance_card', label: 'Card photos', required: false },
        ],
      },
    ],
  } as never

  it('reads the three answers by system key — the patient’s CONFIRMED text, never the card photos', () => {
    const answers = intakeInsuranceAnswers(insuranceSchema, { f_carrier: ' Delta Dental ', f_member: 'DD-9', f_group: '', f_card: [{ url: 'x', name: 'x', contentType: 'image/jpeg' }] } as never)
    expect(answers).toEqual({ insurance_provider: 'Delta Dental', insurance_policy_number: 'DD-9' })
  })

  it('fills ONLY the empty columns and stamps the remembered card with source intake when the member id is new', async () => {
    state.selectQueue.push([{ insuranceProvider: 'Cigna', insurancePolicyNumber: null, insuranceGroupNumber: null }])
    const wrote = await writeBackIntakeInsurance('org_1', 'pat_1', insuranceSchema, { f_carrier: 'Delta Dental', f_member: 'DD-9', f_group: 'G-1' } as never)
    expect(wrote).toBe(true)
    const up = state.ops.find((o) => o.kind === 'update' && o.table === 'patient')!
    const set = up.set as Record<string, unknown>
    expect(set.insuranceProvider).toBeUndefined() // Cigna stays — a form never overwrites what is on file
    expect(set.insurancePolicyNumber).toBe('DD-9')
    expect(set.insuranceGroupNumber).toBe('G-1')
    expect(set.insuranceDetail).toMatchObject({ memberId: 'DD-9', payerName: 'Cigna', source: 'intake', relationship: 'self' })
  })

  it('writes nothing when every column is already filled, when the form carries no insurance answers, or when the patient is not this org’s', async () => {
    state.selectQueue.push([{ insuranceProvider: 'Cigna', insurancePolicyNumber: 'C-1', insuranceGroupNumber: 'G' }])
    expect(await writeBackIntakeInsurance('org_1', 'pat_1', insuranceSchema, { f_carrier: 'Delta', f_member: 'DD-9' } as never)).toBe(false)
    expect(await writeBackIntakeInsurance('org_1', 'pat_1', insuranceSchema, { other: 'x' } as never)).toBe(false)
    state.selectQueue.push([])
    expect(await writeBackIntakeInsurance('org_1', 'pat_foreign', insuranceSchema, { f_member: 'DD-9' } as never)).toBe(false)
    expect(state.ops.filter((o) => o.kind === 'update' && o.table === 'patient')).toHaveLength(0)
  })

  it('a group number alone fills the group column and stamps no remembered card (there is no member id to key it on)', async () => {
    state.selectQueue.push([{ insuranceProvider: null, insurancePolicyNumber: 'C-1', insuranceGroupNumber: null }])
    await writeBackIntakeInsurance('org_1', 'pat_1', insuranceSchema, { f_group: 'G-2' } as never)
    const set = state.ops.find((o) => o.kind === 'update' && o.table === 'patient')!.set as Record<string, unknown>
    expect(set.insuranceGroupNumber).toBe('G-2')
    expect(set.insuranceDetail).toBeUndefined()
  })
})
