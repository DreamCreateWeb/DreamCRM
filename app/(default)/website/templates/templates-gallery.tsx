'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  PRACTICE_TYPE_LABELS,
  type SitePracticeType,
  type SiteTemplateCatalogEntry,
} from '@/lib/site-templates/catalog'
import { saveTemplate } from '../editor/website-actions'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { StatusPill } from '@/components/ui/status-pill'

/**
 * The template gallery grid — category chips (practice type), style-tag
 * filters, a sort control, and one card per design carrying a LIVE scaled
 * iframe of the clinic's own homepage rendered in that template (the
 * side-effect-free /site/<slug>/tf/<id> frame; each card forces its own
 * template per request — no shared preview cookie to clobber).
 */

// The frame renders at a fixed desktop width and is CSS-scaled to the card.
const FRAME_W = 1360
const FRAME_H = 850

type SortKey = 'recommended' | 'name'

/** Pure, exported for tests: category → tags → sort, current always visible
 *  logic lives in the render (a filtered-out current is honest). */
export function filterAndSortTemplates(
  entries: SiteTemplateCatalogEntry[],
  opts: { category: SitePracticeType | 'all'; tags: string[]; sort: SortKey },
): SiteTemplateCatalogEntry[] {
  let list = entries
  if (opts.category !== 'all') {
    list = list.filter((e) => e.practiceTypes.includes(opts.category as SitePracticeType))
  }
  if (opts.tags.length > 0) {
    list = list.filter((e) => opts.tags.every((t) => e.styleTags.includes(t)))
  }
  if (opts.sort === 'name') {
    list = [...list].sort((a, b) => a.label.localeCompare(b.label))
  }
  return list
}

export default function TemplatesGallery({
  entries,
  currentId,
  slug,
}: {
  entries: SiteTemplateCatalogEntry[]
  currentId: string
  slug: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [category, setCategory] = useState<SitePracticeType | 'all'>('all')
  const [tags, setTags] = useState<string[]>([])
  const [sort, setSort] = useState<SortKey>('recommended')
  const [applying, setApplying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const categories = useMemo(() => {
    const present = new Set(entries.flatMap((e) => e.practiceTypes))
    return (Object.keys(PRACTICE_TYPE_LABELS) as SitePracticeType[]).filter((t) => present.has(t))
  }, [entries])
  const allTags = useMemo(
    () => Array.from(new Set(entries.flatMap((e) => e.styleTags))).sort(),
    [entries],
  )
  const shown = filterAndSortTemplates(entries, { category, tags, sort })

  async function onApply(entry: SiteTemplateCatalogEntry) {
    if (applying) return
    const ok = await confirm({
      title: `Switch to ${entry.label}?`,
      message:
        'Your content stays exactly as it is — designs are pure presentation. The switch saves to your draft; publish when you’re ready to update the live site.',
      confirmLabel: 'Apply design',
    })
    if (!ok) return
    setApplying(entry.id)
    setError(null)
    const res = await saveTemplate(entry.id)
    setApplying(null)
    if (res.ok) router.refresh()
    else setError(res.error)
  }

  return (
    <div>
      {/* ── Filter bar: category chips · style tags · sort ────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Chip active={category === 'all'} onClick={() => setCategory('all')}>
          All practice types
        </Chip>
        {categories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? 'all' : c)}>
            {PRACTICE_TYPE_LABELS[c]}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
        {allTags.map((t) => (
          <Chip
            key={t}
            active={tags.includes(t)}
            onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}
          >
            {t}
          </Chip>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="form-select py-1 text-xs"
          >
            <option value="recommended">Recommended</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
        Every preview is your real site — your name, photos, and services — rendered live in that design.
      </p>
      {error && <p className="mb-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
          No designs match those filters yet — more designs are on the way.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {shown.map((entry) => (
            <TemplateCard
              key={entry.id}
              entry={entry}
              slug={slug}
              isCurrent={entry.id === currentId}
              applying={applying === entry.id}
              busy={applying !== null}
              onApply={() => onApply(entry)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-teal-500 text-white dark:bg-teal-400 dark:text-gray-900'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function TemplateCard({
  entry,
  slug,
  isCurrent,
  applying,
  busy,
  onApply,
}: {
  entry: SiteTemplateCatalogEntry
  slug: string
  isCurrent: boolean
  applying: boolean
  busy: boolean
  onApply: () => void
}) {
  // Scale the fixed-width frame to the card: measure the wrapper and derive
  // the transform. ResizeObserver keeps it right through sidebar collapses
  // and window resizes; until the first real measurement the frame stays
  // hidden (no flash of a mis-scaled site).
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState<number | null>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      if (el.clientWidth > 0) setScale(el.clientWidth / FRAME_W)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="v2-card overflow-hidden flex flex-col">
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden border-b border-[color:var(--color-hairline)] bg-gray-100 dark:bg-gray-800"
        style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}
      >
        <iframe
          src={`/site/${slug}/tf/${entry.id}`}
          title={`${entry.label} — preview on your own content`}
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          // A preview, not a page: no scrolling, no clicks, no focus.
          className="absolute top-0 left-0 border-0 bg-white pointer-events-none select-none"
          style={{
            width: FRAME_W,
            height: FRAME_H,
            transform: `scale(${scale ?? 0})`,
            transformOrigin: 'top left',
            visibility: scale === null ? 'hidden' : undefined,
          }}
        />
      </div>
      <div className="p-4 flex flex-col gap-2 grow">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{entry.label}</h2>
          {isCurrent && <StatusPill tone="ok" label="Current design" />}
          <span className="ml-auto flex flex-wrap gap-1">
            {entry.practiceTypes.map((t) => (
              <span
                key={t}
                className="rounded-full bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400"
              >
                {PRACTICE_TYPE_LABELS[t]}
              </span>
            ))}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{entry.description}</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          <span className="font-medium">Best for:</span> {entry.bestFor}
        </p>
        <div className="mt-auto pt-2 flex items-center gap-2">
          {!isCurrent && (
            <>
              <Link
                href={`/website/editor?previewTemplate=${encodeURIComponent(entry.id)}`}
                className="text-xs font-semibold px-3 py-2 rounded-[var(--r-sm)] bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition-colors"
              >
                Preview in the editor
              </Link>
              <button
                type="button"
                onClick={onApply}
                disabled={busy}
                className="text-xs font-medium px-3 py-2 rounded-[var(--r-sm)] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors disabled:opacity-50"
              >
                {applying ? 'Applying…' : 'Apply'}
              </button>
            </>
          )}
          {isCurrent && (
            <Link
              href="/website/editor"
              className="text-xs font-semibold px-3 py-2 rounded-[var(--r-sm)] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
            >
              Open in the editor
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
