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

// Semantic tones — meaning-first names so "what error looks like" is decided
// HERE, once. Raw hexes for these meanings are banned outside this file
// (tests/a11y/portal-tokens.test.ts).
export const PORTAL_ERROR = '#B4231F'
export const PORTAL_WARN_BG = '#FBF3E4'
export const PORTAL_WARN_INK = '#8A6116'
export const PORTAL_SUCCESS_BG = '#E5EFE6'
export const PORTAL_SUCCESS_INK = '#2F6B3C'
export const PORTAL_DANGER_BG = '#F7E9E6'
export const PORTAL_DANGER_INK = '#9B4434'

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
  confirmed: { bg: PORTAL_SUCCESS_BG, fg: PORTAL_SUCCESS_INK, label: 'Confirmed' },
  scheduled: { bg: PORTAL_WARN_BG, fg: PORTAL_WARN_INK, label: 'Scheduled' },
  completed: { bg: '#EDEAE4', fg: PORTAL_MUTED, label: 'Completed' },
  cancelled: { bg: PORTAL_DANGER_BG, fg: PORTAL_DANGER_INK, label: 'Cancelled' },
  no_show: { bg: PORTAL_DANGER_BG, fg: PORTAL_DANGER_INK, label: 'Missed' },
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

/** Pill-shaped primary action — brand fill. Works from server pages (href)
 *  AND client components (onClick/disabled) so nobody hand-rolls the pill. */
export function BrandButton({
  children,
  brand,
  href,
  type = 'button',
  small = false,
  onClick,
  disabled,
  className = '',
}: {
  children: React.ReactNode
  brand: string
  href?: string
  type?: 'button' | 'submit'
  small?: boolean
  onClick?: () => void
  disabled?: boolean
  className?: string
}) {
  const cls = `inline-flex items-center justify-center rounded-full font-semibold text-white transition disabled:opacity-50 ${
    small ? 'px-4 py-2 text-[0.82rem]' : 'px-5 py-2.5 text-[0.9rem]'
  } ${className}`
  if (href) {
    return (
      <Link href={href} className={cls} style={{ backgroundColor: brand }}>
        {children}
      </Link>
    )
  }
  return (
    <button type={type} className={cls} style={{ backgroundColor: brand }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/** Bare text action — the "Cancel"/"Never mind" third tier. */
export function GhostButton({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[0.85rem] font-medium ${className}`}
      style={{ color: PORTAL_MUTED }}
    >
      {children}
    </button>
  )
}

/** The error line under a failed action — one voice, one color, role=alert. */
export function PortalErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p className="mt-2 text-[0.82rem] font-medium" style={{ color: PORTAL_ERROR }} role="alert">
      {children}
    </p>
  )
}

/** Warm text input — the portal's one field recipe. */
export function PortalInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', style, ...rest } = props
  return (
    <input
      {...rest}
      className={`w-full rounded-2xl px-3.5 py-2.5 text-[0.92rem] outline-none ${className}`}
      style={{ border: `1px solid ${PORTAL_BORDER}`, color: PORTAL_INK, backgroundColor: '#FFFFFF', ...style }}
    />
  )
}

/** Warm textarea — same recipe as PortalInput. */
export function PortalTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', style, ...rest } = props
  return (
    <textarea
      {...rest}
      className={`w-full rounded-2xl px-3.5 py-2.5 text-[0.92rem] outline-none ${className}`}
      style={{ border: `1px solid ${PORTAL_BORDER}`, color: PORTAL_INK, backgroundColor: '#FFFFFF', ...style }}
    />
  )
}

/** Tinted notice block — success (green) or attention (amber), one recipe. */
export function PortalNotice({
  tone,
  children,
  className = '',
}: {
  tone: 'success' | 'warn'
  children: React.ReactNode
  className?: string
}) {
  const bg = tone === 'success' ? PORTAL_SUCCESS_BG : PORTAL_WARN_BG
  const ink = tone === 'success' ? PORTAL_SUCCESS_INK : PORTAL_WARN_INK
  return (
    <div className={`rounded-2xl px-4 py-3.5 text-[0.9rem] font-medium ${className}`} style={{ backgroundColor: bg, color: ink }}>
      {children}
    </div>
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

/** The portal's ONE back-to-parent affordance for sub-pages (visit detail,
 *  receipt, …) — brand-colored chevron + parent label. Both existing
 *  sub-pages used to hand-roll different styles; new sub-pages use this. */
export function PortalBackLink({
  href,
  label,
  brand,
}: {
  href: string
  label: string
  brand: string
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 text-[0.88rem] font-semibold"
      style={{ color: brand }}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 3.5 5.5 8l4.5 4.5" />
      </svg>
      {label}
    </a>
  )
}
