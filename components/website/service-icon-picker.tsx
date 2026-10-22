'use client'

import { useMemo, useState } from 'react'
import ImageUploader from '@/components/ui/image-uploader'
import ServiceIcon from '@/components/clinic-site/service-icon'
import {
  SERVICE_ICON_EMOJI,
  glyphIconValue,
  parseServiceIcon,
  searchServiceIconGlyphs,
} from '@/lib/service-icons'

/**
 * The icon picker — one panel for every place a service's picture can be
 * changed: the Website Studio (click the icon on the canvas; the Studio hosts
 * it on its own overlay layer) and the services list in Website → Content.
 * Three ways in, one value out:
 *
 *   Icons    the curated line glyphs (searchable by name and purpose),
 *   Emoji    a short list that reads well on a card,
 *   Upload   the practice's own picture (a square PNG or SVG looks best).
 *
 * `onPick(value)` receives the stored string — `icon:<id>`, the uploaded
 * https URL, or the emoji — and `null` for "no icon" (the template shows its
 * own numbering instead). The host saves it; the panel never writes. There is
 * deliberately no shared drawer wrapper here: the platform `Drawer` portals at
 * z-50, which the Studio's z-[60] chrome covers, so each host owns its shell.
 */

type Tab = 'icons' | 'emoji' | 'upload'

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'icons', label: 'Icons' },
  { id: 'emoji', label: 'Emoji' },
  { id: 'upload', label: 'Upload your own' },
]

export interface ServiceIconPickerPanelProps {
  /** The service's current icon value. */
  current: string | null | undefined
  /** Fires with the chosen value; null means "no icon". */
  onPick: (value: string | null) => void
  /** Disables the grid while the host is saving. */
  busy?: boolean
}

export function ServiceIconPickerPanel({ current, onPick, busy = false }: ServiceIconPickerPanelProps) {
  const currentRef = parseServiceIcon(current)
  const [tab, setTab] = useState<Tab>(
    currentRef?.kind === 'image' ? 'upload' : currentRef?.kind === 'emoji' ? 'emoji' : 'icons',
  )
  const [query, setQuery] = useState('')
  const glyphs = useMemo(() => searchServiceIconGlyphs(query), [query])

  return (
    <div className="space-y-4" data-testid="service-icon-picker">
      <div className="flex items-center gap-3 rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] p-3">
        <span
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[color:var(--color-surface-1)] text-2xl text-gray-800 dark:text-gray-100"
          data-testid="service-icon-current"
        >
          <ServiceIcon
            icon={current}
            size={28}
            fallback={<span className="text-xs font-semibold text-gray-400">none</span>}
          />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-gray-800 dark:text-gray-100">
            {currentRef ? 'Showing now' : 'No icon yet'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {currentRef?.kind === 'glyph'
              ? currentRef.glyph.label
              : currentRef?.kind === 'image'
                ? 'Your own picture'
                : currentRef?.kind === 'emoji'
                  ? 'An emoji'
                  : 'The card shows its number instead.'}
          </p>
        </div>
      </div>

      <div role="tablist" aria-label="Icon sources" className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const on = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={`rounded-[var(--r-pill)] px-3 py-1.5 text-sm transition-colors ${
                on
                  ? 'bg-teal-500/12 font-medium text-teal-700 dark:text-teal-300'
                  : 'text-gray-600 hover:bg-gray-500/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'icons' && (
        <div>
          <label htmlFor="service-icon-search" className="sr-only">
            Search icons
          </label>
          <input
            id="service-icon-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — whitening, kids, implants…"
            className="form-input w-full text-sm"
            autoComplete="off"
          />
          {glyphs.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Nothing by that name — try the emoji, or upload your own.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5" role="group" aria-label="Icons">
              {glyphs.map((g) => {
                const value = glyphIconValue(g.id)
                const on = currentRef?.kind === 'glyph' && currentRef.id === g.id
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-label={g.label}
                    aria-pressed={on}
                    title={g.label}
                    disabled={busy}
                    onClick={() => onPick(value)}
                    data-testid={`service-icon-glyph-${g.id}`}
                    className={`flex flex-col items-center gap-1 rounded-[var(--r-md)] border px-2 py-2.5 text-gray-800 transition-colors hover:bg-teal-500/5 disabled:opacity-50 dark:text-gray-100 ${
                      on
                        ? 'border-teal-500 ring-1 ring-inset ring-teal-500 bg-teal-500/10'
                        : 'border-gray-200 dark:border-gray-700/70'
                    }`}
                  >
                    <ServiceIcon icon={value} size={26} />
                    <span className="text-xs leading-tight text-gray-600 dark:text-gray-300">{g.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'emoji' && (
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8" role="group" aria-label="Emoji">
          {SERVICE_ICON_EMOJI.map((e) => {
            const on = currentRef?.kind === 'emoji' && currentRef.text === e
            return (
              <button
                key={e}
                type="button"
                aria-label={`Emoji ${e}`}
                aria-pressed={on}
                disabled={busy}
                onClick={() => onPick(e)}
                data-testid="service-icon-emoji"
                className={`flex h-11 items-center justify-center rounded-[var(--r-md)] border text-2xl transition-colors hover:bg-teal-500/5 disabled:opacity-50 ${
                  on ? 'border-teal-500 ring-1 ring-inset ring-teal-500 bg-teal-500/10' : 'border-gray-200 dark:border-gray-700/70'
                }`}
              >
                <span aria-hidden="true">{e}</span>
              </button>
            )
          })}
        </div>
      )}

      {tab === 'upload' && (
        <div>
          <ImageUploader
            name="service-icon-upload"
            defaultValue={currentRef?.kind === 'image' ? currentRef.url : null}
            folder="service-icons"
            label="Your own picture"
            hint="A square PNG or SVG with a transparent background looks best — it shows about the size of a coin."
            previewClass="aspect-square max-w-[160px]"
            maxBytes={2 * 1024 * 1024}
            onChange={(url) => {
              if (url) onPick(url)
            }}
          />
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[color:var(--color-hairline)] pt-3">
        <button
          type="button"
          disabled={busy || !currentRef}
          onClick={() => onPick(null)}
          className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 dark:text-gray-300 dark:hover:text-white"
          data-testid="service-icon-none"
        >
          No icon — show the number
        </button>
      </div>
    </div>
  )
}
