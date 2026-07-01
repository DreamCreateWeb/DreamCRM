'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react'
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
import { TagChip } from '@/components/ui/tag-chip'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { BulkBar } from '@/components/ui/bulk-bar'
import { FlashToast } from '@/components/ui/flash-toast'
import { addDaysYmd, todayYmd, MAX_FOLLOWUP_TITLE_LEN } from '@/lib/types/followups'
import {
  appointmentViewFiltersToQuery,
  isEmptyAppointmentViewFilters,
  describeAppointmentViewFilters,
  type AppointmentViewFilters,
} from '@/lib/types/appointment-views'
import SavedViewsBar, { type SavedViewChip } from '@/components/saved-views/saved-views-bar'
import { bulkCreateFollowupsForPatientsAction } from '../patients/actions'
import NewBookingDrawer from './new-booking-drawer'
import AppointmentDrawer from './appointment-drawer'
import { confirmAppointmentAction, markCompletedAction, bulkSendRemindersAction, bulkSetAppointmentStatusAction, createAppointmentViewAction, deleteAppointmentViewAction } from './actions'

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

// Stable empty base for the optimistic-confirmed set (useOptimistic resets to it).
const EMPTY_CONFIRMED: Set<string> = new Set()

export default function AgendaView({
  groups,
  meta,
  filters,
  orgName,
  savedViews = [],
}: {
  groups: AppointmentDayGroup[]
  meta: AppointmentFilterMeta
  filters: AppointmentListFilters
  orgName: string
  savedViews?: SavedViewChip[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  // ?appt=<id> deep-links straight to a visit's drawer (Overview activity, the
  // patient timeline, ⌘K). Like ?new=1, we seed React state from the param then
  // strip it so closing + refreshing doesn't re-pop the drawer.
  const [openDetail, setOpenDetail] = useState<string | null>(() => params.get('appt'))
  // ?new=1 (the header "+ New ▾" quick-create + ⌘K "Add a booking") opens the
  // new-booking drawer on arrival, then we strip the param so closing it and
  // refreshing doesn't pop the drawer back open.
  const [newBookingOpen, setNewBookingOpen] = useState(() => params.get('new') === '1')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  // Optimistically mark a row confirmed the instant you click — the action +
  // revalidation catch up behind it (front desk confirms all day; the wait felt slow).
  const [optimisticConfirmed, addOptimisticConfirmed] = useOptimistic<Set<string>, string>(
    EMPTY_CONFIRMED,
    (current, id) => new Set(current).add(id),
  )
  // Same optimistic pattern for "Mark done" on past-but-open visits — the front
  // desk reconciles the day's schedule in a rapid pass, so the row flips instantly.
  const [optimisticCompleted, addOptimisticCompleted] = useOptimistic<Set<string>, string>(
    EMPTY_CONFIRMED,
    (current, id) => new Set(current).add(id),
  )
  const [_pending, startTransition] = useTransition()
  const [bulkPending, startBulk] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  // Consume the ?new=1 / ?appt= deep-links once: drop them from the URL
  // (replace, no history entry) so each drawer's open state is owned by React
  // from here on.
  useEffect(() => {
    if (params.get('new') !== '1' && !params.get('appt')) return
    const next = new URLSearchParams(params.toString())
    next.delete('new')
    next.delete('appt')
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
    startTransition(async () => {
      addOptimisticConfirmed(id)
      try {
        await confirmAppointmentAction(id)
      } catch {
        // The optimistic confirm reverts when the transition ends; tell the
        // user why instead of letting the pill silently snap back.
        setToast("Couldn't confirm that visit — please try again.")
      }
    })
  }

  function onComplete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    startTransition(async () => {
      addOptimisticCompleted(id)
      try {
        const r = await markCompletedAction(id)
        // Completing a visit auto-sends the review request (Google-first) — tell
        // the front desk it went out so the loop feels real.
        setToast(r.reviewSent ? 'Marked done — review request sent.' : 'Marked done.')
      } catch {
        setToast("Couldn't mark that visit done — please try again.")
      }
    })
  }

  const [followupOpen, setFollowupOpen] = useState(false)

  function onBulkSend() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startBulk(async () => {
      const r = await bulkSendRemindersAction(ids, 'email')
      setToast(`Sent ${r.sent} reminder${r.sent === 1 ? '' : 's'}${r.skipped ? ` · skipped ${r.skipped}` : ''}${r.errors.length ? ` · ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}` : ''}`)
      setSelected(new Set())
    })
  }

  // Bulk end-of-day reconciliation — mark the selected visits completed/no-show
  // at once. `verb` is the toast phrasing ("completed" / "as no-show").
  function onBulkStatus(status: 'completed' | 'no_show', verb: string) {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    startBulk(async () => {
      const r = await bulkSetAppointmentStatusAction(ids, status)
      setToast(`Marked ${r.updated} ${verb}${r.skipped ? ` · skipped ${r.skipped}` : ''}`)
      setSelected(new Set())
    })
  }

  // Selected appointments → their unique patients (one follow-up per patient
  // even if you picked two of their visits).
  const selectedPatientIds = useMemo(() => {
    const idToPatient = new Map<string, string>()
    for (const g of groups) for (const r of g.rows) idToPatient.set(r.id, r.patientId)
    const out = new Set<string>()
    for (const id of Array.from(selected)) {
      const p = idToPatient.get(id)
      if (p) out.add(p)
    }
    return Array.from(out)
  }, [selected, groups])

  function onBulkFollowup(title: string, dueDate: string) {
    if (selectedPatientIds.length === 0 || !title.trim()) return
    startBulk(async () => {
      const r = await bulkCreateFollowupsForPatientsAction(selectedPatientIds, { title, dueDate: dueDate || null })
      if (r.ok) {
        setToast(`Added ${r.created} follow-up${r.created === 1 ? '' : 's'}`)
        setSelected(new Set())
        setFollowupOpen(false)
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nav-badges:refresh'))
      } else {
        setToast(r.error)
      }
    })
  }

  const totalRows = useMemo(() => groups.reduce((acc, g) => acc + g.rows.length, 0), [groups])

  // Saved-views bar inputs — the agenda filters map 1:1 onto the view shape.
  const currentViewFilters: AppointmentViewFilters = {
    window: filters.window,
    attention: filters.attention,
    providerId: filters.providerId,
    source: filters.source,
    search: filters.search,
  }
  const currentViewQuery = appointmentViewFiltersToQuery(currentViewFilters)
  const viewIsEmpty = isEmptyAppointmentViewFilters(currentViewFilters)
  const providerNameMap = useMemo(
    () => new Map(meta.providers.map((p) => [p.id, p.displayName])),
    [meta.providers],
  )
  const viewSuggestedName = describeAppointmentViewFilters(currentViewFilters, providerNameMap)
  const viewIsActiveSaved = !viewIsEmpty && savedViews.some((v) => v.query === currentViewQuery)

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
          <>
            {totalRows > 0 && (
              <ActionButton
                variant="ghost"
                href={currentViewQuery ? `/appointments/export?${currentViewQuery}` : '/appointments/export'}
                target="_blank"
              >
                Export CSV
              </ActionButton>
            )}
            <ActionButton variant="primary" onClick={() => setNewBookingOpen(true)}>
              + New booking
            </ActionButton>
          </>
        }
      />

      {newBookingOpen && <NewBookingDrawer onClose={() => setNewBookingOpen(false)} />}

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="v2-panel p-4 mb-4 space-y-3">
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

      {/* ── Saved views (named filter combos) ────────────────────────── */}
      <SavedViewsBar
        basePath="/appointments"
        allLabel="Next 14 days"
        views={savedViews}
        currentQuery={currentViewQuery}
        isEmpty={viewIsEmpty}
        isActiveSaved={viewIsActiveSaved}
        suggestedName={viewSuggestedName}
        onSave={(name) => createAppointmentViewAction(name, currentViewFilters)}
        onDelete={(id) => deleteAppointmentViewAction(id)}
      />

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
              onComplete={onComplete}
              optimisticConfirmed={optimisticConfirmed}
              optimisticCompleted={optimisticCompleted}
            />
          ))}
        </div>
      )}

      {/* ── Sticky bulk action bar ───────────────────────────────────── */}
      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <ActionButton variant="primary" size="sm" onClick={onBulkSend} disabled={bulkPending}>
          {bulkPending ? 'Sending…' : `Send ${selected.size} reminder${selected.size === 1 ? '' : 's'}`}
        </ActionButton>
        <ActionButton variant="secondary" size="sm" onClick={() => onBulkStatus('completed', 'completed')} disabled={bulkPending}>
          Mark completed
        </ActionButton>
        <ActionButton variant="secondary" size="sm" onClick={() => onBulkStatus('no_show', 'as no-show')} disabled={bulkPending}>
          Mark no-show
        </ActionButton>
        <div className="relative">
          <ActionButton variant="secondary" size="sm" onClick={() => setFollowupOpen((o) => !o)} disabled={bulkPending}>
            Add follow-up
          </ActionButton>
          {followupOpen && (
            <BulkFollowupComposer
              count={selectedPatientIds.length}
              pending={bulkPending}
              onSubmit={onBulkFollowup}
              onClose={() => setFollowupOpen(false)}
            />
          )}
        </div>
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
  onComplete,
  optimisticConfirmed,
  optimisticCompleted,
}: {
  group: AppointmentDayGroup
  selected: Set<string>
  onToggleDay: () => void
  onToggleRow: (id: string) => void
  onOpen: (id: string) => void
  onConfirm: (id: string, e: React.MouseEvent) => void
  onComplete: (id: string, e: React.MouseEvent) => void
  optimisticConfirmed: Set<string>
  optimisticCompleted: Set<string>
}) {
  const allSelected = group.rows.length > 0 && group.rows.every((r) => selected.has(r.id))
  const stillUnconfirmed = group.rows.filter(
    (r) => r.status === 'scheduled' && !optimisticConfirmed.has(r.id),
  ).length
  return (
    <section>
      <div className="sticky top-0 z-10 bg-[color:var(--color-surface-sunk)]/95 backdrop-blur px-4 py-2 mb-2 rounded-[var(--r-md)] ring-1 ring-inset ring-[color:var(--color-hairline)] flex items-center gap-3">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleDay}
          className="form-checkbox shrink-0"
          aria-label={`Select all ${group.label}`}
        />
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{group.label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
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
            onComplete={(e) => onComplete(r.id, e)}
            confirmedOptimistic={optimisticConfirmed.has(r.id)}
            completedOptimistic={optimisticCompleted.has(r.id)}
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
  onComplete,
  confirmedOptimistic,
  completedOptimistic,
}: {
  row: AppointmentRow
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onConfirm: (e: React.MouseEvent) => void
  onComplete: (e: React.MouseEvent) => void
  confirmedOptimistic: boolean
  completedOptimistic: boolean
}) {
  const typeLabel = row.type.replace(/_/g, ' ')
  // Reflect an in-flight confirm/complete immediately (the button hides, the pill flips).
  const status = completedOptimistic
    ? 'completed'
    : confirmedOptimistic && row.status === 'scheduled'
      ? 'confirmed'
      : row.status
  // A past visit that's still open (scheduled/confirmed) is the one that needs
  // marking done — surface it inline so the front desk doesn't open the drawer.
  const isPastOpen =
    (status === 'scheduled' || status === 'confirmed') &&
    new Date(row.startTime).getTime() < Date.now()
  return (
    <li
      onClick={onOpen}
      className={`v2-card px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30 border-l-4 ${agingBorderClass(APPOINTMENT_AGING_TIER[row.agingLevel])} ${
        // Selected row = teal inner ring + faint teal wash (selection ≠ status).
        selected ? 'bg-teal-500/5 ring-1 ring-inset ring-teal-500/40' : ''
      }`}
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
        <div className="shrink-0 w-20 text-sm font-mono-num font-medium text-gray-700 dark:text-gray-300 tabular-nums">
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
          {row.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {row.tags.slice(0, 4).map((t) => (
                <TagChip key={t.id} name={t.name} color={t.color} size="xs" />
              ))}
            </div>
          )}
          {row.notes && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1 italic">&ldquo;{row.notes}&rdquo;</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isPastOpen && (
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={onComplete}
              title="Mark this visit done — this sends the review request"
            >
              Mark done
            </ActionButton>
          )}
          {status === 'scheduled' && !isPastOpen && (
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={onConfirm}
              title="Mark as confirmed (manual override)"
            >
              Confirm
            </ActionButton>
          )}
          <StatusPill tone={STATUS_TONE[status]} title={STATUS_TITLE[status]}>
            {STATUS_LABEL[status]}
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
  )
}

/**
 * Compact composer for the agenda's bulk "Add follow-up" — opens upward from
 * the sticky bulk bar. Creates one follow-up per selected (deduped) patient,
 * e.g. "Call back about rebooking" for everyone who no-showed today.
 */
function BulkFollowupComposer({
  count,
  pending,
  onSubmit,
  onClose,
}: {
  count: number
  pending: boolean
  onSubmit: (title: string, dueDate: string) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(addDaysYmd(todayYmd(), 3))
  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border border-[color:var(--color-hairline)] bg-[color:var(--color-surface-2)] p-2.5 shadow-[var(--shadow-modal)]">
      <p className="mb-1.5 text-xs font-medium text-gray-700 dark:text-gray-200">
        Follow-up for {count} patient{count === 1 ? '' : 's'}
      </p>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_FOLLOWUP_TITLE_LEN))}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(title, dueDate); if (e.key === 'Escape') onClose() }}
        placeholder="e.g. Call about rebooking"
        className="form-input w-full text-xs py-1"
      />
      <div className="mt-2 flex items-center gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="form-input text-xs py-1 flex-1"
          aria-label="Due date"
        />
        <ActionButton variant="primary" size="sm" onClick={() => onSubmit(title, dueDate)} disabled={pending || !title.trim() || count === 0}>
          {pending ? 'Adding…' : 'Add'}
        </ActionButton>
      </div>
    </div>
  )
}
