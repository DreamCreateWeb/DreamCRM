import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * OFF UNTIL CHOSEN, for intake (docs/ACTIVATION.md law 1; audit rounds 2–3).
 * `patientFacingIntakeOpen` is the ONE question every patient-facing intake
 * surface asks; the two wrappers return nothing while the door is closed;
 * `splitIntakeFormsForDoor` is the ONE rule the intro and the turn-on
 * action share — an untouched seed patients already answered is THEIRS.
 */
const switches = { intake_forms: true }
vi.mock('@/lib/services/feature-switches', () => ({ getFeatureSwitchState: async () => ({ ...switches }) }))

const state = { templates: [] as Array<Record<string, unknown>>, counts: {} as Record<string, number>, lastCountedId: null as string | null }
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    let table: unknown = null
    let counting = false
    obj.from = (t: unknown) => {
      table = t
      return obj
    }
    for (const m of ['where', 'orderBy', 'innerJoin', 'leftJoin']) obj[m] = () => obj
    obj.limit = async () => rows()
    const rows = () => {
      if (table === schema.formTemplate) return state.templates
      if (table === schema.formSubmission) return [{ count: counting ? 0 : 0 }]
      return []
    }
    obj.then = (resolve: (v: unknown) => void) => resolve(rows())
    return obj
  }
  // The submissions count reads `count(*)` per template; keyed by the template id we recorded last.
  const select = (sel?: Record<string, unknown>) => {
    const c = chain()
    if (sel && 'count' in sel) {
      c.then = (resolve: (v: unknown) => void) => resolve([{ count: state.counts[state.lastCountedId ?? ''] ?? 0 }])
    }
    return c
  }
  return { schema, db: { select } }
})
vi.mock('drizzle-orm', async (orig) => {
  const real = await orig<typeof import('drizzle-orm')>()
  return {
    ...real,
    // Capture which template the count is for (the `eq(formTemplateId, id)` arm) — crude but enough for the split's rule.
    eq: (col: unknown, v: unknown) => {
      if (typeof v === 'string' && v.startsWith('tpl_')) state.lastCountedId = v
      return real.eq(col as never, v as never)
    },
  }
})

import { getPatientFacingDefaultForm, getPatientFacingFormBySlug, patientFacingIntakeOpen, splitIntakeFormsForDoor } from '@/lib/services/forms'
import { DEFAULT_INTAKE_TEMPLATE } from '@/lib/types/forms'

const tpl = (id: string, over: Record<string, unknown> = {}) => ({ id, title: 't', slug: id, isDefault: 1, archivedAt: null, schema: DEFAULT_INTAKE_TEMPLATE, updatedAt: new Date('2026-01-01'), ...over })

beforeEach(() => {
  switches.intake_forms = true
  state.templates = []
  state.counts = {}
})

describe('patientFacingIntakeOpen + the wrappers', () => {
  it('a closed door answers nothing — no default form, no form by slug', async () => {
    state.templates = [tpl('tpl_seed')]
    switches.intake_forms = false
    expect(await patientFacingIntakeOpen('org_1')).toBe(false)
    expect(await getPatientFacingDefaultForm('org_1')).toBeNull()
    expect(await getPatientFacingFormBySlug('org_1', 'tpl_seed')).toBeNull()
    switches.intake_forms = true
    expect((await getPatientFacingDefaultForm('org_1'))?.id).toBe('tpl_seed')
    expect((await getPatientFacingFormBySlug('org_1', 'tpl_seed'))?.id).toBe('tpl_seed')
  })
})

describe('splitIntakeFormsForDoor', () => {
  it('the unanswered untouched seed is the picker’s; an answered seed and an edited form are theirs; archived forms are neither', async () => {
    const edited = { ...DEFAULT_INTAKE_TEMPLATE, sections: DEFAULT_INTAKE_TEMPLATE.sections.slice(0, 2) }
    state.templates = [tpl('tpl_seed'), tpl('tpl_answered'), tpl('tpl_edited', { schema: edited }), tpl('tpl_gone', { archivedAt: new Date() })]
    state.counts = { tpl_answered: 2 }
    const { own, seeded } = await splitIntakeFormsForDoor('org_1')
    expect(seeded.map((t) => t.id)).toEqual(['tpl_seed'])
    expect(own.map((t) => t.id).sort()).toEqual(['tpl_answered', 'tpl_edited'])
  })
})
