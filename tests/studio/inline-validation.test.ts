import { describe, it, expect } from 'vitest'
import { dayHoursError } from '@/app/(default)/website/hours-editor'
import { isValidVideoUrl } from '@/lib/website-url'

/**
 * Client-side validators that mirror the server rules so the Website Studio can
 * flag bad input BEFORE a round-trip (hours grid + intro-video URL).
 */

describe('dayHoursError (hours editor)', () => {
  it('is null for a closed day regardless of times', () => {
    expect(dayHoursError('', '', true)).toBeNull()
    expect(dayHoursError('09:00', '17:00', true)).toBeNull()
  })

  it('flags an open day missing a time', () => {
    expect(dayHoursError('', '17:00', false)).toMatch(/open and close/i)
    expect(dayHoursError('09:00', '', false)).toMatch(/open and close/i)
  })

  it('flags open >= close', () => {
    expect(dayHoursError('17:00', '09:00', false)).toMatch(/before/i)
    expect(dayHoursError('12:00', '12:00', false)).toMatch(/before/i)
  })

  it('is null for a valid open day', () => {
    expect(dayHoursError('09:00', '17:00', false)).toBeNull()
  })
})

describe('isValidVideoUrl (intro video)', () => {
  it('accepts empty (clears the field)', () => {
    expect(isValidVideoUrl('')).toBe(true)
    expect(isValidVideoUrl('   ')).toBe(true)
  })

  it('accepts http(s) URLs', () => {
    expect(isValidVideoUrl('https://cdn.example.com/clip.mp4')).toBe(true)
    expect(isValidVideoUrl('http://example.com/v.webm')).toBe(true)
  })

  it('accepts an uploaded /-rooted path', () => {
    expect(isValidVideoUrl('/uploads/clinic-video/abc.mp4')).toBe(true)
  })

  it('rejects junk + dangerous schemes', () => {
    expect(isValidVideoUrl('not a url')).toBe(false)
    expect(isValidVideoUrl('javascript:alert(1)')).toBe(false)
    expect(isValidVideoUrl('ftp://example.com/x.mp4')).toBe(false)
  })
})
