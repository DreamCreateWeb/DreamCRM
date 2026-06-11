import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ActionButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  // The ONE primary action per surface — brand TEAL, nothing else competes.
  // Dark: the teal-400 aqua + ink-900 text keeps contrast on the navy world.
  primary:
    'bg-teal-500 hover:bg-teal-600 text-white dark:bg-teal-400 dark:hover:bg-teal-300 dark:text-gray-900',
  secondary:
    'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  ghost:
    'border-transparent shadow-none text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300',
}

/**
 * Ambient-breath skin — a subtle teal gradient that the `.breath` keyframes
 * drift across (~6s, compositor-only). Reserved for the page's SINGLE primary
 * (PageHeader sets `breath` on its primary action). Reduced-motion stills it.
 */
const BREATH_CLASSES =
  'breath bg-gradient-to-r from-teal-500 via-teal-600 to-teal-500 hover:from-teal-600 hover:to-teal-600 text-white dark:from-teal-400 dark:via-teal-300 dark:to-teal-400 dark:text-gray-900'

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
  return (
    <button type="button" {...rest} className={classes}>
      {children}
    </button>
  )
}
