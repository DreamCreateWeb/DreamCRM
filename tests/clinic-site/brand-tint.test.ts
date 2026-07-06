import { describe, it, expect } from 'vitest'
import { brandTint } from '@/lib/brand-tint'

describe('brandTint', () => {
  it('appends the right hex alpha for the common steps', () => {
    expect(brandTint('#9CAF9F', 0.12)).toBe('#9CAF9F1F')
    expect(brandTint('#2F6D62', 0.15)).toBe('#2F6D6226')
    expect(brandTint('#2F6D62', 0.25)).toBe('#2F6D6240')
  })

  it('clamps alpha to 0..1', () => {
    expect(brandTint('#2F6D62', 2)).toBe('#2F6D62FF')
    expect(brandTint('#2F6D62', -1)).toBe('#2F6D6200')
  })

  it('degrades safely on non-6-digit input (never corrupts the color)', () => {
    expect(brandTint('#9CF', 0.12)).toBe('#9CF')
    expect(brandTint('var(--c-brand)', 0.12)).toBe('var(--c-brand)')
    expect(brandTint('', 0.12)).toBe('')
  })
})
