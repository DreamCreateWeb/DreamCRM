import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import {
  MAX_SITE_VIDEO_BYTES,
  MAX_SITE_VIDEO_MB,
  SITE_VIDEO_TYPES,
} from '@/lib/media'

/**
 * Presigned direct-to-S3 upload for the website's intro video. 4K clips run
 * hundreds of MB, which the classic /api/upload route can't carry: it buffers
 * the whole body in server memory and App Runner cuts requests at ~120s. Here
 * the browser PUTs straight to the bucket with a signature that pins the key,
 * content-type, and exact byte length.
 *
 * Only when STORAGE_DRIVER=s3 — on the Vercel Blob driver (dev fallback) we
 * answer { fallback: true } and the client uses the classic route instead.
 *
 * Security: the classic route sniffs magic bytes because the public bucket
 * must never serve markup (stored XSS). A presigned PUT can't be sniffed
 * server-side, but the signed content-type is locked to a video/* value, and
 * browsers never render `video/*` responses as HTML — junk uploaded under a
 * video type is inert. The key is confined to the caller's own clinic-video
 * folder.
 */
export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { name?: unknown; type?: unknown; size?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }

  const name = typeof body.name === 'string' && body.name ? body.name : 'video.mp4'
  const type = typeof body.type === 'string' ? body.type : ''
  const size = typeof body.size === 'number' ? body.size : NaN

  if (!(SITE_VIDEO_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { error: 'Please choose an MP4, MOV, or WebM video.' },
      { status: 415 },
    )
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: 'empty file' }, { status: 400 })
  }
  if (size > MAX_SITE_VIDEO_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_SITE_VIDEO_MB}MB).` },
      { status: 413 },
    )
  }

  if (process.env.STORAGE_DRIVER !== 's3') {
    // Dev / Vercel Blob path — no presigned PUT there; the client falls back
    // to the classic buffered route (fine at dev sizes).
    return NextResponse.json({ fallback: true })
  }

  const safe = name.replace(/[^a-z0-9_.-]/gi, '_')
  const { presignVideoUpload } = await import('@/lib/blob-s3')
  const result = await presignVideoUpload(
    `clinic-video/${session.user.id}/${Date.now()}-${safe}`,
    type,
    size,
  )
  return NextResponse.json({ uploadUrl: result.uploadUrl, url: result.url })
}
