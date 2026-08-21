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
import { SearchInput } from '@/components/ui/search-input'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'

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
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<ServiceLibraryEntryWithStatus | null>(null)
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<{ slug: string; act: 'approve' | 'reject' | 'archive' } | null>(null)

  const counts = useMemo(
    () => ({
      pending: entries.filter((e) => e.status === 'pending').length,
      active: entries.filter((e) => e.status === 'active').length,
      archived: entries.filter((e) => e.status === 'archived').length,
    }),
    [entries],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter(
      (e) =>
        e.status === tab &&
        (q === '' ||
          e.name.toLowerCase().includes(q) ||
          e.slug.includes(q) ||
          (e.submittedByOrgId ? (orgNames[e.submittedByOrgId] ?? '').toLowerCase().includes(q) : false)),
    )
  }, [entries, tab, query, orgNames])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {(['pending', 'active', 'archived'] as Tab[]).map((t) => (
          <FilterChip key={t} active={tab === t} onClick={() => setTab(t)} count={counts[t]}>
            {TAB_LABELS[t]}
          </FilterChip>
        ))}
        <div className="ml-auto w-56">
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
            placeholder="Search name, slug, clinic…"
            ariaLabel="Search library entries"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        query.trim() !== '' ? (
          <EmptyState
            icon="🔍"
            title="Nothing matches that search"
            body="The entries are still here — clear the search to see them."
            action={
              <ActionButton variant="secondary" size="sm" onClick={() => setQuery('')}>
                Clear search
              </ActionButton>
            }
          />
        ) : tab === 'pending' ? (
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

            return (
              <div key={entry.slug} className="v2-card">
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
                      <span className="text-xs uppercase tracking-wide bg-[color:var(--color-surface-sunk)] text-gray-600 dark:text-gray-300 rounded px-1.5 py-0.5">
                        {entry.origin === 'platform' ? 'Platform-seeded' : 'Clinic-submitted'}
                      </span>
                      {entry.editedByAdmin && (
                        <span
                          className="text-xs uppercase tracking-wide bg-violet-500/10 text-violet-700 dark:text-violet-300 rounded px-1.5 py-0.5"
                          title="A platform admin has hand-edited this default"
                        >
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
                      busyAction={busy?.slug === entry.slug ? busy.act : null}
                      onApprove={(note) =>
                        startTransition(() => {
                          setBusy({ slug: entry.slug, act: 'approve' })
                          void approveLibraryEntryAction(entry.slug, note)
                            .then((out) => {
                              if (!out.ok) toast(out.error, { tone: 'urgent' })
                              else toast('Approved — available to every clinic.')
                            })
                            .finally(() => setBusy(null))
                        })
                      }
                      onReject={(note) =>
                        startTransition(() => {
                          setBusy({ slug: entry.slug, act: 'reject' })
                          void rejectLibraryEntryAction(entry.slug, note)
                            .then((out) => {
                              if (!out.ok) toast(out.error, { tone: 'urgent' })
                              else toast('Rejected — the submitter keeps their own copy.')
                            })
                            .finally(() => setBusy(null))
                        })
                      }
                      onArchive={(note) =>
                        startTransition(() => {
                          setBusy({ slug: entry.slug, act: 'archive' })
                          void archiveLibraryEntryAction(entry.slug, note)
                            .then((out) => {
                              if (!out.ok) toast(out.error, { tone: 'urgent' })
                              else toast('Archived.')
                            })
                            .finally(() => setBusy(null))
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
            toast('Default updated — every clinic starts from this now.')
          }}
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
  busyAction,
  onApprove,
  onReject,
  onArchive,
}: {
  entry: ServiceLibraryEntryWithStatus
  busyAction: 'approve' | 'reject' | 'archive' | null
  onApprove: (note: string) => void
  onReject: (note: string) => void
  onArchive: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const busy = busyAction !== null
  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-gray-200 dark:border-gray-700/60">
      <textarea
        rows={2}
        value={note}
        onChange={(e) => {
          setNote(e.target.value)
          if (noteError) setNoteError(null)
        }}
        placeholder={
          entry.status === 'pending'
            ? 'Reviewer note (required for reject)'
            : 'Archive note (required)'
        }
        aria-invalid={noteError ? true : undefined}
        className="form-textarea w-full text-sm"
      />
      {noteError && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {noteError}
        </p>
      )}
      <div className="flex gap-2">
        {entry.status === 'pending' && (
          <>
            <ActionButton
              variant="primary"
              size="sm"
              onClick={() => onApprove(note)}
              pending={busyAction === 'approve'}
              disabled={busy}
            >
              Approve
            </ActionButton>
            <ActionButton
              variant="danger"
              size="sm"
              pending={busyAction === 'reject'}
              disabled={busy}
              onClick={() => {
                if (!note.trim()) {
                  setNoteError('Add a reviewer note before rejecting — the submitter sees it.')
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
            pending={busyAction === 'archive'}
            disabled={busy}
            onClick={() => {
              if (!note.trim()) {
                setNoteError('Add a note explaining why you are archiving this entry.')
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
