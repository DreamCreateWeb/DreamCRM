import SiteImage from '../../site-image'
import { nameInitials } from '@/components/clinic-site/name-initials'

/**
 * The home plate — the Home Team template's crest. A pentagon (a square
 * with the bottom two corners meeting in a point — the shape itself, no
 * texture), outlined in charcoal with the team color as an inner rule, the
 * clinic's logo inside or a slab monogram when there is none, and the town
 * set small along the top edge. This is the one place the template draws a
 * baseball object, and it is the object that is literally the word "home".
 */
export default function HomePlate({
  name,
  place,
  logoUrl,
  size = 340,
}: {
  name: string
  place: string | null
  logoUrl: string | null
  size?: number
}) {
  const initials = nameInitials(name)
  return (
    <div className="relative mx-auto" style={{ width: size, maxWidth: '100%', aspectRatio: '1 / 1' }} aria-hidden="true">
      <svg viewBox="0 0 320 320" className="w-full h-full">
        {/* The plate: 17 units wide in the rulebook; drawn as a square top and a pointed bottom. */}
        <path
          d="M36 40 H284 V190 L160 296 L36 190 Z"
          fill="var(--c-surface, #FDFDFB)"
          stroke="var(--c-deep, #1F2327)"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M54 58 H266 V182 L160 272 L54 182 Z"
          fill="none"
          stroke="var(--c-strip, #40C0E0)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* The town, set along the top edge */}
        <text
          x="160"
          y="84"
          textAnchor="middle"
          fill="var(--c-ink-muted, #5F6670)"
          fontSize="12"
          fontWeight={700}
          letterSpacing="4"
          style={{ fontFamily: 'var(--font-score, sans-serif)' }}
        >
          {(place ?? 'HOME').toUpperCase()}
        </text>
        {!logoUrl && (
          <text
            x="160"
            y="196"
            textAnchor="middle"
            fill="var(--c-heading, #2A2E33)"
            fontSize={initials.length > 1 ? 88 : 104}
            fontWeight={700}
            style={{ fontFamily: 'var(--font-display, serif)' }}
          >
            {initials || '·'}
          </text>
        )}
      </svg>
      {logoUrl && (
        <span
          className="absolute flex items-center justify-center"
          style={{ left: '50%', top: '47%', width: '58%', height: '34%', transform: 'translate(-50%, -50%)' }}
        >
          <SiteImage displayWidth={Math.round(size * 0.58)} src={logoUrl} alt="" className="max-w-full max-h-full object-contain" />
        </span>
      )}
    </div>
  )
}
