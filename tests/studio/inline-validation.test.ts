import { describe, it, expect } from 'vitest'
import { dayHoursError } from '@/app/(default)/website/editor/hours-editor'
import { isValidVideoUrl, videoUrlProblem } from '@/lib/website-url'

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

describe('videoUrlProblem (page links that render a grey box)', () => {
  it('names Google Drive share links as unplayable', () => {
    const msg = videoUrlProblem('https://drive.google.com/file/d/1AbC/view?usp=sharing')
    expect(msg).toMatch(/Google Drive/)
    expect(msg).toMatch(/upload/i)
  })

  it('catches the other page hosts', () => {
    expect(videoUrlProblem('https://www.youtube.com/watch?v=abc')).toMatch(/YouTube/)
    expect(videoUrlProblem('https://youtu.be/abc')).toMatch(/YouTube/)
    expect(videoUrlProblem('https://vimeo.com/12345')).toMatch(/Vimeo/)
    expect(videoUrlProblem('https://photos.google.com/share/xyz')).toMatch(/Google Photos/)
    expect(videoUrlProblem('https://www.dropbox.com/s/abc/clip.mp4')).toMatch(/Dropbox/)
  })

  it('lets Dropbox DIRECT-content forms through', () => {
    expect(videoUrlProblem('https://www.dropbox.com/s/abc/clip.mp4?raw=1')).toBeNull()
    expect(videoUrlProblem('https://www.dropbox.com/s/abc/clip.mp4?dl=1')).toBeNull()
    expect(videoUrlProblem('https://dl.dropboxusercontent.com/s/abc/clip.mp4')).toBeNull()
  })

  it('is null for playable/neutral inputs (shape errors are isValidVideoUrl’s job)', () => {
    expect(videoUrlProblem('')).toBeNull()
    expect(videoUrlProblem('/uploads/clinic-video/abc.mp4')).toBeNull()
    expect(videoUrlProblem('https://cdn.example.com/clip.mp4')).toBeNull()
    expect(videoUrlProblem('not a url')).toBeNull()
    // Lookalike hosts must not match (suffix anchoring).
    expect(videoUrlProblem('https://notdrive.google.com.evil.com/x.mp4')).toBeNull()
    expect(videoUrlProblem('https://myyoutube.example.com/x.mp4')).toBeNull()
  })
})
