import { describe, it, expect } from 'vitest'
import {
  coerceTagColor,
  isPatientTagColor,
  PATIENT_TAG_COLORS,
  TAG_CHIP_CLASSES,
  TAG_DOT_CLASSES,
} from '@/lib/types/patient-tags'

describe('patient-tag color helpers', () => {
  it('recognizes every palette color', () => {
    for (const c of PATIENT_TAG_COLORS) expect(isPatientTagColor(c)).toBe(true)
  })

  it('rejects non-palette values', () => {
    expect(isPatientTagColor('chartreuse')).toBe(false)
    expect(isPatientTagColor('')).toBe(false)
    expect(isPatientTagColor(null)).toBe(false)
    expect(isPatientTagColor(42)).toBe(false)
  })

  it('coerces an unknown color to gray, preserves a valid one', () => {
    expect(coerceTagColor('teal')).toBe('teal')
    expect(coerceTagColor('not-a-color')).toBe('gray')
    expect(coerceTagColor(undefined)).toBe('gray')
  })

  it('has a chip + dot class for every palette color (no missing tones)', () => {
    for (const c of PATIENT_TAG_COLORS) {
      expect(TAG_CHIP_CLASSES[c]).toBeTruthy()
      expect(TAG_DOT_CLASSES[c]).toBeTruthy()
    }
  })
})
