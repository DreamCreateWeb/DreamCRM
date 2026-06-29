import { DreamCreateMark } from '@/components/brand/dream-create-logo'

/**
 * Shared chrome for every auth surface (sign-in / sign-up / reset / accept-
 * invite). Replaces the old split-with-stock-photo layout: a single elevated
 * card floating on an ambient teal "aurora" — the brand's liquid-soul identity,
 * no photography. Fully responsive (centered column) and dark-mode aware.
 *
 * Pages pass their heading + form as `title`/`subtitle`/`children`; `footer`
 * renders the cross-link below the card. Omit `title`/`subtitle` (e.g. the
 * step-driven accept-invite flow) to let the children own the heading.
 */
export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow?: string
  title?: string
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <main className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden px-4 py-10 bg-[#EDF1F4] dark:bg-[#0a1020]">
      {/* Ambient teal aurora — the brand identity stands in for the photo. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-32 h-[30rem] w-[30rem] rounded-full opacity-60 blur-[90px]"
          style={{ background: 'radial-gradient(circle, rgba(86,213,203,0.45), transparent 70%)' }}
        />
        <div
          className="absolute top-1/4 -right-32 h-[34rem] w-[34rem] rounded-full opacity-50 blur-[100px]"
          style={{ background: 'radial-gradient(circle, rgba(31,110,126,0.40), transparent 70%)' }}
        />
        <div
          className="absolute -bottom-44 left-1/4 h-[28rem] w-[28rem] rounded-full opacity-40 blur-[90px]"
          style={{ background: 'radial-gradient(circle, rgba(51,169,174,0.38), transparent 70%)' }}
        />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand lockup */}
        <div className="flex flex-col items-center text-center mb-6">
          <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-white dark:bg-gray-900 shadow-[0_10px_30px_-8px_rgba(16,42,67,0.35)] ring-1 ring-black/[0.06] dark:ring-white/10">
            <DreamCreateMark size={34} />
          </span>
          <span className="mt-3 text-lg font-extrabold tracking-tight text-[#1A2140] dark:text-white">Dream Create</span>
        </div>

        {/* Card */}
        <div className="rounded-[1.4rem] bg-white/95 dark:bg-gray-900/90 backdrop-blur-sm ring-1 ring-black/[0.06] dark:ring-white/10 shadow-[0_24px_70px_-20px_rgba(16,42,67,0.30)] p-7 sm:p-9">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-400 mb-2">
              {eyebrow}
            </p>
          )}
          {title && <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">{title}</h1>}
          {subtitle && <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          <div className={title || subtitle ? 'mt-6' : ''}>{children}</div>
        </div>

        {footer && <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">{footer}</div>}
      </div>
    </main>
  )
}
