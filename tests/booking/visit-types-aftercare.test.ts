import { describe, it, expect } from 'vitest'
import {
  CHECK_IN_AFTER_BY_DEFAULT,
  DEFAULT_AFTERCARE_BY_ID,
  DEFAULT_VISIT_TYPES,
  resolveVisitTypes,
  visitTypeAftercare,
  visitTypeChecksInAfter,
} from '@/lib/types/visit-types'

/**
 * AFTERCARE + THE DAY-AFTER CHECK-IN on the visit-type catalog (ML-28).
 * The two fields ride the `visit_types` jsonb — no column, no migration —
 * so the resolver is the whole contract:
 *  - the standard defaults: aftercare for the types that have one, the
 *    check-in for the procedures that earn one, nothing for the rest;
 *  - an ABSENT key (settings stored before the field existed) gets the
 *    default for its id; a stored '' / false is the practice's own choice
 *    and wins — blank is the switch;
 *  - defaults are keyed by id, so a clinic-added "Crown" picks its up;
 *  - the two readers the lanes use.
 */

describe('the standard defaults', () => {
  it('cleaning, filling, extraction and root canal carry aftercare; checkup, consultation, emergency and other do not', () => {
    const byId = new Map(DEFAULT_VISIT_TYPES.map((t) => [t.id, t]))
    for (const id of ['cleaning', 'filling', 'extraction', 'root_canal']) {
      expect(byId.get(id)?.aftercareInstructions, id).toBe(DEFAULT_AFTERCARE_BY_ID[id])
      expect(byId.get(id)?.aftercareInstructions?.length, id).toBeGreaterThan(40)
    }
    for (const id of ['checkup', 'consultation', 'emergency', 'other']) {
      expect(byId.get(id)?.aftercareInstructions, id).toBe('')
    }
  })

  it('extraction and root canal check in the day after; nothing else does by default', () => {
    for (const t of DEFAULT_VISIT_TYPES) {
      expect(t.checkInAfter, t.id).toBe(t.id === 'extraction' || t.id === 'root_canal')
    }
    expect(Array.from(CHECK_IN_AFTER_BY_DEFAULT).sort()).toEqual(['extraction', 'implant', 'root_canal'])
  })

  it('the defaults are honest, generic dental aftercare — no prices, no texting, no promises', () => {
    for (const [id, text] of Object.entries(DEFAULT_AFTERCARE_BY_ID)) {
      expect(text, id).not.toMatch(/\$|\bprice|\bfree\b/i)
      expect(text, id).not.toMatch(/\btext(s|ing)?\b/i)
      expect(text, id).not.toMatch(/guarantee|promise/i)
      expect(text.length, id).toBeLessThanOrEqual(800)
    }
  })
})

describe('resolveVisitTypes — absent vs stored', () => {
  it('an older blob with no aftercare / check-in keys gets the defaults for its ids', () => {
    const got = resolveVisitTypes([
      { id: 'cleaning', label: 'Cleaning', durationMinutes: 30 },
      { id: 'extraction', label: 'Extraction', durationMinutes: 45 },
      { id: 'checkup', label: 'Checkup', durationMinutes: 30 },
    ])
    const byId = new Map(got.map((t) => [t.id, t]))
    expect(byId.get('cleaning')?.aftercareInstructions).toBe(DEFAULT_AFTERCARE_BY_ID.cleaning)
    expect(byId.get('cleaning')?.checkInAfter).toBe(false)
    expect(byId.get('extraction')?.aftercareInstructions).toBe(DEFAULT_AFTERCARE_BY_ID.extraction)
    expect(byId.get('extraction')?.checkInAfter).toBe(true)
    expect(byId.get('checkup')?.aftercareInstructions).toBe('')
    expect(byId.get('checkup')?.checkInAfter).toBe(false)
  })

  it('a stored blank and a stored false are the practice’s own choice — they win over the default', () => {
    const got = resolveVisitTypes([
      { id: 'cleaning', label: 'Cleaning', durationMinutes: 30, aftercareInstructions: '' },
      { id: 'extraction', label: 'Extraction', durationMinutes: 45, aftercareInstructions: '  Our words.  ', checkInAfter: false },
    ])
    const byId = new Map(got.map((t) => [t.id, t]))
    expect(byId.get('cleaning')?.aftercareInstructions).toBe('')
    expect(byId.get('extraction')?.aftercareInstructions).toBe('Our words.')
    expect(byId.get('extraction')?.checkInAfter).toBe(false)
  })

  it('a clinic-added Crown / Whitening / Implant type picks up its default by id (slugged from the label)', () => {
    const got = resolveVisitTypes([
      { label: 'Crown', durationMinutes: 60 },
      { label: 'Whitening', durationMinutes: 60 },
      { label: 'Implant', durationMinutes: 90 },
      { label: 'Night guard fitting', durationMinutes: 30 },
    ])
    const byId = new Map(got.map((t) => [t.id, t]))
    expect(byId.get('crown')?.aftercareInstructions).toBe(DEFAULT_AFTERCARE_BY_ID.crown)
    expect(byId.get('whitening')?.aftercareInstructions).toBe(DEFAULT_AFTERCARE_BY_ID.whitening)
    expect(byId.get('implant')?.aftercareInstructions).toBe(DEFAULT_AFTERCARE_BY_ID.implant)
    expect(byId.get('implant')?.checkInAfter).toBe(true)
    expect(byId.get('crown')?.checkInAfter).toBe(false)
    expect(byId.get('night_guard_fitting')?.aftercareInstructions).toBe('')
    expect(byId.get('night_guard_fitting')?.checkInAfter).toBe(false)
  })

  it('caps aftercare at 800 characters and refuses a non-string', () => {
    const got = resolveVisitTypes([
      { id: 'cleaning', label: 'Cleaning', durationMinutes: 30, aftercareInstructions: 'x'.repeat(1000) },
      { id: 'filling', label: 'Filling', durationMinutes: 30, aftercareInstructions: 42 },
    ])
    const byId = new Map(got.map((t) => [t.id, t]))
    expect(byId.get('cleaning')?.aftercareInstructions).toHaveLength(800)
    expect(byId.get('filling')?.aftercareInstructions).toBe('')
  })
})

describe('the readers', () => {
  it('visitTypeAftercare / visitTypeChecksInAfter read the resolved catalog; unknown ids are empty / false', () => {
    expect(visitTypeAftercare(null, 'cleaning')).toBe(DEFAULT_AFTERCARE_BY_ID.cleaning)
    expect(visitTypeAftercare(null, 'checkup')).toBe('')
    expect(visitTypeAftercare(null, 'mystery')).toBe('')
    expect(visitTypeAftercare(null, null)).toBe('')
    expect(visitTypeChecksInAfter(null, 'extraction')).toBe(true)
    expect(visitTypeChecksInAfter(null, 'cleaning')).toBe(false)
    expect(visitTypeChecksInAfter(null, 'mystery')).toBe(false)
    const stored = [{ id: 'extraction', label: 'Extraction', durationMinutes: 45, checkInAfter: false, aftercareInstructions: 'Ours.' }]
    expect(visitTypeChecksInAfter(stored, 'extraction')).toBe(false)
    expect(visitTypeAftercare(stored, 'extraction')).toBe('Ours.')
  })
})
