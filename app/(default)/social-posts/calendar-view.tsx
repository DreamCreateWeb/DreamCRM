'use client'

import { useMemo, useState } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { TONE_DOT, type Tone } from '@/lib/ui/encodings'
import { GBP_POST_TYPE_LABELS, type SocialPostView, type GbpPostStatus } from '@/lib/types/zernio'
import { isVideoUrl } from '@/lib/media'

/**
 * Content calendar — a CSS-grid month view of scheduled + published posts (no
 * heavy calendar lib). Each post lands on its scheduled date (scheduled) or
 * published date (published), shown as a compact chip with its channel icons +
 * a status dot. Clicking a chip opens a small detail popover. Month navigation
 * via prev/next/today. DESIGN-SYSTEM v2 throughout.
 *
 * A post with neither a scheduled nor a published date (a draft / failed
 * publish-now) lands on its created date so it's never lost from the calendar.
 */

const STATUS_TONE: Record<GbpPostStatus, Tone> = {
  published: 'ok',
  scheduled: 'info',
  draft: 'neutral',
  failed: 'urgent',
}
const STATUS_LABEL: Record<GbpPostStatus, string> = {
  published: 'Published',
  scheduled: 'Scheduled',
  draft: 'Draft',
  failed: 'Failed',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The date a post sits on in the calendar (scheduled → published → created). */
function calendarDateIso(p: SocialPostView): string {
  return p.scheduledAtIso ?? p.publishedAtIso ?? p.createdAtIso
}

/** A local YYYY-MM-DD key for a date (calendar cells are local days). */
function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function CalendarView({ posts }: { posts: SocialPostView[] }) {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [open, setOpen] = useState<SocialPostView | null>(null)

  // Bucket posts by their local day key.
  const byDay = useMemo(() => {
    const m = new Map<string, SocialPostView[]>()
    for (const p of posts) {
      const d = new Date(calendarDateIso(p))
      if (Number.isNaN(d.getTime())) continue
      const k = dayKey(d)
      const arr = m.get(k) ?? []
      arr.push(p)
      m.set(k, arr)
    }
    return m
  }, [posts])

  // Build the 6-week grid covering the cursor month.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const startOffset = first.getDay() // 0=Sun
    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - startOffset)
    const out: Date[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      out.push(d)
    }
    return out
  }, [cursor])

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const todayKey = dayKey(today)

  return (
    <div className="v2-panel p-4">
      {/* Month nav */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 font-mono-num">{monthLabel}</h2>
        <div className="flex items-center gap-1.5">
          <ActionButton variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            ← Prev
          </ActionButton>
          <ActionButton variant="ghost" size="sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Today
          </ActionButton>
          <ActionButton variant="ghost" size="sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            Next →
          </ActionButton>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-px mb-px">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-gray-400 text-center py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px bg-[color:var(--color-hairline)] rounded-[var(--r-md)] overflow-hidden">
        {cells.map((d) => {
          const k = dayKey(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const dayPosts = byDay.get(k) ?? []
          const isToday = k === todayKey
          return (
            <div
              key={k}
              className={`min-h-[84px] p-1.5 ${inMonth ? 'bg-[color:var(--color-surface-2)]' : 'bg-[color:var(--color-surface-sunk)]'}`}
            >
              <div
                className={`text-[11px] font-mono-num mb-1 ${
                  isToday
                    ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-500 text-white dark:bg-teal-400 dark:text-gray-900'
                    : inMonth
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'text-gray-300 dark:text-gray-600'
                }`}
              >
                {d.getDate()}
              </div>
              <div className="space-y-1">
                {dayPosts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setOpen(p)}
                    className="w-full text-left rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-1.5 py-1 hover:ring-teal-400"
                    title={p.summary}
                  >
                    <div className="flex items-center gap-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[STATUS_TONE[p.status]]}`} />
                      <span className="text-[11px] truncate text-gray-700 dark:text-gray-200">{previewText(p)}</span>
                    </div>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {p.targets.slice(0, 5).map((t) => (
                        <span key={t.id} className="text-[10px]" aria-hidden="true" title={t.label}>
                          {t.icon}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {open && <DetailPopover post={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function previewText(p: SocialPostView): string {
  if (p.postType === 'event' && p.eventTitle) return p.eventTitle
  return p.summary
}

function DetailPopover({ post, onClose }: { post: SocialPostView; onClose: () => void }) {
  const targetsGbp = post.targets.some((t) => t.platform === 'googlebusiness')
  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 flex-wrap mb-2">
          {targetsGbp && post.postType !== 'standard' && (
            <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              {GBP_POST_TYPE_LABELS[post.postType]}
            </span>
          )}
          <StatusPill tone={STATUS_TONE[post.status]} label={STATUS_LABEL[post.status]} />
        </div>
        {post.imageUrl && (
          <div className="w-full max-w-xs aspect-[4/3] rounded-[var(--r-md)] overflow-hidden ring-1 ring-inset ring-[color:var(--color-hairline)] mb-3 bg-black/5">
            {isVideoUrl(post.imageUrl) ? (
              <video src={post.imageUrl} muted playsInline controls preload="metadata" className="w-full h-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
            )}
          </div>
        )}
        {post.postType === 'event' && post.eventTitle && (
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{post.eventTitle}</p>
        )}
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{post.summary}</p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {post.targets.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-300"
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${TONE_DOT[STATUS_TONE[t.status]]}`} title={STATUS_LABEL[t.status]} />
            </span>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <ActionButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
