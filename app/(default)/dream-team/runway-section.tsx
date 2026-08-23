'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { stopRunwayItemAction } from './actions'

/**
 * "GOING OUT SOON" — the veto runway (docs/ai-operations.md, D4). Every
 * piece the deep-sleep lanes have staged, with its go-time in the clinic's
 * own wall clock and a one-tap Stop. The queue renders NOTHING when empty:
 * an empty runway is a fact, not a surface to decorate.
 *
 * Stop semantics differ by rail and the copy says so: a stopped social
 * post is discarded (the machine drafts fresh next cycle); a stopped
 * article returns to drafts.
 */
export interface RunwayRowData {
  kind: 'social' | 'blog'
  id: string
  excerpt: string
  destination: string
  /** Pre-formatted in the clinic's wall clock (server-rendered — tz law). */
  goesOutLabel: string
}

const KIND_ICON: Record<RunwayRowData['kind'], string> = { social: '📣', blog: '📝' }

export default function RunwaySection({ items }: { items: RunwayRowData[] }) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  const [gone, setGone] = useState<Set<string>>(new Set())

  const visible = items.filter((i) => !gone.has(i.id))
  if (visible.length === 0) return null

  async function stop(item: RunwayRowData) {
    if (
      item.kind === 'social' &&
      !(await confirm({
        title: 'Stop this post?',
        message: 'It comes off the queue and won’t go out. The draft is discarded — the team drafts fresh next time.',
        confirmLabel: 'Stop it',
        danger: true,
      }))
    )
      return
    setStoppingId(item.id)
    startTransition(async () => {
      try {
        const r = await stopRunwayItemAction({ kind: item.kind, id: item.id })
        if (r.ok) {
          setGone((g) => new Set(g).add(item.id))
          toast(r.message)
          router.refresh()
        } else {
          toast(r.message, { tone: 'urgent' })
        }
      } catch {
        toast("Couldn't stop it — try again.", { tone: 'urgent' })
      } finally {
        setStoppingId(null)
      }
    })
  }

  return (
    <section id="going-out-soon" className="mt-8 scroll-mt-24">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Going out soon</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Queued by the team — stop anything that shouldn&rsquo;t go.
        </p>
      </div>
      <ul className="v2-card divide-y divide-[color:var(--color-hairline)]">
        {visible.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="flex items-center gap-3 px-4 py-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-base"
            >
              {KIND_ICON[item.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-800 dark:text-gray-100">{item.excerpt}</p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {item.kind === 'blog' ? 'Article · ' : 'Post · '}
                {item.destination}
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span className="font-medium text-gray-600 dark:text-gray-300 tabular-nums">
                  goes out {item.goesOutLabel}
                </span>
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => void stop(item)}
              className="min-h-8 shrink-0 rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-700 disabled:opacity-50 dark:text-gray-300 dark:hover:text-rose-300"
            >
              {pending && stoppingId === item.id ? 'Stopping…' : 'Stop'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
