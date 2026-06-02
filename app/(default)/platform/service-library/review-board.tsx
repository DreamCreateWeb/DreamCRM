'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import {
  approveLibraryEntryAction,
  archiveLibraryEntryAction,
  rejectLibraryEntryAction,
} from './admin-actions'

/**
 * Platform admin review board for the shared service library. Three tabs —
 * Pending (the action queue, default), Active (the canonical catalog +
 * Archive cleanup), Archived (the audit trail). Each row expands to show
 * the entry preview; pending rows carry Approve / Reject controls.
 */

interface Props {
  entries: ServiceLibraryEntryWithStatus[]
  orgNames: Record<string, string>
}

type Tab = 'pending' | 'active' | 'archived'

export default function ReviewBoard({ entries, orgNames }: Props) {
  const [tab, setTab] = useState<Tab>('pending')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(
    null,
  )
  const [, startTransition] = useTransition()
  const [busySlug, setBusySlug] = useState<string | null>(null)

  function showToast(t: { kind: 'success' | 'error'; msg: string }) {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  const counts = useMemo(
    () => ({
      pending: entries.filter((e) => e.status === 'pending').length,
      active: entries.filter((e) => e.status === 'active').length,
      archived: entries.filter((e) => e.status === 'archived').length,
    }),
    [entries],
  )

  const filtered = useMemo(
    () => entries.filter((e) => e.status === tab),
    [entries, tab],
  )

  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-gray-700">
        {(['pending', 'active', 'archived'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${
              tab === t
                ? 'border-violet-500 text-violet-700 dark:text-violet-300'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {t}
            <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
              ({counts[t]})
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          {tab === 'pending'
            ? 'No pending submissions — clear ✨'
            : tab === 'archived'
            ? 'No archived entries.'
            : 'No active entries yet.'}
        </p>
      )}

      <div className="space-y-3">
        {filtered.map((entry) => {
          const orgLabel = entry.submittedByOrgId
            ? orgNames[entry.submittedByOrgId] ?? entry.submittedByOrgId
            : entry.origin === 'platform'
            ? 'Platform-seeded'
            : 'Unknown'
          const isExpanded = expanded === entry.slug
          const isBusy = busySlug === entry.slug

          return (
            <div
              key={entry.slug}
              className="border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800"
            >
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : entry.slug)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
              >
                <div className="text-2xl w-10 text-center pt-0.5">
                  {entry.icon ?? '🦷'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-800 dark:text-gray-100">
                      {entry.name}
                    </p>
                    <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5">
                      {entry.category}
                    </span>
                    <span
                      className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
                        entry.status === 'pending'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200'
                          : entry.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                          : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {entry.status}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5">
                      origin: {entry.origin}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                    {entry.shortDescription}
                  </p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Submitted by: {orgLabel} · {entry.slug}
                  </p>
                  {entry.reviewNotes && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">
                      Note: {entry.reviewNotes}
                    </p>
                  )}
                </div>
                <div className="text-xs text-gray-400">{isExpanded ? '▾' : '▸'}</div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-700/60 p-4 space-y-4">
                  <EntryPreview entry={entry} />
                  <ActionRow
                    entry={entry}
                    busy={isBusy}
                    onApprove={(note) =>
                      startTransition(() => {
                        setBusySlug(entry.slug)
                        void approveLibraryEntryAction(entry.slug, note)
                          .then((out) => {
                            if (!out.ok) showToast({ kind: 'error', msg: out.error })
                            else showToast({ kind: 'success', msg: 'Approved' })
                          })
                          .finally(() => setBusySlug(null))
                      })
                    }
                    onReject={(note) =>
                      startTransition(() => {
                        setBusySlug(entry.slug)
                        void rejectLibraryEntryAction(entry.slug, note)
                          .then((out) => {
                            if (!out.ok) showToast({ kind: 'error', msg: out.error })
                            else showToast({ kind: 'success', msg: 'Rejected' })
                          })
                          .finally(() => setBusySlug(null))
                      })
                    }
                    onArchive={(note) =>
                      startTransition(() => {
                        setBusySlug(entry.slug)
                        void archiveLibraryEntryAction(entry.slug, note)
                          .then((out) => {
                            if (!out.ok) showToast({ kind: 'error', msg: out.error })
                            else showToast({ kind: 'success', msg: 'Archived' })
                          })
                          .finally(() => setBusySlug(null))
                      })
                    }
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
            toast.kind === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-400/30'
              : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-400/30'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function EntryPreview({ entry }: { entry: ServiceLibraryEntryWithStatus }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Hero bullets
        </h4>
        <ul className="text-sm list-disc list-inside text-gray-700 dark:text-gray-200 space-y-0.5">
          {entry.heroBullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Body
        </h4>
        <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
          {entry.body}
        </p>
      </div>
      <div>
        <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Process ({entry.processSteps.length} steps)
        </h4>
        <ol className="text-sm text-gray-700 dark:text-gray-200 space-y-2">
          {entry.processSteps.map((step, i) => (
            <li key={i} className="border-l-2 border-violet-300 dark:border-violet-500 pl-3">
              <strong className="block">
                {i + 1}. {step.title}
              </strong>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <h4 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          FAQ ({entry.faq.length})
        </h4>
        <ul className="text-sm text-gray-700 dark:text-gray-200 space-y-2">
          {entry.faq.map((f, i) => (
            <li key={i}>
              <strong className="block">{f.question}</strong>
              <span className="text-gray-600 dark:text-gray-300">{f.answer}</span>
            </li>
          ))}
        </ul>
      </div>
      {entry.relatedSlugs && entry.relatedSlugs.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Related: {entry.relatedSlugs.join(', ')}
        </div>
      )}
    </div>
  )
}

function ActionRow({
  entry,
  busy,
  onApprove,
  onReject,
  onArchive,
}: {
  entry: ServiceLibraryEntryWithStatus
  busy: boolean
  onApprove: (note: string) => void
  onReject: (note: string) => void
  onArchive: (note: string) => void
}) {
  const [note, setNote] = useState('')
  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-gray-200 dark:border-gray-700/60">
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={
          entry.status === 'pending'
            ? 'Reviewer note (required for reject)'
            : 'Archive note (required)'
        }
        className="form-textarea w-full text-sm"
      />
      <div className="flex gap-2">
        {entry.status === 'pending' && (
          <>
            <button
              type="button"
              onClick={() => onApprove(note)}
              disabled={busy}
              className="btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? 'Working…' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!note.trim()) {
                  alert('Please add a reviewer note before rejecting.')
                  return
                }
                onReject(note)
              }}
              disabled={busy}
              className="btn-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
            >
              Reject
            </button>
          </>
        )}
        {entry.status === 'active' && (
          <button
            type="button"
            onClick={() => {
              if (!note.trim()) {
                alert('Please add a note explaining why you are archiving this entry.')
                return
              }
              onArchive(note)
            }}
            disabled={busy}
            className="btn-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
          >
            Archive
          </button>
        )}
      </div>
    </div>
  )
}
