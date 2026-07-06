import Link from 'next/link'

/**
 * Presentational primitives for the patient portal — warm-neutral cards,
 * serif display headings, pills, empty states. Server-component friendly
 * (no hooks); pages compose these with their own actions.
 */

export const PORTAL_INK = '#1C1A17'
export const PORTAL_MUTED = '#6B635A'
export const PORTAL_BORDER = '#E8E2D9'
export const PORTAL_BG = '#FAF7F2'

export function PortalCard({
  children,
  className = '',
  accent,
}: {
  children: React.ReactNode
  className?: string
  /** Optional left accent bar color (e.g. brand for the next-visit card). */
  accent?: string
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 sm:p-6 ${className}`}
      style={{
        border: `1px solid ${PORTAL_BORDER}`,
        boxShadow: '0 1px 2px rgba(28, 26, 23, 0.04)',
        ...(accent ? { borderLeft: `4px solid ${accent}` } : {}),
      }}
    >
      {children}
    </div>
  )
}

/** Fraunces display heading, brand-colorable. */
export function PortalHeading({
  children,
  color = PORTAL_INK,
  as: Tag = 'h1',
  className = '',
}: {
  children: React.ReactNode
  color?: string
  as?: 'h1' | 'h2' | 'h3'
  className?: string
}) {
  const size =
    Tag === 'h1' ? 'text-[1.9rem] sm:text-[2.2rem]' : Tag === 'h2' ? 'text-[1.35rem]' : 'text-[1.1rem]'
  return (
    <Tag
      className={`font-semibold leading-tight tracking-tight ${size} ${className}`}
      style={{ fontFamily: 'var(--font-display)', color }}
    >
      {children}
    </Tag>
  )
}

export function PortalSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-2.5 text-[0.78rem] font-bold uppercase tracking-[0.12em]"
      style={{ color: PORTAL_MUTED }}
    >
      {children}
    </p>
  )
}

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  confirmed: { bg: '#E5EFE6', fg: '#2F6B3C', label: 'Confirmed' },
  scheduled: { bg: '#FBF3E4', fg: '#8A6116', label: 'Scheduled' },
  completed: { bg: '#EDEAE4', fg: '#6B635A', label: 'Completed' },
  cancelled: { bg: '#F7E9E6', fg: '#9B4434', label: 'Cancelled' },
  no_show: { bg: '#F7E9E6', fg: '#9B4434', label: 'Missed' },
}

export function VisitStatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.scheduled
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[0.78rem] font-semibold"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  )
}

/** Round provider portrait with initials fallback — real faces build trust. */
export function ProviderFace({
  name,
  photoUrl,
  brand,
  size = 44,
}: {
  name: string | null
  photoUrl: string | null
  brand: string
  size?: number
}) {
  if (!name) return null
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  const initials = name
    .replace(/^Dr\.?\s+/i, '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: brand,
        fontSize: size * 0.36,
        fontFamily: 'var(--font-display)',
      }}
    >
      {initials}
    </span>
  )
}

export function PortalEmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
  brand,
}: {
  title: string
  body?: string
  ctaHref?: string
  ctaLabel?: string
  brand?: string
}) {
  return (
    <div className="py-10 text-center">
      <p className="text-[1.05rem] font-semibold" style={{ color: PORTAL_INK }}>
        {title}
      </p>
      {body && (
        <p className="mx-auto mt-1.5 max-w-sm text-[0.9rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
          {body}
        </p>
      )}
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-5 inline-block rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white"
          style={{ backgroundColor: brand ?? '#9CAF9F' }}
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}

/** Pill-shaped primary action — brand fill. */
export function BrandButton({
  children,
  brand,
  href,
  type = 'button',
  small = false,
}: {
  children: React.ReactNode
  brand: string
  href?: string
  type?: 'button' | 'submit'
  small?: boolean
}) {
  const cls = `inline-flex items-center justify-center rounded-full font-semibold text-white ${
    small ? 'px-4 py-2 text-[0.82rem]' : 'px-5 py-2.5 text-[0.9rem]'
  }`
  if (href) {
    return (
      <Link href={href} className={cls} style={{ backgroundColor: brand }}>
        {children}
      </Link>
    )
  }
  return (
    <button type={type} className={cls} style={{ backgroundColor: brand }}>
      {children}
    </button>
  )
}

/** Quiet secondary action — white pill with warm border. */
export function QuietButton({
  children,
  href,
  type = 'button',
  small = false,
}: {
  children: React.ReactNode
  href?: string
  type?: 'button' | 'submit'
  small?: boolean
}) {
  const cls = `inline-flex items-center justify-center rounded-full bg-white font-semibold ${
    small ? 'px-4 py-2 text-[0.82rem]' : 'px-5 py-2.5 text-[0.9rem]'
  }`
  const style = { border: `1px solid ${PORTAL_BORDER}`, color: PORTAL_INK }
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {children}
      </Link>
    )
  }
  return (
    <button type={type} className={cls} style={style}>
      {children}
    </button>
  )
}
