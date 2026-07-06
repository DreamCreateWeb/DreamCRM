'use client'

import { useState } from 'react'
import { saveBrandColor } from './website-actions'

// A curated dental-friendly starting set — every swatch runs through the same
// derived-palette + contrast machinery, so all of these land readable.
const PRESETS = [
  '#9CAF9F', // sage
  '#2F6D62', // teal
  '#3E5C50', // forest
  '#6B8FA3', // dusty blue
  '#23486B', // navy
  '#7B5E7B', // plum
  '#B36A4C', // terracotta
  '#C2A15A', // warm gold
]

/**
 * The Studio's brand-color control — the ONE lever the whole public-site
 * palette derives from, finally editable where the owner can SEE the result
 * (save → canvas reloads → every band/ink/accent re-derives). Previously
 * buried in Settings → Clinic.
 */
export default function BrandColorPopover({
  initial,
  onSaved,
}: {
  initial: string
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(initial)
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalized = /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim().toUpperCase() : null

  async function save() {
    if (!normalized || busy) return
    setBusy(true)
    setError(null)
    const res = await saveBrandColor(normalized)
    setBusy(false)
    if (res.ok) {
      setCurrent(normalized)
      setOpen(false)
      onSaved()
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          setValue(current)
          setError(null)
        }}
        aria-expanded={open}
        title="Brand color — your whole site's palette derives from this one color"
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
          open ? 'bg-gray-700 text-white' : 'text-gray-300 hover:text-white hover:bg-gray-800'
        }`}
      >
        <span
          aria-hidden="true"
          className="w-3.5 h-3.5 rounded-full ring-1 ring-white/30"
          style={{ backgroundColor: current }}
        />
        <span className="hidden lg:inline">Brand</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-gray-700 bg-gray-900 p-4 shadow-2xl z-20">
          <p className="text-sm font-semibold text-white mb-1">Brand color</p>
          <p className="text-xs text-gray-400 leading-relaxed mb-3">
            One color, whole site — backgrounds, the dark band, buttons, and text tints all
            derive from it (and stay readable automatically).
          </p>
          <div className="grid grid-cols-8 gap-1.5 mb-3">
            {PRESETS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => setValue(hex)}
                aria-label={`Use ${hex}`}
                aria-pressed={normalized === hex}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
                  normalized === hex ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900' : 'ring-1 ring-white/20'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="color"
              value={normalized ?? current}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Pick a custom color"
              className="w-9 h-9 rounded-md bg-transparent border border-gray-700 cursor-pointer"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="#2F6D62"
              spellCheck={false}
              className="flex-1 min-w-0 rounded-md bg-gray-800 border border-gray-700 px-2.5 py-1.5 text-sm font-mono text-gray-100 focus:outline-none focus:border-teal-400"
            />
          </div>
          {error && (
            <p className="text-xs text-rose-400 mb-2" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-400 hover:text-white px-2 py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!normalized || busy}
              className="text-xs font-semibold rounded-md px-3 py-1.5 bg-teal-500 text-white hover:bg-teal-400 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Saving…' : 'Save · repaint site'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
