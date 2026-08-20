'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * THE copy-to-clipboard chip — a mono-truncated value with a one-tap copy and
 * an inline "Copied ✓" confirmation that self-clears. Extracted because six
 * surfaces (share links, calendar feed, domain card, blog editor, prospecting)
 * each hand-rolled their own; new copyable values (intake fill URLs, packet
 * links) use this instead of printing un-selectable gray text.
 *
 * The VALUE is the button: tapping anywhere on the chip copies. Falls back to
 * a temporary <textarea> select when the async clipboard API is unavailable
 * (older WebViews, non-secure contexts).
 */
export function CopyChip({
  value,
  label,
  className = '',
}: {
  /** The exact string to copy (usually a URL). */
  value: string
  /** Accessible label; defaults to "Copy link". */
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const ta = document.createElement('textarea')
        ta.value = value
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      /* leave the chip as-is — the value is still visible to select by hand */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label ?? 'Copy link'}
      title={copied ? 'Copied' : (label ?? 'Copy link')}
      className={`group inline-flex max-w-full items-center gap-1.5 rounded-[var(--r-sm)] border border-[color:var(--color-hairline)] bg-[color:var(--color-surface-sunk)] px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:border-[color:var(--color-hairline-strong)] hover:text-gray-800 dark:hover:text-gray-100 transition-colors ${className}`}
    >
      <span className="font-mono truncate">{value}</span>
      <span
        aria-live="polite"
        className={`shrink-0 font-medium ${copied ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </span>
    </button>
  )
}
