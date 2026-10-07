'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { TONE_TEXT } from '@/lib/ui/encodings'
import {
  BEST_TIMES,
  PMS_CONNECT_INTRO,
  PMS_VENDORS,
  describePmsConnectStatus,
  pmsVendorLabel,
  type PmsConnectStatus,
} from '@/lib/pms-connect'
import { submitPmsConnectRequestAction } from '../actions'

/**
 * THE PMS FRONT DOOR (docs/ACTIVATION.md S4). Unconnected, the detail page
 * is the intro card — what it does, what to know — and ONE form: which
 * system, the practice name as it knows it, who we should talk to and when.
 * Submitted, it is a STATUS in the feature's own words ("We’re connecting
 * it — you’ll hear from Dustin within a day") with what the clinic told us
 * and a way to update it. Members read who can ask.
 */
export interface ConnectRequestView {
  vendor: string
  vendorName: string | null
  practiceNameInPms: string | null
  contactName: string
  contactEmail: string
  contactPhone: string | null
  bestTime: string | null
  notes: string | null
  status: PmsConnectStatus
  /** When the clinic ASKED (the row's createdAt) — a status answer never re-dates the ask (audit round 2). */
  requestedAtIso: string
}

export default function PmsConnectRequest({
  request,
  canManage,
  defaultContactName,
  defaultContactEmail,
}: {
  request: ConnectRequestView | null
  canManage: boolean
  defaultContactName: string | null
  defaultContactEmail: string | null
}) {
  const [editing, setEditing] = useState(false)
  const open = request && (request.status === 'requested' || request.status === 'scheduled')

  return (
    <section className="space-y-5" data-testid="pms-connect-door">
      {request && !editing && (
        <StatusCard request={request} canManage={canManage} onEdit={() => setEditing(true)} />
      )}

      {(!request || editing) && (
        <div className="v2-card px-5 py-5 sm:px-6 sm:py-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{PMS_CONNECT_INTRO.title}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{PMS_CONNECT_INTRO.lede}</p>
          <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">What it does</p>
          <ul className="mt-2 space-y-2">
            {PMS_CONNECT_INTRO.does.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-gray-800 dark:text-gray-100">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">What to know</p>
          <ul className="mt-2 space-y-1.5">
            {PMS_CONNECT_INTRO.know.map((line) => (
              <li key={line} className="text-sm text-gray-600 dark:text-gray-300">
                {line}
              </li>
            ))}
          </ul>

          {canManage ? (
            <RequestForm
              request={request}
              defaultContactName={defaultContactName}
              defaultContactEmail={defaultContactEmail}
              onDone={() => setEditing(false)}
              onCancel={open ? () => setEditing(false) : null}
            />
          ) : (
            <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">{PMS_CONNECT_INTRO.askManager}</p>
          )}
        </div>
      )}
    </section>
  )
}

function StatusCard({ request, canManage, onEdit }: { request: ConnectRequestView; canManage: boolean; onEdit: () => void }) {
  const vendor = pmsVendorLabel(request.vendor, request.vendorName)
  const { pill, sentence } = describePmsConnectStatus(request.status, vendor)
  const tone = request.status === 'connected' ? 'ok' : request.status === 'closed' ? 'neutral' : 'info'
  const best = BEST_TIMES.find((b) => b.id === request.bestTime)?.label ?? null
  return (
    <div className="v2-card px-5 py-5 sm:px-6 sm:py-6" data-testid="pms-connect-status">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <StatusPill tone={tone} label={pill} />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Asked {new Date(request.requestedAtIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <p className="mt-3 text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{sentence}</p>
      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Row label="System" value={vendor} />
        {request.practiceNameInPms && <Row label={`Name in ${vendor}`} value={request.practiceNameInPms} />}
        <Row label="We’ll call" value={`${request.contactName} · ${request.contactEmail}${request.contactPhone ? ` · ${request.contactPhone}` : ''}`} />
        {best && <Row label="Best time" value={best} />}
        {request.notes && <Row label="Notes" value={request.notes} />}
      </dl>
      {canManage && request.status !== 'connected' && (
        <button type="button" onClick={onEdit} className="mt-4 text-xs text-gray-500 dark:text-gray-400 hover:underline">
          {request.status === 'closed' ? 'Ask us to connect it again' : 'Update what you told us'}
        </button>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-800 dark:text-gray-100">{value}</dd>
    </div>
  )
}

function RequestForm({
  request,
  defaultContactName,
  defaultContactEmail,
  onDone,
  onCancel,
}: {
  request: ConnectRequestView | null
  defaultContactName: string | null
  defaultContactEmail: string | null
  onDone: () => void
  onCancel: (() => void) | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [vendor, setVendor] = useState(request?.vendor ?? '')
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<Record<string, string>>({})

  const submit = (formData: FormData) => {
    setError(null)
    setIssues({})
    startTransition(async () => {
      const r = await submitPmsConnectRequestAction(formData)
      if (r.ok) {
        onDone()
        router.refresh()
        return
      }
      if (r.issues?.length) setIssues(Object.fromEntries(r.issues.map((i) => [i.field, i.message])))
      if (r.error) setError(r.error)
    })
  }

  const field = 'form-input w-full text-sm'
  const label = 'block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1'
  const issue = (k: string) =>
    issues[k] ? (
      <p className={`mt-1 text-xs ${TONE_TEXT.warn}`} role="alert">
        {issues[k]}
      </p>
    ) : null

  return (
    <form action={submit} className="mt-6 v2-well px-4 py-4 space-y-4" data-testid="pms-connect-form" noValidate>
      <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Tell us what you run</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="pms-vendor">Practice software</label>
          <select id="pms-vendor" name="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} className="form-select w-full text-sm">
            <option value="" disabled>Pick one…</option>
            {PMS_VENDORS.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
          {issue('vendor')}
        </div>
        {vendor === 'other' && (
          <div>
            <label className={label} htmlFor="pms-vendor-name">What is it called?</label>
            <input id="pms-vendor-name" name="vendorName" defaultValue={request?.vendorName ?? ''} className={field} autoComplete="off" />
            {issue('vendorName')}
          </div>
        )}
        <div>
          <label className={label} htmlFor="pms-practice-name">Practice name as the software knows it <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span></label>
          <input id="pms-practice-name" name="practiceNameInPms" defaultValue={request?.practiceNameInPms ?? ''} className={field} autoComplete="organization" />
        </div>
      </div>

      <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 pt-1">Who we should call</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="pms-contact-name">Name</label>
          <input id="pms-contact-name" name="contactName" defaultValue={request?.contactName ?? defaultContactName ?? ''} className={field} autoComplete="name" />
          {issue('contactName')}
        </div>
        <div>
          <label className={label} htmlFor="pms-contact-email">Email</label>
          <input id="pms-contact-email" name="contactEmail" type="email" defaultValue={request?.contactEmail ?? defaultContactEmail ?? ''} className={field} autoComplete="email" />
          {issue('contactEmail')}
        </div>
        <div>
          <label className={label} htmlFor="pms-contact-phone">Phone <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span></label>
          <input id="pms-contact-phone" name="contactPhone" type="tel" defaultValue={request?.contactPhone ?? ''} className={field} autoComplete="tel" />
        </div>
        <div>
          <label className={label} htmlFor="pms-best-time">Best time</label>
          <select id="pms-best-time" name="bestTime" defaultValue={request?.bestTime ?? 'any'} className="form-select w-full text-sm">
            {BEST_TIMES.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
          {issue('bestTime')}
        </div>
      </div>
      <div>
        <label className={label} htmlFor="pms-notes">Anything we should know <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span></label>
        <textarea id="pms-notes" name="notes" rows={2} defaultValue={request?.notes ?? ''} className="form-textarea w-full text-sm" placeholder="Your IT person’s name, a server that lives off-site, a day the office is closed…" />
      </div>

      {error && (
        <p className={`text-sm ${TONE_TEXT.warn}`} role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <ActionButton type="submit" variant="primary" breath pending={pending}>
          {request ? 'Update the request' : PMS_CONNECT_INTRO.button}
        </ActionButton>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
            Keep it as it was
          </button>
        )}
      </div>
    </form>
  )
}
