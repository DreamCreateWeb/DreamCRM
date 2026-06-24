import { describe, it, expect } from 'vitest'
import { normalizeMetricsWindow, scaleToWindow, DEFAULT_WINDOW_DAYS } from '@/lib/services/metrics-window'

describe('normalizeMetricsWindow', () => {
  it('keeps 90, floors other positives, defaults to 30', () => {
    expect(normalizeMetricsWindow(90)).toBe(90)
    expect(normalizeMetricsWindow(45.7)).toBe(45)
    expect(normalizeMetricsWindow(undefined)).toBe(DEFAULT_WINDOW_DAYS)
    expect(normalizeMetricsWindow(0)).toBe(30)
    expect(normalizeMetricsWindow(-5)).toBe(30)
  })
})

describe('scaleToWindow', () => {
  it('scales a per-30-day baseline linearly to the window', () => {
    expect(scaleToWindow(100, 30)).toBe(100)
    expect(scaleToWindow(100, 90)).toBe(300)
    expect(scaleToWindow(10, 90)).toBe(30)
  })
})
