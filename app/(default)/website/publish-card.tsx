'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { publishWebsiteAction, discardWebsiteAction } from './editor/website-actions'

/**
 * The hub's Draft→Publish card — shows what's saved but not yet on the live
 * site, with the one button that makes it live (and a guarded discard).
 * Rendered only when there ARE unpublished changes; the quiet state is no
 * card at all (calm chrome).
 */
export default function PublishCard({
  count,
  labels,
}: {
  count: number
  labels: string[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<'publish' | 'discard' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shown = labels.slice(0, 6)
  const more = labels.length - shown.length

  async function onPublish() {
    if (busy) return
    setBusy('publish')
    setError(null)
    const res = await publishWebsiteAction()
    setBusy(null)
    if (res.ok) router.refresh()
    else setError(res.error)
  }

  async function onDiscard() {
    if (busy) return
    const ok = await confirm({
      title: 'Discard your unpublished changes?',
      message: `Throws away ${count} saved-but-unpublished change${count === 1 ? '' : 's'}. Your live site was never touched, so it stays exactly as patients see it now.`,
      confirmLabel: 'Discard draft',
    })
    if (!ok) return
    setBusy('discard')
    setError(null)
    const res = await discardWebsiteAction()
    setBusy(null)
    if (res.ok) router.refresh()
    else setError(res.error)
  }

  return (
    <div className="v2-card p-4 sm:p-5 mb-6 border-l-4 border-l-teal-500">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {count} unpublished change{count === 1 ? '' : 's'}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Saved in your draft — patients still see the published site. {shown.join(' · ')}
            {more > 0 ? ` · +${more} more` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy !== null}
            className="text-xs font-medium px-3 py-2 rounded-[var(--r-sm)] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors disabled:opacity-50"
          >
            {busy === 'discard' ? 'Discarding…' : 'Discard'}
          </button>
          <button
            type="button"
            onClick={onPublish}
            disabled={busy !== null}
            className="text-xs font-semibold px-4 py-2 rounded-[var(--r-sm)] bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition-colors disabled:opacity-60"
          >
            {busy === 'publish' ? 'Publishing…' : 'Publish to your live site'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}
