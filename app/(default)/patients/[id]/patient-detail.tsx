'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import type { PatientHeader } from '@/lib/services/patients'
import type { TimelineEvent, TimelineCounts, TimelineKind } from '@/lib/services/patient-timeline'
import type { PatientNoteRow } from '@/lib/services/patient-notes'
import { agingBorderClass, patientFlagGlyphs, type AgingTierId, type Tone } from '@/lib/ui/encodings'
import { usePopoverDismiss } from '@/components/ui/use-popover-dismiss'
import { MiniTrend } from '@/components/ui/charts'
import { useTrailLabel } from '@/app/trail-context'
import { ActionButton } from '@/components/ui/action-button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { StatusPill } from '@/components/ui/status-pill'
import { FilterChip } from '@/components/ui/filter-chip'
import { GlyphCluster } from '@/components/ui/glyph-cluster'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import { useToast } from '@/components/ui/toast'
import EditPatientModal from './edit-modal'
import NotesPanel from './notes-panel'
import TagsPanel from './tags-panel'
import DocumentsPanel from './documents-panel'
import FollowupsPanel from './followups-panel'
import MergeDuplicate from './merge-duplicate'
import LoyaltyPanel, { type LoyaltyPanelData } from './loyalty-panel'
import type { PatientTagView } from '@/lib/types/patient-tags'
import type { PatientDocumentRow } from '@/lib/types/patient-documents'
import type { PatientFollowupView } from '@/lib/types/followups'
import BookFromPatientDrawer from '../../appointments/book-from-patient-drawer'
import SendIntakeInline, { type IntakeFormOption } from '../send-intake-inline'
import type { FamilyMemberView } from '@/lib/services/patients'
import type { ReferralContext } from '@/lib/services/patient-referrals'
import {
  archivePatientAction,
  openPatientThreadAction,
  sendIntakeRequestAction,
  sendPatientPortalInviteAction,
  sendPayLinkAction,
  sendReviewRequestForPatientAction,
  viewAsPatientAction,
} from '../actions'

function money(cents: number): string {
  if (cents === 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toFixed(0)}`
}

/** Short "as of Jun 3" stamp for the PMS balance freshness line. */
function fmtAsOf(d: Date | null): string {
  if (!d) return ''
  return `as of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function fmtFullDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtRelative(d: Date | null): string {
  if (!d) return ''
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days < 0) {
    const abs = Math.abs(days)
    if (abs === 1) return 'tomorrow'
    if (abs < 7) return `in ${abs}d`
    if (abs < 30) return `in ${Math.floor(abs / 7)}w`
    return `in ${Math.floor(abs / 30)}mo`
  }
  if (days === 1) return '1d ago'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Lifecycle → semantic tone (categorical state, per the contract). */
const LIFECYCLE: Record<string, { tone: Tone; label: string }> = {
  lead: { tone: 'special', label: 'Lead' },
  new: { tone: 'info', label: 'New patient' },
  active: { tone: 'ok', label: 'Active' },
  at_risk: { tone: 'warn', label: 'At risk' },
  lapsed: { tone: 'urgent', label: 'Lapsed' },
  archived: { tone: 'neutral', label: 'Archived' },
}

const SOURCE_LABEL: Record<string, string> = {
  website: 'website',
  booking: 'booking widget',
  referral: 'referral',
  walk_in: 'walk-in',
  manual: 'manual entry',
  lead_form: 'contact form',
  invite: 'patient invite',
  website_request: 'appointment request',
  pms: 'the practice system',
  pms_import: 'the practice system (imported)',
  import: 'CSV import',
}

// Timeline filter tabs. "Billing" is a GROUP — it matches every money-shaped
// kind (legacy invoices + the real commerce sources: shop orders, online
// balance payments, memberships), mirroring BILLING_TIMELINE_KINDS in the
// service. The other tabs map 1:1 to a kind. (Reviews show under "All" only.)
type FilterTab = 'all' | 'appointment' | 'message' | 'form_submission' | 'billing' | 'note'

const BILLING_KINDS = new Set<TimelineKind>(['invoice', 'shop_order', 'balance_payment', 'membership'])

function matchesTab(tab: FilterTab, kind: TimelineKind): boolean {
  if (tab === 'all') return true
  if (tab === 'billing') return BILLING_KINDS.has(kind)
  return kind === tab
}

const FILTER_KEYS: Array<{ key: FilterTab; label: string; countKey: keyof TimelineCounts }> = [
  { key: 'all', label: 'All', countKey: 'all' },
  { key: 'appointment', label: 'Appointments', countKey: 'appointments' },
  { key: 'message', label: 'Messages', countKey: 'messages' },
  { key: 'form_submission', label: 'Forms', countKey: 'forms' },
  { key: 'billing', label: 'Billing', countKey: 'billing' },
  { key: 'note', label: 'Notes', countKey: 'notes' },
]

/** How many timeline rows render before the "Show older" break — a long-tenured
 *  patient can carry hundreds of entries, and painting them all at once buries
 *  the recent story the front desk actually came for. */
const TIMELINE_PAGE = 40

export default function PatientDetail({
  header,
  timeline,
  counts,
  notes,
  intakeForms = [],
  isPlatformAdmin = false,
  patientOptions = [],
  tags = [],
  tagCatalog = [],
  documents = [],
  followups = [],
  staff = [],
  canMerge = false,
  mergeCandidates = [],
  family = [],
  referral = null,
  loyalty = null,
  canAdjustLoyalty = false,
}: {
  header: PatientHeader
  timeline: TimelineEvent[]
  counts: TimelineCounts
  notes: PatientNoteRow[]
  intakeForms?: IntakeFormOption[]
  isPlatformAdmin?: boolean
  /** id+name list for the guardian (family-access) picker in the edit modal. */
  patientOptions?: Array<{ id: string; name: string }>
  tags?: PatientTagView[]
  tagCatalog?: PatientTagView[]
  documents?: PatientDocumentRow[]
  followups?: PatientFollowupView[]
  staff?: Array<{ userId: string; name: string }>
  canMerge?: boolean
  mergeCandidates?: Array<{ id: string; name: string; email: string | null; phone: string | null; reason: string }>
  family?: FamilyMemberView[]
  referral?: ReferralContext | null
  /** Rewards data when the loyalty program is on; null hides the card. */
  loyalty?: LoyaltyPanelData | null
  canAdjustLoyalty?: boolean
}) {
  // Timeline filter lives in the URL (?tab=) so a refresh, a shared link, or
  // a back-button return lands on the same slice. Chip clicks update via
  // history.replaceState — no server round-trip for a client-side filter.
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab')
  const [filter, setFilterState] = useState<FilterTab>(
    FILTER_KEYS.some((f) => f.key === urlTab) ? (urlTab as FilterTab) : 'all',
  )
  const [visibleCount, setVisibleCount] = useState(TIMELINE_PAGE)
  const confirm = useConfirm()
  const [editOpen, setEditOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [archivePending, startArchive] = useTransition()

  // Label this stop on the journey-trail with the patient's name, so the back
  // chip reads "← Olivia Lopez" instead of "← Patients" when you leave here.
  // (Other detail routes — /shop/products/[id], /careers/[id], /posts/[id] —
  // can call useTrailLabel the same way; the registry fallback covers them if
  // they don't.)
  useTrailLabel(header.fullName)

  function setFilter(next: FilterTab) {
    setFilterState(next)
    setVisibleCount(TIMELINE_PAGE)
    const url = new URL(window.location.href)
    if (next === 'all') url.searchParams.delete('tab')
    else url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url.toString())
  }

  const filtered = useMemo(
    () => filter === 'all' ? timeline : timeline.filter((e) => matchesTab(filter, e.kind)),
    [filter, timeline],
  )

  // Completed visits per calendar quarter over the trailing two years — the
  // header strip's heartbeat, derived from the timeline already in hand.
  const visitTrend = useMemo(() => {
    const now = new Date()
    const nowQ = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3)
    const buckets = Array.from({ length: 8 }, (_, i) => {
      const q = nowQ - 7 + i
      const year = Math.floor(q / 4)
      return { bucket: `Q${(q % 4) + 1} ’${String(year).slice(2)}`, value: 0 }
    })
    for (const e of timeline) {
      if (e.kind !== 'appointment' || e.status !== 'completed') continue
      const q = e.occurredAt.getFullYear() * 4 + Math.floor(e.occurredAt.getMonth() / 3)
      const idx = q - (nowQ - 7)
      if (idx >= 0 && idx < 8) buckets[idx].value += 1
    }
    return buckets
  }, [timeline])
  const visitTrendTotal = visitTrend.reduce((sum, b) => sum + b.value, 0)

  const lifecycle = LIFECYCLE[header.lifecycle] ?? { tone: 'ok' as Tone, label: header.lifecycle }

  async function onArchive() {
    if (
      !(await confirm({
        title: `Archive ${header.fullName}?`,
        message: "They'll move to the Archived list.",
        confirmLabel: 'Archive',
        danger: true,
      }))
    )
      return
    startArchive(async () => {
      await archivePatientAction(header.id)
      setToast(`${header.fullName} archived`)
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      {/* ── Back link ────────────────────────────────────────────────── */}
      <div className="mb-4">
        <Link
          href="/patients"
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← All patients
        </Link>
      </div>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="v2-card p-5 mb-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                {header.fullName}
              </h1>
              {header.ageYears !== null && (
                <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                  {header.ageYears} yrs
                </span>
              )}
              <StatusPill tone={lifecycle.tone} label={lifecycle.label} />
              <GlyphCluster glyphs={patientFlagGlyphs(header.flags)} cap={Infinity} />
              <EncodingLegend
                glyphs={[
                  'newPatient',
                  'birthday',
                  'balance',
                  'missingIntakeNext',
                  'unconfirmed48h',
                  'lapsed',
                  'optedOut',
                ]}
                pills={[
                  { tone: 'special', label: 'Lead', meaning: 'A prospect who has not booked yet' },
                  { tone: 'info', label: 'New patient', meaning: 'Recently joined — getting established' },
                  { tone: 'ok', label: 'Active', meaning: 'Seen recently, in good standing' },
                  { tone: 'warn', label: 'At risk', meaning: 'Drifting — worth a recall nudge' },
                  { tone: 'urgent', label: 'Lapsed', meaning: 'No visit in 9+ months' },
                  { tone: 'neutral', label: 'Archived', meaning: 'Moved out of the active list' },
                ]}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              First seen {fmtFullDate(header.firstSeenAt)}
              {header.source && <> · via {SOURCE_LABEL[header.source] ?? header.source}</>}
              {header.totalBookings > 0 && <> · {header.totalBookings} {header.totalBookings === 1 ? 'booking' : 'bookings'} on file</>}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {/* The ONE primary: messaging is the most-used relationship action. */}
            <form action={openPatientThreadAction}>
              <input type="hidden" name="patientId" value={header.id} />
              <ActionButton variant="primary" size="sm" type="submit">
                Send message
              </ActionButton>
            </form>
            <ActionButton variant="secondary" size="sm" onClick={() => setBookOpen(true)}>
              Book appointment
            </ActionButton>
            <ActionButton variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </ActionButton>
            <MoreActionsMenu
              patientId={header.id}
              forms={intakeForms}
              isPlatformAdmin={isPlatformAdmin}
            />
          </div>
        </div>
        {/* Header stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-[color:var(--color-hairline)]">
          <Stat label="Last visit" value={fmtFullDate(header.lastVisitAt)} hint={fmtRelative(header.lastVisitAt)} />
          <Stat
            label="Next visit"
            value={header.nextVisitAt ? fmtFullDate(header.nextVisitAt) : 'None scheduled'}
            hint={header.nextVisitType ? header.nextVisitType.replace(/_/g, ' ') : ''}
          />
          {/* Balance is the PMS-synced figure. NULL = nothing on file — we show
              "—" + an honest hint, never a fabricated $0. */}
          <Stat
            label="Balance"
            mono
            value={header.outstandingBalanceCents == null ? '—' : money(header.outstandingBalanceCents)}
            hint={
              header.outstandingBalanceCents == null
                ? 'No PMS balance on file'
                : header.outstandingBalanceCents > 0
                  ? fmtAsOf(header.balanceAsOf) || 'unpaid'
                  : fmtAsOf(header.balanceAsOf) || 'paid up'
            }
            tone={
              header.outstandingBalanceCents == null
                ? 'neutral'
                : header.outstandingBalanceCents > 0
                  ? 'warn'
                  : 'ok'
            }
          />
          <Stat label="Shop purchases" mono value={money(header.shopSpendCents)} hint="paid in your store" />
          {/* The strip's heartbeat: completed visits per quarter, trailing 2y. */}
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
              Visit rhythm
            </p>
            {visitTrendTotal > 0 ? (
              <>
                <div className="mt-1">
                  <MiniTrend data={visitTrend} variant="bar" width={104} height={26} />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">completed per quarter</p>
              </>
            ) : (
              <p className="text-sm font-semibold mt-0.5 text-gray-800 dark:text-gray-100">—</p>
            )}
          </div>
        </div>
        {/* Jump straight to this patient's visits in the schedule. */}
        <div className="pt-2">
          <Link
            href={`/appointments?q=${encodeURIComponent(header.fullName)}`}
            className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline"
          >
            View in schedule →
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Identity rail ──────────────────────────────────────────── */}
        <aside className="lg:col-span-3 space-y-4">
          <NeedsAttention header={header} forms={intakeForms} />
          <FollowupsPanel patientId={header.id} initial={followups} staff={staff} />
          <TagsPanel patientId={header.id} initialTags={tags} catalog={tagCatalog} />
          <IdentityCard header={header} />
          {family.length > 0 && <FamilyCard family={family} />}
          {referral && (referral.referredBy || referral.referred.length > 0) && (
            <ReferralCard referral={referral} />
          )}
          {loyalty && (
            <LoyaltyPanel patientId={header.id} data={loyalty} canAdjust={canAdjustLoyalty} />
          )}
        </aside>

        {/* ── Timeline ───────────────────────────────────────────────── */}
        <section className="lg:col-span-6">
          <div className="v2-card">
            <div className="px-4 py-3 border-b border-[color:var(--color-hairline)] flex flex-wrap gap-1.5 items-center">
              {FILTER_KEYS.map((f) => (
                <FilterChip
                  key={f.key}
                  active={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  count={counts[f.countKey] > 0 ? counts[f.countKey] : undefined}
                >
                  {f.label}
                </FilterChip>
              ))}
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon="🌱"
                title={filter === 'all' ? 'No activity yet' : `No ${filter.replace('_', ' ')} entries`}
                body={
                  filter === 'all'
                    ? 'Bookings, messages, form submissions and invoices will appear here as they happen.'
                    : 'Nothing of this kind on the record yet — the other tabs may still have activity.'
                }
                action={
                  filter === 'all' || filter === 'appointment' ? (
                    <ActionButton variant="secondary" size="sm" onClick={() => setBookOpen(true)}>
                      Book an appointment
                    </ActionButton>
                  ) : filter === 'message' ? (
                    <form action={openPatientThreadAction}>
                      <input type="hidden" name="patientId" value={header.id} />
                      <ActionButton variant="secondary" size="sm" type="submit">
                        Send a message
                      </ActionButton>
                    </form>
                  ) : filter === 'form_submission' && intakeForms.length > 0 ? (
                    <SendIntakeInline
                      patientId={header.id}
                      forms={intakeForms}
                      label="Send an intake form →"
                      className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-50"
                    />
                  ) : undefined
                }
              />
            ) : (
              <>
                <ul className="divide-y divide-[color:var(--color-hairline)]">
                  {filtered.slice(0, visibleCount).map((e) => (
                    <TimelineRow key={e.id} event={e} />
                  ))}
                </ul>
                {filtered.length > visibleCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + TIMELINE_PAGE)}
                    className="w-full border-t border-[color:var(--color-hairline)] px-4 py-3 text-center text-sm font-medium text-teal-700 dark:text-teal-400 hover:bg-gray-50 dark:hover:bg-gray-900/30"
                  >
                    Show older ({filtered.length - visibleCount} more)
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── Notes + documents column ───────────────────────────────── */}
        <aside className="lg:col-span-3 space-y-4">
          <NotesPanel patientId={header.id} notes={notes} />
          <DocumentsPanel patientId={header.id} initial={documents} />
          {/* Destructive action lives apart from the primary, at the bottom. */}
          <div className="mt-4">
            <ActionButton
              variant="danger"
              size="sm"
              onClick={onArchive}
              disabled={archivePending || header.lifecycle === 'archived'}
              className="w-full justify-center"
            >
              {archivePending ? 'Archiving…' : header.lifecycle === 'archived' ? 'Archived' : 'Archive patient'}
            </ActionButton>
            {canMerge && (
              <MergeDuplicate
                survivorId={header.id}
                survivorName={header.fullName}
                candidates={mergeCandidates}
                allPatients={patientOptions}
              />
            )}
          </div>
        </aside>
      </div>

      {editOpen && (
        <EditPatientModal header={header} patientOptions={patientOptions} onClose={() => setEditOpen(false)} />
      )}
      {bookOpen && (
        <BookFromPatientDrawer
          patientId={header.id}
          patientName={header.fullName}
          onClose={() => setBookOpen(false)}
        />
      )}
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

/**
 * The header's overflow: occasional relationship actions (intake, review
 * request, the admin-only portal preview) fold behind ONE More ▾ so the
 * daily three — message, book, edit — read at a glance. Feedback still
 * lands in the global toast; only the pressed row shows the busy mark.
 */
function MoreActionsMenu({
  patientId,
  forms = [],
  isPlatformAdmin = false,
}: {
  patientId: string
  forms?: IntakeFormOption[]
  isPlatformAdmin?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  usePopoverDismiss(open, wrapRef, () => setOpen(false))
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<string | null>(null)
  const [formId, setFormId] = useState<string>(forms[0]?.id ?? '')

  function run(key: string, fn: () => Promise<void>) {
    setActive(key)
    startTransition(async () => {
      try {
        await fn()
      } finally {
        setActive(null)
        setOpen(false)
      }
    })
  }

  const rowClass =
    'w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-50'

  return (
    <div ref={wrapRef} className="relative">
      <ActionButton
        variant="secondary"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        More ▾
      </ActionButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-60 rounded-[var(--r-md)] border border-[color:var(--color-hairline-strong)] bg-white dark:bg-gray-800 py-1 shadow-lg"
        >
          {forms.length > 1 && (
            <div className="px-3 pt-2 pb-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Intake form
              </label>
              <select
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                disabled={pending}
                className="form-select w-full text-xs py-1"
              >
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            className={rowClass}
            onClick={() =>
              run('intake', async () => {
                const r = await sendIntakeRequestAction(patientId, formId || undefined)
                if (r.ok) toast(`"${r.formTitle}" sent to ${r.sentTo}`)
                else toast(r.error, { tone: 'urgent' })
              })
            }
          >
            {active === 'intake' ? 'Sending intake…' : 'Send intake'}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            className={rowClass}
            onClick={() =>
              run('review', async () => {
                const r = await sendReviewRequestForPatientAction(patientId)
                if (r.ok) toast('Review request sent')
                else toast(r.error, { tone: 'urgent' })
              })
            }
          >
            {active === 'review' ? 'Sending request…' : 'Request review'}
          </button>
          {isPlatformAdmin && (
            <form action={viewAsPatientAction}>
              <input type="hidden" name="patientId" value={patientId} />
              <button
                type="submit"
                role="menuitem"
                disabled={pending}
                title="Preview the patient portal as this patient (platform admin)"
                className={`${rowClass} text-violet-700 dark:text-violet-300`}
              >
                View as patient
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  mono = false,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'ok' | 'warn'
  /** Money/count values render in Geist Mono (the financial-instrument signature). */
  mono?: boolean
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-amber-700 dark:text-amber-300'
      : tone === 'ok'
        ? 'text-emerald-700 dark:text-emerald-300'
        : 'text-gray-800 dark:text-gray-100'
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 tabular-nums ${mono ? 'font-mono-num' : ''} ${valueClass}`}>{value}</p>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 capitalize" suppressHydrationWarning>{hint}</p>}
    </div>
  )
}

function SendPortalInviteButton({ patientId }: { patientId: string }) {
  const [pending, startTransition] = useTransition()
  const toast = useToast()

  function onClick() {
    startTransition(async () => {
      const r = await sendPatientPortalInviteAction(patientId)
      if (r.ok) toast(`Invite sent to ${r.sentTo}`)
      else toast(r.error, { tone: 'urgent' })
    })
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send portal invite →'}
      </button>
    </div>
  )
}

function NeedsAttention({ header, forms = [] }: { header: PatientHeader; forms?: IntakeFormOption[] }) {
  const items: Array<{ severity: 'warn' | 'info'; copy: string; cta?: { label: string; href: string }; sendIntake?: boolean; sendPayLink?: boolean }> = []
  if (header.flags.unconfirmedNext48h) {
    items.push({
      severity: 'warn',
      copy: 'Upcoming appointment is unconfirmed.',
      cta: { label: 'Send confirmation', href: '/appointments?attention=unconfirmed&window=next_14d' },
    })
  }
  if (header.flags.missingIntakeBeforeAppt) {
    items.push({
      severity: 'warn',
      copy: 'Missing intake form before next visit.',
      sendIntake: true,
    })
  }
  if (header.outstandingBalanceCents != null && header.outstandingBalanceCents > 0) {
    items.push({
      severity: 'warn',
      copy: `${money(header.outstandingBalanceCents)} balance on file (from your PMS).`,
      // With an email on file the fastest fix is emailing their pay link;
      // otherwise fall back to the reconciliation page.
      ...(header.email
        ? { sendPayLink: true }
        : { cta: { label: 'See online payments', href: '/payments/online' } }),
    })
  }
  if (header.flags.lapsed) {
    items.push({
      severity: 'info',
      copy: 'No visit in 9+ months. Send a recall.',
    })
  }
  if (items.length === 0) {
    return (
      <div className="v2-card px-4 py-3">
        <StatusPill tone="ok" label="Nothing pending" />
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
          This patient is in good shape. Nothing for you to action right now.
        </p>
      </div>
    )
  }
  return (
    <div className="v2-card px-4 py-3">
      <StatusPill tone="warn" label="Needs attention" />
      <ul className="space-y-2 mt-2">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-gray-800 dark:text-gray-100">
            <p>{it.copy}</p>
            {it.sendIntake && (
              <SendIntakeInline
                patientId={header.id}
                forms={forms}
                label="Send intake →"
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-50"
              />
            )}
            {it.sendPayLink && <SendPayLinkInline patientId={header.id} />}
            {it.cta && (
              <Link
                href={it.cta.href}
                className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
              >
                {it.cta.label} →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Inline "email a pay link" action for the balance nudge — sends the
 *  patient their balance + the secure /b/[token] pay page. */
function SendPayLinkInline({ patientId }: { patientId: string }) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  function onClick() {
    setFeedback(null)
    startTransition(async () => {
      const r = await sendPayLinkAction(patientId)
      if (r.ok) setFeedback({ kind: 'ok', msg: 'Pay link sent — it lands with their balance and a secure pay page.' })
      else setFeedback({ kind: 'err', msg: r.error })
    })
  }

  if (feedback?.kind === 'ok') {
    return <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{feedback.msg}</p>
  }
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Email a pay link →'}
      </button>
      {feedback?.kind === 'err' && (
        <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">{feedback.msg}</p>
      )}
    </>
  )
}

/** The household at a glance — guardian links from the portal's family
 *  access, surfaced clinic-side ("book them together", one call for all). */
function FamilyCard({ family }: { family: FamilyMemberView[] }) {
  const label: Record<FamilyMemberView['relation'], string> = {
    guardian: 'Guardian',
    dependent: 'Dependent',
    household: 'Same household',
  }
  return (
    <div className="v2-card px-4 py-4">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">
        Family
      </p>
      <ul className="space-y-1.5">
        {family.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
            <Link
              href={`/patients/${m.id}`}
              className={`font-medium hover:underline truncate ${m.isActive ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
            >
              {m.name}
            </Link>
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{label[m.relation]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
        Linked through portal family access — handy for booking the household together.
      </p>
    </div>
  )
}

/** Refer-a-friend attribution, both directions: who sent this patient to us,
 *  and which patients they've sent. Word-of-mouth made visible (and thankable)
 *  instead of buried in "how did you hear about us?". */
function ReferralCard({ referral }: { referral: ReferralContext }) {
  return (
    <div className="v2-card px-4 py-4">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">
        Referrals
      </p>
      {referral.referredBy && (
        <p className="text-sm text-gray-800 dark:text-gray-100">
          Referred by{' '}
          <Link href={`/patients/${referral.referredBy.id}`} className="font-medium text-teal-700 dark:text-teal-400 hover:underline">
            {referral.referredBy.name}
          </Link>
        </p>
      )}
      {referral.referred.length > 0 && (
        <div className={referral.referredBy ? 'mt-2.5' : ''}>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Brought {referral.referred.length === 1 ? 'a friend' : `${referral.referred.length} friends`} to the practice:
          </p>
          <ul className="space-y-1">
            {referral.referred.map((r) => (
              <li key={r.id} className="text-sm truncate">
                <Link href={`/patients/${r.id}`} className="font-medium text-gray-800 dark:text-gray-100 hover:underline">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
            Worth a thank-you at their next visit.
          </p>
        </div>
      )}
    </div>
  )
}

function IdentityCard({ header }: { header: PatientHeader }) {
  const address = [header.addressLine1, [header.city, header.state].filter(Boolean).join(', '), header.postalCode]
    .filter(Boolean).join(' · ')
  return (
    <div className="v2-card px-4 py-4 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Contact</p>
        <p className="text-sm text-gray-800 dark:text-gray-100 break-all">{header.email ?? '—'}</p>
        <p className="text-sm text-gray-700 dark:text-gray-200">{header.phone ?? '—'}</p>
      </div>
      {(header.dateOfBirth || address) && (
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Personal</p>
          {header.dateOfBirth && (
            <p className="text-sm text-gray-700 dark:text-gray-200">DOB {header.dateOfBirth}</p>
          )}
          {address && (
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-snug mt-1">{address}</p>
          )}
        </div>
      )}
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Insurance</p>
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {header.insuranceProvider ?? <span className="text-gray-500 dark:text-gray-400 italic">No insurance on file</span>}
        </p>
        {header.insurancePolicyNumber && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Policy {header.insurancePolicyNumber}</p>
        )}
        {header.insuranceGroupNumber && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Group {header.insuranceGroupNumber}</p>
        )}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Portal</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          {header.hasPortalAccount ? 'Linked to a portal account' : 'Not invited yet'}
        </p>
        {!header.hasPortalAccount &&
          (header.email ? (
            <SendPortalInviteButton patientId={header.id} />
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Add an email to invite them.</p>
          ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

const APPT_STATUS: Record<string, { tone: Tone; label: string }> = {
  scheduled: { tone: 'warn', label: 'Unconfirmed' },
  confirmed: { tone: 'ok', label: 'Confirmed' },
  completed: { tone: 'neutral', label: 'Completed' },
  cancelled: { tone: 'urgent', label: 'Cancelled' },
  no_show: { tone: 'urgent', label: 'No-show' },
}

const INV_STATUS: Record<string, { tone: Tone; label: string }> = {
  draft: { tone: 'neutral', label: 'Draft' },
  pending: { tone: 'warn', label: 'Pending' },
  paid: { tone: 'ok', label: 'Paid' },
  overdue: { tone: 'urgent', label: 'Overdue' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
}

const KIND_ICON: Record<TimelineKind, string> = {
  appointment: '📅',
  message: '💬',
  form_submission: '📝',
  invoice: '💵',
  note: '📌',
  created: '🌱',
  shop_order: '🛍️',
  membership: '🦷',
  balance_payment: '💳',
  review: '⭐',
  document: '📎',
  followup: '☑️',
  campaign: '📣',
  tag: '🏷️',
}

// Commerce/payment status → tone (ball-in-court: pending = info, paid = ok,
// failed/past-due = urgent, cancelled/refunded = neutral).
const COMMERCE_STATUS: Record<string, { tone: Tone; label: string }> = {
  pending: { tone: 'info', label: 'Pending' },
  paid: { tone: 'ok', label: 'Paid' },
  active: { tone: 'ok', label: 'Active' },
  failed: { tone: 'urgent', label: 'Failed' },
  past_due: { tone: 'urgent', label: 'Past due' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
  refunded: { tone: 'neutral', label: 'Refunded' },
}

/** Days a timeline entry has been waiting → the shared aging-border tier.
 *  (agingDays is only set on entries that NEED action: an aging unconfirmed
 *  visit, an overdue invoice.) */
function timelineAgingTier(days: number | null): AgingTierId | null {
  if (days == null) return null
  if (days <= 2) return 'aging'
  if (days <= 7) return 'late'
  return 'overdue'
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const ago = fmtRelative(event.occurredAt)
  const agingTier = timelineAgingTier(event.agingDays)
  const pill = (() => {
    if (event.kind === 'appointment' && event.status) {
      const s = APPT_STATUS[event.status] ?? APPT_STATUS.scheduled
      return <StatusPill tone={s.tone} label={s.label} />
    }
    if (event.kind === 'invoice' && event.status) {
      const s = INV_STATUS[event.status] ?? INV_STATUS.draft
      return <StatusPill tone={s.tone} label={s.label} />
    }
    if (
      (event.kind === 'shop_order' ||
        event.kind === 'balance_payment' ||
        event.kind === 'membership') &&
      event.status
    ) {
      const s = COMMERCE_STATUS[event.status]
      if (s) return <StatusPill tone={s.tone} label={s.label} />
    }
    if (event.kind === 'message' && event.direction) {
      return (
        <StatusPill
          tone={event.direction === 'in' ? 'info' : 'neutral'}
          label={event.direction === 'in' ? 'From patient' : 'To patient'}
        />
      )
    }
    return null
  })()

  const inner = (
    <div className="flex items-start gap-3">
      <div className="text-xl leading-none shrink-0 w-8 text-center" aria-hidden="true">
        {KIND_ICON[event.kind]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 capitalize">
            {event.title}
          </span>
          {pill}
        </div>
        {event.subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{event.subtitle}</p>
        )}
        {event.body && (
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-3 whitespace-pre-wrap">
            {event.body}
          </p>
        )}
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 tabular-nums" suppressHydrationWarning>
        {ago}
      </span>
    </div>
  )
  // External (http) hrefs — e.g. a document's S3 URL — open in a new tab so the
  // patient page stays put; internal routes use the SPA Link.
  const external = !!event.href && /^https?:\/\//i.test(event.href)
  return (
    <li
      className={`border-l-2 ${agingBorderClass(agingTier)} px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/30`}
    >
      {event.href ? (
        external ? (
          <a href={event.href} target="_blank" rel="noopener noreferrer" className="block">{inner}</a>
        ) : (
          <Link href={event.href} className="block">{inner}</Link>
        )
      ) : (
        inner
      )}
    </li>
  )
}
