import SiteImage from '../../site-image'
import { nameInitials } from '@/components/clinic-site/name-initials'

/**
 * The crest — the Established template's hero object, where other templates
 * put a lifestyle photo. A lettered ring (the practice name over the top arc,
 * the town under the bottom arc), a double gold hairline, and the clinic's
 * logo or a serif monogram in the disc. Pure SVG + one optional image; it
 * looks finished for a practice that has uploaded nothing but a name.
 *
 * Text rides <textPath> so the ring is real type, not a raster. The path ids
 * carry a suffix so two crests on one page (hero + a future about band)
 * cannot cross their arcs.
 */
export default function Crest({
  name,
  place,
  logoUrl,
  size = 360,
  idSuffix = 'hero',
}: {
  name: string
  place: string | null
  logoUrl: string | null
  /** Rendered box width in CSS px (the SVG scales to it). */
  size?: number
  idSuffix?: string
}) {
  const initials = nameInitials(name)
  const topArc = `est-top-${idSuffix}`
  const bottomArc = `est-bottom-${idSuffix}`
  // Letter-spaced small caps on a 320-unit box; long names get a smaller
  // face so the arc never runs into itself.
  const ringText = name.toUpperCase()
  const ringSize = ringText.length > 28 ? 13 : ringText.length > 20 ? 15 : 17
  const place_ = (place ?? 'Dentistry').toUpperCase()

  return (
    <div className="relative mx-auto" style={{ width: size, maxWidth: '100%', aspectRatio: '1 / 1' }} aria-hidden="true">
      {/* The glow behind the crest: the soft accent, feathered. */}
      <span
        className="absolute inset-[-12%] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(closest-side, var(--c-brand-soft, #F6E3E4) 0%, rgba(255,255,255,0) 72%)' }}
      />
      <svg viewBox="0 0 320 320" className="relative w-full h-full" style={{ fontFamily: 'var(--font-display, serif)' }}>
        <defs>
          <path id={topArc} d="M 42 160 A 118 118 0 0 1 278 160" fill="none" />
          <path id={bottomArc} d="M 278 160 A 118 118 0 0 1 42 160" fill="none" />
        </defs>
        {/* Disc */}
        <circle cx="160" cy="160" r="150" fill="var(--c-surface, #FFFDF8)" stroke="var(--c-border, #E3DCCB)" strokeWidth="1" />
        {/* Double gold ring */}
        <circle cx="160" cy="160" r="142" fill="none" stroke="var(--c-strip, #C9A24A)" strokeWidth="1.5" />
        <circle cx="160" cy="160" r="136" fill="none" stroke="var(--c-strip, #C9A24A)" strokeWidth="0.75" opacity="0.7" />
        {/* Inner ring */}
        <circle cx="160" cy="160" r="98" fill="none" stroke="var(--c-strip, #C9A24A)" strokeWidth="1" />
        <circle cx="160" cy="160" r="92" fill="var(--c-bg, #FAF7F0)" stroke="var(--c-border, #E3DCCB)" strokeWidth="1" />
        {/* Ring text */}
        <text fill="var(--c-heading, #152238)" fontSize={ringSize} fontWeight={600} letterSpacing="3.5">
          <textPath href={`#${topArc}`} startOffset="50%" textAnchor="middle">
            {ringText}
          </textPath>
        </text>
        <text fill="var(--c-strip-ink, #152238)" fontSize="12" fontWeight={600} letterSpacing="4" opacity="0.85">
          <textPath href={`#${bottomArc}`} startOffset="50%" textAnchor="middle">
            {place_}
          </textPath>
        </text>
        {/* The two gold stars that bracket the bottom text */}
        <circle cx="42" cy="160" r="2.5" fill="var(--c-strip, #C9A24A)" />
        <circle cx="278" cy="160" r="2.5" fill="var(--c-strip, #C9A24A)" />
        {/* Monogram when there is no logo */}
        {!logoUrl && (
          <text
            x="160"
            y="176"
            textAnchor="middle"
            fill="var(--c-brand-strong, #B5121B)"
            fontSize={initials.length > 1 ? 64 : 76}
            fontWeight={600}
            fontStyle="italic"
          >
            {initials || '·'}
          </text>
        )}
      </svg>
      {logoUrl && (
        <span
          className="absolute rounded-full overflow-hidden flex items-center justify-center"
          style={{ left: '50%', top: '50%', width: '52%', height: '52%', transform: 'translate(-50%, -50%)' }}
        >
          <SiteImage displayWidth={Math.round(size * 0.5)} src={logoUrl} alt="" className="w-[84%] h-[84%] object-contain" />
        </span>
      )}
    </div>
  )
}
