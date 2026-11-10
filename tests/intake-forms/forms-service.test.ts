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

// ML-50b: the primary card lives in patient_insurance; the write-back reads and writes it through the slot service.
const slot = vi.hoisted(() => ({
  primary: null as null | { provider: string | null; policyNumber: string | null; groupNumber: string | null },
  upserts: [] as Array<{ org: string; patient: string; rank: string; card: Record<string, unknown> }>,
  owned: true,
}))
vi.mock('@/lib/services/insurance-eligibility/plans', () => ({
  getPatientInsurance: async () => slot.primary,
  listPatientInsurance: async () => (slot.primary ? [{ rank: 'primary', ...slot.primary, detail: null }] : []),
  upsertPatientInsurance: async (org: string, patient: string, rank: string, card: Record<string, unknown>) => {
    if (!slot.owned) return false
    slot.upserts.push({ org, patient, rank, card })
    return true
  },
}))

// The on-submit pre-visit summary (ML-27) has its own suite; here it is inert.
vi.mock('@/lib/services/intake-summary', () => ({ summarizeSubmission: vi.fn(async () => ({ ok: false, reason: 'not_configured' })) }))

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

  it('does NOT link when the form names a different person on a shared email (family-safe)', async () => {
    state.selectQueue.push([{ id: 'pat_maria', firstName: 'Maria', lastName: 'Aguilera' }])
    await submitForm({
      organizationId: 'org_1',
      formTemplateId: 'tmpl_1',
      data: { x: 'y' },
      submitterName: 'John Aguilera',
      submitterEmail: 'family@example.com',
    })
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_submission')!
    expect((insert.values as { patientId: string | null }).patientId).toBeNull()
    expect(state.ops.filter((o) => o.kind === 'update' && o.table === 'patient')).toHaveLength(0)
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

  beforeEach(() => {
    slot.primary = null
    slot.upserts = []
    slot.owned = true
  })

  it('fills ONLY the empty fields of the primary slot and stamps the remembered card with source intake when the member id is new', async () => {
    slot.primary = { provider: 'Cigna', policyNumber: null, groupNumber: null }
    const wrote = await writeBackIntakeInsurance('org_1', 'pat_1', insuranceSchema, { f_carrier: 'Delta Dental', f_member: 'DD-9', f_group: 'G-1' } as never)
    expect(wrote).toBe(true)
    expect(slot.upserts).toHaveLength(1)
    const { org, patient, rank, card } = slot.upserts[0]
    expect([org, patient, rank]).toEqual(['org_1', 'pat_1', 'primary'])
    expect(card.provider).toBe('Cigna') // a form never overwrites what is on file
    expect(card.policyNumber).toBe('DD-9')
    expect(card.groupNumber).toBe('G-1')
    expect(card.detail).toMatchObject({ memberId: 'DD-9', payerName: 'Cigna', source: 'intake', relationship: 'self' })
  })

  it('writes nothing when every field is already filled, when the form carries no insurance answers, or when the patient is not this org’s', async () => {
    slot.primary = { provider: 'Cigna', policyNumber: 'C-1', groupNumber: 'G' }
    expect(await writeBackIntakeInsurance('org_1', 'pat_1', insuranceSchema, { f_carrier: 'Delta', f_member: 'DD-9' } as never)).toBe(false)
    expect(await writeBackIntakeInsurance('org_1', 'pat_1', insuranceSchema, { other: 'x' } as never)).toBe(false)
    slot.primary = null
    slot.owned = false
    expect(await writeBackIntakeInsurance('org_1', 'pat_foreign', insuranceSchema, { f_member: 'DD-9' } as never)).toBe(false)
    expect(slot.upserts).toHaveLength(0)
  })

  it('a group number alone fills the group field and stamps no remembered card (there is no member id to key it on)', async () => {
    slot.primary = { provider: null, policyNumber: 'C-1', groupNumber: null }
    await writeBackIntakeInsurance('org_1', 'pat_1', insuranceSchema, { f_group: 'G-2' } as never)
    const { card } = slot.upserts[0]
    expect(card.groupNumber).toBe('G-2')
    expect(card.detail).toBeUndefined()
  })
})

describe('the auto-send rule’s targeting + refresh window (ML-27)', () => {
  it('create persists the ticked visit types (deduped) and the window; none ticked → null, off → null', async () => {
    state.selectQueue.push([]) // slug free
    await createFormTemplate('org_1', {
      title: 'Sedation consent',
      schema: sampleSchema,
      appointmentTypeIds: ['sedation', 'sedation', 'extraction'],
      refreshMonths: 12,
    })
    const insert = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_template')!
    expect(insert.values).toMatchObject({ appointmentTypeIds: ['sedation', 'extraction'], refreshMonths: 12 })

    state.ops.length = 0
    state.selectQueue.push([])
    await createFormTemplate('org_1', { title: 'Plain intake', schema: sampleSchema, appointmentTypeIds: [], refreshMonths: null })
    const plain = state.ops.find((o) => o.kind === 'insert' && o.table === 'form_template')!
    expect(plain.values).toMatchObject({ appointmentTypeIds: null, refreshMonths: null })
  })

  it('update: an absent field leaves the rule alone; [] / null clear it', async () => {
    await updateFormTemplate('org_1', 'form_x', { title: 'Renamed', schema: sampleSchema })
    const untouched = state.ops.find((o) => o.kind === 'update' && o.table === 'form_template')!.set as Record<string, unknown>
    expect('appointmentTypeIds' in untouched).toBe(false)
    expect('refreshMonths' in untouched).toBe(false)

    state.ops.length = 0
    await updateFormTemplate('org_1', 'form_x', { title: 'Renamed', schema: sampleSchema, appointmentTypeIds: [], refreshMonths: null })
    const cleared = state.ops.find((o) => o.kind === 'update' && o.table === 'form_template')!.set as Record<string, unknown>
    expect(cleared.appointmentTypeIds).toBeNull()
    expect(cleared.refreshMonths).toBeNull()
  })

  it('refuses a window outside 1..60 months', async () => {
    await expect(
      updateFormTemplate('org_1', 'form_x', { title: 'x', schema: sampleSchema, refreshMonths: 0 }),
    ).rejects.toThrow()
    await expect(
      updateFormTemplate('org_1', 'form_x', { title: 'x', schema: sampleSchema, refreshMonths: 61 }),
    ).rejects.toThrow()
  })
})
