'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Emoji drawer — a v3 composer-widget affordance (no third-party picker
 * library; a curated grid is faster, smaller, and never drifts off-brand).
 * Renders the 😊 toolbar button; the drawer opens above/below it, inserts
 * via `onPick`, and closes on Esc, outside click, or pick (multi-pick when
 * the user holds the drawer open — we close per pick for calm, Hootsuite
 * keeps it open; front desks compose short posts, one-at-a-time wins).
 *
 * Curation: warm, practice-appropriate sets (incl. the dental corner 🦷).
 * Buttons are real <button>s with the emoji as accessible name context via
 * aria-label on the group; each emoji is its own label (screen readers read
 * the character).
 */
const EMOJI_SETS: Array<{ label: string; emojis: string[] }> = [
  {
    label: 'Smiles',
    emojis: ['😀', '😁', '😄', '😊', '🙂', '😉', '😍', '🥰', '😎', '🤗', '😌', '🤩', '🥳', '😇', '🙌', '😅'],
  },
  {
    label: 'Care',
    emojis: ['🦷', '😁', '✨', '🪥', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🏥', '💙', '🤍', '🫧', '💧', '🍎', '🥗', '💪', '🌟'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️', '💙', '💚', '💛', '🧡', '💜', '🤍', '💖', '💕', '💗', '💓', '💝'],
  },
  {
    label: 'Hands',
    emojis: ['👍', '👏', '🙏', '🤝', '✌️', '🤞', '👋', '💪', '🫶', '👌'],
  },
  {
    label: 'Celebrate',
    emojis: ['🎉', '🎊', '🥳', '🎈', '🎁', '🏆', '⭐', '🌟', '✨', '💫', '🔥', '🎂'],
  },
  {
    label: 'Handy',
    emojis: ['📅', '🕐', '📍', '📞', '💬', '📣', '☀️', '🌈', '🌸', '🍀', '⏰', '✅', '❗', '❓', '➡️', '🆕'],
  },
]

export function EmojiPicker({
  onPick,
  className = '',
  direction = 'up',
}: {
  /** Called with the picked emoji character. */
  onPick: (emoji: string) => void
  className?: string
  /** Which way the drawer opens — 'up' for bottom toolbars (default),
   *  'down' for toolbars that sit at the top of their card. */
  direction?: 'up' | 'down'
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Add an emoji"
        title="Add an emoji"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[17px] leading-none transition hover:bg-[color:var(--color-surface-sunk)] ${
          open ? 'bg-[color:var(--color-surface-sunk)]' : ''
        }`}
      >
        <span aria-hidden="true">😊</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Emoji picker"
          className={`pop-in absolute left-0 z-30 w-72 rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-3 shadow-[var(--shadow-pop)] ${
            direction === 'up' ? 'bottom-10 origin-bottom-left' : 'top-10 origin-top-left'
          }`}
        >
          <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
            {EMOJI_SETS.map((set) => (
              <div key={set.label}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {set.label}
                </p>
                <div role="group" aria-label={set.label} className="grid grid-cols-8 gap-0.5">
                  {set.emojis.map((e, i) => (
                    <button
                      key={`${set.label}-${i}`}
                      type="button"
                      onClick={() => {
                        onPick(e)
                        setOpen(false)
                      }}
                      aria-label={e}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[17px] leading-none transition hover:bg-[color:var(--color-surface-sunk)]"
                    >
                      <span aria-hidden="true">{e}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
