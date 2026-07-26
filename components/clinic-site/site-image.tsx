import type { ImgHTMLAttributes } from 'react'
import { siteImageSource } from '@/lib/site-image'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & {
  src: string
  alt: string
  /**
   * The widest BOX this photo is ever painted in, in CSS pixels — not the
   * file's intrinsic size, and not a pre-inflated guess. The helper adds the
   * headroom itself (2x DPR + object-cover crop, see COVER_CROP_FACTOR in
   * lib/site-image.ts): a 248 px team card passes 248 and serves 640 (1x) /
   * 1080 (2x) instead of the clinic's 7000 px original.
   */
  displayWidth: number
}

/**
 * The public site's `<img>`. Identical to a raw one except the source runs
 * through Next's image optimizer when the URL is a clinic upload — see
 * lib/site-image.ts for why (uploaded originals are 20–30 MP; browsers
 * downscale them in one crude step and the result looks grainy).
 *
 * Deliberately NOT `next/image`: the clinic templates lay images out with
 * plain CSS (`object-cover` inside aspect-ratio boxes, oval clips, snap
 * tracks), and `next/image`'s wrapper/`fill` semantics would rewrite that
 * layout. This keeps the markup and takes only the delivery.
 *
 * Plain function component (no hooks) so server AND client templates can use
 * it. Every caller keeps its own `width`/`height`/`loading`/`className`.
 */
export default function SiteImage({ src, displayWidth, ...rest }: Props) {
  const source = siteImageSource(src, displayWidth)
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...rest} src={source.src} srcSet={source.srcSet} />
}
