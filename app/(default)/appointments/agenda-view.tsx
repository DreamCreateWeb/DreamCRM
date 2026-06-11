'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import type {
  AppointmentRow,
  AppointmentDayGroup,
  AppointmentListFilters,
  AppointmentFilterMeta,
  AppointmentStatus,
} from '@/lib/services/appointments'
import {
  APPOINTMENT_AGING_TIER,
  agingBorderClass,
  appointmentFlagGlyphs,
  type Tone,
} from '@/lib/ui/encodings'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FilterChip } from '@/components/ui/filter-chip'
import { GlyphCluster } from '@/components/ui/glyph-cluster'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { BulkBar } from '@/components/ui/bulk-bar'
import { FlashToast } from '@/components/ui/flash-toast'
import NewBookingDrawer from './new-booking-drawer'
import AppointmentDrawer from './appointment-drawer'
import { confirmAppointmentAction, bulkSendRemindersAction } from './actions'

// Status carries categorical state only (timing lives on the aging border,
// per-row flags on the glyphs). Tones from the semantic contract:
// scheduled = warn (needs OUR confirmation text), confirmed = ok,
// completed = neutral (inert/done), cancelled + no-show = urgent (problem).
const STATUS_TONE: Record<AppointmentStatus, Tone> = {
  scheduled: 'warn',
  confirmed: 'ok',
  completed: 'neutral',
  cancelled: 'urgent',
  no_show: 'urgent',
}
const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Unconfirmed',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}
const STATUS_TITLE: Record<AppointmentStatus, string> = {
  scheduled: "Hasn't confirmed yet — send a reminder",
  confirmed: 'The patient confirmed this visit',
  completed: 'This visit is done',
  cancelled: 'This visit was cancelled',
  no_show: "The patient didn't show",
}

// Legend glyphs, in the order appointmentFlagGlyphs emits them.
const LEGEND_GLYPHS = [
  'newPatient',
  'lapsedReturning',
  'birthday',
  'balance',
  'missingIntakeThis',
  'unconfirmed48h',
  'bookedJustNow',
  'rescheduled',
  'reminderSent',
  'optedOut',
] as const

const LEGEND_PILLS = [
  { tone: 'warn' as Tone, label: 'Unconfirmed', meaning: "Hasn't confirmed yet — send a reminder" },
  { tone: 'ok' as Tone, label: 'Confirmed', meaning: 'The patient confirmed this visit' },
  { tone: 'neutral' as Tone, label: 'Completed', meaning: 'This visit is done' },
  { tone: 'urgent' as Tone, label: 'Cancelled', meaning: 'This visit was cancelled' },
  { tone: 'urgent' as Tone, label: 'No-show', meaning: "The patient didn't show" },
  { tone: 'warn' as Tone, label: 'Needs rebooking', meaning: 'Cancelled/no-show with nothing booked ahead — chase + rebook' },
]

const WINDOW_LABELS: Array<{ key: NonNullable<AppointmentListFilters['window']>; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'this_week', label: 'This week' },
  { key: 'next_14d', label: 'Next 14 days' },
  { key: 'all_upcoming', label: 'All upcoming' },
  { key: 'past_30d', label: 'Past 30 days' },
]

// Attention chips carrying an emoji/icon MUST pass `title` (design-system rule).
const ATTENTION_LABELS: Array<{
  key: NonNullable<AppointmentListFilters['attention']>[number]
  label: string
  title?: string
}> = [
  { key: 'unconfirmed', label: 'Unconfirmed', title: 'Visits the patient still needs to confirm' },
  { key: 'needs_intake', label: '📝 Needs intake', title: 'Visits with no intake form on file yet' },
  { key: 'new_patients', label: '★ New patients', title: 'First-time or recently-joined patients' },
  { key: 'has_balance', label: '$ Has balance', title: 'Patients who owe an outstanding balance' },
  { key: 'lapsed_rebooking', label: '💤 Lapsed rebooking', title: 'Lapsed patients who booked again — welcome them back' },
  { key: 'needs_rebooking', label: '↩ Needs rebooking', title: 'Cancelled / no-show in the last 60 days with nothing booked ahead — chase + rebook' },
  { key: 'cancelled', label: 'Cancelled', title: 'Cancelled visits to recover' },
  { key: 'no_show', label: 'No-show', title: 'Visits the patient missed' },
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

function emptyCopy(filters: AppointmentListFilters): { icon: string; title: string; body: string } {
  if (filters.attention?.includes('unconfirmed')) {
    return { icon: '✅', title: 'No unconfirmed appointments — nice.', body: 'Everything in this window is confirmed.' }
  }
  if (filters.attention?.includes('cancelled') || filters.attention?.includes('no_show')) {
    return { icon: '🌿', title: 'No cancellations to recover from — keep going.', body: 'Great front-desk discipline.' }
  }
  if (filters.attention?.includes('needs_intake')) {
    return { icon: '📋', title: 'All upcoming visitors have their intake on file.', body: 'Nothing to chase.' }
  }
  if (filters.attention?.includes('lapsed_rebooking')) {
    return { icon: '🌱', title: 'No lapsed-patient rebookings in this window.', body: 'Run a recall campaign to bring them back.' }
  }
  if (filters.attention?.includes('needs_rebooking')) {
    return { icon: '🌿', title: 'Nobody waiting to be rebooked.', body: 'Every recent cancellation or no-show already has a next visit on the books.' }
  }
  if (filters.window === 'today') {
    return { icon: '☕', title: 'Nothing booked today.', body: 'Go enjoy a quiet morning, or send your booking link out to fill the gaps.' }
  }
  return { icon: '📅', title: 'No appointments in this window.', body: 'Try a wider date range, or share your booking link.' }
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
  // ?new=1 (the header "+ New ▾" quick-create + ⌘K "Add a booking") opens the
  // new-booking drawer on arrival, then we strip the param so closing it and
  // refreshing doesn't pop the drawer back open.
  const [newBookingOpen, setNewBookingOpen] = useState(() => params.get('new') === '1')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [_pending, startTransition] = useTransition()
  const [bulkPending, startBulk] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  // Consume the ?new=1 deep-link once: drop it from the URL (replace, no
  // history entry) so the drawer's open state is owned by React from here on.
  useEffect(() => {
    if (params.get('new') !== '1') return
    const next = new URLSearchParams(params.toString())
    next.delete('new')
    const qs = next.toString()
    router.replace(qs ? `/appointments?${qs}` : '/appointments')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    })
  }

  const totalRows = useMemo(() => groups.reduce((acc, g) => acc + g.rows.length, 0), [groups])

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Daily · ${orgName}`}
        title="Appointments"
        subtitle={
          totalRows === 0
            ? 'Confirm, reschedule, and follow up on the visits on your books.'
            : `${totalRows} ${totalRows === 1 ? 'booking' : 'bookings'} in view — confirm, reschedule, and follow up.`
        }
        legend={
          <EncodingLegend
            glyphs={[...LEGEND_GLYPHS]}
            aging="appointments"
            pills={LEGEND_PILLS}
          />
        }
        actions={
          <ActionButton variant="primary" onClick={() => setNewBookingOpen(true)}>
            + New booking
          </ActionButton>
        }
      />

      {newBookingOpen && <NewBookingDrawer onClose={() => setNewBookingOpen(false)} />}

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-4 mb-4 space-y-3">
        {/* Date window row */}
        <div className="flex flex-wrap gap-2 items-center">
          {WINDOW_LABELS.map((w) => (
            <FilterChip
              key={w.key}
              active={(filters.window ?? 'next_14d') === w.key}
              onClick={() => setParam('window', w.key === 'next_14d' ? null : w.key)}
            >
              {w.label}
            </FilterChip>
          ))}
        </div>
        {/* Needs-attention row + search */}
        <div className="flex flex-wrap gap-2 items-center">
          {ATTENTION_LABELS.map((a) => (
            <FilterChip
              key={a.key}
              active={(filters.attention ?? []).includes(a.key)}
              onClick={() => toggleAttention(a.key)}
              title={a.title}
            >
              {a.label}
            </FilterChip>
          ))}
          {meta.providers.length > 0 && (
            <select
              value={filters.providerId ?? ''}
              onChange={(e) => setParam('provider', e.target.value || null)}
              className="form-select text-xs py-1"
              title="Filter by staff member"
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
        <AgendaEmptyState filters={filters} onNewBooking={() => setNewBookingOpen(true)} />
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
      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <ActionButton variant="primary" size="sm" onClick={onBulkSend} disabled={bulkPending}>
          {bulkPending ? 'Sending…' : `Send ${selected.size} reminder${selected.size === 1 ? '' : 's'}`}
        </ActionButton>
      </BulkBar>

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}

      {openDetail && (
        <AppointmentDrawer
          appointmentId={openDetail}
          onClose={() => setOpenDetail(null)}
        />
      )}
    </div>
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
        <p className="text-xs text-stone-600 dark:text-gray-300 tabular-nums">
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
      className={`bg-white dark:bg-gray-800 shadow-sm rounded-xl px-4 py-3 cursor-pointer hover:bg-stone-50 dark:hover:bg-gray-900/30 transition border-l-4 ${agingBorderClass(APPOINTMENT_AGING_TIER[row.agingLevel])}`}
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
        <div className="shrink-0 w-20 text-sm font-mono font-medium text-gray-700 dark:text-gray-300 tabular-nums">
          {fmtTime(row.startTime)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 capitalize truncate">
              {typeLabel}
            </span>
            {row.durationMinutes && (
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{row.durationMinutes}m</span>
            )}
            {row.providerName && (
              <span className="text-xs text-gray-500 dark:text-gray-400">· with {row.providerName}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <Link
              href={`/patients/${row.patientId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:underline truncate"
            >
              {row.patientName}
            </Link>
            <GlyphCluster glyphs={appointmentFlagGlyphs(row.flags)} cap={4} />
          </div>
          {row.notes && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1 italic">&ldquo;{row.notes}&rdquo;</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {row.status === 'scheduled' && (
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={onConfirm}
              disabled={confirming}
              title="Mark as confirmed (manual override)"
            >
              {confirming ? '…' : 'Confirm'}
            </ActionButton>
          )}
          <StatusPill tone={STATUS_TONE[row.status]} title={STATUS_TITLE[row.status]}>
            {STATUS_LABEL[row.status]}
          </StatusPill>
          {row.needsRebooking && (
            <StatusPill tone="warn" title="Cancelled / no-show with nothing booked ahead — open this row to rebook">
              ↩ Rebook
            </StatusPill>
          )}
        </div>
      </div>
    </li>
  )
}

function AgendaEmptyState({
  filters,
  onNewBooking,
}: {
  filters: AppointmentListFilters
  onNewBooking: () => void
}) {
  const copy = emptyCopy(filters)
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <EmptyState
        icon={copy.icon}
        title={copy.title}
        body={copy.body}
        action={
          <ActionButton variant="primary" onClick={onNewBooking}>
            + New booking
          </ActionButton>
        }
      />
    </div>
  )
}
