import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ActionButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  // The ONE primary action per surface — the dream-blue gradient bubble,
  // nothing else competes. White text holds contrast in BOTH themes (the
  // fill stays a saturated blue gradient at night; it just glows more).
  primary:
    'bg-gradient-to-br from-teal-400 to-teal-600 hover:from-teal-500 hover:to-teal-600 text-white shadow-[0_8px_20px_rgb(76_125_240_/_0.35)] hover:shadow-[0_10px_26px_rgb(76_125_240_/_0.45)]',
  secondary:
    'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  ghost:
    'border-transparent shadow-none text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300',
}

/**
 * Ambient-breath skin — a subtle dream-blue gradient that the `.breath`
 * keyframes drift across (~6s, compositor-only). Reserved for the page's
 * SINGLE primary (PageHeader sets `breath` on its primary action).
 * Reduced-motion stills it.
 */
const BREATH_CLASSES =
  'breath bg-gradient-to-r from-teal-400 via-teal-600 to-teal-400 text-white shadow-[0_8px_20px_rgb(76_125_240_/_0.35)] hover:shadow-[0_10px_26px_rgb(76_125_240_/_0.45)]'

const SIZE_CLASSES = { sm: 'btn-sm', md: 'btn' } as const

/**
 * Standard dashboard button. Renders a <Link> when `href` is set, otherwise
 * a <button>. Exactly one `primary` per surface (page header, drawer,
 * modal); everything else is secondary/ghost; destructive actions are
 * `danger` and never sit adjacent to the primary.
 *
 * `breath` adds the ambient-gradient drift — pass it ONLY on the page's one
 * true primary (PageHeader does this for you). It applies to the `primary`
 * variant; ignored elsewhere.
 */
export function ActionButton({
  variant = 'secondary',
  size = 'md',
  pending = false,
  href,
  target,
  rel,
  breath = false,
  className = '',
  children,
  ...rest
}: {
  variant?: ActionButtonVariant
  size?: 'sm' | 'md'
  /** Busy state: disables the button, announces aria-busy, and overlays a
   *  small spinner while KEEPING the label (at opacity-0) so the button's
   *  width never jumps mid-action. Prefer this over hand-rolled
   *  `{pending ? 'Sending…' : …}` ternaries — the feedback belongs in the
   *  primitive, and buttons whose authors forgot the ternary get it free. */
  pending?: boolean
  href?: string
  /** Link-only: pass '_blank' for new-tab links (rel defaults safely). */
  target?: string
  rel?: string
  /** Ambient gradient drift — only on the page's single primary action. */
  breath?: boolean
  className?: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const variantClasses =
    breath && variant === 'primary' ? BREATH_CLASSES : VARIANT_CLASSES[variant]
  const classes = `${SIZE_CLASSES[size]} ${variantClasses} disabled:opacity-60 disabled:pointer-events-none ${className}`

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        title={rest.title}
        target={target}
        rel={rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)}
      >
        {children}
      </Link>
    )
  }
  if (pending) {
    return (
      <button
        type="button"
        {...rest}
        disabled
        aria-busy="true"
        className={`relative ${classes}`}
      >
        {/* Label stays in the layout (invisible) so width doesn't jump. */}
        <span className="opacity-0" aria-hidden>
          {children}
        </span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="btn-spinner" aria-hidden />
          <span className="sr-only">Working…</span>
        </span>
      </button>
    )
  }
  return (
    <button type="button" {...rest} className={classes}>
      {children}
    </button>
  )
}
