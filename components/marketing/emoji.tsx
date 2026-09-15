import { MARKETING_EMOJI, type MarketingEmojiName } from '@/lib/marketing/emoji'

/**
 * A curated animated emoji (`BRAND.md` Part 5).
 *
 * WHY `<picture>` AND NOT A LIBRARY. Noto also publishes these as Lottie, and
 * Lottie needs `lottie-web` (~70 KB gzipped) on a marketing site that ships
 * zero animation JS today — against `BRAND.md` Part 6 ("CSS only. No animation
 * library."). Animated WebP needs nothing, and the reduced-motion fallback is
 * pure markup: the `media` query on the `<source>` swaps in a still frame
 * before the animated file is ever fetched. No JS, no hydration, no flash of
 * the wrong one, and it works in a server component.
 *
 * `prefers-reduced-motion` is not advisory here. A looping glyph beside body
 * copy is exactly the thing that setting exists to stop.
 *
 * ALT TEXT. Decorative by default — `alt=""` plus `aria-hidden`, so a screen
 * reader skips it entirely. Pass `label` ONLY when the emoji carries meaning
 * the surrounding copy does not already say. If the sentence next to it
 * already says "application in", the glyph is decoration and must stay silent;
 * announcing "party popper" there is noise, not access.
 *
 * SIZE. Assets are 96px square, so the useful range is up to 48px on a 2x
 * screen. `width`/`height` are always emitted to reserve the box — these load
 * inside text runs, and a late-arriving image that reflows a paragraph is a
 * worse experience than no image.
 */
export function MarketingEmoji({
  name,
  size = 40,
  label,
  className = '',
}: {
  name: MarketingEmojiName
  /** Rendered edge in px. The assets are 96px, so ≤48 keeps it crisp at 2x. */
  size?: number
  /** Alt text. Omit for decoration — the default is silent. */
  label?: string
  className?: string
}) {
  const decorative = !label
  return (
    <picture>
      <source srcSet={`/images/emoji/${name}-still.webp`} media="(prefers-reduced-motion: reduce)" />
      {/* eslint-disable-next-line @next/next/no-img-element -- animated WebP;
          next/image would re-encode it to a single frame. */}
      <img
        src={`/images/emoji/${name}.webp`}
        alt={decorative ? '' : label}
        aria-hidden={decorative || undefined}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={`inline-block select-none align-[-0.2em] ${className}`}
        style={{ width: size, height: size }}
      />
    </picture>
  )
}

/** The glyph list, for places that want the plain characters (docs, tests). */
export const MARKETING_EMOJI_GLYPHS = MARKETING_EMOJI
