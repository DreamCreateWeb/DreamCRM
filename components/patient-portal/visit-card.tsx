'use client'

import { useState, useTransition } from 'react'
import {
  confirmMyVisitAction,
  joinMyWaitlistAction,
  cancelMyVisitAction,
  rescheduleMyVisitAction,
  getPortalSlotsAction,
} from '@/app/(portal)/patient/actions'
import SlotPicker from './slot-picker'
import { fmtVisitDayTime, visitProximityLabel } from './format'

/**
 * The portal's anchor object: a state-aware visit card. The action row
 * mutates with the visit's state (Confirm → Add to calendar / Directions →
 * Reschedule / Cancel → inside the notice window: "call us"), per the
 * athenahealth/Tend pattern — the next step lives ON the card, never in a
 * menu. Self-serve changes happen inline (expanding panels), no navigation.
 */

export interface VisitCardData {
  id: string
  type: string
  typeLabel: string
  status: string
  startIso: string
  providerName: string | null
  providerPhotoUrl: string | null
  patientFirstName: string
  isDependent: boolean
}

const BORDER = '#E8E2D9'
const INK = '#1C1A17'
const MUTED = '#6B635A'

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  confirmed: { bg: '#E5EFE6', fg: '#2F6B3C', label: 'Confirmed' },
  scheduled: { bg: '#FBF3E4', fg: '#8A6116', label: 'Needs confirming' },
}

function Face({ name, photoUrl, brand }: { name: string | null; photoUrl: string | null; brand: string }) {
  if (!name) return null
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt={name} className="h-11 w-11 shrink-0 rounded-full object-cover" width={44} height={44} loading="lazy" decoding="async" />
  }
  const initials = name
    .replace(/^Dr\.?\s+/i, '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[0.95rem] font-semibold text-white"
      style={{ backgroundColor: brand, fontFamily: 'var(--font-display)' }}
    >
      {initials}
    </span>
  )
}

function ActionPill({
  children,
  onClick,
  href,
  brand,
  variant = 'quiet',
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  brand?: string
  variant?: 'brand' | 'quiet' | 'danger'
  disabled?: boolean
}) {
  const cls = 'inline-flex items-center justify-center rounded-full px-3.5 py-2 text-[0.8rem] font-semibold transition-opacity disabled:opacity-50'
  const style =
    variant === 'brand'
      ? { backgroundColor: brand, color: '#FFFFFF' }
      : variant === 'danger'
        ? { backgroundColor: '#FFFFFF', border: '1px solid #E8C8C0', color: '#9B4434' }
        : { backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, color: INK }
  if (href) {
    return (
      <a href={href} className={cls} style={style} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
        {children}
      </a>
    )
  }
  return (
    <button type="button" className={cls} style={style} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export default function VisitCard({
  visit,
  brand,
  timeZone,
  clinicPhone,
  mapsQuery,
  canModify,
  canJoinWaitlist,
  minNoticeHours,
  showFace,
}: {
  visit: VisitCardData
  brand: string
  timeZone: string
  clinicPhone: string | null
  /** "addressLine1, City, ST" for the Get-directions deep link; null hides it. */
  mapsQuery: string | null
  /** Clinic allows self-serve reschedule/cancel (feature flag). */
  canModify: boolean
  /** Clinic allows waitlist self-enroll ("notify me if something opens sooner"). */
  canJoinWaitlist: boolean
  /** Reschedule/cancel cutoff (hours before start). */
  minNoticeHours: number
  showFace: boolean
}) {
  const [panel, setPanel] = useState<'none' | 'reschedule' | 'cancel'>('none')
  const [waitlisted, setWaitlisted] = useState(false)
  const [newSlotIso, setNewSlotIso] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const start = new Date(visit.startIso)
  const withinNotice = start.getTime() - Date.now() < minNoticeHours * 3_600_000
  const statusStyle = STATUS_STYLES[visit.status]
  const proximity = visitProximityLabel(start, timeZone)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) => {
    setMessage(null)
    startTransition(async () => {
      const res = await fn()
      if (res.ok) {
        setMessage({ kind: 'ok', text: okText })
        setPanel('none')
        setNewSlotIso(null)
      } else {
        setMessage({ kind: 'error', text: res.error ?? 'Something went wrong.' })
      }
    })
  }

  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: `1px solid ${BORDER}`, borderLeft: `4px solid ${brand}`, boxShadow: '0 1px 2px rgba(28,26,23,0.04)' }}
    >
      <div className="flex items-start gap-3.5">
        {showFace && <Face name={visit.providerName} photoUrl={visit.providerPhotoUrl} brand={brand} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[1.05rem] font-semibold leading-snug" style={{ color: INK }}>
              {visit.typeLabel}
              {visit.providerName ? (
                <span className="font-normal" style={{ color: MUTED }}>
                  {' '}
                  with {visit.providerName}
                </span>
              ) : null}
            </p>
            {statusStyle && (
              <span className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold" style={{ backgroundColor: statusStyle.bg, color: statusStyle.fg }}>
                {statusStyle.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-[0.92rem]" style={{ color: MUTED }}>
            {fmtVisitDayTime(start, timeZone)}
            {proximity && (
              <span className="ml-2 rounded-full px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide" style={{ backgroundColor: '#FAF7F2', color: brand }}>
                {proximity}
              </span>
            )}
          </p>
          {visit.isDependent && (
            <p className="mt-0.5 text-[0.85rem] font-medium" style={{ color: brand }}>
              for {visit.patientFirstName}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {visit.status === 'scheduled' && (
          <ActionPill
            brand={brand}
            variant="brand"
            disabled={pending}
            onClick={() => run(() => confirmMyVisitAction(visit.id), 'See you then — you’re confirmed.')}
          >
            Confirm visit
          </ActionPill>
        )}
        <ActionPill href={`/patient/appointments/${visit.id}/ics`}>Add to calendar</ActionPill>
        {mapsQuery && (
          <ActionPill href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`}>
            Directions
          </ActionPill>
        )}
        {canModify && !withinNotice && (
          <>
            <ActionPill onClick={() => setPanel(panel === 'reschedule' ? 'none' : 'reschedule')} disabled={pending}>
              Reschedule
            </ActionPill>
            <ActionPill variant="danger" onClick={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')} disabled={pending}>
              Cancel
            </ActionPill>
          </>
        )}
        {canModify && withinNotice && clinicPhone && (
          <ActionPill href={`tel:${clinicPhone}`}>Need to change it? Call us</ActionPill>
        )}
        {/* Fast-pass waitlist self-enroll — the same list the front desk works
            from, so a freed slot reaches this patient like any other. Only
            worth offering while the visit is still ahead + changeable. */}
        {canJoinWaitlist && !withinNotice && (visit.status === 'scheduled' || visit.status === 'confirmed') && (
          waitlisted ? (
            <span
              className="inline-flex items-center rounded-full px-3.5 py-1.5 text-[0.85rem] font-semibold"
              style={{ backgroundColor: '#EEF4EF', color: '#3E5C50' }}
            >
              ✓ We’ll text or email if something opens sooner
            </span>
          ) : (
            <ActionPill
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await joinMyWaitlistAction(visit.id)
                  if (res.ok) setWaitlisted(true)
                  return res
                }, 'You’re on the list — we’ll reach out the moment something opens up.')
              }
            >
              ⏰ Notify me if something opens sooner
            </ActionPill>
          )
        )}
      </div>

      {panel === 'reschedule' && (
        <div className="mt-4 rounded-2xl p-4" style={{ backgroundColor: '#FAF7F2' }}>
          <p className="mb-3 text-[0.9rem] font-semibold" style={{ color: INK }}>
            Pick a new time — we’ll let the front desk know.
          </p>
          <SlotPicker
            loadSlots={getPortalSlotsAction}
            brand={brand}
            timeZone={timeZone}
            selectedIso={newSlotIso}
            onSelect={setNewSlotIso}
            minNoticeHours={minNoticeHours}
          />
          {newSlotIso && (
            <div className="mt-3 flex gap-2">
              <ActionPill
                brand={brand}
                variant="brand"
                disabled={pending}
                onClick={() => run(() => rescheduleMyVisitAction(visit.id, newSlotIso), 'All moved — your new time is confirmed in email too.')}
              >
                {pending ? 'Moving…' : 'Move my visit'}
              </ActionPill>
              <ActionPill onClick={() => setPanel('none')} disabled={pending}>
                Never mind
              </ActionPill>
            </div>
          )}
        </div>
      )}

      {panel === 'cancel' && (
        <div className="mt-4 rounded-2xl p-4" style={{ backgroundColor: '#FAF7F2' }}>
          <p className="text-[0.9rem]" style={{ color: INK }}>
            Life happens — no judgment. Want us to cancel this visit?
          </p>
          <div className="mt-3 flex gap-2">
            <ActionPill
              variant="danger"
              disabled={pending}
              onClick={() => run(() => cancelMyVisitAction(visit.id), 'Cancelled. Whenever you’re ready, we’ll be here.')}
            >
              {pending ? 'Cancelling…' : 'Yes, cancel it'}
            </ActionPill>
            <ActionPill onClick={() => setPanel('none')} disabled={pending}>
              Keep my visit
            </ActionPill>
          </div>
        </div>
      )}

      {message && (
        <p
          className="mt-3 rounded-xl px-3.5 py-2.5 text-[0.85rem] font-medium"
          style={
            message.kind === 'ok'
              ? { backgroundColor: '#E5EFE6', color: '#2F6B3C' }
              : { backgroundColor: '#F7E9E6', color: '#9B4434' }
          }
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
