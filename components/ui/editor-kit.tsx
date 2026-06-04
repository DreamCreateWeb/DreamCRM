'use client'

import { useState, type KeyboardEvent, type ReactNode } from 'react'

/**
 * Shared UI primitives for the Website Studio section editors, so every modal
 * reads the same: labelled fields, card-per-item repeaters with tidy reorder /
 * remove controls, dashed add buttons, and friendly empty states.
 */

/** Standard input class strings — keep every editor's fields visually identical. */
export const inputCls =
  'w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/15 dark:focus:ring-stone-100/20 focus:border-stone-400 transition'
export const textareaCls = `${inputCls} resize-y leading-relaxed`
export const selectCls =
  'rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-900/15 focus:border-stone-400 transition'

/** A labelled field wrapper. */
export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label?: string
  hint?: string
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-[12px] font-medium text-stone-600 dark:text-stone-300 mb-1"
        >
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1">{hint}</p>}
    </div>
  )
}

function Ctrl({
  onClick,
  disabled,
  label,
  danger,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-7 h-7 inline-flex items-center justify-center rounded-md transition disabled:opacity-25 disabled:cursor-default ${
        danger
          ? 'text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/25'
          : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-700/60'
      }`}
    >
      {children}
    </button>
  )
}

const stroke = { fill: 'none', viewBox: '0 0 20 20', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

/**
 * A repeater item card: a soft panel with a header row (label + reorder + remove)
 * over a stack of fields.
 */
export function EditorCard({
  label,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  onRemove,
  headerExtra,
  children,
}: {
  label?: ReactNode
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  onRemove?: () => void
  headerExtra?: ReactNode
  children: ReactNode
}) {
  const hasControls = onMoveUp || onMoveDown || onRemove
  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-700/70 bg-stone-50/70 dark:bg-stone-800/40 p-4">
      {(label || headerExtra || hasControls) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {label && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                {label}
              </span>
            )}
            {headerExtra}
          </div>
          {hasControls && (
            <div className="flex items-center gap-0.5 shrink-0">
              {onMoveUp && (
                <Ctrl onClick={onMoveUp} disabled={!canMoveUp} label="Move up">
                  <svg className="w-4 h-4" {...stroke}>
                    <path d="M5 12.5L10 7.5l5 5" />
                  </svg>
                </Ctrl>
              )}
              {onMoveDown && (
                <Ctrl onClick={onMoveDown} disabled={!canMoveDown} label="Move down">
                  <svg className="w-4 h-4" {...stroke}>
                    <path d="M5 7.5L10 12.5l5-5" />
                  </svg>
                </Ctrl>
              )}
              {onRemove && (
                <Ctrl onClick={onRemove} label="Remove" danger>
                  <svg className="w-4 h-4" {...stroke}>
                    <path d="M5.5 6.5h9M8 6.5V5h4v1.5M6.5 6.5l.5 8h6l.5-8" />
                  </svg>
                </Ctrl>
              )}
            </div>
          )}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </div>
  )
}

/** Full-width dashed "add another" button. */
export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 dark:border-stone-600 py-2.5 text-[13px] font-semibold text-stone-500 dark:text-stone-400 hover:border-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition"
    >
      <svg className="w-4 h-4" {...stroke}>
        <path d="M10 5v10M5 10h10" />
      </svg>
      {children}
    </button>
  )
}

/** Friendly empty state inside a dashed panel. */
export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-5 text-center text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
      {children}
    </div>
  )
}

/**
 * Chip / tag input for editing a list of short strings (insurance carriers,
 * "why us" highlights, payment methods). Type + Enter (or comma) to add a chip,
 * × to remove, Backspace on an empty field removes the last. Serialises to a
 * hidden input as newline-joined text so it round-trips through the existing
 * `parseStringList` save paths unchanged.
 */
export function TagListEditor({
  name,
  defaultValue,
  placeholder,
  addLabel = 'Add another…',
}: {
  name: string
  defaultValue?: string[] | null
  placeholder?: string
  addLabel?: string
}) {
  const [items, setItems] = useState<string[]>(defaultValue ?? [])
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) {
      setDraft('')
      return
    }
    setItems((prev) => {
      const next = [...prev]
      for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p)
      return next
    })
    setDraft('')
  }
  function remove(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i))
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && items.length > 0) {
      remove(items.length - 1)
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={items.join('\n')} />
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 p-2 focus-within:ring-2 focus-within:ring-stone-900/15 dark:focus-within:ring-stone-100/20 focus-within:border-stone-400 transition">
        {items.map((it, i) => (
          <span
            key={`${it}-${i}`}
            className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-700 pl-2.5 pr-1.5 py-1 text-[13px] font-medium text-stone-700 dark:text-stone-200"
          >
            {it}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-stone-400 hover:text-rose-600 transition"
              aria-label={`Remove ${it}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
                <path d="M6 6l8 8M14 6l-8 8" />
              </svg>
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={items.length === 0 ? placeholder : addLabel}
          className="flex-1 min-w-[140px] bg-transparent text-sm px-1.5 py-1 focus:outline-none text-stone-900 dark:text-stone-100 placeholder-stone-400"
        />
      </div>
      <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-1.5">
        Type and press Enter to add. Click × to remove.
      </p>
    </div>
  )
}
