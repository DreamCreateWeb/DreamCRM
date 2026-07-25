/**
 * PUBLIC-SITE IMAGE DELIVERY (2026-07-25).
 *
 * Clinics upload straight off a photographer's export — the All About Smiles
 * headshots landed at 7008×4672 (32 MP, 6.5 MB each). Painted into a 248 px
 * card that is a ~14× downscale, and browsers resample that in one low-quality
 * step (iOS also hard-subsamples anything past its decode budget), so a
 * gorgeous original renders visibly GRAINY. Nothing was wrong with the file;
 * the delivery was wrong.
 *
 * The fix: run every clinic-uploaded photo through Next's built-in image
 * optimizer (`/_next/image`), which resizes with a proper filter and re-encodes
 * to WebP — the same 6.5 MB headshot comes back at 57 KB and looks correct.
 * These helpers are PURE + client-safe so the raw `<img>` tags the public site
 * is built on (see components/clinic-site/site-image.tsx) can opt in without
 * adopting `next/image`'s layout behaviour.
 *
 * The host list + width ladder + quality MUST mirror `next.config.js` — the
 * optimizer rejects anything outside them (a 400, i.e. a broken image). The
 * mirror is pinned by tests/clinic-site/site-image.test.ts.
 */

/** Hostname patterns the optimizer will fetch from — mirrors `images.remotePatterns`. */
export const OPTIMIZED_IMAGE_HOSTS = [
  '*.public.blob.vercel-storage.com',
  '**.dreamcreatestudio.com',
  'dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com',
] as const

/** Next's default `imageSizes` + `deviceSizes` — the only widths the optimizer serves. */
export const OPTIMIZED_IMAGE_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
] as const

/** Next's default `images.qualities` is `[75]`; any other `q` is a 400. */
export const OPTIMIZED_IMAGE_QUALITY = 75

/**
 * The painted width of the homepage hero photo. Shared by every template AND by
 * the shell's `<link rel="preload">` so the preload and the `<img>` request the
 * SAME bytes (a mismatch downloads the hero twice).
 */
export const HERO_IMAGE_DISPLAY_WIDTH = 600

/**
 * Match a hostname against one Next remote-pattern host.
 * `*` matches exactly one label; `**` matches one or more.
 */
function hostMatches(hostname: string, pattern: string): boolean {
  if (pattern === hostname) return true
  if (pattern.startsWith('**.')) {
    const suffix = pattern.slice(3)
    return hostname.endsWith(`.${suffix}`)
  }
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2)
    if (!hostname.endsWith(`.${suffix}`)) return false
    const label = hostname.slice(0, -(suffix.length + 1))
    return label.length > 0 && !label.includes('.')
  }
  return false
}

/**
 * Can the optimizer serve this URL? Only absolute https URLs on an allowed
 * host, and never SVG (the optimizer refuses it without
 * `dangerouslyAllowSVG`) or video (a different element entirely).
 */
export function isOptimizableImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false // relative/data:/blob: — leave it exactly as given
  }
  if (parsed.protocol !== 'https:') return false
  if (/\.svg(\?|#|$)/i.test(parsed.pathname)) return false
  if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(parsed.pathname)) return false
  return OPTIMIZED_IMAGE_HOSTS.some((p) => hostMatches(parsed.hostname, p))
}

/** Smallest served width that still covers `target` (clamped to the ladder's top). */
export function pickOptimizedWidth(target: number): number {
  const widths = OPTIMIZED_IMAGE_WIDTHS
  return widths.find((w) => w >= target) ?? widths[widths.length - 1]
}

/** The optimizer URL for one width. Relative on purpose — it resolves against
 *  whatever host the clinic site is being served from (subdomain OR custom
 *  domain), both of which are this same Next app. */
export function optimizedImageUrl(url: string, width: number): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${pickOptimizedWidth(width)}&q=${OPTIMIZED_IMAGE_QUALITY}`
}

export interface SiteImageSource {
  src: string
  /** Absent when the URL can't be optimized — the caller just renders `src`. */
  srcSet?: string
}

/**
 * Build `src` + `srcSet` for a photo painted at `displayWidth` CSS pixels.
 *
 * Two candidates (1x / 2x) with `x` descriptors rather than `w` + `sizes`: the
 * public site paints these at a known card width, so the browser doesn't need a
 * `sizes` hint to choose — and `x` descriptors can't be silently wrong the way
 * a stale `sizes` string can. `src` carries the 2x URL so a browser without
 * srcSet support still gets a sharp (and still small) image.
 */
export function siteImageSource(url: string, displayWidth: number): SiteImageSource {
  if (!isOptimizableImageUrl(url)) return { src: url }
  const one = pickOptimizedWidth(displayWidth)
  const two = pickOptimizedWidth(displayWidth * 2)
  const src1x = optimizedImageUrl(url, one)
  const src2x = optimizedImageUrl(url, two)
  if (one === two) return { src: src1x }
  return { src: src2x, srcSet: `${src1x} 1x, ${src2x} 2x` }
}
