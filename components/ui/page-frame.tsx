import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/ui/page-header'

/**
 * THE page frame — one outer wrapper + one header for every module page under
 * `app/(default)` (settings excepted until ML-55 lands).
 *
 * What it owns, so no page hand-rolls it:
 *  - the gutters: 16px on a phone, 24px from `sm`, 32px from `lg`, never wider
 *    than the page's content `width` (a token, not a class a page can typo);
 *  - the Orientation law as code: a TOP-LEVEL page passes `group` +
 *    `clinicName` and gets the `<Group> · <clinic name>` eyebrow; a workspace
 *    SUB-PAGE passes `hub` and gets its way back (`‹ Hub`) instead. A page with
 *    its own fixed eyebrow string (the platform tenant's) passes `eyebrow`;
 *  - the header (title scale, subtitle, `actions`, `legend`) via PageHeader;
 *  - the `pulse` slot (ML-37's PagePulse) directly under the header.
 *
 * The `<main>` landmark belongs to DashboardShell — a second one here would
 * break "one <main> per page", so the frame is a plain `<div>`.
 */
export const PAGE_FRAME_WIDTHS = {
  wide: 'max-w-[96rem]',
  '80rem': 'max-w-[80rem]',
  '1100': 'max-w-[1100px]',
  '6xl': 'max-w-6xl',
  '5xl': 'max-w-5xl',
  '4xl': 'max-w-4xl',
  '3xl': 'max-w-3xl',
  '2xl': 'max-w-2xl',
} as const

export type PageFrameWidth = keyof typeof PAGE_FRAME_WIDTHS

/** The one eyebrow rule: a way back wins, then group · clinic, then a literal. */
export function frameEyebrow({
  group,
  clinicName,
  hub,
  eyebrow,
}: {
  group?: string
  clinicName?: string | null
  hub?: { href: string; label: string }
  eyebrow?: ReactNode
}): ReactNode {
  if (hub) {
    return (
      <Link href={hub.href} className="hover:underline underline-offset-4">
        ‹ {hub.label}
      </Link>
    )
  }
  if (group) return clinicName ? `${group} · ${clinicName}` : group
  return eyebrow
}

export function PageFrame({
  width = 'wide',
  group,
  clinicName,
  hub,
  eyebrow,
  title,
  subtitle,
  actions,
  legend,
  aura,
  back,
  before,
  pulse,
  headerClassName,
  className = '',
  children,
}: {
  width?: PageFrameWidth
  /** Top-level pages: the sidebar group, e.g. "Daily". */
  group?: string
  clinicName?: string | null
  /** Workspace sub-pages: the hub they hang off — renders the way back. */
  hub?: { href: string; label: string }
  /** A fixed eyebrow (platform tenant strings); `group`/`hub` win over it. */
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  legend?: ReactNode
  aura?: boolean
  /** A way back ABOVE the header (a detail page's "All X" link). */
  back?: { href: string; label: string }
  /** Passed to the PageHeader root (e.g. `no-print`). */
  headerClassName?: string
  /** Page furniture that sits ABOVE the header (a ModuleHint, a banner). */
  before?: ReactNode
  /** PagePulse (ML-37) — sits directly under the header. */
  pulse?: ReactNode
  /** Spacing overrides for the rare page that needs them (padding only). */
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      data-page-frame=""
      className={`px-4 sm:px-6 lg:px-8 w-full ${PAGE_FRAME_WIDTHS[width]} mx-auto ${className || 'py-8'}`}
    >
      {before}
      {back && (
        <div className="mb-4">
          <Link
            href={back.href}
            className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {back.label}
          </Link>
        </div>
      )}
      <PageHeader
        eyebrow={frameEyebrow({ group, clinicName, hub, eyebrow })}
        title={title}
        subtitle={subtitle}
        actions={actions}
        legend={legend}
        aura={aura}
        className={headerClassName}
      />
      {pulse}
      {children}
    </div>
  )
}
