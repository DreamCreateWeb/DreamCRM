import type { ComponentProps, ReactNode } from 'react'

/**
 * THE shared form fields (ML-55b) — replace the Mosaic input, select,
 * textarea, checkbox and radio classes (the legacy form-prefixed set).
 *
 *  - text controls are a 40px box (the floor), `--r-sm`, the ink ramp for the
 *    value (a bare `text-ink-900` is right in both themes), the teal focus ring;
 *  - a checkbox / radio is selection ink (teal), 16px glyph — wrap it in a
 *    <label> so the hit target is the whole row;
 *  - `Field` is the label + helper + error row around any of them.
 *
 * The on/off switch is `Toggle` (components/ui/toggle.tsx — a real
 * `role="switch"`). Callers add layout only (`w-full`, `mt-1`, widths); a
 * caller class lands LAST so an invalid border (`border-rose-400`) wins.
 */
export const FIELD_BOX_CLASSES =
  'min-h-10 rounded-[var(--r-sm)] border border-gray-200 bg-white px-3 py-2 text-sm leading-5 text-ink-900 placeholder:text-ink-500 hover:border-gray-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700/60 dark:bg-gray-900/30 dark:hover:border-gray-600 dark:disabled:border-gray-700 dark:disabled:bg-gray-700/30'

const CHECK =
  'h-4 w-4 shrink-0 border border-gray-300 bg-white focus:ring-0 focus:ring-offset-0 focus-visible:ring-2 focus-visible:ring-teal-500/50 checked:border-transparent checked:bg-teal-500 disabled:opacity-60 dark:border-gray-700/60 dark:bg-gray-900/30 dark:checked:border-transparent'

export function TextInput({ className = '', ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={`${FIELD_BOX_CLASSES} ${className}`} />
}

export function Select({ className = '', ...rest }: ComponentProps<'select'>) {
  return <select {...rest} className={`${FIELD_BOX_CLASSES} pr-10 ${className}`} />
}

export function Textarea({ className = '', ...rest }: ComponentProps<'textarea'>) {
  return <textarea {...rest} className={`${FIELD_BOX_CLASSES} ${className}`} />
}

export function Checkbox({ className = '', ...rest }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input {...rest} type="checkbox" className={`${CHECK} rounded-sm ${className}`} />
}

export function Radio({ className = '', ...rest }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input {...rest} type="radio" className={`${CHECK} rounded-full ${className}`} />
}

/** Label + control + helper/error. Pass the control as children. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className = '',
  children,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-ink-600">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
