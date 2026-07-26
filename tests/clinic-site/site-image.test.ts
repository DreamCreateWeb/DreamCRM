/**
 * The public-site image-delivery contract.
 *
 * Clinic photos are uploaded straight off a camera (the All About Smiles
 * headshots were 7008×4672 / 6.5 MB) and painted into ~250 px cards. Browsers
 * resample that ~14× downscale in one crude step, so the live site rendered
 * them GRAINY. Every clinic-uploaded photo therefore goes through Next's image
 * optimizer via `siteImageSource`.
 *
 * The optimizer 400s on any host, width, or quality it wasn't configured for —
 * a broken image on a public site — so these tests pin the helper's tables to
 * `next.config.js` itself, and pin the photo surfaces to `<SiteImage>`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import {
  OPTIMIZED_IMAGE_HOSTS,
  OPTIMIZED_IMAGE_QUALITY,
  OPTIMIZED_IMAGE_WIDTHS,
  isOptimizableImageUrl,
  pickOptimizedWidth,
  siteImageSource,
} from '@/lib/site-image'

const ROOT = resolve(__dirname, '../..')
const S3 = 'https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/clinic-staff/o/head.jpg'

describe('isOptimizableImageUrl', () => {
  it('accepts the upload hosts we actually store photos on', () => {
    expect(isOptimizableImageUrl(S3)).toBe(true)
    expect(isOptimizableImageUrl('https://acme.dreamcreatestudio.com/x.png')).toBe(true)
    expect(isOptimizableImageUrl('https://abc.public.blob.vercel-storage.com/x.png')).toBe(true)
  })

  it('leaves anything the optimizer would reject exactly as given', () => {
    // Unknown host (a clinic pasting an image URL from their old site).
    expect(isOptimizableImageUrl('https://example.com/x.jpg')).toBe(false)
    // Wildcards match labels, not arbitrary suffixes.
    expect(isOptimizableImageUrl('https://evil-dreamcreatestudio.com/x.jpg')).toBe(false)
    expect(isOptimizableImageUrl('https://a.b.public.blob.vercel-storage.com/x.png')).toBe(false)
    // SVG has no `dangerouslyAllowSVG`; video isn't an <img> at all.
    expect(isOptimizableImageUrl(`${S3.replace('.jpg', '.svg')}`)).toBe(false)
    expect(isOptimizableImageUrl(`${S3.replace('.jpg', '.mp4')}`)).toBe(false)
    // Non-absolute / non-https sources pass straight through.
    expect(isOptimizableImageUrl('/images/logo.png')).toBe(false)
    expect(isOptimizableImageUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isOptimizableImageUrl('blob:https://x/y')).toBe(false)
    expect(isOptimizableImageUrl('http://acme.dreamcreatestudio.com/x.png')).toBe(false)
    expect(isOptimizableImageUrl(null)).toBe(false)
  })
})

describe('pickOptimizedWidth', () => {
  it('rounds UP to a served width (never below what is painted)', () => {
    expect(pickOptimizedWidth(248)).toBe(256)
    expect(pickOptimizedWidth(256)).toBe(256)
    expect(pickOptimizedWidth(600)).toBe(640)
    expect(pickOptimizedWidth(1200)).toBe(1200)
  })
  it('clamps to the top of the ladder instead of emitting an unserved width', () => {
    expect(pickOptimizedWidth(99999)).toBe(3840)
  })
})

describe('siteImageSource', () => {
  it('emits a 1x/2x pair with object-cover crop headroom (the blurry-headshot case)', () => {
    // A 248px 4:5 team card holding a landscape (1.5:1) upload needs a ~465px
    // source at 1x / ~930px at 2x — cover scales by box HEIGHT. Serving the
    // bare box width (256/640) shipped visibly soft photos on 1x desktops.
    const { src, srcSet } = siteImageSource(S3, 248)
    expect(srcSet).toBe(
      `/_next/image?url=${encodeURIComponent(S3)}&w=640&q=75 1x, ` +
        `/_next/image?url=${encodeURIComponent(S3)}&w=1080&q=75 2x`,
    )
    expect(src).toBe(`/_next/image?url=${encodeURIComponent(S3)}&w=1080&q=75`)
  })

  it('caps every candidate at the sharpness ceiling (never the 3840 jumbo rung)', () => {
    // The hero: 600 × 2 (crop) = 1200 at 1x; 2400 at 2x would ladder-jump to
    // 3840 — the ceiling holds it at 2048.
    const { srcSet } = siteImageSource(S3, 600)
    expect(srcSet).toBe(
      `/_next/image?url=${encodeURIComponent(S3)}&w=1200&q=75 1x, ` +
        `/_next/image?url=${encodeURIComponent(S3)}&w=2048&q=75 2x`,
    )
  })

  it('is a RELATIVE url — clinic sites are served from subdomains and custom domains alike', () => {
    expect(siteImageSource(S3, 248).src.startsWith('/_next/image?')).toBe(true)
  })

  it('drops the srcSet when 1x and 2x land on the same served width', () => {
    // A huge displayWidth: both candidates hit the ceiling → one URL, no pair.
    const { src, srcSet } = siteImageSource(S3, 3840)
    expect(srcSet).toBeUndefined()
    expect(src).toBe(`/_next/image?url=${encodeURIComponent(S3)}&w=2048&q=75`)
  })

  it('passes a non-optimizable url through untouched (no broken images)', () => {
    expect(siteImageSource('https://example.com/x.jpg', 248)).toEqual({
      src: 'https://example.com/x.jpg',
    })
  })
})

describe('parity with next.config.js (the optimizer 400s on anything else)', () => {
  const config = createRequire(import.meta.url)(join(ROOT, 'next.config.js'))

  it('every host we build optimizer urls for is an allowed remote pattern', () => {
    const configured = config.images.remotePatterns.map((p: { hostname: string }) => p.hostname)
    expect([...OPTIMIZED_IMAGE_HOSTS].sort()).toEqual([...configured].sort())
  })

  it('the width ladder + quality match the optimizer defaults we rely on', () => {
    // We take Next's defaults rather than configuring our own — so the config
    // must NOT narrow them out from under the helper.
    expect(config.images.deviceSizes).toBeUndefined()
    expect(config.images.imageSizes).toBeUndefined()
    expect(config.images.qualities).toBeUndefined()
    expect(OPTIMIZED_IMAGE_QUALITY).toBe(75)
    expect(OPTIMIZED_IMAGE_WIDTHS[0]).toBe(16)
    expect(OPTIMIZED_IMAGE_WIDTHS[OPTIMIZED_IMAGE_WIDTHS.length - 1]).toBe(3840)
  })
})

/**
 * The regression guard. A raw `<img>` bound to a clinic-uploaded URL is the bug
 * this whole module exists to fix, so new ones must not creep back into the
 * public site.
 */
describe('the public site renders uploaded photos through SiteImage', () => {
  const SCAN = [join(ROOT, 'app/site'), join(ROOT, 'components/clinic-site')]

  /** Files that legitimately keep a raw <img>, with the reason. */
  const ALLOWLIST: Record<string, string> = {
    'components/clinic-site/site-image.tsx': 'the wrapper itself',
    'components/clinic-site/edit-bridge.tsx': 'owner-only editor chrome, not the public render',
    'components/clinic-site/editable.tsx': 'owner-only editor chrome',
    'app/site/[slug]/icon.tsx': 'ImageResponse (satori), not the DOM',
    'app/site/[slug]/opengraph-image.tsx': 'ImageResponse (satori), not the DOM',
    'app/site/[slug]/intake/[formSlug]/intake-form-runner.tsx':
      'previews the patient’s own just-picked file (blob: URLs)',
  }

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.tsx$/.test(full)) out.push(full)
    }
    return out
  }

  /** Drop comments + template literals — both legitimately SAY "<img>" while
   *  rendering nothing (prose about the tag; the print-window markup string). */
  function code(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/`[\s\S]*?`/g, '``')
  }

  it('has no raw <img> left outside the documented exceptions', () => {
    const offenders: string[] = []
    for (const full of SCAN.flatMap((d) => walk(d))) {
      const rel = full.slice(ROOT.length + 1)
      if (ALLOWLIST[rel]) continue
      if (/<img[\s>]/.test(code(readFileSync(full, 'utf8')))) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })
})
