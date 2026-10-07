import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE INTAKE DOOR'S ONE BUTTON (docs/ACTIVATION.md S5, audit round 1).
 * Provisioning seeds the standard template untouched, so every clinic had
 * "1 form on file" and the door never offered the picker. Turning on now
 * rebuilds THAT seeded form in place from what they kept — its slug (the
 * link already on their site and in their confirmations) survives — and
 * only mints a new form when there is none; a form somebody edited is theirs
 * and is left alone. Then the switch flips. Members are refused.
 */

const state = { role: 'owner', templates: [] as Array<Record<string, unknown>>, created: [] as unknown[], updated: [] as Array<[string, Record<string, unknown>]>, enabled: [] as string[] }
vi.mock('next/navigation', () => ({ redirect: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth/context', () => ({ requireTenant: async () => ({ tenantType: 'clinic', role: state.role, organizationId: 'org_a' }) }))
vi.mock('@/lib/services/forms', () => ({
  FormTemplateInput: { parse: (x: unknown) => x },
  archiveFormTemplate: vi.fn(),
  createPacket: vi.fn(),
  deletePacket: vi.fn(),
  listFormTemplates: async () => state.templates,
  createFormTemplate: async (_org: string, input: unknown) => {
    state.created.push(input)
    return { id: 'new' }
  },
  updateFormTemplate: async (_org: string, id: string, input: Record<string, unknown>) => {
    state.updated.push([id, input])
    return { id }
  },
}))
vi.mock('@/lib/services/intake-summary', () => ({ summarizeSubmission: vi.fn() }))
vi.mock('@/lib/services/form-translate', () => ({ generateFormTranslation: vi.fn() }))
vi.mock('@/lib/services/feature-switches', () => ({ enableFeature: async (_org: string, key: string) => { state.enabled.push(key) } }))

import { turnOnIntakeFormsAction } from '@/app/(default)/intake-forms/actions'
import { DEFAULT_INTAKE_TEMPLATE } from '@/lib/types/forms'

const seed = (over: Record<string, unknown> = {}) => ({ id: 'seed', title: 'New Patient Intake', description: 'Standard', schema: DEFAULT_INTAKE_TEMPLATE, archivedAt: null, isDefault: 1, ...over })

beforeEach(() => {
  state.role = 'owner'
  state.templates = []
  state.created = []
  state.updated = []
  state.enabled = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('turnOnIntakeFormsAction', () => {
  it('rebuilds the untouched seeded form in place from the kept sections, keeps it default, and flips the switch', async () => {
    state.templates = [seed()]
    expect(await turnOnIntakeFormsAction({ sections: ['medical'] })).toEqual({ ok: true })
    expect(state.created).toEqual([])
    expect(state.updated).toHaveLength(1)
    const [id, input] = state.updated[0]
    expect(id).toBe('seed')
    expect((input.schema as { sections: Array<{ id: string }> }).sections.map((s) => s.id)).toEqual(['patient_info', 'medical'])
    expect(input.isDefault).toBe(true)
    expect(state.enabled).toEqual(['intake_forms'])
  })

  it('with no form at all it mints the first one from the kept sections', async () => {
    expect(await turnOnIntakeFormsAction({ sections: ['consent'] })).toEqual({ ok: true })
    expect(state.updated).toEqual([])
    expect(state.created).toHaveLength(1)
    expect(state.enabled).toEqual(['intake_forms'])
  })

  it('a form somebody edited is theirs: nothing is rebuilt or created, only the switch flips', async () => {
    const edited = { ...DEFAULT_INTAKE_TEMPLATE, sections: DEFAULT_INTAKE_TEMPLATE.sections.slice(0, 2) }
    state.templates = [seed({ id: 'theirs', schema: edited })]
    expect(await turnOnIntakeFormsAction({ sections: [] })).toEqual({ ok: true })
    expect(state.created).toEqual([])
    expect(state.updated).toEqual([])
    expect(state.enabled).toEqual(['intake_forms'])
  })

  it('a member is refused before anything is written', async () => {
    state.role = 'member'
    const r = await turnOnIntakeFormsAction({ sections: [] })
    expect(r.ok).toBe(false)
    expect(state.enabled).toEqual([])
  })
})
