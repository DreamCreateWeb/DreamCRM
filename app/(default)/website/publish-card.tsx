'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ActionButton } from '@/components/ui/action-button'
import { runAction } from '@/lib/run-action'
import { publishWebsiteAction, discardWebsiteAction } from './editor/website-actions'

/**
 * The hub's Draft→Publish card — shows what's saved but not yet on the live
 * site, one checkbox per changed SECTION (all on), and the button that makes
 * the checked ones live. Sections left unchecked stay saved as a draft for
 * someone's read. Rendered only when there ARE unpublished changes; the quiet
 * state is no card at all (calm chrome).
 */
export default function PublishCard({
  count,
  labels,
  sections = [],
}: {
  count: number
  labels: string[]
  sections?: { key: string; label: string }[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<'publish' | 'discard' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Track what is switched OFF, so a section that appears after a refresh
  // starts on and one that vanished simply drops out.
  const [off, setOff] = useState<ReadonlySet<string>>(new Set())
  const shown = labels.slice(0, 6)
  const more = labels.length - shown.length

  const picking = sections.length > 0
  const chosen = sections.filter((s) => !off.has(s.key))
  const partial = picking && chosen.length < sections.length
  const nothingChosen = picking && chosen.length === 0
  // `undefined` means "everything staged" — also what a card with no section
  // list (an older caller) has always sent.
  const input = partial ? { sections: chosen.map((s) => s.key) } : undefined

  function toggle(key: string) {
    setOff((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function onPublish() {
    if (busy || nothingChosen) return
    setBusy('publish')
    setError(null)
    try {
      const res = await runAction(() => publishWebsiteAction(input))
      if (res.ok) router.refresh()
      else setError(res.error)
    } finally {
      setBusy(null)
    }
  }

  async function onDiscard() {
    if (busy || nothingChosen) return
    const what = partial
      ? `Throws away the saved-but-unpublished changes in ${chosen.map((s) => s.label).join(', ')}. The other sections stay saved as a draft.`
      : `Throws away ${count} saved-but-unpublished change${count === 1 ? '' : 's'}.`
    const ok = await confirm({
      title: partial ? 'Discard these unpublished changes?' : 'Discard your unpublished changes?',
      message: `${what} Your live site was never touched, so it stays exactly as patients see it now.`,
      confirmLabel: 'Discard draft',
    })
    if (!ok) return
    setBusy('discard')
    setError(null)
    try {
      const res = await runAction(() => discardWebsiteAction(input))
      if (res.ok) router.refresh()
      else setError(res.error)
    } finally {
      setBusy(null)
    }
  }

  const publishLabel = partial
    ? `Publish ${chosen.length} of ${sections.length}`
    : 'Publish to your live site'

  return (
    <div className="v2-card p-4 sm:p-5 mb-6 border-l-4 border-l-teal-500">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {count} unpublished change{count === 1 ? '' : 's'}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Saved in your draft — patients still see the published site.
            {picking ? '' : ` ${shown.join(' · ')}${more > 0 ? ` · +${more} more` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ActionButton variant="ghost" size="sm" onClick={onDiscard} pending={busy === 'discard'} disabled={busy !== null || nothingChosen}>
            Discard
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={onPublish} pending={busy === 'publish'} disabled={busy !== null || nothingChosen}>
            {publishLabel}
          </ActionButton>
        </div>
      </div>
      {picking && (
        <fieldset className="mt-3">
          <legend className="sr-only">Sections to publish</legend>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {sections.map((s) => (
              <li key={s.key}>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={!off.has(s.key)}
                    onChange={() => toggle(s.key)}
                    disabled={busy !== null}
                    className="form-checkbox"
                  />
                  {s.label}
                </label>
              </li>
            ))}
          </ul>
          {partial && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Keep the rest as a draft — {sections.length - chosen.length} section
              {sections.length - chosen.length === 1 ? '' : 's'} stay saved but unpublished.
            </p>
          )}
        </fieldset>
      )}
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>}
    </div>
  )
}
