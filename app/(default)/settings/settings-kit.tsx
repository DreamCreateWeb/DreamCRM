import type { ReactNode } from 'react'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Shared building blocks for the Settings surface, so every page reads + saves
 * the same way instead of each one hand-rolling its own header, section card,
 * and label/control row. Pure presentational (no hooks) → usable from both the
 * server page shells and the client panels.
 */

/** Per-page header. Pairs the page title with a surface eyebrow ("Clinic
 *  settings" / "Account"). Aura off — Settings headers sit inside a panel. */
export function SettingsHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      actions={actions}
      aura={false}
    />
  )
}

/** A titled settings block — an etched v2 card with a heading, optional helper
 *  text, an optional right-aligned action, then the body. The consistent unit
 *  every panel is built from. */
export function SettingsSection({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`v2-card p-5 ${className}`}>
      {(title || description || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400 max-w-prose">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** A single setting: label + helper on the left, control on the right (the
 *  Stripe/Linear settings row). Stacks on the narrowest screens. */
export function SettingsRow({
  label,
  htmlFor,
  description,
  control,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  description?: ReactNode
  /** The control (toggle / select / input). Alias: pass it as `children`. */
  control?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-gray-100 dark:border-gray-700/50 py-3.5 first:border-t-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-gray-800 dark:text-gray-100"
        >
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400 max-w-prose">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0 sm:pt-0.5">{control ?? children}</div>
    </div>
  )
}
