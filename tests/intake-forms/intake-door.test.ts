import { describe, it, expect } from 'vitest'
import { DEFAULT_INTAKE_TEMPLATE, INTAKE_REQUIRED_SECTION, intakeSectionChoices, isUntouchedSeedTemplate, pickIntakeSections } from '@/lib/types/forms'

/**
 * The intake door's "what to collect" (docs/ACTIVATION.md S5): the
 * standard template's sections as choices with the basics locked on, and
 * the schema the clinic turns on with — kept sections in template order,
 * `patient_info` always, unknown ids ignored.
 */
describe('intakeSectionChoices + pickIntakeSections', () => {
  it('lists every section with its question count; only the basics are required', () => {
    const choices = intakeSectionChoices()
    expect(choices.map((c) => c.id)).toEqual(DEFAULT_INTAKE_TEMPLATE.sections.map((s) => s.id))
    expect(choices.filter((c) => c.required).map((c) => c.id)).toEqual([INTAKE_REQUIRED_SECTION])
    for (const c of choices) expect(c.fieldCount).toBeGreaterThan(0)
  })

  it('keeps the chosen sections in template order and always the basics', () => {
    const picked = pickIntakeSections(['consent', 'medical'])
    expect(picked.sections.map((s) => s.id)).toEqual(['patient_info', 'medical', 'consent'])
    expect(pickIntakeSections([]).sections.map((s) => s.id)).toEqual(['patient_info'])
    expect(pickIntakeSections(['nonsense', 'dental']).sections.map((s) => s.id)).toEqual(['patient_info', 'dental'])
  })

  it('never mutates the template', () => {
    const before = JSON.stringify(DEFAULT_INTAKE_TEMPLATE)
    pickIntakeSections(['insurance'])
    expect(JSON.stringify(DEFAULT_INTAKE_TEMPLATE)).toBe(before)
  })
})

/**
 * Provisioning seeds the standard template byte-for-byte (audit round 1:
 * every provisioned clinic had "1 form on file" and never met the picker).
 * Until somebody edits it, it is not THEIR form.
 */
describe('isUntouchedSeedTemplate', () => {
  it('recognises the seeded standard template, whatever key order the jsonb round-trip left', () => {
    expect(isUntouchedSeedTemplate({ schema: DEFAULT_INTAKE_TEMPLATE })).toBe(true)
    const shuffled = JSON.parse(JSON.stringify(DEFAULT_INTAKE_TEMPLATE, Object.keys(DEFAULT_INTAKE_TEMPLATE).sort().reverse()))
    expect(isUntouchedSeedTemplate({ schema: { ...shuffled, sections: DEFAULT_INTAKE_TEMPLATE.sections } })).toBe(true)
  })
  it('an edited form, a picked-down form, or an archived seed is not the untouched seed', () => {
    expect(isUntouchedSeedTemplate({ schema: pickIntakeSections(['medical']) })).toBe(false)
    const edited = { ...DEFAULT_INTAKE_TEMPLATE, sections: DEFAULT_INTAKE_TEMPLATE.sections.map((s, i) => (i === 0 ? { ...s, title: 'About the patient' } : s)) }
    expect(isUntouchedSeedTemplate({ schema: edited })).toBe(false)
    expect(isUntouchedSeedTemplate({ schema: DEFAULT_INTAKE_TEMPLATE, archivedAt: new Date() })).toBe(false)
    expect(isUntouchedSeedTemplate({ schema: null })).toBe(false)
  })
})
