import { describe, it, expect } from 'vitest'
import { isVideoUrl, isVideoFile, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_IMAGE_MB, MAX_VIDEO_MB } from '@/lib/media'

describe('media bounds + helpers', () => {
  it('exposes generous, consistent caps', () => {
    expect(MAX_IMAGE_MB).toBe(25)
    expect(MAX_VIDEO_MB).toBe(100)
    expect(MAX_IMAGE_BYTES).toBe(25 * 1024 * 1024)
    expect(MAX_VIDEO_BYTES).toBe(100 * 1024 * 1024)
  })

  it('detects video URLs by extension (and ignores images)', () => {
    expect(isVideoUrl('https://x.s3.amazonaws.com/social-posts/u/123-clip.mp4')).toBe(true)
    expect(isVideoUrl('https://x/clip.MOV')).toBe(true)
    expect(isVideoUrl('https://x/clip.webm?v=2')).toBe(true)
    expect(isVideoUrl('https://x/photo.jpg')).toBe(false)
    expect(isVideoUrl('https://x/photo.png')).toBe(false)
    expect(isVideoUrl(null)).toBe(false)
  })

  it('detects video files by MIME', () => {
    expect(isVideoFile({ type: 'video/mp4' })).toBe(true)
    expect(isVideoFile({ type: 'video/quicktime' })).toBe(true)
    expect(isVideoFile({ type: 'image/jpeg' })).toBe(false)
  })
})
