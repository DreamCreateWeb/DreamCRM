'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type {
  PatientListRow,
  PatientListFilters,
  PatientListSort,
  PatientFilterMeta,
} from '@/lib/services/patients'
import { GlyphCluster } from './glyph-cluster'
import BulkMessageModal from './bulk-message-modal'
import AddPatientModal from './add-patient-modal'

function money(cents: number): string {
  if (cents === 0) return '—'
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toFixed(0)}`
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtRelative(d: Date | null): string {
  if (!d) return ''
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days < 0) {
    const absDays = Math.abs(days)
    if (absDays === 1) return 'tomorrow'
    if (absDays < 7) return `in ${absDays}d`
    if (absDays < 30) return `in ${Math.floor(absDays / 7)}w`
    return `in ${Math.floor(absDays / 30)}mo`
  }
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function lastVisitTone(d: Date | null): string {
  if (!d) return 'text-gray-500 dark:text-gray-400'
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days < 90) return 'text-emerald-700 dark:text-emerald-300'
  if (days < 180) return 'text-amber-700 dark:text-amber-300'
  return 'text-red-700 dark:text-red-300'
}

const RECALL_PILL: Record<string, string> = {
  scheduled: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  due: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  overdue: 'bg-red-500/15 text-red-700 dark:text-red-300',
  na: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
}

const RECALL_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  due: 'Due',
  overdue: 'Overdue',
  na: '—',
}

const SOURCE_LABEL: Record<string, string> = {
  website: 'Website',
  booking: 'Booking widget',
  referral: 'Referral',
  walk_in: 'Walk-in',
  manual: 'Manual',
  lead_form: 'Contact form',
  invite: 'Invite',
}

export default function PatientsList({
  rows,
  meta,
  filters,
  sort,
  orgName,
}: {
  rows: PatientListRow[]
  meta: PatientFilterMeta
  filters: PatientListFilters
  sort: PatientListSort
  orgName: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const [isPending, startTransition] = useTransition()

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }
  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key); else next.set(key, value)
    startTransition(() => router.push(`/patients?${next.toString()}`))
  }

  function setFlag(key: 'balance' | 'intake' | 'birthday', on: boolean) {
    setParam(key, on ? '1' : null)
  }

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setParam('q', searchInput.trim() || null)
  }

  function cycleSortFor(field: PatientListSort['field']) {
    const current = sort.field === field ? sort.direction : null
    const nextDir = current === 'asc' ? 'desc' : 'asc'
    setParam('sort', `${field}:${nextDir}`)
  }

  const sortArrow = (field: PatientListSort['field']) => {
    if (sort.field !== field) return ''
    return sort.direction === 'asc' ? ' ▲' : ' ▼'
  }

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  )

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
            Patients · {orgName}
          </p>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            {rows.length} {rows.length === 1 ? 'patient' : 'patients'}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAddOpen(true)}
            className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            + Add patient
          </button>
        </div>
      </div>

      {/* ── Filter chips + search ────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <form onSubmit={submitSearch} className="flex-1 min-w-[260px]">
          <input
            type="text"
            placeholder="Search by name, email, or phone"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="form-input w-full text-sm"
          />
        </form>
        <div className="flex flex-wrap gap-2 items-center">
          <Chip
            label="All"
            active={!filters.status || filters.status === 'all'}
            onClick={() => setParam('status', null)}
          />
          <Chip
            label="New (≤30d)"
            active={filters.status === 'new'}
            onClick={() => setParam('status', filters.status === 'new' ? null : 'new')}
          />
          <Chip
            label="Recall due"
            active={filters.status === 'recall_due'}
            onClick={() => setParam('status', filters.status === 'recall_due' ? null : 'recall_due')}
          />
          <Chip
            label="Lapsed"
            active={filters.status === 'inactive'}
            onClick={() => setParam('status', filters.status === 'inactive' ? null : 'inactive')}
          />
          <Chip
            label="$ Has balance"
            active={!!filters.hasBalance}
            onClick={() => setFlag('balance', !filters.hasBalance)}
          />
          <Chip
            label="📝 Missing intake"
            active={!!filters.missingIntake}
            onClick={() => setFlag('intake', !filters.missingIntake)}
          />
          <Chip
            label="🎂 Birthday this month"
            active={!!filters.birthdayThisMonth}
            onClick={() => setFlag('birthday', !filters.birthdayThisMonth)}
          />
          {meta.sources.length > 0 && (
            <select
              value={(filters.sources?.[0]) ?? ''}
              onChange={(e) => setParam('source', e.target.value || null)}
              className="form-select text-xs py-1"
            >
              <option value="">Any source</option>
              {meta.sources.map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s] ?? s}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="form-checkbox"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer" onClick={() => cycleSortFor('name')}>
                    Patient{sortArrow('name')}
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer" onClick={() => cycleSortFor('lastVisit')}>
                    Last visit{sortArrow('lastVisit')}
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer" onClick={() => cycleSortFor('nextVisit')}>
                    Next visit{sortArrow('nextVisit')}
                  </th>
                  <th className="px-4 py-3 text-left">Recall</th>
                  <th className="px-4 py-3 text-right cursor-pointer" onClick={() => cycleSortFor('balance')}>
                    Balance{sortArrow('balance')}
                  </th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left cursor-pointer" onClick={() => cycleSortFor('lastActivity')}>
                    Last contact{sortArrow('lastActivity')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {rows.map((r) => (
                  <PatientRow
                    key={r.id}
                    row={r}
                    selected={selected.has(r.id)}
                    onToggle={() => toggleOne(r.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Sticky bulk action bar ───────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 sm:bottom-6 sm:right-6 sm:left-auto sm:rounded-xl bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-900 shadow-2xl px-5 py-3 flex items-center gap-3 z-30">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <button
            onClick={() => setBulkOpen(true)}
            className="text-xs font-semibold uppercase tracking-wider bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 px-3 py-1.5 rounded-md"
          >
            Send email
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-300 dark:text-gray-600 hover:text-white dark:hover:text-black px-2"
          >
            Clear
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {isPending && (
        <div className="fixed inset-0 bg-black/5 dark:bg-white/5 pointer-events-none z-20" />
      )}

      {bulkOpen && (
        <BulkMessageModal
          patients={selectedRows}
          onClose={() => setBulkOpen(false)}
          onSent={() => { setBulkOpen(false); setSelected(new Set()) }}
        />
      )}
      {addOpen && <AddPatientModal onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${
        active
          ? 'bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-800'
          : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  )
}

function PatientRow({
  row,
  selected,
  onToggle,
}: {
  row: PatientListRow
  selected: boolean
  onToggle: () => void
}) {
  const balanceClass = row.outstandingBalanceCents > 0
    ? 'text-red-700 dark:text-red-300 font-semibold'
    : 'text-gray-400 dark:text-gray-500'
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="form-checkbox"
          aria-label={`Select ${row.fullName}`}
        />
      </td>
      <td className="px-4 py-3">
        <Link href={`/patients/${row.id}`} className="block group">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-800 dark:text-gray-100 group-hover:underline">
              {row.fullName}
            </span>
            {row.ageYears !== null && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {row.ageYears}
              </span>
            )}
            <GlyphCluster flags={row.flags} cap={4} />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[260px]">
            {row.email ?? row.phone ?? ''}
          </div>
        </Link>
      </td>
      <td className={`px-4 py-3 ${lastVisitTone(row.lastVisitAt)}`} suppressHydrationWarning>
        <div>{fmtDate(row.lastVisitAt)}</div>
        {row.lastVisitAt && (
          <div className="text-xs opacity-75">{fmtRelative(row.lastVisitAt)}</div>
        )}
      </td>
      <td className="px-4 py-3">
        {row.nextVisitAt ? (
          <>
            <div className="text-gray-800 dark:text-gray-100">{fmtDate(row.nextVisitAt)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {(row.nextVisitType ?? '').replace(/_/g, ' ')}
            </div>
          </>
        ) : (
          <span className="text-gray-400 dark:text-gray-500 italic text-xs">None scheduled</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${RECALL_PILL[row.recallStatus]}`}>
          {RECALL_LABEL[row.recallStatus]}
        </span>
      </td>
      <td className={`px-4 py-3 text-right ${balanceClass}`}>
        {money(row.outstandingBalanceCents)}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
        {row.source ? SOURCE_LABEL[row.source] ?? row.source : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
        {row.lastContactAt ? fmtRelative(row.lastContactAt) : '—'}
      </td>
    </tr>
  )
}

function EmptyState() {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-3xl mb-3">🌿</p>
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
        No patients yet
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Your first patient will appear here when someone books on your site.
        Until then, you can add one manually using the button above.
      </p>
    </div>
  )
}
