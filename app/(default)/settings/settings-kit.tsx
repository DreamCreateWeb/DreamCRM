import type { ReactNode } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Shared building blocks for the Settings surface, so every page reads + saves
 * the same way instead of each one hand-rolling its own header, section card,
 * and label/control row. Pure presentational (no hooks) → usable from both the
 * server page shells and the client panels.
 */

/**
 * The standard shell for a focused settings page: a calm `PageHeader` (aura OFF
 * — settings are data surfaces, the one brand moment lives on the Settings home)
 * above one consistent `.v2-panel`. The eyebrow is the ONE consistent way back
 * to the Settings home — a "‹ Settings" link every page inherits — so there's no
 * cross-page rail to carry (the `/settings` home IS the cross-page navigation).
 */
export function SettingsPage({
  backLabel = 'Settings',
  title,
  subtitle,
  actions,
  padded = false,
  panel = true,
  children,
}: {
  /** Label for the back-to-home link (defaults to "Settings"). */
  backLabel?: string
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Add inner padding for pages that render form fields directly. Pages whose
   *  content is SettingsSection cards / SettingsTabs self-pad, so leave it off. */
  padded?: boolean
  /** When false, render children bare (for pages like Automated emails that lay
   *  out their own `.v2-card` grid and shouldn't sit inside one panel). */
  panel?: boolean
  children: ReactNode
}) {
  return (
    <>
      <PageHeader eyebrow={<BackToSettingsLink label={backLabel} />} title={title} subtitle={subtitle} actions={actions} aura={false} />
      {panel ? <div className={`v2-panel mb-8${padded ? ' p-6' : ''}`}>{children}</div> : children}
    </>
  )
}

/** The back-to-home affordance shared by every focused settings page. Rendered
 *  in the header's eyebrow slot (teal caps) so it reads as the section crumb AND
 *  the way back to `/settings` in one control. */
function BackToSettingsLink({ label }: { label: string }) {
  return (
    <Link
      href="/settings"
      className="group -ml-0.5 inline-flex items-center gap-1 rounded-[var(--r-sm)] px-0.5 hover:text-teal-800 dark:hover:text-teal-300 transition-colors"
    >
      <svg
        className="h-3 w-3 fill-current transition-transform group-hover:-translate-x-0.5"
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path d="M6.7 2.3a1 1 0 0 1 0 1.4L4.4 6H14a1 1 0 1 1 0 2H4.4l2.3 2.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0Z" />
      </svg>
      {label}
    </Link>
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
