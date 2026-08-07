/**
 * Shared media-upload bounds + tiny helpers, safe on both client and server.
 *
 * Limits are deliberately generous for modern social content: a 5MB image cap
 * is unrealistic for high-quality photos, and short social video clips run well
 * past it. Images are sniffed + stored server-side (a tighter abuse surface on
 * the public bucket); video gets the larger ceiling.
 */

export const MAX_IMAGE_MB = 25
export const MAX_VIDEO_MB = 100
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024

// The website's intro/"difference" clip gets a much larger ceiling than social
// video: a 1–2 minute 4K clip runs 200–500MB, and it's served from our own
// bucket (social platforms enforce their own caps well below this, so the
// composer stays on MAX_VIDEO_MB). Site videos upload straight to S3 via a
// presigned PUT — never through the app server, which App Runner would cut
// off at 120s — so the size is bounded by policy, not infrastructure.
export const MAX_SITE_VIDEO_MB = 500
export const MAX_SITE_VIDEO_BYTES = MAX_SITE_VIDEO_MB * 1024 * 1024

/** Browser-reported MIME types the site-video presign accepts (matches the
 * upload route's magic-byte families: MP4/MOV/WebM). */
export const SITE_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const

/** The video extensions our upload route accepts (matches its magic-byte sniff). */
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|#|$)/i

/** Best-effort: is this stored media URL a video (by extension)? */
export function isVideoUrl(url: string | null | undefined): boolean {
  return !!url && VIDEO_EXT.test(url)
}

/** Is this picked file a video (by its browser-reported MIME)? */
export function isVideoFile(file: { type: string }): boolean {
  return file.type.startsWith('video/')
}
