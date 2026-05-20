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
    return 'unknown'
  }
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
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
