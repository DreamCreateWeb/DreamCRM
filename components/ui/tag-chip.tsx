import { TAG_CHIP_CLASSES, type PatientTagColor } from '@/lib/types/patient-tags'

/**
 * A patient tag rendered as a small colored pill. Server-safe (no client hooks)
 * so it works in both the list rows and the detail editor. Pass `onRemove` to
 * show an inline ✕ (the editor uses it; read-only contexts omit it).
 */
export function TagChip({
  name,
  color,
  size = 'sm',
  onRemove,
  removeLabel,
}: {
  name: string
  color: PatientTagColor
  size?: 'xs' | 'sm'
  onRemove?: () => void
  removeLabel?: string
}) {
  const pad = size === 'xs' ? 'px-1.5 py-0 text-xs' : 'px-2 py-0.5 text-xs'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ring-1 ring-inset font-medium leading-tight ${pad} ${TAG_CHIP_CLASSES[color]}`}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${name} tag`}
          className="-mr-0.5 ml-0.5 rounded-full opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  )
}
