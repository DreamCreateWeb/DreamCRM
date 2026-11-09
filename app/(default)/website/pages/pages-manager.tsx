'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { SitePageIndexEntry } from '@/lib/clinic-site-helpers'
import { StatusPill } from '@/components/ui/status-pill'
import { inputCls } from '@/components/ui/editor-kit'
import { ActionButton } from '@/components/ui/action-button'
import { MiniTrend } from '@/components/ui/charts'
import { runAction, isStaleFailure } from '@/lib/run-action'
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

export interface PageVisits {
  /** Views in the last 30 days. */
  views: number
  /** Zero-filled daily series, parallel to `visitDays`. */
  daily: number[]
}

export default function PagesManager({
  pages,
  copyByPath,
  siteUrl,
  visitsByPath,
  visitDays = [],
}: {
  pages: SitePageIndexEntry[]
  copyByPath: Record<string, PageCopyGroup>
  siteUrl: string
  /** Per-page 30-day visits keyed by the index path ('' = home). Omitted when
   *  the traffic read failed — the column then simply doesn't render. */
  visitsByPath?: Record<string, PageVisits>
  /** 'YYYY-MM-DD' per series point (calendar dates, labelled as-is). */
  visitDays?: string[]
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [sortByVisits, setSortByVisits] = useState(false)
  const liveCount = pages.filter((p) => p.live).length
  const showVisits = !!visitsByPath
  const rows =
    showVisits && sortByVisits
      ? [...pages].sort((a, b) => (visitsByPath[b.path]?.views ?? 0) - (visitsByPath[a.path]?.views ?? 0))
      : pages

  return (
    <section className="v2-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Your pages</h2>
        <span className="flex items-center gap-3 text-xs tabular-nums font-mono-num text-gray-500 dark:text-gray-400">
          {showVisits && (
            <button
              type="button"
              onClick={() => setSortByVisits((v) => !v)}
              aria-pressed={sortByVisits}
              className="font-sans font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
            >
              {sortByVisits ? 'Sorted by visits' : 'Sort by visits'}
            </button>
          )}
          {liveCount} live
        </span>
      </div>
      <ul className="divide-y divide-[color:var(--color-hairline)]">
        {rows.map((p) => {
          const copy = copyByPath[p.path]
          const editCount =
            (copy?.concrete.filter((c) => c.current !== null).length ?? 0) +
            (copy?.savedWildcard.length ?? 0)
          const hasCopy = !!copy && (copy.concrete.length > 0 || copy.savedWildcard.length > 0 || copy.wildcardFamilies > 0)
          const isOpen = open === p.key
          return (
            <li key={p.key} className="py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {hasCopy ? (
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : p.key)}
                    aria-expanded={isOpen}
                    className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100 hover:underline underline-offset-4"
                  >
                    <span aria-hidden="true" className={`text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                      ›
                    </span>
                    {p.label}
                  </button>
                ) : (
                  /* Nothing to disclose — plain text, no dead tab stop, the
                     chevron simply absent (a reserved invisible control was
                     focusable-disabled noise for keyboard users). */
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100 pl-[1.1rem]">
                    {p.label}
                  </span>
                )}
                {p.live ? (
                  <StatusPill tone="ok" label="Live" />
                ) : (
                  <StatusPill tone="neutral" label="Not published yet" title={p.needs ?? undefined} />
                )}
                {editCount > 0 && (
                  <span
                    className="text-xs text-gray-500 dark:text-gray-400 tabular-nums"
                    title="Copy on this page that differs from the template default — expand the row to see and edit each one"
                  >
                    {editCount} text edit{editCount === 1 ? '' : 's'}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3 text-xs">
                  {showVisits && p.live && (
                    <span className="flex items-center gap-2" data-testid="page-visits">
                      <span
                        className="tabular-nums font-mono-num text-gray-700 dark:text-gray-200"
                        title="Visits in the last 30 days"
                      >
                        {(visitsByPath[p.path]?.views ?? 0).toLocaleString()} visits
                      </span>
                      {visitsByPath[p.path] && visitsByPath[p.path].views > 0 && (
                        <MiniTrend
                          data={visitsByPath[p.path].daily.map((value, i) => ({
                            bucket: visitDays[i] ?? String(i + 1),
                            value,
                          }))}
                          width={64}
                          height={20}
                        />
                      )}
                    </span>
                  )}
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
      const res: SectionResult | { ok: false; error: string; stale?: true } = await runAction(() =>
        saveInlineField(`copy:${copyKey}`, value),
      )
      if (isStaleFailure(res)) {
        setError(res.error)
      } else if (res.ok) {
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
        {savedValue && <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">customized</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={fallback || 'Edited on the page'}
          className={`${inputCls} flex-1`}
        />
        <ActionButton
          variant="primary"
          size="sm"
          onClick={onSave}
          pending={pending}
          disabled={pending || !dirty}
          className="shrink-0"
        >
          Save
        </ActionButton>
      </div>
      {saved && !dirty && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Saved ✓ — publish to go live</p>}
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {!value && savedValue && !dirty && null}
    </div>
  )
}
