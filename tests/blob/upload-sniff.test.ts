/**
 * Unit tests for the upload route's magic-byte sniffer + the route's MIME/size
 * gate. The destination S3 bucket is public-read, so the route must reject SVG
 * and anything that isn't a known raster image / video — validated by real
 * bytes, never the client Content-Type.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Auth + storage are mocked so the route runs without a session backend / S3.
vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(async () => ({ user: { id: 'user_1' } })),
}))
const uploaded: Array<{ path: string; contentType?: string }> = []
vi.mock('@/lib/blob', () => ({
  uploadBlob: vi.fn(async (path: string, _body: unknown, opts: { contentType?: string }) => {
    uploaded.push({ path, contentType: opts?.contentType })
    return { url: `https://cdn.example/${path}`, pathname: path }
  }),
}))

import { sniffUpload, POST } from '@/app/api/upload/route'

// Magic-byte prefixes for each format (padded to 32 bytes — the route reads 32).
function bytes(...prefix: number[]): Uint8Array {
  const b = new Uint8Array(32)
  prefix.forEach((v, i) => (b[i] = v))
  return b
}
const codes = (s: string) => s.split('').map((c) => c.charCodeAt(0))
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0)
const GIF = bytes(...codes('GIF89a'))
function webp(): Uint8Array {
  const b = bytes(...codes('RIFF'))
  codes('WEBP').forEach((c, i) => (b[8 + i] = c))
  return b
}
function mp4(): Uint8Array {
  const b = new Uint8Array(32)
  codes('ftyp').forEach((c, i) => (b[4 + i] = c))
  codes('isom').forEach((c, i) => (b[8 + i] = c))
  return b
}
const WEBM = bytes(0x1a, 0x45, 0xdf, 0xa3)
function svg(): Uint8Array {
  return bytes(...codes('<svg xmlns'))
}

describe('sniffUpload', () => {
  it('identifies raster images', () => {
    expect(sniffUpload(PNG)).toEqual({ kind: 'image', type: 'image/png' })
    expect(sniffUpload(JPEG)).toEqual({ kind: 'image', type: 'image/jpeg' })
    expect(sniffUpload(GIF)).toEqual({ kind: 'image', type: 'image/gif' })
    expect(sniffUpload(webp())).toEqual({ kind: 'image', type: 'image/webp' })
  })

  it('identifies videos', () => {
    expect(sniffUpload(mp4())).toEqual({ kind: 'video', type: 'video/mp4' })
    expect(sniffUpload(WEBM)).toEqual({ kind: 'video', type: 'video/webm' })
  })

  it('rejects SVG outright', () => {
    const r = sniffUpload(svg())
    expect(r.kind).toBe('rejected')
    if (r.kind === 'rejected') expect(r.reason).toMatch(/SVG/i)
  })

  it('rejects unknown / binary junk', () => {
    expect(sniffUpload(bytes(0x00, 0x01, 0x02, 0x03)).kind).toBe('rejected')
  })
})

function fileFrom(bytes: Uint8Array, name: string, type: string, size?: number): File {
  // Keep the real body small (just the magic bytes) but override `size` so we
  // can exercise the size caps without allocating tens of MB in the test.
  const file = new File([bytes], name, { type })
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size, configurable: true })
  }
  return file
}

async function post(file: File, folder = 'clinic-logos'): Promise<Response> {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('folder', folder)
  // Hand the route our FormData directly (a real Request would re-serialize the
  // body and drop the test's overridden `file.size`). The route only calls
  // `.formData()`, so a minimal stub is enough + keeps the size override intact.
  const req = { formData: async () => fd } as unknown as Request
  return POST(req)
}

describe('upload route gate', () => {
  beforeEach(() => {
    uploaded.length = 0
  })

  it('accepts a PNG by magic bytes (stores the sniffed content-type)', async () => {
    const res = await post(fileFrom(PNG, 'logo.png', 'image/png'))
    expect(res.status).toBe(200)
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0].contentType).toBe('image/png')
  })

  it('accepts a PNG even when the client lies about the type', async () => {
    // Client claims SVG, bytes are PNG → we trust the bytes.
    const res = await post(fileFrom(PNG, 'x.svg', 'image/svg+xml'))
    expect(res.status).toBe(200)
    expect(uploaded[0].contentType).toBe('image/png')
  })

  it('rejects an SVG with 415 even when the client claims image/png', async () => {
    const res = await post(fileFrom(svg(), 'evil.png', 'image/png'))
    expect(res.status).toBe(415)
    expect(uploaded).toHaveLength(0)
  })

  it('accepts a generous image (20MB) but rejects one over the 25MB cap', async () => {
    const ok = await post(fileFrom(PNG, 'big.png', 'image/png', 20 * 1024 * 1024))
    expect(ok.status).toBe(200)
    const tooBig = await post(fileFrom(PNG, 'huge.png', 'image/png', 26 * 1024 * 1024))
    expect(tooBig.status).toBe(413)
  })

  it('accepts a video well past the old 50MB cap (now up to 100MB)', async () => {
    const res = await post(fileFrom(mp4(), 'clip.mp4', 'video/mp4', 80 * 1024 * 1024), 'social-posts')
    expect(res.status).toBe(200)
    expect(uploaded[uploaded.length - 1].contentType).toBe('video/mp4')
  })

  it('rejects a video over the 100MB cap with 413', async () => {
    const res = await post(fileFrom(mp4(), 'big.mp4', 'video/mp4', 101 * 1024 * 1024), 'social-posts')
    expect(res.status).toBe(413)
  })

  it('rejects an empty file', async () => {
    const res = await post(new File([], 'empty.png', { type: 'image/png' }))
    expect(res.status).toBe(400)
  })
})
