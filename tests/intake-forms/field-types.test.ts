import { describe, it, expect } from 'vitest'
import {
  sanitizeFileRefs,
  isFileRefArray,
  isDisplayOnlyField,
  isFieldVisible,
  firstMissingRequiredField,
  sanitizeSubmissionData,
  type FormTemplateSchema,
} from '@/lib/types/forms'

/**
 * Phase 1A new field types: the file-ref trust boundary, display-only +
 * conditional handling in required-validation, and the server-side submission
 * sanitizer (clamps file fields, drops display-only values).
 */

describe('sanitizeFileRefs', () => {
  it('keeps a well-formed ref + preserves a valid side', () => {
    const out = sanitizeFileRefs([
      { url: 'https://cdn/x.jpg', name: 'x.jpg', contentType: 'image/jpeg', side: 'front' },
    ])
    expect(out).toEqual([{ url: 'https://cdn/x.jpg', name: 'x.jpg', contentType: 'image/jpeg', side: 'front' }])
  })

  it('drops non-http urls + non-array input', () => {
    expect(sanitizeFileRefs(null)).toEqual([])
    expect(sanitizeFileRefs([{ url: 'javascript:alert(1)', name: 'x', contentType: 'image/png' }])).toEqual([])
    expect(sanitizeFileRefs([{ url: '/rel.png', name: 'x', contentType: 'image/png' }])).toEqual([])
  })

  it('ignores an invalid side value', () => {
    const out = sanitizeFileRefs([{ url: 'https://cdn/x.jpg', name: 'x', contentType: 'image/jpeg', side: 'middle' }])
    expect(out[0].side).toBeUndefined()
  })

  it('caps the count', () => {
    const many = Array.from({ length: 10 }).map((_, i) => ({ url: `https://cdn/${i}.jpg`, name: `${i}`, contentType: 'image/jpeg' }))
    expect(sanitizeFileRefs(many)).toHaveLength(6)
  })
})

describe('isFileRefArray', () => {
  it('distinguishes file refs from a choice string[]', () => {
    expect(isFileRefArray([{ url: 'https://cdn/x.jpg', name: 'x', contentType: 'image/jpeg' }])).toBe(true)
    expect(isFileRefArray(['Diabetes', 'Pregnant'])).toBe(false)
    expect(isFileRefArray([])).toBe(false)
    expect(isFileRefArray('x')).toBe(false)
  })
})

describe('isDisplayOnlyField', () => {
  it('is true only for content blocks', () => {
    expect(isDisplayOnlyField({ type: 'content' })).toBe(true)
    expect(isDisplayOnlyField({ type: 'text' })).toBe(false)
    expect(isDisplayOnlyField({ type: 'insurance_card' })).toBe(false)
  })
})

describe('isFieldVisible', () => {
  it('is visible with no condition', () => {
    expect(isFieldVisible(null, {})).toBe(true)
    expect(isFieldVisible(undefined, {})).toBe(true)
  })
  it('equals matches a string or a boolean (as string)', () => {
    expect(isFieldVisible({ fieldId: 'a', op: 'equals', value: 'yes' }, { a: 'yes' })).toBe(true)
    expect(isFieldVisible({ fieldId: 'a', op: 'equals', value: 'yes' }, { a: 'no' })).toBe(false)
    expect(isFieldVisible({ fieldId: 'a', op: 'equals', value: 'true' }, { a: true })).toBe(true)
  })
  it('includes matches a member of a multi-select', () => {
    expect(isFieldVisible({ fieldId: 'c', op: 'includes', value: 'Pregnant' }, { c: ['Diabetes', 'Pregnant'] })).toBe(true)
    expect(isFieldVisible({ fieldId: 'c', op: 'includes', value: 'Heart' }, { c: ['Diabetes'] })).toBe(false)
  })
  it('answered checks any non-empty value', () => {
    expect(isFieldVisible({ fieldId: 'a', op: 'answered' }, { a: 'x' })).toBe(true)
    expect(isFieldVisible({ fieldId: 'a', op: 'answered' }, { a: '' })).toBe(false)
    expect(isFieldVisible({ fieldId: 'a', op: 'answered' }, { a: false })).toBe(false)
    expect(isFieldVisible({ fieldId: 'a', op: 'answered' }, {})).toBe(false)
  })
})

const schema: FormTemplateSchema = {
  sections: [
    {
      id: 's1',
      title: 'S',
      fields: [
        { id: 'note', type: 'content', label: 'Notice', required: false, body: 'read this' },
        { id: 'name', type: 'text', label: 'Name', required: true },
        { id: 'card', type: 'insurance_card', label: 'Card', required: true },
        { id: 'has_allergy', type: 'yes_no', label: 'Allergies?', required: false },
        { id: 'allergy_detail', type: 'text', label: 'Which?', required: true, visibleWhen: { fieldId: 'has_allergy', op: 'equals', value: 'true' } },
      ],
    },
  ],
}

describe('firstMissingRequiredField (new types)', () => {
  it('ignores a content block even if it has no value', () => {
    const data = { name: 'Mia', card: [{ url: 'https://cdn/f.jpg', name: 'f', contentType: 'image/jpeg' }], has_allergy: false }
    expect(firstMissingRequiredField(schema, data)).toBeNull()
  })
  it('flags a required insurance_card with no files', () => {
    const data = { name: 'Mia', card: [], has_allergy: false }
    expect(firstMissingRequiredField(schema, data)).toBe('Card')
  })
  it('does not require a conditionally-hidden field', () => {
    const data = { name: 'Mia', card: [{ url: 'https://cdn/f.jpg', name: 'f', contentType: 'image/jpeg' }], has_allergy: false }
    expect(firstMissingRequiredField(schema, data)).toBeNull() // allergy_detail hidden
  })
  it('requires the conditional field once its trigger is met', () => {
    const data = { name: 'Mia', card: [{ url: 'https://cdn/f.jpg', name: 'f', contentType: 'image/jpeg' }], has_allergy: true }
    expect(firstMissingRequiredField(schema, data)).toBe('Which?')
  })
})

describe('sanitizeSubmissionData', () => {
  it('clamps file fields to clean refs + drops content values + passes text through', () => {
    const dirty = {
      note: 'should be dropped',
      name: 'Mia',
      card: [
        { url: 'https://cdn/f.jpg', name: 'f', contentType: 'image/jpeg', side: 'front' as const },
        { url: 'javascript:bad', name: 'evil', contentType: 'image/png' },
      ],
    }
    const out = sanitizeSubmissionData(schema, dirty)
    expect(out.note).toBeUndefined()
    expect(out.name).toBe('Mia')
    expect(out.card).toEqual([{ url: 'https://cdn/f.jpg', name: 'f', contentType: 'image/jpeg', side: 'front' }])
  })
})
