'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import type { PatientHeader } from '@/lib/services/patients'
import type { TimelineEvent, TimelineCounts, TimelineKind } from '@/lib/services/patient-timeline'
import type { PatientNoteRow } from '@/lib/services/patient-notes'
import { GlyphCluster } from '../glyph-cluster'
import EditPatientModal from './edit-modal'
import NotesPanel from './notes-panel'
import BookFromPatientDrawer from '../../appointments/book-from-patient-drawer'
import { archivePatientAction, openPatientThreadAction, sendIntakeRequestAction } from '../actions'

function money(cents: number): string {
  if (cents === 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toFixed(0)}`
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

const LIFECYCLE_PILL: Record<string, string> = {
  lead: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  new: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  at_risk: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  lapsed: 'bg-red-500/15 text-red-700 dark:text-red-300',
  archived: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
}

const LIFECYCLE_LABEL: Record<string, string> = {
  lead: 'Lead',
  new: 'New patient',
  active: 'Active',
  at_risk: 'At risk',
  lapsed: 'Lapsed',
  archived: 'Archived',
}

const SOURCE_LABEL: Record<string, string> = {
  website: 'website',
  booking: 'booking widget',
  referral: 'referral',
  walk_in: 'walk-in',
  manual: 'manual entry',
  lead_form: 'contact form',
  invite: 'patient invite',
}

const FILTER_KEYS: Array<{ key: TimelineKind | 'all'; label: string; countKey: keyof TimelineCounts }> = [
  { key: 'all', label: 'All', countKey: 'all' },
  { key: 'appointment', label: 'Appointments', countKey: 'appointments' },
  { key: 'message', label: 'Messages', countKey: 'messages' },
  { key: 'form_submission', label: 'Forms', countKey: 'forms' },
  { key: 'invoice', label: 'Billing', countKey: 'billing' },
  { key: 'note', label: 'Notes', countKey: 'notes' },
]

export default function PatientDetail({
  header,
  timeline,
  counts,
  notes,
}: {
  header: PatientHeader
  timeline: TimelineEvent[]
  counts: TimelineCounts
  notes: PatientNoteRow[]
}) {
  const [filter, setFilter] = useState<TimelineKind | 'all'>('all')
  const [editOpen, setEditOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [archivePending, startArchive] = useTransition()

  const filtered = useMemo(
    () => filter === 'all' ? timeline : timeline.filter((e) => e.kind === filter),
    [filter, timeline],
  )

  function onArchive() {
    if (!confirm(`Archive ${header.fullName}? They'll move to the Archived list.`)) return
    startArchive(async () => { await archivePatientAction(header.id) })
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
      <header className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5 mb-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100">
                {header.fullName}
              </h1>
              {header.ageYears !== null && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {header.ageYears} yrs
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${LIFECYCLE_PILL[header.lifecycle] ?? LIFECYCLE_PILL.active}`}>
                {LIFECYCLE_LABEL[header.lifecycle] ?? header.lifecycle}
              </span>
              <GlyphCluster flags={header.flags} cap={Infinity} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              First seen {fmtFullDate(header.firstSeenAt)}
              {header.source && <> · via {SOURCE_LABEL[header.source] ?? header.source}</>}
              {header.totalBookings > 0 && <> · {header.totalBookings} {header.totalBookings === 1 ? 'booking' : 'bookings'} on file</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={openPatientThreadAction}>
              <input type="hidden" name="patientId" value={header.id} />
              <button
                type="submit"
                className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50"
              >
                Send message
              </button>
            </form>
            <button
              type="button"
              onClick={() => setBookOpen(true)}
              className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50"
            >
              Book appointment
            </button>
            <SendIntakeButton patientId={header.id} />
            <button
              onClick={() => setEditOpen(true)}
              className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800"
            >
              Edit
            </button>
          </div>
        </div>
        {/* Header stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100 dark:border-gray-700/60">
          <Stat label="Last visit" value={fmtFullDate(header.lastVisitAt)} hint={fmtRelative(header.lastVisitAt)} />
          <Stat
            label="Next visit"
            value={header.nextVisitAt ? fmtFullDate(header.nextVisitAt) : 'None scheduled'}
            hint={header.nextVisitType ? header.nextVisitType.replace(/_/g, ' ') : ''}
          />
          <Stat
            label="Balance"
            value={money(header.outstandingBalanceCents)}
            hint={header.outstandingBalanceCents > 0 ? 'unpaid' : 'paid up'}
            tone={header.outstandingBalanceCents > 0 ? 'warn' : 'ok'}
          />
          <Stat label="Lifetime spend" value={money(header.lifetimeValueCents)} hint="shop invoices" />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Identity rail ──────────────────────────────────────────── */}
        <aside className="lg:col-span-3 space-y-4">
          <NeedsAttention header={header} />
          <IdentityCard header={header} />
        </aside>

        {/* ── Timeline ───────────────────────────────────────────────── */}
        <section className="lg:col-span-6">
          <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 flex flex-wrap gap-1.5 items-center">
              {FILTER_KEYS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${
                    filter === f.key
                      ? 'bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-800'
                      : 'bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                  {counts[f.countKey] > 0 && (
                    <span className="ml-1 opacity-60">{counts[f.countKey]}</span>
                  )}
                </button>
              ))}
            </div>
            {filtered.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-3xl mb-2">🌱</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No {filter === 'all' ? 'activity yet' : `${filter.replace('_', ' ')} entries`}.
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs mx-auto">
                  Bookings, messages, form submissions and invoices will appear here as they happen.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {filtered.map((e) => (
                  <TimelineRow key={e.id} event={e} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Notes column ───────────────────────────────────────────── */}
        <aside className="lg:col-span-3">
          <NotesPanel patientId={header.id} notes={notes} />
          <div className="mt-4">
            <button
              onClick={onArchive}
              disabled={archivePending}
              className="w-full text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition py-2"
            >
              {archivePending ? 'Archiving…' : header.lifecycle === 'archived' ? 'Archived' : 'Archive patient'}
            </button>
          </div>
        </aside>
      </div>

      {editOpen && <EditPatientModal header={header} onClose={() => setEditOpen(false)} />}
      {bookOpen && (
        <BookFromPatientDrawer
          patientId={header.id}
          patientName={header.fullName}
          onClose={() => setBookOpen(false)}
        />
      )}
    </div>
  )
}

function SendIntakeButton({ patientId }: { patientId: string }) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  function onClick() {
    setFeedback(null)
    startTransition(async () => {
      const r = await sendIntakeRequestAction(patientId)
      if (r.ok) setFeedback({ kind: 'ok', msg: `Intake link sent to ${r.sentTo}` })
      else setFeedback({ kind: 'err', msg: r.error })
      setTimeout(() => setFeedback(null), 4000)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send intake'}
      </button>
      {feedback && (
        <span
          className={`text-[11px] ${feedback.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
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
}: {
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'ok' | 'warn'
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-red-700 dark:text-red-300'
      : tone === 'ok'
        ? 'text-emerald-700 dark:text-emerald-300'
        : 'text-gray-800 dark:text-gray-100'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${valueClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-gray-500 dark:text-gray-400 capitalize" suppressHydrationWarning>{hint}</p>}
    </div>
  )
}

function NeedsAttention({ header }: { header: PatientHeader }) {
  const items: Array<{ severity: 'warn' | 'info'; copy: string; cta?: { label: string; href: string } }> = []
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
      cta: { label: 'Send intake', href: '/intake-forms' },
    })
  }
  if (header.outstandingBalanceCents > 0) {
    items.push({
      severity: 'warn',
      copy: `${money(header.outstandingBalanceCents)} balance outstanding.`,
      cta: { label: 'View invoices', href: '/ecommerce/invoices' },
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
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
          Nothing pending
        </p>
        <p className="text-xs text-emerald-700/70 dark:text-emerald-300/70">
          This patient is in good shape. Nothing for you to action right now.
        </p>
      </div>
    )
  }
  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-2">
        Needs attention
      </p>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-gray-800 dark:text-gray-100">
            <p>{it.copy}</p>
            {it.cta && (
              <Link
                href={it.cta.href}
                className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
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
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-4 py-4 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Contact</p>
        <p className="text-sm text-gray-800 dark:text-gray-100 break-all">{header.email ?? '—'}</p>
        <p className="text-sm text-gray-700 dark:text-gray-200">{header.phone ?? '—'}</p>
      </div>
      {(header.dateOfBirth || address) && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Personal</p>
          {header.dateOfBirth && (
            <p className="text-sm text-gray-700 dark:text-gray-200">DOB {header.dateOfBirth}</p>
          )}
          {address && (
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-snug mt-1">{address}</p>
          )}
        </div>
      )}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Insurance</p>
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {header.insuranceProvider ?? <span className="text-gray-400 italic">No insurance on file</span>}
        </p>
        {header.insurancePolicyNumber && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Policy {header.insurancePolicyNumber}</p>
        )}
        {header.insuranceGroupNumber && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Group {header.insuranceGroupNumber}</p>
        )}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Portal</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          {header.hasPortalAccount ? 'Linked to a portal account' : 'Not invited yet'}
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

const APPT_STATUS_LABEL: Record<string, string> = {
  scheduled: 'Unconfirmed',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

const APPT_STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  completed: 'bg-gray-500/15 text-gray-600 dark:text-gray-300',
  cancelled: 'bg-red-500/15 text-red-700 dark:text-red-300',
  no_show: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

const INV_STATUS_PILL: Record<string, string> = {
  draft: 'bg-gray-500/15 text-gray-600 dark:text-gray-300',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  paid: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  overdue: 'bg-red-500/15 text-red-700 dark:text-red-300',
  cancelled: 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
}

const KIND_ICON: Record<TimelineKind, string> = {
  appointment: '📅',
  message: '💬',
  form_submission: '📝',
  invoice: '💵',
  note: '📌',
  created: '🌱',
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const ago = fmtRelative(event.occurredAt)
  const pill = (() => {
    if (event.kind === 'appointment' && event.status) {
      return (
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${APPT_STATUS_PILL[event.status] ?? APPT_STATUS_PILL.scheduled}`}>
          {APPT_STATUS_LABEL[event.status] ?? event.status}
        </span>
      )
    }
    if (event.kind === 'invoice' && event.status) {
      return (
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${INV_STATUS_PILL[event.status] ?? INV_STATUS_PILL.draft}`}>
          {event.status}
        </span>
      )
    }
    if (event.kind === 'message' && event.direction) {
      return (
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${event.direction === 'in' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-violet-500/15 text-violet-700 dark:text-violet-300'}`}>
          {event.direction === 'in' ? 'From patient' : 'To patient'}
        </span>
      )
    }
    return null
  })()

  const inner = (
    <div className="flex items-start gap-3">
      <div className={`text-xl leading-none shrink-0 w-8 text-center ${event.agingDays !== null ? 'text-amber-500' : ''}`}>
        {KIND_ICON[event.kind]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 capitalize">
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
      <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0" suppressHydrationWarning>
        {ago}
      </span>
    </div>
  )
  return (
    <li className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
      {event.href ? <Link href={event.href} className="block">{inner}</Link> : inner}
    </li>
  )
}
