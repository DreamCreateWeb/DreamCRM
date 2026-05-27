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

const JOB_STATUS_STYLE: Record<JobStatus, string> = {
  draft: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  closed: 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
  filled: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
}

const APP_STATUS_STYLE: Record<ApplicationStatus, string> = {
  new: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  reviewing: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  interview: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  offer: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  hired: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  archived: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
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

// Aging tint for un-reviewed (new) applicants — the Leads "rotting" borrow.
function agingBorder(app: ApplicationRow): string {
  if (app.status !== 'new') return 'border-l-stone-200 dark:border-l-stone-700'
  if (app.ageHours < 24) return 'border-l-emerald-400'
  if (app.ageHours < 72) return 'border-l-amber-400'
  return 'border-l-rose-400'
}

interface Props {
  jobs: JobPostingRow[]
  applications: ApplicationRow[]
  counts: Record<ApplicationStatus | 'all', number>
  stats: { openRoles: number; totalApplicants: number; newApplicants: number }
  publicBase: string | null
}

export default function CareersClient({ jobs, applications, counts, stats, publicBase }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'roles' | 'applicants'>(stats.newApplicants > 0 ? 'applicants' : 'roles')
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selected = applications.find((a) => a.id === selectedId) ?? null
  const filtered = statusFilter === 'all' ? applications : applications.filter((a) => a.status === statusFilter)

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn()
      router.refresh()
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Hero */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">Hiring</p>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">Careers</h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
            Post openings on your own site — they get picked up by Google for Jobs + Indeed for free. Applications land
            here in a triage pipeline.
          </p>
        </div>
        <Link
          href="/careers/new"
          className="inline-flex items-center px-4 py-2 rounded-lg text-[13px] font-semibold bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
        >
          + New role
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6 max-w-md">
        <Stat label="Open roles" value={stats.openRoles} />
        <Stat label="Applicants" value={stats.totalApplicants} />
        <Stat label="New" value={stats.newApplicants} tone={stats.newApplicants > 0 ? 'alert' : undefined} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-stone-200 dark:border-stone-700">
        {(['roles', 'applicants'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[13px] font-medium -mb-px border-b-2 ${
              tab === t
                ? 'border-violet-500 text-stone-900 dark:text-stone-100'
                : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700'
            }`}
          >
            {t === 'roles' ? `Roles (${jobs.length})` : `Applicants (${counts.all})`}
          </button>
        ))}
      </div>

      {tab === 'roles' ? (
        <div className="space-y-2.5">
          {jobs.length === 0 ? (
            <Empty>No roles yet. Click &ldquo;New role&rdquo; to post your first opening.</Empty>
          ) : (
            jobs.map((j) => (
              <div
                key={j.id}
                className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4 flex flex-wrap items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-stone-900 dark:text-stone-100">{j.title}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${JOB_STATUS_STYLE[j.status]}`}>
                      {j.status}
                    </span>
                    {j.applicantCount > 0 && (
                      <span className="text-[11px] text-stone-500 dark:text-stone-400">
                        {j.applicantCount} applicant{j.applicantCount === 1 ? '' : 's'}
                        {j.newApplicantCount > 0 && <span className="text-sky-600 dark:text-sky-400"> · {j.newApplicantCount} new</span>}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">
                    {ROLE_LABELS[j.role]} · {EMPLOYMENT_LABELS[j.employmentType]}
                    {formatComp(j) ? ` · ${formatComp(j)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[12px]">
                  {j.status === 'open' && publicBase && (
                    <a href={`${publicBase}/${j.slug}`} target="_blank" rel="noopener" className="px-2 py-1 rounded text-stone-500 hover:text-violet-600 dark:text-stone-400">
                      View
                    </a>
                  )}
                  <Link href={`/careers/${j.id}`} className="px-2 py-1 rounded text-stone-600 hover:text-violet-600 dark:text-stone-300">
                    Edit
                  </Link>
                  {j.status !== 'open' ? (
                    <button
                      disabled={isPending}
                      onClick={() => run(() => setJobStatusAction(j.id, 'open'))}
                      className="px-2 py-1 rounded font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    >
                      Publish
                    </button>
                  ) : (
                    <button
                      disabled={isPending}
                      onClick={() => run(() => setJobStatusAction(j.id, 'closed'))}
                      className="px-2 py-1 rounded text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                    >
                      Close
                    </button>
                  )}
                  <button
                    disabled={isPending}
                    onClick={() => {
                      if (confirm(`Delete "${j.title}"? This removes its applications too.`)) run(() => deleteJobAction(j.id))
                    }}
                    className="px-2 py-1 rounded text-stone-400 hover:text-rose-600 dark:hover:text-rose-400"
                  >
                    Delete
                  </button>
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
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-[12px] px-2.5 py-1 rounded-full border ${
                    statusFilter === s
                      ? 'bg-stone-900 text-white border-stone-900 dark:bg-stone-100 dark:text-stone-900 dark:border-stone-100'
                      : 'border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300'
                  }`}
                >
                  {s === 'all' ? 'All' : APP_STATUS_LABEL[s]} {counts[s] > 0 && <span className="opacity-60">{counts[s]}</span>}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <Empty>No applicants in this view.</Empty>
              ) : (
                filtered.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700/60 border-l-4 ${agingBorder(a)} p-3 ${
                      selectedId === a.id ? 'ring-2 ring-violet-300 dark:ring-violet-500/40' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-stone-900 dark:text-stone-100 truncate">{a.name}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${APP_STATUS_STYLE[a.status]}`}>
                        {APP_STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5 truncate">
                      {a.jobTitle} · applied {a.ageHours < 24 ? `${a.ageHours}h ago` : `${Math.floor(a.ageHours / 24)}d ago`}
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
              <div className="bg-white dark:bg-stone-900 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-6 text-center text-[13px] text-stone-400 dark:text-stone-500">
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

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-stone-900 dark:text-stone-100">{app.name}</h3>
          <p className="text-[12px] text-stone-500 dark:text-stone-400">{app.jobTitle}</p>
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${APP_STATUS_STYLE[app.status]}`}>
          {APP_STATUS_LABEL[app.status]}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-[13px]">
        <a href={`mailto:${app.email}`} className="block text-violet-600 dark:text-violet-400 hover:underline truncate">{app.email}</a>
        {app.phone && <a href={`tel:${app.phone}`} className="block text-stone-600 dark:text-stone-300">{app.phone}</a>}
        {app.linkedinUrl && (
          <a href={app.linkedinUrl} target="_blank" rel="noopener" className="block text-violet-600 dark:text-violet-400 hover:underline truncate">
            LinkedIn
          </a>
        )}
        {app.resumeUrl && (
          <a href={app.resumeUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 mt-1 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200">
            Download résumé
          </a>
        )}
      </div>

      {app.coverNote && (
        <p className="mt-3 text-[13px] text-stone-600 dark:text-stone-300 whitespace-pre-wrap border-l-2 border-stone-200 dark:border-stone-700 pl-3">
          {app.coverNote}
        </p>
      )}

      {/* Pipeline */}
      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">Move to</p>
        <div className="flex flex-wrap gap-1.5">
          {APPLICATION_PIPELINE.filter((s) => s !== app.status).map((s) => (
            <button
              key={s}
              disabled={isPending}
              onClick={() => run(() => setApplicationStatusAction(app.id, s))}
              className="text-[12px] px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              {APP_STATUS_LABEL[s]}
            </button>
          ))}
          <button
            disabled={isPending}
            onClick={() => run(() => setApplicationStatusAction(app.id, 'rejected'))}
            className="text-[12px] px-2.5 py-1 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            Pass
          </button>
        </div>
      </div>

      {/* Rating + notes */}
      <div className="mt-4">
        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n === rating ? 0 : n)}
              className={`text-lg leading-none ${n <= rating ? 'text-amber-400' : 'text-stone-300 dark:text-stone-600'}`}
              aria-label={`Rate ${n}`}
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
          className="w-full text-[13px] px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 resize-none"
        />
        <button
          disabled={isPending}
          onClick={() => run(() => updateApplicationNotesAction(app.id, notes || null, rating || null))}
          className="mt-2 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
        >
          Save notes
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'alert' }) {
  return (
    <div className="px-3 py-2.5 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700/60">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${tone === 'alert' ? 'text-sky-600 dark:text-sky-400' : 'text-stone-900 dark:text-stone-100'}`}>
        {value}
      </p>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center text-[13px] text-stone-400 dark:text-stone-500">
      {children}
    </div>
  )
}
