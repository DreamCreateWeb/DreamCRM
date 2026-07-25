/**
 * CLIENT-SIDE UPLOAD DOWNSCALE (2026-07-25).
 *
 * Clinics upload straight off the photographer's drive — the All About Smiles
 * headshots arrived at 7008×4672 (32 MP, 6.5 MB each). Nothing on the public
 * site or in the dashboard paints an image wider than ~1200 CSS px, so every
 * pixel past ~2560 on the long edge is upload time the front desk waits
 * through, storage we pay for, and (before the optimizer landed) a browser
 * downscale that rendered grainy.
 *
 * `/_next/image` now fixes DELIVERY; this caps what we STORE. It runs in the
 * browser before the transfer starts, so a slow office connection uploads a
 * ~400 KB file instead of a 6.5 MB one.
 *
 * Deliberately conservative — this is a lossy, irreversible edit to someone's
 * photo, so it only fires when the win is unambiguous:
 *   - still-image formats only (GIF is skipped: re-encoding kills animation),
 *   - only when the long edge is genuinely over the cap,
 *   - the original format is preserved (a PNG logo keeps its alpha),
 *   - anything unexpected (no canvas, decode failure, a result that came out
 *     BIGGER) falls back to the untouched original.
 */

/** Long-edge cap for stored images. ~2× the widest surface that paints them. */
export const MAX_UPLOAD_EDGE = 2560

/** JPEG/WebP re-encode quality. High enough that the resize is the only visible change. */
const REENCODE_QUALITY = 0.92

/** Formats it's safe to re-encode. GIF is excluded on purpose (animation). */
const DOWNSCALABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Would we touch a file of this type at all? Pure — the unit-testable half. */
export function isDownscalableType(type: string): boolean {
  return DOWNSCALABLE.has(type)
}

/**
 * Target pixel size for an image, or null when it already fits. Pure.
 * Preserves aspect ratio and rounds to whole pixels.
 */
export function scaledSize(
  width: number,
  height: number,
  maxEdge: number = MAX_UPLOAD_EDGE,
): { width: number; height: number } | null {
  const longEdge = Math.max(width, height)
  if (!Number.isFinite(longEdge) || longEdge <= maxEdge || longEdge <= 0) return null
  const scale = maxEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Resize `file` so its long edge is at most `maxEdge`, in the browser.
 * ALWAYS resolves — every failure path returns the original file untouched.
 */
export async function downscaleImageFile(
  file: File,
  maxEdge: number = MAX_UPLOAD_EDGE,
): Promise<File> {
  if (!isDownscalableType(file.type)) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const target = scaledSize(bitmap.width, bitmap.height, maxEdge)
    if (!target) return file

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    // Browsers' default resampling is already the good one for a canvas draw
    // (unlike the CSS downscale that caused the grain); ask for high anyway.
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, target.width, target.height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, REENCODE_QUALITY),
    )
    // A "smaller" file that got bigger means the re-encode lost — keep the original.
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close?.()
  }
}
