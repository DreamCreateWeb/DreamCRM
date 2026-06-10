'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import {
  AGENCY_PROJECT_STATUSES,
  AGENCY_PROJECT_TYPES,
  AGENCY_PROJECT_STATUS_LABELS,
  AGENCY_PROJECT_TYPE_LABELS,
  type AgencyProjectStatus,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'
import type { PipelineProject } from '@/lib/services/projects'
import { formatMoneyShort } from '@/lib/utils/format'
import { deletePipelineProject, moveProjectStage } from './pipeline-actions'
import { TONE_PILL, type Tone } from '@/lib/ui/encodings'
import { FilterChip } from '@/components/ui/filter-chip'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'

const PRIMARY_STATUSES: AgencyProjectStatus[] = ['lead', 'discovery', 'in_progress', 'review', 'completed']
const SIDE_STATUSES: AgencyProjectStatus[] = ['on_hold', 'cancelled']

const TYPE_ICONS: Record<AgencyProjectType, string> = {
  website: '🌐',
  ecommerce: '🛒',
  intake_form: '📝',
  videography: '🎥',
  photography: '📸',
  content: '✍️',
  other: '📦',
}

const COLUMN_TONES: Record<AgencyProjectStatus, string> = {
  lead: 'border-gray-400/50',
  discovery: 'border-amber-400/60',
  in_progress: 'border-violet-400/70',
  review: 'border-sky-400/70',
  completed: 'border-emerald-500/70',
  on_hold: 'border-yellow-400/60',
  cancelled: 'border-red-400/60',
}

interface Props {
  projects: PipelineProject[]
}

export default function PipelineBoard({ projects }: Props) {
  const [typeFilter, setTypeFilter] = useState<'all' | AgencyProjectType>('all')
  const [clinicFilter, setClinicFilter] = useState<string>('all')
  const [showSide, setShowSide] = useState(false)
  const [search, setSearch] = useState('')

  const clinicOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of projects) {
      if (p.organizationId && p.clinicName) seen.set(p.organizationId, p.clinicName)
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [projects])

  const typeCounts = useMemo(() => {
    const c: Record<AgencyProjectType, number> = {
      website: 0,
      ecommerce: 0,
      intake_form: 0,
      videography: 0,
      photography: 0,
      content: 0,
      other: 0,
    }
    for (const p of projects) c[p.type as AgencyProjectType]++
    return c
  }, [projects])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return projects.filter((p) => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false
      if (clinicFilter !== 'all' && p.organizationId !== clinicFilter) return false
      if (term) {
        const hay = [p.title, p.clinicName, p.description, AGENCY_PROJECT_TYPE_LABELS[p.type as AgencyProjectType]]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(term)) return false
      }
      return true
    })
  }, [projects, typeFilter, clinicFilter, search])

  const byStatus = useMemo(() => {
    const map = new Map<AgencyProjectStatus, PipelineProject[]>()
    for (const s of AGENCY_PROJECT_STATUSES) map.set(s, [])
    for (const p of filtered) map.get(p.status as AgencyProjectStatus)?.push(p)
    return map
  }, [filtered])

  const sideCount = (byStatus.get('on_hold')?.length ?? 0) + (byStatus.get('cancelled')?.length ?? 0)

  if (projects.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        <EmptyState
          icon="🗂"
          title="No projects in the pipeline yet"
          body="Add your first agency project — a website build, intake form, photo or video shoot, etc. — to see it appear in the kanban below."
        />
      </div>
    )
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-4 py-3 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} count={projects.length}>
              All
            </FilterChip>
            {AGENCY_PROJECT_TYPES.map((t) => (
              <FilterChip
                key={t}
                active={typeFilter === t}
                onClick={() => setTypeFilter(t)}
                count={typeCounts[t]}
                title={AGENCY_PROJECT_TYPE_LABELS[t]}
              >
                <span aria-hidden="true">{TYPE_ICONS[t]}</span> {AGENCY_PROJECT_TYPE_LABELS[t]}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, clinic, notes…"
              aria-label="Search projects"
              className="form-input text-sm py-1.5 w-56"
            />
            {clinicOptions.length > 0 && (
              <select
                aria-label="Filter by clinic"
                value={clinicFilter}
                onChange={(e) => setClinicFilter(e.target.value)}
                className="form-select text-sm py-1.5"
              >
                <option value="all">All clinics</option>
                {clinicOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Primary kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {PRIMARY_STATUSES.map((status) => (
          <Column key={status} status={status} projects={byStatus.get(status) ?? []} />
        ))}
      </div>

      {/* Side rail */}
      {sideCount > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowSide((v) => !v)}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            aria-expanded={showSide}
          >
            {showSide ? '▾' : '▸'} On hold & cancelled ({sideCount})
          </button>
          {showSide && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {SIDE_STATUSES.map((status) => (
                <Column key={status} status={status} projects={byStatus.get(status) ?? []} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Column({ status, projects }: { status: AgencyProjectStatus; projects: PipelineProject[] }) {
  const totalValue = projects.reduce((acc, p) => acc + (p.budgetCents ?? 0), 0)
  return (
    <div className={`bg-gray-50 dark:bg-gray-900/20 border-t-2 ${COLUMN_TONES[status]} rounded-lg p-2`}>
      <header className="flex items-center justify-between px-2 py-1.5">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
          {AGENCY_PROJECT_STATUS_LABELS[status]}
          <span className="ml-1.5 text-gray-500 dark:text-gray-400 font-medium normal-case tabular-nums">
            {projects.length}
          </span>
        </div>
        {totalValue > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium tabular-nums">
            {formatMoneyShort(totalValue)}
          </div>
        )}
      </header>
      <div className="space-y-2 mt-1.5 min-h-[80px]">
        {projects.length === 0 ? (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">No projects</div>
        ) : (
          projects.map((p) => <ProjectCard key={p.id} project={p} />)
        )}
      </div>
    </div>
  )
}

function ProjectCard({ project }: { project: PipelineProject }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const now = Date.now()
  const isOverdue = project.dueDate && new Date(project.dueDate).getTime() < now &&
    !['completed', 'cancelled'].includes(project.status)
  const daysInStage = Math.floor((now - new Date(project.updatedAt).getTime()) / (24 * 60 * 60 * 1000))

  function handleMove(next: string) {
    if (!next || next === project.status) return
    setError(null)
    startTransition(async () => {
      try {
        await moveProjectStage({ id: project.id, status: next })
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  function handleDelete() {
    if (!confirm(`Delete "${project.title}"? This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      try {
        await deletePipelineProject(project.id)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div
      className={`bg-white dark:bg-gray-800 shadow-sm rounded-lg p-3 border border-gray-100 dark:border-gray-700/60 ${pending ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0" aria-hidden>{TYPE_ICONS[project.type as AgencyProjectType] ?? '📦'}</span>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm text-gray-800 dark:text-gray-100 leading-tight truncate">
            {project.title}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {project.organizationId && project.clinicName ? (
              <Link
                href={`/ecommerce/customers/${project.organizationId}`}
                className="hover:text-violet-600 dark:hover:text-violet-400"
              >
                {project.clinicName}
              </Link>
            ) : (
              <span className="italic text-gray-500 dark:text-gray-400">No clinic linked</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" suppressHydrationWarning>
        {project.budgetCents != null && project.budgetCents > 0 && (
          <Pill tone="neutral">{formatMoneyShort(project.budgetCents)}</Pill>
        )}
        {project.dueDate && (
          <Pill tone={isOverdue ? 'urgent' : 'neutral'}>
            {isOverdue ? 'Overdue ' : 'Due '}
            {new Date(project.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Pill>
        )}
        {daysInStage >= 14 && !['completed', 'cancelled'].includes(project.status) && (
          <Pill tone="warn">{daysInStage}d in stage</Pill>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <select
          value={project.status}
          onChange={(e) => handleMove(e.target.value)}
          disabled={pending}
          aria-label={`Stage for ${project.title}`}
          className="form-select text-xs py-1 pr-7 pl-2 max-w-[12rem] truncate"
        >
          {AGENCY_PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {AGENCY_PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <ActionButton
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={pending}
          aria-label={`Delete ${project.title}`}
          className="text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 px-1"
          title="Delete"
        >
          ×
        </ActionButton>
      </div>
      {error && <div className="text-xs text-rose-700 dark:text-rose-300 mt-1.5">{error}</div>}
    </div>
  )
}

function Pill({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  return <span className={`text-xs font-medium px-1.5 py-0.5 rounded tabular-nums ${TONE_PILL[tone]}`}>{children}</span>
}
