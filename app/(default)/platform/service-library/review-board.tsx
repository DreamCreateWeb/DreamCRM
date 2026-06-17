'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import {
  approveLibraryEntryAction,
  archiveLibraryEntryAction,
  rejectLibraryEntryAction,
} from './admin-actions'
import LibraryEntryEditor from './library-entry-editor'
import { type Tone } from '@/lib/ui/encodings'
import { FilterChip } from '@/components/ui/filter-chip'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'

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

const STATUS_TONE: Record<ServiceLibraryEntryWithStatus['status'], Tone> = {
  pending: 'warn',
  active: 'ok',
  archived: 'neutral',
}

const TAB_LABELS: Record<Tab, string> = {
  pending: 'Pending',
  active: 'Active',
  archived: 'Archived',
}

export default function ReviewBoard({ entries, orgNames }: Props) {
  const [tab, setTab] = useState<Tab>('pending')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<ServiceLibraryEntryWithStatus | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'urgent'; msg: string } | null>(null)
  const [, startTransition] = useTransition()
  const [busySlug, setBusySlug] = useState<string | null>(null)

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
      <div className="flex flex-wrap gap-2 mb-5">
        {(['pending', 'active', 'archived'] as Tab[]).map((t) => (
          <FilterChip key={t} active={tab === t} onClick={() => setTab(t)} count={counts[t]}>
            {TAB_LABELS[t]}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        tab === 'pending' ? (
          <EmptyState
            icon="✨"
            title="No pending submissions"
            body="You're all caught up — there's nothing waiting for review."
          />
        ) : tab === 'archived' ? (
          <EmptyState
            title="No archived entries"
            body="Entries you archive will be kept here for the audit trail."
          />
        ) : (
          <EmptyState
            title="No active entries yet"
            body="Approved services will appear here, available to every clinic."
          />
        )
      ) : (
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
                  aria-expanded={isExpanded}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
                >
                  <div className="text-2xl w-10 text-center pt-0.5" aria-hidden="true">
                    {entry.icon ?? '🦷'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-800 dark:text-gray-100">
                        {entry.name}
                      </p>
                      <span className="text-xs uppercase tracking-wide bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5">
                        {entry.category}
                      </span>
                      <StatusPill tone={STATUS_TONE[entry.status]} label={entry.status} />
                      <span className="text-xs uppercase tracking-wide bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5">
                        origin: {entry.origin}
                      </span>
                      {entry.editedByAdmin && (
                        <span className="text-xs uppercase tracking-wide bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 rounded px-1.5 py-0.5">
                          Edited ✨
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                      {entry.shortDescription}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Submitted by: {orgLabel} · {entry.slug}
                    </p>
                    {entry.reviewNotes && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">
                        Note: {entry.reviewNotes}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400" aria-hidden="true">
                    {isExpanded ? '▾' : '▸'}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700/60 p-4 space-y-4">
                    <div className="flex justify-end">
                      <ActionButton variant="secondary" size="sm" onClick={() => setEditing(entry)}>
                        ✏️ Edit content
                      </ActionButton>
                    </div>
                    <EntryPreview entry={entry} />
                    <ActionRow
                      entry={entry}
                      busy={isBusy}
                      onApprove={(note) =>
                        startTransition(() => {
                          setBusySlug(entry.slug)
                          void approveLibraryEntryAction(entry.slug, note)
                            .then((out) => {
                              if (!out.ok) setToast({ kind: 'urgent', msg: out.error })
                              else setToast({ kind: 'ok', msg: 'Approved' })
                            })
                            .finally(() => setBusySlug(null))
                        })
                      }
                      onReject={(note) =>
                        startTransition(() => {
                          setBusySlug(entry.slug)
                          void rejectLibraryEntryAction(entry.slug, note)
                            .then((out) => {
                              if (!out.ok) setToast({ kind: 'urgent', msg: out.error })
                              else setToast({ kind: 'ok', msg: 'Rejected' })
                            })
                            .finally(() => setBusySlug(null))
                        })
                      }
                      onArchive={(note) =>
                        startTransition(() => {
                          setBusySlug(entry.slug)
                          void archiveLibraryEntryAction(entry.slug, note)
                            .then((out) => {
                              if (!out.ok) setToast({ kind: 'urgent', msg: out.error })
                              else setToast({ kind: 'ok', msg: 'Archived' })
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
      )}

      {editing && (
        <LibraryEntryEditor
          key={editing.slug}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setToast({ kind: 'ok', msg: 'Default updated — every clinic starts from this now.' })
          }}
        />
      )}

      {toast && (
        <FlashToast
          message={toast.msg}
          tone={toast.kind === 'ok' ? 'ok' : 'urgent'}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  )
}

function EntryPreview({ entry }: { entry: ServiceLibraryEntryWithStatus }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Hero bullets
        </h4>
        <ul className="text-sm list-disc list-inside text-gray-700 dark:text-gray-200 space-y-0.5">
          {entry.heroBullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Body
        </h4>
        <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
          {entry.body}
        </p>
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
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
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
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
            <ActionButton variant="primary" size="sm" onClick={() => onApprove(note)} disabled={busy}>
              {busy ? 'Working…' : 'Approve'}
            </ActionButton>
            <ActionButton
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (!note.trim()) {
                  alert('Please add a reviewer note before rejecting.')
                  return
                }
                onReject(note)
              }}
            >
              Reject
            </ActionButton>
          </>
        )}
        {entry.status === 'active' && (
          <ActionButton
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (!note.trim()) {
                alert('Please add a note explaining why you are archiving this entry.')
                return
              }
              onArchive(note)
            }}
          >
            Archive
          </ActionButton>
        )}
      </div>
    </div>
  )
}
