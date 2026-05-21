'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import type {
  AppointmentRow,
  AppointmentDayGroup,
  AppointmentListFilters,
  AppointmentFilterMeta,
  AgingLevel,
  AppointmentStatus,
} from '@/lib/services/appointments'
import { AppointmentGlyphCluster } from './appointment-glyph-cluster'
import AppointmentDrawer from './appointment-drawer'
import { confirmAppointmentAction, bulkSendRemindersAction } from './actions'

const STATUS_PILL: Record<AppointmentStatus, string> = {
  scheduled: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  completed: 'bg-stone-500/15 text-stone-600 dark:text-stone-300',
  cancelled: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  no_show: 'bg-red-500/15 text-red-700 dark:text-red-300',
}
const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Unconfirmed',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

const AGING_BORDER: Record<AgingLevel, string> = {
  none: 'border-l-transparent',
  neutral: 'border-l-stone-300 dark:border-l-stone-600',
  amber: 'border-l-amber-400',
  darkAmber: 'border-l-amber-600',
  red: 'border-l-red-600',
}

const WINDOW_LABELS: Array<{ key: NonNullable<AppointmentListFilters['window']>; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'this_week', label: 'This week' },
  { key: 'next_14d', label: 'Next 14 days' },
  { key: 'all_upcoming', label: 'All upcoming' },
  { key: 'past_30d', label: 'Past 30 days' },
]

const ATTENTION_LABELS: Array<{ key: NonNullable<AppointmentListFilters['attention']>[number]; label: string }> = [
  { key: 'unconfirmed', label: 'Unconfirmed' },
  { key: 'needs_intake', label: '📝 Needs intake' },
  { key: 'new_patients', label: '★ New patients' },
  { key: 'has_balance', label: '$ Has balance' },
  { key: 'lapsed_rebooking', label: '💤 Lapsed rebooking' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'no_show', label: 'No-show' },
]

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function sourceLabel(s: string): string {
  switch (s) {
    case 'booking_widget': return 'Public booking widget'
    case 'portal': return 'Patient portal'
    case 'manual': return 'Front desk (manual)'
    case 'phone': return 'Phone call'
    case 'recall_campaign': return 'Recall campaign'
    case 'invite': return 'Invite acceptance'
    default: return s.replace(/_/g, ' ')
  }
}

function emptyCopy(filters: AppointmentListFilters): { emoji: string; title: string; subtitle: string } {
  if (filters.attention?.includes('unconfirmed')) {
    return { emoji: '✅', title: 'No unconfirmed appointments — nice.', subtitle: 'Everything in this window is confirmed.' }
  }
  if (filters.attention?.includes('cancelled') || filters.attention?.includes('no_show')) {
    return { emoji: '🌿', title: 'No cancellations to recover from — keep going.', subtitle: 'Great front-desk discipline.' }
  }
  if (filters.attention?.includes('needs_intake')) {
    return { emoji: '📋', title: 'All upcoming visitors have their intake on file.', subtitle: 'Nothing to chase.' }
  }
  if (filters.attention?.includes('lapsed_rebooking')) {
    return { emoji: '🌱', title: 'No lapsed-patient rebookings in this window.', subtitle: 'Run a recall campaign to bring them back.' }
  }
  if (filters.window === 'today') {
    return { emoji: '☕', title: 'Nothing booked today.', subtitle: 'Go enjoy a quiet morning, or send your booking link out to fill the gaps.' }
  }
  return { emoji: '📅', title: 'No appointments in this window.', subtitle: 'Try a wider date range, or share your booking link.' }
}

export default function AgendaView({
  groups,
  meta,
  filters,
  orgName,
}: {
  groups: AppointmentDayGroup[]
  meta: AppointmentFilterMeta
  filters: AppointmentListFilters
  orgName: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [openDetail, setOpenDetail] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [_pending, startTransition] = useTransition()
  const [bulkPending, startBulk] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value === null || value === '') next.delete(key); else next.set(key, value)
    startTransition(() => router.push(`/appointments?${next.toString()}`))
  }

  function toggleAttention(key: NonNullable<AppointmentListFilters['attention']>[number]) {
    const cur = new Set(filters.attention ?? [])
    if (cur.has(key)) cur.delete(key); else cur.add(key)
    setParam('attention', Array.from(cur).join(',') || null)
  }

  function submitSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setParam('q', searchInput.trim() || null)
  }

  function toggleRow(id: string) {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleDay(rows: AppointmentRow[]) {
    const dayIds = rows.map((r) => r.id)
    const allOn = dayIds.every((id) => selected.has(id))
    setSelected((cur) => {
      const next = new Set(cur)
      if (allOn) dayIds.forEach((id) => next.delete(id))
      else dayIds.forEach((id) => next.add(id))
      return next
    })
  }

  function onConfirm(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmingId(id)
    startTransition(async () => {
      await confirmAppointmentAction(id)
      setConfirmingId(null)
    })
  }

  function onBulkSend() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startBulk(async () => {
      const r = await bulkSendRemindersAction(ids, 'email')
      setToast(`Sent ${r.sent} reminder${r.sent === 1 ? '' : 's'}${r.skipped ? ` · skipped ${r.skipped}` : ''}${r.errors.length ? ` · ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}` : ''}`)
      setSelected(new Set())
      setTimeout(() => setToast(null), 4000)
    })
  }

  const totalRows = useMemo(() => groups.reduce((acc, g) => acc + g.rows.length, 0), [groups])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
            Appointments · {orgName}
          </p>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            {totalRows} {totalRows === 1 ? 'booking' : 'bookings'}
          </h1>
        </div>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-4 mb-4 space-y-3">
        {/* Date window row */}
        <div className="flex flex-wrap gap-2 items-center">
          {WINDOW_LABELS.map((w) => (
            <Chip
              key={w.key}
              label={w.label}
              active={(filters.window ?? 'next_14d') === w.key}
              onClick={() => setParam('window', w.key === 'next_14d' ? null : w.key)}
            />
          ))}
        </div>
        {/* Needs-attention row + search */}
        <div className="flex flex-wrap gap-2 items-center">
          {ATTENTION_LABELS.map((a) => (
            <Chip
              key={a.key}
              label={a.label}
              active={(filters.attention ?? []).includes(a.key)}
              onClick={() => toggleAttention(a.key)}
            />
          ))}
          {meta.providers.length > 0 && (
            <select
              value={filters.providerId ?? ''}
              onChange={(e) => setParam('provider', e.target.value || null)}
              className="form-select text-xs py-1"
            >
              <option value="">Any staff</option>
              {meta.providers.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
          )}
          {meta.sources.length > 0 && (
            <select
              value={filters.source ?? ''}
              onChange={(e) => setParam('source', e.target.value || null)}
              className="form-select text-xs py-1"
              title="Filter by how the booking came in"
            >
              <option value="">Any source</option>
              {meta.sources.map((s) => (
                <option key={s} value={s}>{sourceLabel(s)}</option>
              ))}
            </select>
          )}
          <form onSubmit={submitSearch} className="flex-1 min-w-[200px] ml-auto">
            <input
              type="text"
              placeholder="Search patient, email, phone, or notes"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="form-input w-full text-sm"
            />
          </form>
        </div>
      </div>

      {/* ── Agenda ───────────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <EmptyState filters={filters} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <DaySection
              key={g.date.toISOString()}
              group={g}
              selected={selected}
              onToggleDay={() => toggleDay(g.rows)}
              onToggleRow={toggleRow}
              onOpen={(id) => setOpenDetail(id)}
              onConfirm={onConfirm}
              confirmingId={confirmingId}
            />
          ))}
        </div>
      )}

      {/* ── Sticky bulk action bar ───────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 sm:bottom-6 sm:right-6 sm:left-auto sm:rounded-xl bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-900 shadow-2xl px-5 py-3 flex items-center gap-3 z-30">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <button
            onClick={onBulkSend}
            disabled={bulkPending}
            className="text-xs font-semibold uppercase tracking-wider bg-white/10 dark:bg-black/10 hover:bg-white/20 dark:hover:bg-black/20 px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {bulkPending ? 'Sending…' : 'Send reminder'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-300 dark:text-gray-600 hover:text-white dark:hover:text-black px-2"
          >
            Clear
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 right-6 bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-40">
          {toast}
        </div>
      )}

      {openDetail && (
        <AppointmentDrawer
          appointmentId={openDetail}
          onClose={() => setOpenDetail(null)}
        />
      )}
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

function DaySection({
  group,
  selected,
  onToggleDay,
  onToggleRow,
  onOpen,
  onConfirm,
  confirmingId,
}: {
  group: AppointmentDayGroup
  selected: Set<string>
  onToggleDay: () => void
  onToggleRow: (id: string) => void
  onOpen: (id: string) => void
  onConfirm: (id: string, e: React.MouseEvent) => void
  confirmingId: string | null
}) {
  const allSelected = group.rows.length > 0 && group.rows.every((r) => selected.has(r.id))
  const stillUnconfirmed = group.rows.filter((r) => r.status === 'scheduled').length
  return (
    <section>
      <div className="sticky top-0 z-10 bg-stone-50 dark:bg-gray-900/60 backdrop-blur px-4 py-2 mb-2 rounded-md border border-stone-200 dark:border-gray-700/60 flex items-center gap-3">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleDay}
          className="form-checkbox shrink-0"
          aria-label={`Select all ${group.label}`}
        />
        <p className="text-sm font-semibold text-stone-700 dark:text-gray-200">{group.label}</p>
        <p className="text-xs text-stone-500 dark:text-gray-400">
          {group.totals.booked} booked
          {group.totals.confirmed > 0 && ` · ${group.totals.confirmed} confirmed`}
          {stillUnconfirmed > 0 && ` · ${stillUnconfirmed} still need a text`}
        </p>
      </div>
      <ul className="space-y-2">
        {group.rows.map((r) => (
          <AppointmentRowCard
            key={r.id}
            row={r}
            selected={selected.has(r.id)}
            onToggle={() => onToggleRow(r.id)}
            onOpen={() => onOpen(r.id)}
            onConfirm={(e) => onConfirm(r.id, e)}
            confirming={confirmingId === r.id}
          />
        ))}
      </ul>
    </section>
  )
}

function AppointmentRowCard({
  row,
  selected,
  onToggle,
  onOpen,
  onConfirm,
  confirming,
}: {
  row: AppointmentRow
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onConfirm: (e: React.MouseEvent) => void
  confirming: boolean
}) {
  const typeLabel = row.type.replace(/_/g, ' ')
  return (
    <li
      onClick={onOpen}
      className={`bg-white dark:bg-gray-800 shadow-sm rounded-xl px-4 py-3 cursor-pointer hover:bg-stone-50 dark:hover:bg-gray-900/30 transition border-l-4 ${AGING_BORDER[row.agingLevel]}`}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); onToggle() }}
          onClick={(e) => e.stopPropagation()}
          className="form-checkbox shrink-0"
          aria-label={`Select ${row.patientName}`}
        />
        <div className="shrink-0 w-20 text-sm font-mono font-medium text-gray-700 dark:text-gray-300">
          {fmtTime(row.startTime)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 capitalize truncate">
              {typeLabel}
            </span>
            {row.durationMinutes && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{row.durationMinutes}m</span>
            )}
            {row.providerName && (
              <span className="text-xs text-gray-500 dark:text-gray-400">· with {row.providerName}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <Link
              href={`/patients/${row.patientId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm text-gray-700 dark:text-gray-200 hover:underline truncate"
            >
              {row.patientName}
            </Link>
            <AppointmentGlyphCluster flags={row.flags} cap={4} />
          </div>
          {row.notes && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1 italic">&ldquo;{row.notes}&rdquo;</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.status === 'scheduled' && (
            <button
              onClick={onConfirm}
              disabled={confirming}
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 disabled:opacity-50"
              title="Mark as confirmed (manual override)"
            >
              {confirming ? '…' : 'Confirm'}
            </button>
          )}
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_PILL[row.status]}`}>
            {STATUS_LABEL[row.status]}
          </span>
        </div>
      </div>
    </li>
  )
}

function EmptyState({ filters }: { filters: AppointmentListFilters }) {
  const copy = emptyCopy(filters)
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-6 py-16 text-center">
      <p className="text-4xl mb-3">{copy.emoji}</p>
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">{copy.title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">{copy.subtitle}</p>
    </div>
  )
}
