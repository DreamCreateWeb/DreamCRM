import { useId } from 'react'

/**
 * Brand assets — the v3 "Dream Bubble" mark (2026-07-18 redesign, owner-
 * approved): a plump thought-bubble capital D in the dream-blue gradient
 * with a glossy shine and two trailing dream-bubbles (the comic-strip
 * "dreaming…" trail). It doubles as a chat bubble — dreams + conversations.
 *
 * LOCKUP RULE: the mark IS the letter D. Full lockups render the mark
 * followed by the REST of the word ("reamCRM" / "ream Create") — never
 * "[D] DreamCRM" with a duplicated D. Collapsed/tiny contexts use the mark
 * alone. The trailing bubbles hang below the baseline like a descender.
 *
 * These are the canonical brand stops — reuse them, don't re-derive brand
 * colors elsewhere. (icon.tsx + opengraph-image.tsx inline this artwork for
 * their SVG-string renderers; keep the three files' geometry in sync.)
 */

export const BRAND = {
  /** Dream-bubble gradient, light → deep (dream-blue ramp: teal-400/500/700). */
  blueLight: '#7CA5FF',
  blue: '#4C7DF0',
  blueDeep: '#2F52B3',
  /** Wordmark ink (v3 blue-lean navy — matches --color-ink-800). */
  ink: '#22304E',
} as const

/** The bubble-D artwork, shared by every renderer of the mark. */
export const MARK_VIEWBOX = '0 0 80 76'
export const MARK_D_PATH =
  'M24 4h12c20.4 0 34 12.4 34 29s-13.6 29-34 29H24c-6.1 0-10-3.9-10-10V14c0-6.1 3.9-10 10-10Zm7 15.5c-2.6 0-4 1.4-4 4v19c0 2.6 1.4 4 4 4h5.5c11.6 0 18.5-5.2 18.5-13.5S48.1 19.5 36.5 19.5H31Z'

/**
 * The Dream Bubble D, standalone. `size` is the rendered HEIGHT; width is
 * size·80/76. The D body spans the top ~82% of the box — the trailing
 * bubbles below are a descender, which the lockups account for.
 */
export function DreamCreateMark({
  size = 32,
  className = '',
  title = 'DreamCRM',
}: {
  size?: number
  className?: string
  title?: string
}) {
  // Unique gradient id per mount so multiple marks on one page don't collide.
  const gid = useId()
  return (
    <svg
      width={(size * 80) / 76}
      height={size}
      viewBox={MARK_VIEWBOX}
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="56" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND.blueLight} />
          <stop offset="0.55" stopColor={BRAND.blue} />
          <stop offset="1" stopColor={BRAND.blueDeep} />
        </linearGradient>
      </defs>
      {/* The bubble D */}
      <path fill={`url(#${gid})`} fillRule="evenodd" d={MARK_D_PATH} />
      {/* Glossy shine */}
      <ellipse cx="30" cy="12.5" rx="9" ry="3.6" fill="#fff" opacity="0.35" transform="rotate(-10 30 12.5)" />
      {/* Dream trail */}
      <circle cx="15" cy="67" r="5" fill={`url(#${gid})`} />
      <circle cx="6.5" cy="74" r="2.6" fill={BRAND.blueLight} />
    </svg>
  )
}

/**
 * Shared integrated-lockup renderer: the mark as the capital D + the rest
 * of the word on the D's baseline. Nunito's cap height is ~0.72em and the
 * D body is 58/76 of the mark box, so fontSize = size·(58/76)/0.72 matches
 * cap heights; the 0.055·size padding then seats the text baseline on the
 * D body's bottom edge (tuned against guide lines in the 2026-07-18
 * alignment lab — the naive 14/76 SVG-box math floated the text high).
 */
function IntegratedLockup({
  size,
  rest,
  className,
  restClassName,
}: {
  size: number
  rest: React.ReactNode
  className?: string
  restClassName?: string
}) {
  const fontSize = Math.round((size * (58 / 76)) / 0.72)
  const baselineDrop = Math.round(size * 0.055)
  return (
    <span className={`inline-flex items-end ${className ?? ''}`}>
      <DreamCreateMark size={size} className="shrink-0" />
      <span
        className={`font-extrabold leading-none tracking-tight ${restClassName ?? ''}`}
        style={{ fontSize, paddingBottom: baselineDrop, marginLeft: Math.round(size * -0.05) }}
      >
        {rest}
      </span>
    </span>
  )
}

/**
 * The PRODUCT lockup — "DreamCRM", with the mark as the D. Use in the
 * dashboard chrome (expanded sidebar). "ream" is wordmark ink, "CRM" is
 * the brand blue (dream-sky on dark).
 */
export function DreamCrmLogo({ size = 30, className = '' }: { size?: number; className?: string }) {
  return (
    <IntegratedLockup
      size={size}
      className={className}
      restClassName="text-[--brand-ink,#22304E] dark:text-white"
      rest={
        <>
          ream
          <span className="text-teal-500 dark:text-teal-400">CRM</span>
        </>
      }
    />
  )
}

/**
 * The COMPANY lockup — "Dream Create", with the mark as the D (same
 * no-duplicate-D rule). Used by auth / partner / marketing chrome.
 */
export function DreamCreateLogo({
  size = 28,
  className = '',
  wordmarkClassName = '',
}: {
  size?: number
  className?: string
  wordmarkClassName?: string
}) {
  return (
    <IntegratedLockup
      size={size}
      className={className}
      restClassName={`text-[--brand-ink,#22304E] dark:text-white ${wordmarkClassName}`}
      rest={<>ream&nbsp;Create</>}
    />
  )
}
