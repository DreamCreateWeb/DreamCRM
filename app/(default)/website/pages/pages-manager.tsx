'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { SitePageIndexEntry } from '@/lib/clinic-site-helpers'
import { StatusPill } from '@/components/ui/status-pill'
import { inputCls } from '@/components/ui/editor-kit'
import { saveInlineField, type SectionResult } from '../editor/website-actions'

/**
 * The Pages list — one row per page the site can serve. Live rows open in the
 * editor / view live; gated-off rows say exactly what would publish them.
 * Expanding a row reveals its copy overrides (the page's headlines/eyebrows)
 * as plain inputs saving through the Studio's saveInlineField — the first
 * non-canvas home those edits have ever had.
 */

export interface PageCopyGroup {
  /** Non-wildcard keys: editable here (template fallback shown as placeholder). */
  concrete: { key: string; label: string; fallback: string; current: string | null }[]
  /** Saved concrete instances of wildcard families (editable/clearable). */
  savedWildcard: { key: string; label: string; current: string }[]
  /** Families whose numbered items are edited on the canvas. */
  wildcardFamilies: number
}

export default function PagesManager({
  pages,
  copyByPath,
  siteUrl,
}: {
  pages: SitePageIndexEntry[]
  copyByPath: Record<string, PageCopyGroup>
  siteUrl: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const liveCount = pages.filter((p) => p.live).length

  return (
    <section className="v2-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Your pages</h2>
        <span className="text-xs tabular-nums font-mono-num text-gray-500 dark:text-gray-400">
          {liveCount} live
        </span>
      </div>
      <ul className="divide-y divide-[color:var(--color-hairline)]">
        {pages.map((p) => {
          const copy = copyByPath[p.path]
          const editCount =
            (copy?.concrete.filter((c) => c.current !== null).length ?? 0) +
            (copy?.savedWildcard.length ?? 0)
          const hasCopy = !!copy && (copy.concrete.length > 0 || copy.savedWildcard.length > 0 || copy.wildcardFamilies > 0)
          const isOpen = open === p.key
          return (
            <li key={p.key} className="py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : p.key)}
                  disabled={!hasCopy}
                  aria-expanded={isOpen}
                  className={`flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100 ${
                    hasCopy ? 'hover:underline underline-offset-4' : 'cursor-default'
                  }`}
                >
                  <span aria-hidden="true" className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''} ${hasCopy ? '' : 'invisible'}`}>
                    ›
                  </span>
                  {p.label}
                </button>
                {p.live ? (
                  <StatusPill tone="ok" label="Live" />
                ) : (
                  <StatusPill tone="neutral" label="Not published yet" title={p.needs ?? undefined} />
                )}
                {editCount > 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    {editCount} text edit{editCount === 1 ? '' : 's'}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3 text-xs">
                  {p.live && (
                    <>
                      <Link
                        href={`/website/editor?page=${encodeURIComponent(p.path)}`}
                        className="font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
                      >
                        Open in editor
                      </Link>
                      <a
                        href={`${siteUrl}${p.path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-500 dark:text-gray-400 hover:underline underline-offset-4"
                      >
                        View live ↗
                      </a>
                    </>
                  )}
                  {p.manager && (
                    <Link
                      href={p.manager.href}
                      className="text-gray-500 dark:text-gray-400 hover:underline underline-offset-4"
                    >
                      {p.manager.label} →
                    </Link>
                  )}
                </span>
              </div>
              {!p.live && p.needs && (
                <p className="mt-1 ml-6 text-xs text-gray-500 dark:text-gray-400">{p.needs}</p>
              )}
              {isOpen && copy && (
                <div className="mt-3 ml-6 space-y-3">
                  {copy.concrete.map((c) => (
                    <CopyField key={c.key} copyKey={c.key} label={c.label} fallback={c.fallback} current={c.current} />
                  ))}
                  {copy.savedWildcard.map((c) => (
                    <CopyField key={c.key} copyKey={c.key} label={c.label} fallback="" current={c.current} />
                  ))}
                  {copy.wildcardFamilies > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Numbered list items (steps, callouts) are edited right on the page —{' '}
                      <Link
                        href={`/website/editor?page=${encodeURIComponent(p.path)}`}
                        className="font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
                      >
                        open it in the editor
                      </Link>
                      .
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** One copy override — the template's words as placeholder, the clinic's words
 *  as the value; clearing the field returns the page to the template copy. */
function CopyField({
  copyKey,
  label,
  fallback,
  current,
}: {
  copyKey: string
  label: string
  fallback: string
  current: string | null
}) {
  const [value, setValue] = useState(current ?? '')
  const [savedValue, setSavedValue] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const dirty = value !== savedValue

  function onSave() {
    setError(null)
    startTransition(async () => {
      const res: SectionResult = await saveInlineField(`copy:${copyKey}`, value)
      if (res.ok) {
        setSavedValue(value)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
        {label}
        {savedValue && <span className="ml-2 font-normal text-gray-400 dark:text-gray-500">customized</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={fallback || 'Edited on the page'}
          className={`${inputCls} flex-1`}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty}
          className="shrink-0 text-xs font-semibold px-3 py-2 rounded-[var(--r-sm)] bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {saved && !dirty && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Saved ✓ — publish to go live</p>}
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {!value && savedValue && !dirty && null}
    </div>
  )
}
