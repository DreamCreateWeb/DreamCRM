/**
 * Site-wide decorative signature for the clinic template — the pieces that
 * make the design read as FINISHED rather than assembled:
 *
 * - `RippleMotif`: the concentric-arc "calm ripple" (born in the empty-hero
 *   placeholder) generalized into the site's visual DNA — a whisper of brand
 *   linework behind heroes, deep bands, and the closing card.
 * - `ArcDivider`: a shallow organic curve that lets a light band flow INTO a
 *   deep band instead of hitting a hard horizontal seam.
 * - `GrainOverlay`: a barely-there SVG noise wash that gives the deep bands a
 *   tactile, printed-paper luxury (opacity so low it has zero contrast impact).
 *
 * All server-renderable, all `aria-hidden`, all `pointer-events-none` — pure
 * atmosphere, never content. Every consumer must keep its own content above
 * these via a relative z-index.
 */

/** Concentric-arc ripple — the template's signature linework. Position it
 *  absolutely inside a `relative overflow-hidden` parent. */
export function RippleMotif({
  tint,
  className,
  opacity = 0.08,
  style,
}: {
  /** Stroke color — pass the brand hex (or a CSS var expression). */
  tint: string
  className?: string
  /** Stroke opacity — keep it a whisper (0.04–0.12). */
  opacity?: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none ${className ?? ''}`}
      style={style}
      viewBox="0 0 400 400"
      fill="none"
    >
      <g stroke={tint} strokeOpacity={opacity} strokeWidth={1.5} fill="none">
        <circle cx={200} cy={200} r={70} />
        <circle cx={200} cy={200} r={120} />
        <circle cx={200} cy={200} r={170} />
        <circle cx={200} cy={200} r={220} />
        <circle cx={200} cy={200} r={270} />
      </g>
    </svg>
  )
}

/**
 * Shallow organic curve dividing two bands. Renders as an absolutely
 * positioned SVG pinned to the TOP of the darker band, filled with the color
 * of the band ABOVE it — so the light ground appears to dip gently into the
 * deep band. Parent needs `relative` (+ the divider adds its own height as
 * visual breathing room, no layout shift: it overlays the band's padding).
 */
export function ArcDivider({ fill = 'var(--c-bg, #FAF7F2)' }: { fill?: string }) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-px w-full"
      style={{ height: 'clamp(28px, 4vw, 56px)' }}
      viewBox="0 0 1440 56"
      preserveAspectRatio="none"
      fill="none"
    >
      {/* A single soft crest — asymmetric on purpose so it reads organic,
          not like a stamped-out wave pattern. */}
      <path d="M0 0 H1440 V8 C1080 56 480 56 0 12 Z" fill={fill} />
    </svg>
  )
}

/** Inline-SVG noise (feTurbulence) as a data URI — no asset, no network. */
const NOISE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")"

/** Tactile grain wash for deep bands. Absolutely fills its relative parent. */
export function GrainOverlay({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: NOISE_URI, opacity, mixBlendMode: 'overlay' }}
    />
  )
}

/** Four-point sparkle — the marquee separator glyph (replaces plain dots). */
export function SparkleGlyph({ className, color }: { className?: string; color?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill={color ?? 'currentColor'}
    >
      <path d="M5 0 L6.1 3.9 L10 5 L6.1 6.1 L5 10 L3.9 6.1 L0 5 L3.9 3.9 Z" />
    </svg>
  )
}

/**
 * The signature deep "rhythm-break" band, as ONE component — dark derived-
 * palette background, organic ArcDivider seam from the section above, tactile
 * grain, and an optional corner ripple. Every page previously copied this
 * four-element recipe by hand; now the composition (and any future tuning of
 * it) lives here. Children render inside a `relative` wrapper so they stack
 * above the decor; bring your own max-width container + paddings via
 * `className`.
 */
export function DeepBand({
  children,
  className = 'pt-20 pb-14 sm:pt-32 sm:pb-24',
  arcFill,
  ripple = 'right',
}: {
  children: React.ReactNode
  /** Vertical paddings + any extra section classes. */
  className?: string
  /** Color of the section ABOVE the seam (ArcDivider default = page bg). */
  arcFill?: string
  /** Corner ripple placement — 'none' for short bands. */
  ripple?: 'right' | 'left' | 'none'
}) {
  return (
    <section
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundColor: 'var(--c-deep, #36514c)', color: 'var(--c-deep-ink, #FAF7F2)' }}
    >
      <ArcDivider fill={arcFill} />
      <GrainOverlay opacity={0.04} />
      {ripple === 'right' && (
        <RippleMotif tint="#FFFFFF" opacity={0.05} className="absolute -right-40 -bottom-56 w-[560px] h-[560px]" />
      )}
      {ripple === 'left' && (
        <RippleMotif tint="#FFFFFF" opacity={0.04} className="absolute -left-48 -bottom-64 w-[620px] h-[620px]" />
      )}
      <div className="relative">{children}</div>
    </section>
  )
}
