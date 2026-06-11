import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { uploadBlob } from '@/lib/blob'

/**
 * Authenticated upload endpoint. Used for clinic IMAGES (logo, hero, staff
 * headshots, office photos, shop product images, avatars) AND short intro
 * VIDEOS (the Website Studio's "difference" clip). Résumés ride a separate
 * server action (`app/site/[slug]/careers/actions.ts`), not this route.
 *
 * Server-side content validation is mandatory here: the destination S3 bucket
 * is public-read, so an attacker who can authenticate could otherwise PUT an
 * SVG (or HTML-ish) file and serve stored XSS from our own origin. We sniff the
 * real bytes (never trust the client `Content-Type` or filename), allow only a
 * fixed set of raster image + video formats, reject SVG outright, and cap
 * images far below the video limit.
 */

// Allowed raster image formats — sniffed by magic bytes. SVG is deliberately
// excluded (it's XML/script-capable → stored-XSS in a public bucket).
const IMAGE_MAX_BYTES = 8 * 1024 * 1024 // 8MB
// Videos are larger; the Studio caps client-side at 50MB and we mirror it.
const VIDEO_MAX_BYTES = 50 * 1024 * 1024 // 50MB

export type SniffResult =
  | { kind: 'image' | 'video'; type: string }
  | { kind: 'rejected'; reason: string }

/**
 * Identify a file from its leading bytes. Returns the broad kind (image/video)
 * + a canonical content-type, or a rejection. Pure + exported for unit tests.
 */
export function sniffUpload(bytes: Uint8Array): SniffResult {
  const b = bytes
  const has = (sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v)
  const ascii = (s: string, offset = 0) =>
    s.split('').every((c, i) => b[offset + i] === c.charCodeAt(0))

  // ── Images ────────────────────────────────────────────────────────────────
  // JPEG: FF D8 FF
  if (has([0xff, 0xd8, 0xff])) return { kind: 'image', type: 'image/jpeg' }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (has([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { kind: 'image', type: 'image/png' }
  // GIF: "GIF87a" / "GIF89a"
  if (ascii('GIF87a') || ascii('GIF89a')) return { kind: 'image', type: 'image/gif' }
  // WEBP: "RIFF"...."WEBP"
  if (ascii('RIFF') && ascii('WEBP', 8)) return { kind: 'image', type: 'image/webp' }

  // ── Videos (ISO-BMFF / WebM) ────────────────────────────────────────────────
  // MP4 / MOV / M4V: bytes 4-7 are "ftyp" (ISO base media file format box).
  if (ascii('ftyp', 4)) {
    // Distinguish QuickTime brand from MP4 brand — both ride the same container.
    const brand = String.fromCharCode(b[8] ?? 0, b[9] ?? 0, b[10] ?? 0, b[11] ?? 0)
    if (brand.startsWith('qt')) return { kind: 'video', type: 'video/quicktime' }
    return { kind: 'video', type: 'video/mp4' }
  }
  // WebM / Matroska: EBML header 1A 45 DF A3
  if (has([0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'video', type: 'video/webm' }

  // ── Explicit SVG rejection (so the error is clear, not "unknown") ───────────
  // SVG is text; sniff for "<svg" or an XML prolog leading to <svg.
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(b.slice(0, 256))
    .trimStart()
    .toLowerCase()
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype')) {
    return { kind: 'rejected', reason: 'SVG and other markup files aren’t allowed.' }
  }

  return {
    kind: 'rejected',
    reason: 'Unsupported file type. Upload a JPEG, PNG, WebP, or GIF image (or an MP4/WebM video).',
  }
}

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file')
  const folder = (form.get('folder') as string | null) ?? 'uploads'

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'no file' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'empty file' }, { status: 400 })
  }
  // Hard upper bound before we even read bytes (videos are the largest case).
  if (file.size > VIDEO_MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 50MB).' }, { status: 413 })
  }

  // Sniff the real content from the leading bytes — never trust file.type.
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer())
  const sniff = sniffUpload(head)
  if (sniff.kind === 'rejected') {
    return NextResponse.json({ error: sniff.reason }, { status: 415 })
  }
  // Per-kind size cap: images must stay small (the XSS/abuse surface); videos
  // get the full 50MB.
  if (sniff.kind === 'image' && file.size > IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 8MB).' }, { status: 413 })
  }

  const name = (file as File).name || 'upload.bin'
  const safe = name.replace(/[^a-z0-9_.-]/gi, '_')
  const result = await uploadBlob(`${folder}/${session.user.id}/${Date.now()}-${safe}`, file, {
    // Use the SNIFFED content-type, not the client-declared one, so the stored
    // object is always served as exactly what we verified it to be.
    contentType: sniff.type,
  })

  return NextResponse.json(result)
}
