'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ROLE_LABELS,
  EMPLOYMENT_LABELS,
  APPLICATION_PIPELINE,
  formatComp,
  type JobPostingRow,
  type ApplicationRow,
  type ApplicationStatus,
  type JobStatus,
} from '@/lib/types/careers'
import { setJobStatusAction, deleteJobAction, setApplicationStatusAction, updateApplicationNotesAction } from './actions'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { StatusPill } from '@/components/ui/status-pill'
import { FilterChip } from '@/components/ui/filter-chip'
import { FlashToast } from '@/components/ui/flash-toast'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStat } from '@/components/ui/kpi-stat'
import { agingBorderClass, type AgingTierId, type PillLegendRow, type Tone } from '@/lib/ui/encodings'

// Job lifecycle → tone contract. draft/closed are inert (neutral); open is a
// live, healthy listing (ok); filled is a done-good outcome (ok).
const JOB_STATUS_TONE: Record<JobStatus, Tone> = {
  draft: 'neutral',
  open: 'ok',
  closed: 'neutral',
  filled: 'ok',
}
const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  filled: 'Filled',
}

// Applicant pipeline → tone contract. `new` NEEDS our review (warn — ball is
// ours); reviewing/interview are in flight (info); offer is a selected
// candidate (special); hired is done-good (ok); passed/archived are inert.
const APP_STATUS_TONE: Record<ApplicationStatus, Tone> = {
  new: 'warn',
  reviewing: 'info',
  interview: 'info',
  offer: 'special',
  hired: 'ok',
  rejected: 'neutral',
  archived: 'neutral',
}
const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Passed',
  archived: 'Archived',
}
const APP_STATUS_MEANING: Record<ApplicationStatus, string> = {
  new: 'Just applied — review them',
  reviewing: "You're looking them over",
  interview: 'In the interview stage',
  offer: 'An offer is out',
  hired: 'Hired — welcome aboard',
  rejected: 'Passed on this one',
  archived: 'Set aside',
}

const APP_PILL_LEGEND: PillLegendRow[] = (
  ['new', 'reviewing', 'interview', 'offer', 'hired', 'rejected'] as const
).map((s) => ({ tone: APP_STATUS_TONE[s], label: APP_STATUS_LABEL[s], meaning: APP_STATUS_MEANING[s] }))

// Aging tier for an un-reviewed (new) applicant — maps the module's existing
// thresholds onto the shared fresh → aging → overdue vocabulary. Reviewed
// applicants don't rot (the queue measures unreviewed wait time).
function applicantTier(app: ApplicationRow): AgingTierId | null {
  if (app.status !== 'new') return null
  if (app.ageHours < 24) return 'fresh'
  if (app.ageHours < 72) return 'aging'
  return 'overdue'
}

// The single most useful next move for an applicant: advance to the next
// pipeline stage. Returns null at the terminal stages.
function nextStage(status: ApplicationStatus): ApplicationStatus | null {
  const i = APPLICATION_PIPELINE.indexOf(status)
  if (i === -1 || i >= APPLICATION_PIPELINE.length - 1) return null
  return APPLICATION_PIPELINE[i + 1]
}

interface Props {
  jobs: JobPostingRow[]
  applications: ApplicationRow[]
  counts: Record<ApplicationStatus | 'all', number>
  stats: { openRoles: number; totalApplicants: number; newApplicants: number }
  publicBase: string | null
  orgName?: string
}

export default function CareersClient({ jobs, applications, counts, stats, publicBase, orgName = 'Your clinic' }: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const [tab, setTab] = useState<'roles' | 'applicants'>(stats.newApplicants > 0 ? 'applicants' : 'roles')
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  const selected = applications.find((a) => a.id === selectedId) ?? null
  const filtered = statusFilter === 'all' ? applications : applications.filter((a) => a.status === statusFilter)

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (err) {
        // Don't let a failed status/notes change vanish silently.
        setToast(err instanceof Error ? err.message : 'Something went wrong — please try again.')
      }
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
      <PageHeader
        eyebrow={`Website · ${orgName}`}
        title="Careers"
        subtitle="Post openings on your own site — they get picked up by Google for Jobs + Indeed for free. Applications land here in a triage pipeline."
        legend={<EncodingLegend aging="applicants" pills={APP_PILL_LEGEND} />}
        actions={
          <ActionButton variant="primary" breath size="sm" href="/careers/new">
            + New role
          </ActionButton>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6 max-w-md">
        <KpiStat label="Open roles" value={stats.openRoles} />
        <KpiStat label="Applicants" value={stats.totalApplicants} />
        <KpiStat
          label="New"
          value={stats.newApplicants}
          tone={stats.newApplicants > 0 ? 'warn' : undefined}
          sub={stats.newApplicants > 0 ? 'Needs review' : undefined}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200 dark:border-gray-700">
        {(['roles', 'applicants'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 ${
              tab === t
                ? 'border-teal-500 text-gray-900 dark:text-gray-100'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            {t === 'roles' ? `Roles (${jobs.length})` : `Applicants (${counts.all})`}
          </button>
        ))}
      </div>

      {tab === 'roles' ? (
        <div className="space-y-2.5">
          {jobs.length === 0 ? (
            <EmptyState
              icon="📣"
              title="No roles yet"
              body="Post your first opening — it goes live on your site and gets indexed by Google for Jobs and Indeed for free."
              action={
                <ActionButton variant="primary" size="sm" href="/careers/new">
                  + New role
                </ActionButton>
              }
            />
          ) : (
            jobs.map((j) => (
              <div
                key={j.id}
                className="v2-card p-4 flex flex-wrap items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{j.title}</span>
                    <StatusPill tone={JOB_STATUS_TONE[j.status]} label={JOB_STATUS_LABEL[j.status]} />
                    {j.applicantCount > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                        {j.applicantCount} applicant{j.applicantCount === 1 ? '' : 's'}
                        {j.newApplicantCount > 0 && <span className="text-amber-700 dark:text-amber-300"> · {j.newApplicantCount} new</span>}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {ROLE_LABELS[j.role]} · {EMPLOYMENT_LABELS[j.employmentType]}
                    {formatComp(j) ? <> · <span className="font-mono-num">{formatComp(j)}</span></> : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {j.status === 'open' && publicBase && (
                    <a href={`${publicBase}/${j.slug}`} target="_blank" rel="noopener" className="btn-sm border-transparent shadow-none text-gray-500 hover:text-teal-700 dark:text-gray-400">
                      View ↗
                    </a>
                  )}
                  <ActionButton variant="ghost" size="sm" href={`/careers/${j.id}`}>
                    Edit
                  </ActionButton>
                  {j.status !== 'open' ? (
                    <ActionButton variant="secondary" size="sm" disabled={isPending} onClick={() => run(() => setJobStatusAction(j.id, 'open'))}>
                      Publish
                    </ActionButton>
                  ) : (
                    <ActionButton variant="secondary" size="sm" disabled={isPending} onClick={() => run(() => setJobStatusAction(j.id, 'closed'))}>
                      Close
                    </ActionButton>
                  )}
                  <ActionButton
                    variant="danger"
                    size="sm"
                    disabled={isPending}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Delete “${j.title}”?`,
                          message: 'This removes its applications too.',
                          confirmLabel: 'Delete',
                          danger: true,
                        })
                      )
                        run(() => deleteJobAction(j.id))
                    }}
                  >
                    Delete
                  </ActionButton>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4">
          <div>
            {/* Filter chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(['all', ...APPLICATION_PIPELINE, 'rejected', 'archived'] as const).map((s) => (
                <FilterChip
                  key={s}
                  active={statusFilter === s}
                  count={counts[s]}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'All' : APP_STATUS_LABEL[s]}
                </FilterChip>
              ))}
            </div>
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <EmptyState
                  icon="🗂️"
                  title={statusFilter === 'all' ? 'No applicants yet' : 'Nothing in this view'}
                  body={
                    statusFilter === 'all'
                      ? 'When someone applies through your site, they land here for review.'
                      : 'No applicants match this filter right now.'
                  }
                />
              ) : (
                filtered.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left v2-card-interactive border-l-4 ${agingBorderClass(applicantTier(a))} p-3 ${
                      selectedId === a.id ? 'ring-1 ring-inset ring-teal-500/40 bg-teal-500/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{a.name}</span>
                      <StatusPill tone={APP_STATUS_TONE[a.status]} label={APP_STATUS_LABEL[a.status]} title={APP_STATUS_MEANING[a.status]} className="shrink-0" />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {a.jobTitle} · applied <span className="font-mono-num">{a.ageHours < 24 ? `${a.ageHours}h ago` : `${Math.floor(a.ageHours / 24)}d ago`}</span>
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Drawer */}
          <div className="lg:sticky lg:top-4 h-fit">
            {selected ? (
              <ApplicantDrawer key={selected.id} app={selected} isPending={isPending} run={run} />
            ) : (
              <div className="v2-well p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Select an applicant to review.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ApplicantDrawer({
  app,
  isPending,
  run,
}: {
  app: ApplicationRow
  isPending: boolean
  run: (fn: () => Promise<void>) => void
}) {
  const [notes, setNotes] = useState(app.notes ?? '')
  const [rating, setRating] = useState(app.rating ?? 0)

  const advance = nextStage(app.status)
  // Other pipeline stages (not the current one, not the one-click advance) get
  // demoted to secondary "Move to X" buttons so there's a single primary.
  const otherStages = APPLICATION_PIPELINE.filter((s) => s !== app.status && s !== advance)

  return (
    <div className="v2-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{app.name}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{app.jobTitle}</p>
        </div>
        <StatusPill tone={APP_STATUS_TONE[app.status]} label={APP_STATUS_LABEL[app.status]} title={APP_STATUS_MEANING[app.status]} />
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <a href={`mailto:${app.email}`} className="block text-teal-700 dark:text-teal-400 hover:underline truncate">{app.email}</a>
        {app.phone && <a href={`tel:${app.phone}`} className="block text-gray-600 dark:text-gray-300">{app.phone}</a>}
        {app.linkedinUrl && (
          <a href={app.linkedinUrl} target="_blank" rel="noopener" className="block text-teal-700 dark:text-teal-400 hover:underline truncate">
            LinkedIn ↗
          </a>
        )}
      </div>

      {app.coverNote && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap border-l-2 border-[color:var(--color-hairline-strong)] pl-3">
          {app.coverNote}
        </p>
      )}

      {/* Primary action — advance one stage. Résumé download is secondary;
          other pipeline moves are secondary; Pass is danger; Archive is ghost. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {advance && (
          <ActionButton variant="primary" size="sm" disabled={isPending} onClick={() => run(() => setApplicationStatusAction(app.id, advance))}>
            Move to {APP_STATUS_LABEL[advance]}
          </ActionButton>
        )}
        {app.resumeUrl && (
          // Plain <a> (new-tab) styled as a secondary ActionButton — the shared
          // button primitive doesn't forward target/rel.
          <a
            href={app.resumeUrl}
            target="_blank"
            rel="noopener"
            className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300"
          >
            Download résumé ↗
          </a>
        )}
      </div>

      {/* Other pipeline moves */}
      <div className="mt-3">
        <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">Move to</p>
        <div className="flex flex-wrap gap-1.5">
          {otherStages.map((s) => (
            <ActionButton key={s} variant="secondary" size="sm" disabled={isPending} onClick={() => run(() => setApplicationStatusAction(app.id, s))}>
              {APP_STATUS_LABEL[s]}
            </ActionButton>
          ))}
          {app.status !== 'rejected' && (
            <ActionButton variant="danger" size="sm" disabled={isPending} onClick={() => run(() => setApplicationStatusAction(app.id, 'rejected'))}>
              Pass
            </ActionButton>
          )}
          {app.status !== 'archived' && (
            <ActionButton variant="ghost" size="sm" disabled={isPending} onClick={() => run(() => setApplicationStatusAction(app.id, 'archived'))}>
              Archive
            </ActionButton>
          )}
        </div>
      </div>

      {/* Rating + notes */}
      <div className="mt-4">
        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n === rating ? 0 : n)}
              className={`text-lg leading-none ${n <= rating ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}`}
              aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Private notes for the team…"
          className="w-full text-sm px-3 py-2 rounded-[var(--r-sm)] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 resize-none"
        />
        <div className="mt-2">
          <ActionButton variant="secondary" size="sm" disabled={isPending} onClick={() => run(() => updateApplicationNotesAction(app.id, notes || null, rating || null))}>
            Save notes
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
