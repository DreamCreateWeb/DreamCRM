'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import type { PatientHeader } from '@/lib/services/patients'
import type { TimelineEvent, TimelineCounts, TimelineKind } from '@/lib/services/patient-timeline'
import type { PatientNoteRow } from '@/lib/services/patient-notes'
import { patientFlagGlyphs, type Tone } from '@/lib/ui/encodings'
import { useTrailLabel } from '@/app/trail-context'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FilterChip } from '@/components/ui/filter-chip'
import { GlyphCluster } from '@/components/ui/glyph-cluster'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import EditPatientModal from './edit-modal'
import NotesPanel from './notes-panel'
import TagsPanel from './tags-panel'
import DocumentsPanel from './documents-panel'
import FollowupsPanel from './followups-panel'
import type { PatientTagView } from '@/lib/types/patient-tags'
import type { PatientDocumentRow } from '@/lib/types/patient-documents'
import type { PatientFollowupView } from '@/lib/types/followups'
import BookFromPatientDrawer from '../../appointments/book-from-patient-drawer'
import SendIntakeInline, { type IntakeFormOption } from '../send-intake-inline'
import {
  archivePatientAction,
  openPatientThreadAction,
  sendIntakeRequestAction,
  sendPatientPortalInviteAction,
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
}) {
  const [filter, setFilter] = useState<FilterTab>('all')
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

  const filtered = useMemo(
    () => filter === 'all' ? timeline : timeline.filter((e) => matchesTab(filter, e.kind)),
    [filter, timeline],
  )

  const lifecycle = LIFECYCLE[header.lifecycle] ?? { tone: 'ok' as Tone, label: header.lifecycle }

  function onArchive() {
    if (!confirm(`Archive ${header.fullName}? They'll move to the Archived list.`)) return
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
            <SendIntakeButton patientId={header.id} forms={intakeForms} />
            <SendReviewRequestButton patientId={header.id} />
            {isPlatformAdmin && (
              <form action={viewAsPatientAction}>
                <input type="hidden" name="patientId" value={header.id} />
                <ActionButton
                  variant="secondary"
                  size="sm"
                  type="submit"
                  title="Preview the patient portal as this patient (platform admin)"
                  className="border-dashed border-violet-300 dark:border-violet-500/50 text-violet-700 dark:text-violet-300"
                >
                  View as patient
                </ActionButton>
              </form>
            )}
            <ActionButton variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </ActionButton>
          </div>
        </div>
        {/* Header stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-[color:var(--color-hairline)]">
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
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Identity rail ──────────────────────────────────────────── */}
        <aside className="lg:col-span-3 space-y-4">
          <NeedsAttention header={header} forms={intakeForms} />
          <FollowupsPanel patientId={header.id} initial={followups} staff={staff} />
          <TagsPanel patientId={header.id} initialTags={tags} catalog={tagCatalog} />
          <IdentityCard header={header} />
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
                body="Bookings, messages, form submissions and invoices will appear here as they happen."
              />
            ) : (
              <ul className="divide-y divide-[color:var(--color-hairline)]">
                {filtered.map((e) => (
                  <TimelineRow key={e.id} event={e} />
                ))}
              </ul>
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

function SendIntakeButton({ patientId, forms = [] }: { patientId: string; forms?: IntakeFormOption[] }) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [formId, setFormId] = useState<string>(forms[0]?.id ?? '')

  function onClick() {
    setFeedback(null)
    startTransition(async () => {
      const r = await sendIntakeRequestAction(patientId, formId || undefined)
      if (r.ok) setFeedback({ kind: 'ok', msg: `"${r.formTitle}" sent to ${r.sentTo}` })
      else setFeedback({ kind: 'err', msg: r.error })
      setTimeout(() => setFeedback(null), 4000)
    })
  }

  return (
    <div className="relative flex items-center gap-1">
      {forms.length > 1 && (
        <select
          value={formId}
          onChange={(e) => setFormId(e.target.value)}
          disabled={pending}
          aria-label="Choose intake form"
          className="text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-1.5 py-1 max-w-[9rem]"
        >
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      )}
      <ActionButton variant="secondary" size="sm" onClick={onClick} disabled={pending}>
        {pending ? 'Sending…' : 'Send intake'}
      </ActionButton>
      {feedback && (
        <span
          className={`absolute top-full left-0 mt-1 w-max max-w-[16rem] text-xs leading-snug z-10 ${feedback.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}
        >
          {feedback.msg}
        </span>
      )}
    </div>
  )
}

function SendReviewRequestButton({ patientId }: { patientId: string }) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  function onClick() {
    setFeedback(null)
    startTransition(async () => {
      const r = await sendReviewRequestForPatientAction(patientId)
      if (r.ok) setFeedback({ kind: 'ok', msg: 'Review request sent' })
      else setFeedback({ kind: 'err', msg: r.error })
      setTimeout(() => setFeedback(null), 6000)
    })
  }

  return (
    <div className="relative flex flex-col">
      <ActionButton variant="secondary" size="sm" onClick={onClick} disabled={pending}>
        {pending ? 'Sending…' : 'Request review'}
      </ActionButton>
      {feedback && (
        <span
          className={`absolute top-full left-0 mt-1 w-max max-w-[16rem] text-xs leading-snug z-10 ${feedback.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}
        >
          {feedback.msg}
        </span>
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
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  function onClick() {
    setFeedback(null)
    startTransition(async () => {
      const r = await sendPatientPortalInviteAction(patientId)
      setFeedback(r.ok ? { kind: 'ok', msg: `Invite sent to ${r.sentTo}` } : { kind: 'err', msg: r.error })
      setTimeout(() => setFeedback(null), 5000)
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
      {feedback && (
        <p className={`text-xs mt-0.5 ${feedback.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
          {feedback.msg}
        </p>
      )}
    </div>
  )
}

function NeedsAttention({ header, forms = [] }: { header: PatientHeader; forms?: IntakeFormOption[] }) {
  const items: Array<{ severity: 'warn' | 'info'; copy: string; cta?: { label: string; href: string }; sendIntake?: boolean }> = []
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
      cta: { label: 'See online payments', href: '/shop/payments' },
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
      <div className="bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20 rounded-lg px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
          Nothing pending
        </p>
        <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
          This patient is in good shape. Nothing for you to action right now.
        </p>
      </div>
    )
  }
  return (
    <div className="bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 rounded-lg px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
        Needs attention
      </p>
      <ul className="space-y-2">
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

function TimelineRow({ event }: { event: TimelineEvent }) {
  const ago = fmtRelative(event.occurredAt)
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
      <div className={`text-xl leading-none shrink-0 w-8 text-center ${event.agingDays !== null ? 'text-amber-500' : ''}`} aria-hidden="true">
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
  return (
    <li className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/30">
      {event.href ? <Link href={event.href} className="block">{inner}</Link> : inner}
    </li>
  )
}
