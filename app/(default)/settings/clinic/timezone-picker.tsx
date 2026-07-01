'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Searchable IANA timezone picker for the clinic Hours section.
 *
 * The clinic-wide default list (lib/clinic-timezone.ts `US_TIMEZONES`) is
 * US-only, which stranded any clinic outside the US on Eastern. This widens it
 * to a curated-but-comprehensive IANA set with a typeahead so a clinic can find
 * their zone in a couple of keystrokes without scrolling a 400-entry native
 * <select>.
 *
 * It persists EXACTLY the same value the old <select> did — an IANA id like
 * `America/New_York` — in a hidden input under `name`, so `updateClinicProfile`
 * (`clean('timezone', …)`) reads it unchanged. The visible combobox is
 * purely presentational; the hidden input is the source of truth for the Save.
 *
 * The list is a static constant (not `Intl.supportedValuesOf`) so the render is
 * deterministic across server + client with no hydration drift, and every entry
 * carries a friendly label + its live UTC offset shown at render time.
 */

/** Curated IANA zones — every US zone the old picker had, plus the common
 *  Canadian / UK-Ireland / Europe / Australia / NZ / Asia / LatAm zones. Grouped
 *  by region for the label; the value is the raw IANA id we persist. */
const TIMEZONES: Array<{ id: string; label: string; region: string }> = [
  // North America
  { id: 'America/New_York', label: 'Eastern — New York', region: 'North America' },
  { id: 'America/Detroit', label: 'Eastern — Detroit', region: 'North America' },
  { id: 'America/Chicago', label: 'Central — Chicago', region: 'North America' },
  { id: 'America/Denver', label: 'Mountain — Denver', region: 'North America' },
  { id: 'America/Phoenix', label: 'Mountain (no DST) — Phoenix', region: 'North America' },
  { id: 'America/Los_Angeles', label: 'Pacific — Los Angeles', region: 'North America' },
  { id: 'America/Anchorage', label: 'Alaska — Anchorage', region: 'North America' },
  { id: 'Pacific/Honolulu', label: 'Hawaii — Honolulu', region: 'North America' },
  // Canada
  { id: 'America/Toronto', label: 'Eastern — Toronto', region: 'Canada' },
  { id: 'America/Winnipeg', label: 'Central — Winnipeg', region: 'Canada' },
  { id: 'America/Edmonton', label: 'Mountain — Edmonton', region: 'Canada' },
  { id: 'America/Vancouver', label: 'Pacific — Vancouver', region: 'Canada' },
  { id: 'America/Halifax', label: 'Atlantic — Halifax', region: 'Canada' },
  { id: 'America/St_Johns', label: 'Newfoundland — St. John’s', region: 'Canada' },
  // UK & Ireland
  { id: 'Europe/London', label: 'United Kingdom — London', region: 'UK & Ireland' },
  { id: 'Europe/Dublin', label: 'Ireland — Dublin', region: 'UK & Ireland' },
  // Europe
  { id: 'Europe/Lisbon', label: 'Portugal — Lisbon', region: 'Europe' },
  { id: 'Europe/Madrid', label: 'Spain — Madrid', region: 'Europe' },
  { id: 'Europe/Paris', label: 'France — Paris', region: 'Europe' },
  { id: 'Europe/Berlin', label: 'Germany — Berlin', region: 'Europe' },
  { id: 'Europe/Amsterdam', label: 'Netherlands — Amsterdam', region: 'Europe' },
  { id: 'Europe/Rome', label: 'Italy — Rome', region: 'Europe' },
  { id: 'Europe/Zurich', label: 'Switzerland — Zurich', region: 'Europe' },
  { id: 'Europe/Stockholm', label: 'Sweden — Stockholm', region: 'Europe' },
  { id: 'Europe/Warsaw', label: 'Poland — Warsaw', region: 'Europe' },
  { id: 'Europe/Athens', label: 'Greece — Athens', region: 'Europe' },
  { id: 'Europe/Istanbul', label: 'Türkiye — Istanbul', region: 'Europe' },
  { id: 'Europe/Moscow', label: 'Russia — Moscow', region: 'Europe' },
  // Middle East & Africa
  { id: 'Asia/Jerusalem', label: 'Israel — Jerusalem', region: 'Middle East & Africa' },
  { id: 'Asia/Dubai', label: 'UAE — Dubai', region: 'Middle East & Africa' },
  { id: 'Africa/Johannesburg', label: 'South Africa — Johannesburg', region: 'Middle East & Africa' },
  { id: 'Africa/Cairo', label: 'Egypt — Cairo', region: 'Middle East & Africa' },
  { id: 'Africa/Lagos', label: 'Nigeria — Lagos', region: 'Middle East & Africa' },
  // Asia
  { id: 'Asia/Kolkata', label: 'India — Kolkata', region: 'Asia' },
  { id: 'Asia/Karachi', label: 'Pakistan — Karachi', region: 'Asia' },
  { id: 'Asia/Bangkok', label: 'Thailand — Bangkok', region: 'Asia' },
  { id: 'Asia/Singapore', label: 'Singapore', region: 'Asia' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong', region: 'Asia' },
  { id: 'Asia/Shanghai', label: 'China — Shanghai', region: 'Asia' },
  { id: 'Asia/Tokyo', label: 'Japan — Tokyo', region: 'Asia' },
  { id: 'Asia/Seoul', label: 'South Korea — Seoul', region: 'Asia' },
  { id: 'Asia/Manila', label: 'Philippines — Manila', region: 'Asia' },
  // Oceania
  { id: 'Australia/Perth', label: 'Australia — Perth', region: 'Oceania' },
  { id: 'Australia/Adelaide', label: 'Australia — Adelaide', region: 'Oceania' },
  { id: 'Australia/Brisbane', label: 'Australia — Brisbane', region: 'Oceania' },
  { id: 'Australia/Sydney', label: 'Australia — Sydney', region: 'Oceania' },
  { id: 'Pacific/Auckland', label: 'New Zealand — Auckland', region: 'Oceania' },
  // Latin America
  { id: 'America/Mexico_City', label: 'Mexico — Mexico City', region: 'Latin America' },
  { id: 'America/Bogota', label: 'Colombia — Bogotá', region: 'Latin America' },
  { id: 'America/Lima', label: 'Peru — Lima', region: 'Latin America' },
  { id: 'America/Sao_Paulo', label: 'Brazil — São Paulo', region: 'Latin America' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Argentina — Buenos Aires', region: 'Latin America' },
  { id: 'America/Santiago', label: 'Chile — Santiago', region: 'Latin America' },
]

/** Live UTC offset for an IANA id, e.g. "GMT-5". Empty string if the zone is
 *  unknown to the runtime (never happens for the curated list, but stays safe). */
function offsetLabel(id: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: id,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

function labelFor(id: string): string {
  return TIMEZONES.find((t) => t.id === id)?.label ?? id
}

export default function TimezonePicker({
  name,
  defaultValue,
}: {
  name: string
  defaultValue: string
}) {
  // If the stored zone isn't in the curated list (e.g. a legacy exotic value),
  // surface it as its own selectable row so we never silently drop it on save.
  const known = TIMEZONES.some((t) => t.id === defaultValue)
  const options = useMemo(
    () =>
      known
        ? TIMEZONES
        : [{ id: defaultValue, label: defaultValue, region: 'Current' }, ...TIMEZONES],
    [known, defaultValue],
  )

  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Live offsets are computed on the client only — computing them during SSR
  // would depend on the server's clock and could differ from the client on a
  // DST boundary. Start empty (no offset shown) → fill in after mount.
  const [mounted, setMounted] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // Close the dropdown on outside-click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (t) => t.label.toLowerCase().includes(q) || t.id.toLowerCase().replace(/_/g, ' ').includes(q),
    )
  }, [options, query])

  const currentOffset = mounted ? offsetLabel(value) : ''

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          setQuery('')
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="form-input w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="truncate">
          {labelFor(value)}
          {currentOffset && (
            <span className="ml-1.5 text-xs text-gray-400 font-mono-num tabular-nums">
              {currentOffset}
            </span>
          )}
        </span>
        <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="pop-in absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-[var(--shadow-pop)]">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700/60">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city or region…"
              className="form-input w-full text-sm"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                No match — try a city or country name.
              </li>
            )}
            {filtered.map((t) => {
              const sel = t.id === value
              const off = mounted ? offsetLabel(t.id) : ''
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={sel}
                    onClick={() => {
                      setValue(t.id)
                      setOpen(false)
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                      sel
                        ? 'bg-teal-500/12 text-teal-700 dark:text-teal-300 font-medium'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-500/[0.08] dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className="truncate">{t.label}</span>
                    {off && (
                      <span className="shrink-0 text-xs text-gray-400 font-mono-num tabular-nums">
                        {off}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
