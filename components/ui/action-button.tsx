import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ActionButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  // The ONE primary action per surface — brand violet, nothing else competes.
  primary: 'bg-violet-600 hover:bg-violet-700 text-white',
  secondary:
    'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  ghost:
    'border-transparent shadow-none text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300',
}

const SIZE_CLASSES = { sm: 'btn-sm', md: 'btn' } as const

/**
 * Standard dashboard button. Renders a <Link> when `href` is set, otherwise
 * a <button>. Exactly one `primary` per surface (page header, drawer,
 * modal); everything else is secondary/ghost; destructive actions are
 * `danger` and never sit adjacent to the primary.
 */
export function ActionButton({
  variant = 'secondary',
  size = 'md',
  href,
  target,
  rel,
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
  className?: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = `${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} disabled:opacity-60 disabled:pointer-events-none ${className}`

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
