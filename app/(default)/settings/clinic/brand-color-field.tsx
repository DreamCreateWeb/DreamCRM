'use client'

import { useState } from 'react'

/**
 * Brand-color control for the Branding section. Replaces the raw hex text input
 * with a real color picker: a native `<input type="color">` swatch, a hex text
 * field kept in sync with it, and a live preview chip.
 *
 * It persists EXACTLY the same value the old text input did — a hex string like
 * `#9CAF9F` — in a hidden input under `name`, so `updateClinicProfile`
 * (`clean('brandColor', …)`) reads it unchanged (blank → null → the public site
 * falls back to its default accent). The visible controls are presentational;
 * the hidden input is the single source of truth for the mega-form Save.
 */

const HEX = /^#([0-9a-fA-F]{6})$/
const SHORT_HEX = /^#([0-9a-fA-F]{3})$/

/** Normalize user input to a `#rrggbb` string, or null if it isn't a valid hex.
 *  Accepts `abc`, `#abc`, `aabbcc`, `#aabbcc` (case-insensitive). */
function normalizeHex(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const withHash = v.startsWith('#') ? v : `#${v}`
  if (HEX.test(withHash)) return withHash.toLowerCase()
  const short = SHORT_HEX.exec(withHash)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return null
}

export default function BrandColorField({
  name,
  defaultValue,
}: {
  name: string
  defaultValue: string | null
}) {
  const initialNorm = normalizeHex(defaultValue ?? '')
  // `text` is what the user sees in the hex field (may be mid-edit / invalid);
  // `color` is the last VALID hex, driving the native picker + preview + the
  // persisted hidden value. Blank text → no color set (persist empty string).
  const [text, setText] = useState(initialNorm ?? defaultValue ?? '')
  const [color, setColor] = useState<string>(initialNorm ?? '#2a7f8c')

  const norm = normalizeHex(text)
  // Persist the normalized valid hex; a blank field persists '' (→ null server-
  // side); an invalid partial persists nothing new (keeps the last good value so
  // a mid-typing Save can't wipe the color).
  const persisted = text.trim() === '' ? '' : norm ?? initialNorm ?? ''
  const invalid = text.trim() !== '' && norm === null

  return (
    <div>
      <input type="hidden" name={name} value={persisted} />
      <div className="flex items-center gap-3">
        {/* Native color swatch — clicking opens the OS color picker. */}
        <label className="relative inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ backgroundColor: norm ?? color }}
          />
          <input
            type="color"
            aria-label="Pick brand color"
            value={norm ?? color}
            onChange={(e) => {
              setColor(e.target.value)
              setText(e.target.value)
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        {/* Hex text field kept in sync with the swatch. */}
        <div>
          <input
            type="text"
            inputMode="text"
            value={text}
            onChange={(e) => {
              const v = e.target.value
              setText(v)
              const n = normalizeHex(v)
              if (n) setColor(n)
            }}
            onBlur={() => {
              // Snap a valid-but-unnormalized entry ("ABC", "9caf9f") to #rrggbb.
              const n = normalizeHex(text)
              if (n) setText(n)
            }}
            placeholder="#2a7f8c"
            aria-invalid={invalid}
            className={`form-input w-32 font-mono-num ${invalid ? 'border-rose-400 dark:border-rose-500' : ''}`}
          />
          {invalid && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
              Enter a 6-digit hex like #2a7f8c.
            </p>
          )}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[16rem]">
          Used as the accent color across your clinic website. Leave blank for our
          default.
        </span>
      </div>
    </div>
  )
}
