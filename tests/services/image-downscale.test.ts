/**
 * Upload-time downscale. Clinic photos arrive at camera resolution (the All
 * About Smiles headshots were 7008×4672 / 6.5 MB); nothing paints them above
 * ~1200 CSS px. These pin the decision rules — the lossy edit only fires when
 * the win is unambiguous, and every failure path keeps the original file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  MAX_UPLOAD_EDGE,
  isDownscalableType,
  scaledSize,
  downscaleImageFile,
} from '@/lib/image-downscale'

describe('isDownscalableType', () => {
  it('re-encodes still photo formats', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(isDownscalableType(t)).toBe(true)
    }
  })
  it('never touches GIF (re-encoding would kill the animation) or video', () => {
    expect(isDownscalableType('image/gif')).toBe(false)
    expect(isDownscalableType('video/mp4')).toBe(false)
    expect(isDownscalableType('image/svg+xml')).toBe(false)
    expect(isDownscalableType('')).toBe(false)
  })
})

describe('scaledSize', () => {
  it('caps the long edge and keeps the aspect ratio (the real headshot case)', () => {
    expect(scaledSize(7008, 4672)).toEqual({ width: 2560, height: 1707 })
    expect(scaledSize(4672, 7008)).toEqual({ width: 1707, height: 2560 })
  })
  it('returns null when the photo already fits (no lossy re-encode for nothing)', () => {
    expect(scaledSize(1200, 800)).toBeNull()
    expect(scaledSize(MAX_UPLOAD_EDGE, 100)).toBeNull()
  })
  it('honours an explicit cap and never rounds a side to zero', () => {
    expect(scaledSize(4000, 3, 1000)).toEqual({ width: 1000, height: 1 })
  })
  it('shrugs off nonsense dimensions instead of throwing', () => {
    expect(scaledSize(0, 0)).toBeNull()
    expect(scaledSize(Number.NaN, 10)).toBeNull()
  })
})

describe('downscaleImageFile', () => {
  const orig = globalThis.createImageBitmap

  afterEach(() => {
    globalThis.createImageBitmap = orig
    vi.restoreAllMocks()
  })

  function file(type: string, size = 6_500_000) {
    const f = new File(['x'], 'headshot.jpg', { type })
    Object.defineProperty(f, 'size', { value: size })
    return f
  }

  it('returns the original untouched for a format it must not re-encode', async () => {
    const f = file('image/gif')
    expect(await downscaleImageFile(f)).toBe(f)
  })

  it('returns the original when the browser cannot decode (no createImageBitmap)', async () => {
    // @ts-expect-error — simulating an older browser
    globalThis.createImageBitmap = undefined
    const f = file('image/jpeg')
    expect(await downscaleImageFile(f)).toBe(f)
  })

  it('returns the original when decoding throws (a corrupt or exotic file)', async () => {
    globalThis.createImageBitmap = vi.fn(async () => {
      throw new Error('decode failed')
    }) as unknown as typeof createImageBitmap
    const f = file('image/jpeg')
    expect(await downscaleImageFile(f)).toBe(f)
  })

  it('returns the original when the image already fits the cap', async () => {
    globalThis.createImageBitmap = vi.fn(async () => ({
      width: 1200,
      height: 900,
      close: () => {},
    })) as unknown as typeof createImageBitmap
    const f = file('image/jpeg')
    expect(await downscaleImageFile(f)).toBe(f)
  })
})
