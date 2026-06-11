import { useId } from 'react'

/**
 * Dream Create brand assets — vector recreation of the supplied logo:
 * a liquid teal-gradient capital D (paint-drip personality) + a navy-ink
 * wordmark. SVG so it stays crisp at every size and can re-tint for dark
 * surfaces. The gradient stops are the canonical brand teals; the wordmark
 * ink is the canonical brand navy. Reuse these tokens — don't re-derive
 * brand colors elsewhere.
 */

export const BRAND = {
  /** Liquid-D gradient, light → deep. */
  tealLight: '#56D5CB',
  teal: '#33A9AE',
  tealDeep: '#1F6E7E',
  /** Wordmark ink (near-navy). */
  ink: '#1A2140',
} as const

export function DreamCreateMark({
  size = 32,
  className = '',
  title = 'Dream Create',
}: {
  size?: number
  className?: string
  title?: string
}) {
  // Unique gradient id per mount so multiple marks on one page don't collide.
  const gid = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 68"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gid} x1="46" y1="4" x2="16" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND.tealLight} />
          <stop offset="0.55" stopColor={BRAND.teal} />
          <stop offset="1" stopColor={BRAND.tealDeep} />
        </linearGradient>
      </defs>
      {/* Liquid D — bowl with a melting lower-left stem */}
      <path
        fill={`url(#${gid})`}
        fillRule="evenodd"
        d="M20 5h11.5C48.3 5 58.8 15.8 58.8 31.5S48.3 58 31.5 58h-8.2c-3.1 0-4.4 3.1-7.1 2.1-2.3-.9-1.5-4-2.6-6.2-.5-1-.8-2.3-.8-3.9V11.8C12.8 7.5 15.5 5 20 5Zm5.6 12.6c-1.5 0-2.3.8-2.3 2.3v24.2c0 1.5.8 2.3 2.3 2.3h5.6c10.4 0 16.5-5.7 16.5-14.4S41.6 17.6 31.2 17.6h-5.6Z"
      />
      {/* Drips */}
      <circle cx="10.6" cy="64.2" r="2.3" fill={BRAND.tealDeep} />
      <ellipse cx="19.4" cy="64.8" rx="1.7" ry="2.5" fill={BRAND.teal} transform="rotate(14 19.4 64.8)" />
      <circle cx="7.4" cy="57.2" r="1.3" fill={BRAND.teal} />
    </svg>
  )
}

/**
 * Mark + wordmark lockup. The wordmark is set in the UI's heaviest sans
 * (visually matching the supplied logo's bold rounded geometry) and flips
 * to white on dark surfaces.
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
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <DreamCreateMark size={size} />
      <span
        className={`font-extrabold tracking-tight text-[--brand-ink,#1A2140] dark:text-white ${wordmarkClassName}`}
        style={{ fontSize: Math.round(size * 0.68) }}
      >
        Dream&nbsp;Create
      </span>
    </span>
  )
}
