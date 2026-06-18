'use client'

/**
 * The one canonical on/off switch for the dashboard. Replaces the several
 * hand-rolled `role="switch"` buttons that had drifted across Settings
 * (reminders, notifications, portal, practice). Controlled.
 *
 * Teal-on is identity (selection), per the v2 design system — a toggle's ON
 * state is the one sanctioned non-status use of the brand ramp.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  srLabel,
  id,
  size = 'md',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** Accessible name when there's no associated visible <label>. */
  srLabel?: string
  id?: string
  size?: 'sm' | 'md'
}) {
  const d =
    size === 'sm'
      ? { track: 'h-5 w-9', knob: 'h-4 w-4', on: 'translate-x-4', off: 'translate-x-0.5' }
      : { track: 'h-6 w-11', knob: 'h-5 w-5', on: 'translate-x-5', off: 'translate-x-0.5' }
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={srLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${d.track} shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block ${d.knob} transform rounded-full bg-white shadow transition-transform ${
          checked ? d.on : d.off
        }`}
      />
    </button>
  )
}

export default Toggle
