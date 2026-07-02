'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { StatusPill } from '@/components/ui/status-pill'
import { Toggle } from '@/components/ui/toggle'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { SettingsTabs } from '../settings-tabs'
import { OTHER_VISIT_TYPE_ID, type VisitType } from '@/lib/types/visit-types'
import type { PracticeSettingsData } from './actions'
import {
  createProviderAction,
  updateProviderAction,
  deactivateProviderAction,
  saveVisitTypesAction,
  savePracticeOpsAction,
  saveSelfBookingAction,
} from './actions'

// Client-safe copy of the provider roles (the service module is server-only).
const PROVIDER_ROLES = [
  { value: 'dentist', label: 'Dentist' },
  { value: 'hygienist', label: 'Hygienist' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'admin', label: 'Front desk / admin' },
]
const ROLE_LABEL: Record<string, string> = Object.fromEntries(PROVIDER_ROLES.map((r) => [r.value, r.label]))

// Same loose check the server uses — so we can warn before the round-trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Recall interval bounds (mirrors savePracticeOpsAction's [1,36] clamp). */
const RECALL_MIN = 1
const RECALL_MAX = 36
/** Lapsed threshold bounds (mirrors savePracticeOpsAction's [6,60] clamp). */
const LAPSED_MIN = 6
const LAPSED_MAX = 60
const LAPSED_PRESETS = [12, 18, 24] as const

export default function PracticePanel({ initial }: { initial: PracticeSettingsData }) {
  const [toast, setToast] = useState<string | null>(null)
  const flash = (m: string) => setToast(m)

  // View-only (member) access: lock each tab's inputs by wrapping its CONTENT in a
  // disabled fieldset — NOT the whole SettingsTabs, because a disabled fieldset also
  // disables the tab-navigation buttons inside it (which left members stuck on the
  // first tab). Mutations are re-checked server-side regardless.
  const gate = (node: ReactNode): ReactNode =>
    initial.canEdit ? node : <fieldset disabled className="min-w-0 m-0 border-0 p-0 opacity-75">{node}</fieldset>

  return (
    <div className="flex-1 p-6">
      {!initial.canEdit && (
        <div className="mb-6 flex items-start gap-2 rounded-[var(--r-sm)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <StatusPill tone="warn" label="View only" />
          <span>You can view these settings. Only clinic owners and admins can make changes.</span>
        </div>
      )}
      <SettingsTabs
        tabs={[
          { id: 'booking', label: 'Online booking', content: gate(<SelfBookingSection enabled={initial.selfBookingEnabled} flash={flash} />) },
          { id: 'providers', label: 'Providers', content: gate(<ProvidersSection providers={initial.providers} flash={flash} />) },
          { id: 'visit-types', label: 'Visit types', content: gate(<VisitTypesSection initial={initial.visitTypes} depositsAvailable={initial.depositsAvailable} flash={flash} />) },
          { id: 'recall', label: 'Chairs & recall', content: gate(<OpsSection chairCount={initial.chairCount} recallDefaultMonths={initial.recallDefaultMonths} lapsedAfterMonths={initial.lapsedAfterMonths} flash={flash} />) },
        ]}
      />
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

// ─────────────────────── shared bits ───────────────────────

function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-gray-500 dark:text-gray-400">{hint}</p>
    </div>
  )
}

/** The one consistent save affordance for every editable-form section:
 *  an "Unsaved changes" badge when dirty, a "Saved ✓" tick right after a save,
 *  and a Save button that only enables when there's something to persist. This
 *  is what makes the four tabs feel coherent — same dirty→save→confirm loop. */
function SaveBar({
  dirty,
  saved,
  pending,
  onSave,
  saveLabel = 'Save changes',
}: {
  dirty: boolean
  saved: boolean
  pending: boolean
  onSave: () => void
  saveLabel?: string
}) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <ActionButton variant="primary" size="sm" onClick={onSave} disabled={pending || !dirty}>
        {pending ? 'Saving…' : saveLabel}
      </ActionButton>
      {dirty && !pending && <StatusPill tone="warn" label="Unsaved changes" />}
      {!dirty && saved && !pending && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
            <path d="M13.4 4.2a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.4L6.7 9.5l5.3-5.3a1 1 0 0 1 1.4 0Z" />
          </svg>
          Saved
        </span>
      )}
    </div>
  )
}

// ───────────────────────── Patient self-scheduling ─────────────────────────

function SelfBookingSection({ enabled, flash }: { enabled: boolean; flash: (m: string) => void }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [pending, start] = useTransition()

  function toggle(next: boolean) {
    // A switch commits immediately (it IS its own Save) — flip optimistically,
    // revert on error so the control never lies.
    setOn(next)
    start(async () => {
      const r = await saveSelfBookingAction(next)
      if (r.ok) {
        flash(next ? 'Online booking turned on.' : 'Online booking turned off — requests now go to Messages.')
        router.refresh()
      } else {
        setOn(!next)
        flash(r.error)
      }
    })
  }

  return (
    <section>
      <SectionHeading
        title="Patient self-scheduling"
        hint="Controls the “Book” button on both your website and the patient portal. Turn it off if you’d rather patients ask first and your front desk picks the time."
      />
      <div className="v2-well p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <span className="mt-0.5">
            <Toggle
              checked={on}
              onChange={toggle}
              disabled={pending}
              srLabel="Let patients book their own appointment time online"
            />
          </span>
          <span className="text-sm">
            <span className="font-medium text-gray-800 dark:text-gray-100">
              Let patients book their own appointment time online
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {on ? (
                <>
                  <span className="font-medium text-gray-700 dark:text-gray-300">On.</span>{' '}
                  Your website and patient portal show a live calendar — patients pick an open time and it books straight into your schedule.
                </>
              ) : (
                <>
                  <span className="font-medium text-gray-700 dark:text-gray-300">Off.</span>{' '}
                  Patients get a short request form instead of a calendar (email required on the website; portal patients are already known). Each request lands in{' '}
                  <span className="font-medium">Messages</span> and you reach out — by email, text, or in-app — to set the time.
                </>
              )}
            </span>
          </span>
        </label>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        This switch saves the moment you flip it — no separate Save needed.
      </p>
    </section>
  )
}

// ───────────────────────── Providers ─────────────────────────

function ProvidersSection({
  providers,
  flash,
}: {
  providers: PracticeSettingsData['providers']
  flash: (m: string) => void
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, start] = useTransition()
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('dentist')
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const activeNames = new Set(providers.filter((p) => p.isActive).map((p) => p.displayName.trim().toLowerCase()))
  const trimmedNew = newName.trim()
  const dupWarn = trimmedNew.length > 0 && activeNames.has(trimmedNew.toLowerCase())
  const emailInvalid = newEmail.trim().length > 0 && !EMAIL_RE.test(newEmail.trim())

  function add() {
    setError(null)
    if (!trimmedNew) { setError('Enter a name.'); return }
    if (emailInvalid) { setError('Enter a valid email address (or leave it blank).'); return }
    // Duplicate is a soft warning up-front but the server is the source of truth.
    start(async () => {
      const r = await createProviderAction({ displayName: trimmedNew, role: newRole, email: newEmail.trim() || null })
      if (r.ok) { setNewName(''); setNewEmail(''); flash('Provider added.'); router.refresh() }
      else setError(r.error)
    })
  }

  function saveRow(id: string, patch: { displayName: string; role: string; email: string | null }, onDone: () => void) {
    start(async () => {
      const r = await updateProviderAction({ providerId: id, ...patch })
      if (r.ok) { flash('Provider saved.'); onDone(); router.refresh() }
      else flash(r.error)
    })
  }

  function setActive(id: string, name: string, isActive: boolean) {
    if (!isActive) {
      // Deactivation hides the provider from booking — confirm it.
      void (async () => {
        const ok = await confirm({
          title: `Deactivate ${name}?`,
          message: `This hides ${name} from booking — past visits keep their attribution.`,
          confirmLabel: 'Deactivate',
          danger: true,
        })
        if (!ok) return
        start(async () => {
          const r = await deactivateProviderAction(id)
          if (r.ok) { flash('Provider deactivated.'); router.refresh() }
          else flash(r.error)
        })
      })()
      return
    }
    // Reactivation is non-destructive — commit immediately.
    start(async () => {
      const r = await updateProviderAction({ providerId: id, isActive: true })
      if (r.ok) { flash('Provider reactivated.'); router.refresh() }
      else flash(r.error)
    })
  }

  return (
    <section>
      <SectionHeading
        title="Providers"
        hint="The dentists + hygienists patients book with. Appointments attach to one for the “with …” label and the schedule filter. Deactivate (don’t delete) anyone who leaves — their past visits keep the attribution."
      />
      <ul className="mb-4 space-y-2">
        {providers.length === 0 && (
          <li className="v2-well px-4 py-6 text-center text-sm italic text-gray-500 dark:text-gray-400">
            No providers yet — add your first below.
          </li>
        )}
        {providers.map((p) => (
          <ProviderRowEditor key={p.id} provider={p} disabled={pending} onSave={saveRow} onActive={setActive} />
        ))}
      </ul>

      <div className="v2-well p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Add a provider</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[180px] flex-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder="Dr. Jordan Reyes"
              aria-invalid={dupWarn}
              className="form-input mt-1 w-full text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">Role</span>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="form-select mt-1 text-sm">
              {PROVIDER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="block min-w-[180px] flex-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Email <span className="text-gray-400 dark:text-gray-500">(optional)</span></span>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
              placeholder="jordan@clinic.com"
              aria-invalid={emailInvalid}
              className="form-input mt-1 w-full text-sm"
            />
          </label>
          <ActionButton variant="primary" size="sm" onClick={add} disabled={pending || !trimmedNew || emailInvalid}>Add</ActionButton>
        </div>
        {dupWarn && !error && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            A provider named “{trimmedNew}” is already active — you can still add another if that’s intentional.
          </p>
        )}
        {emailInvalid && !error && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">That doesn’t look like a valid email.</p>
        )}
        {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    </section>
  )
}

function ProviderRowEditor({
  provider,
  disabled,
  onSave,
  onActive,
}: {
  provider: PracticeSettingsData['providers'][number]
  disabled: boolean
  onSave: (id: string, patch: { displayName: string; role: string; email: string | null }, onDone: () => void) => void
  onActive: (id: string, name: string, isActive: boolean) => void
}) {
  const [name, setName] = useState(provider.displayName)
  const [role, setRole] = useState(provider.role)
  const [email, setEmail] = useState(provider.email ?? '')
  const [saved, setSaved] = useState(false)

  // Re-sync local edit state if the row's server values change under us
  // (e.g. after a router.refresh from another action on the same list).
  useEffect(() => {
    setName(provider.displayName)
    setRole(provider.role)
    setEmail(provider.email ?? '')
  }, [provider.displayName, provider.role, provider.email])

  const trimmedName = name.trim()
  const trimmedEmail = email.trim()
  const emailInvalid = trimmedEmail.length > 0 && !EMAIL_RE.test(trimmedEmail)
  const dirty =
    trimmedName !== provider.displayName ||
    role !== provider.role ||
    trimmedEmail !== (provider.email ?? '')
  const canSave = dirty && !!trimmedName && !emailInvalid

  function save() {
    setSaved(false)
    onSave(provider.id, { displayName: trimmedName, role, email: trimmedEmail || null }, () => setSaved(true))
  }

  return (
    <li className={`v2-card p-3 ${provider.isActive ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[160px] flex-1">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Name</span>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setSaved(false) }}
            className="form-input mt-1 w-full text-sm"
            aria-label={`Name for ${provider.displayName}`}
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Role</span>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value); setSaved(false) }}
            disabled={disabled}
            className="form-select mt-1 text-sm"
            aria-label={`Role for ${provider.displayName}`}
          >
            {PROVIDER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            {!ROLE_LABEL[role] && <option value={role}>{role}</option>}
          </select>
        </label>
        <label className="block min-w-[160px] flex-1">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setSaved(false) }}
            aria-invalid={emailInvalid}
            placeholder="optional"
            className="form-input mt-1 w-full text-sm"
            aria-label={`Email for ${provider.displayName}`}
          />
        </label>
        <div className="flex items-center gap-2 pb-0.5">
          {dirty && (
            <ActionButton variant="secondary" size="sm" onClick={save} disabled={disabled || !canSave}>Save</ActionButton>
          )}
          {!dirty && saved && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M13.4 4.2a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4 0l-3-3a1 1 0 0 1 1.4-1.4L6.7 9.5l5.3-5.3a1 1 0 0 1 1.4 0Z" />
              </svg>
              Saved
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <Toggle
              checked={provider.isActive}
              onChange={(next) => onActive(provider.id, provider.displayName, next)}
              disabled={disabled}
              size="sm"
              srLabel={`${provider.isActive ? 'Deactivate' : 'Reactivate'} ${provider.displayName}`}
            />
            {provider.isActive ? 'Active' : 'Inactive'}
          </label>
        </div>
      </div>
      {emailInvalid && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">That doesn’t look like a valid email.</p>
      )}
    </li>
  )
}

// ───────────────────────── Visit types ─────────────────────────

function VisitTypesSection({
  initial,
  depositsAvailable,
  flash,
}: {
  initial: VisitType[]
  depositsAvailable: boolean
  flash: (m: string) => void
}) {
  const router = useRouter()
  const [types, setTypes] = useState<VisitType[]>(initial)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // The saved baseline; dirty = anything drifted from it (compared by value).
  const dirty = JSON.stringify(types) !== JSON.stringify(initial)
  const anyDeposit = types.some((t) => (t.depositCents ?? 0) > 0)

  function update(i: number, patch: Partial<VisitType>) {
    setSaved(false)
    setTypes((cur) => cur.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }
  function remove(i: number) {
    setSaved(false)
    setTypes((cur) => cur.filter((_, idx) => idx !== i))
  }
  function add() {
    setSaved(false)
    setTypes((cur) => [
      ...cur,
      { id: `visit_${cur.length + 1}`, label: 'New visit type', durationMinutes: 30, bookablePublic: true, bookablePortal: true, depositCents: 0 },
    ])
  }
  function save() {
    setError(null)
    setSaved(false)
    start(async () => {
      const r = await saveVisitTypesAction(types)
      if (r.ok) { flash('Visit types saved.'); setSaved(true); router.refresh() }
      else setError(r.error)
    })
  }

  return (
    <section>
      <SectionHeading
        title="Visit types"
        hint="The appointment types the front desk, your website booking widget, and the patient portal offer. Duration (in minutes) drives how long each visit blocks the schedule. Toggle where each type can be booked online. An optional deposit (most clinics charge none) is collected at website booking and credited toward the visit."
      />
      <ul className="mb-3 space-y-2">
        {types.map((t, i) => {
          const isOther = t.id === OTHER_VISIT_TYPE_ID
          return (
            <li key={i} className="v2-card flex flex-wrap items-end gap-3 p-3">
              <label className="block min-w-[150px] flex-1">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">Label</span>
                <input value={t.label} onChange={(e) => update(i, { label: e.target.value })} className="form-input mt-1 w-full text-sm" />
              </label>
              <label className="block w-28">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">Duration</span>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="number"
                    min={15}
                    max={480}
                    step={15}
                    value={t.durationMinutes}
                    onChange={(e) => update(i, { durationMinutes: Math.min(480, Math.max(15, Number(e.target.value) || 30)) })}
                    className="form-input w-16 text-sm font-mono-num tabular-nums"
                    aria-label={`Duration in minutes for ${t.label}`}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">min</span>
                </div>
              </label>
              <label className="block w-28">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">Deposit</span>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400">$</span>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    step={1}
                    value={Math.round((t.depositCents ?? 0) / 100)}
                    onChange={(e) => update(i, { depositCents: Math.min(1000, Math.max(0, Math.round(Number(e.target.value) || 0))) * 100 })}
                    className="form-input w-16 text-sm font-mono-num tabular-nums"
                    aria-label={`Booking deposit in dollars for ${t.label} (0 = none)`}
                  />
                </div>
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-xs text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={t.bookablePublic} onChange={(e) => update(i, { bookablePublic: e.target.checked })} className="form-checkbox" />
                Website
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-xs text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={t.bookablePortal} onChange={(e) => update(i, { bookablePortal: e.target.checked })} className="form-checkbox" />
                Portal
              </label>
              <div className="pb-2">
                {isOther ? (
                  <StatusPill tone="neutral" label="Required" title="The catch-all type can't be removed — it keeps booking from dead-ending." />
                ) : (
                  <button type="button" onClick={() => remove(i)} className="text-xs text-rose-600 hover:underline dark:text-rose-400">Remove</button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <ActionButton variant="secondary" size="sm" onClick={add} disabled={pending}>+ Add visit type</ActionButton>
      {anyDeposit && !depositsAvailable && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--r-sm)] border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <StatusPill tone="warn" label="Stripe needed" />
          <span>
            Deposits charge through your connected Stripe account, which isn&rsquo;t active yet —
            until it is, patients book these types <strong>without</strong> paying a deposit.
            Connect Stripe under <a href="/shop" className="font-medium underline">Shop</a>.
          </span>
        </div>
      )}
      {anyDeposit && depositsAvailable && (
        <p className="mt-3 max-w-prose text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Deposits are collected at website booking through your connected Stripe account and
          credited toward the visit — collected deposits appear under Shop → Payments so the
          front desk can post them to your PMS ledger.
        </p>
      )}
      <SaveBar dirty={dirty} saved={saved} pending={pending} onSave={save} saveLabel="Save visit types" />
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </section>
  )
}

// ───────────────────────── Chairs + recall ─────────────────────────

function OpsSection({
  chairCount,
  recallDefaultMonths,
  lapsedAfterMonths,
  flash,
}: {
  chairCount: number
  recallDefaultMonths: number
  lapsedAfterMonths: number
  flash: (m: string) => void
}) {
  const router = useRouter()
  const [chairs, setChairs] = useState(chairCount)
  const [months, setMonths] = useState(recallDefaultMonths)
  const [lapsedMonths, setLapsedMonths] = useState(lapsedAfterMonths)
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  const dirty = chairs !== chairCount || months !== recallDefaultMonths || lapsedMonths !== lapsedAfterMonths

  function save() {
    setSaved(false)
    start(async () => {
      const r = await savePracticeOpsAction({ chairCount: chairs, recallDefaultMonths: months, lapsedAfterMonths: lapsedMonths })
      if (r.ok) { flash('Saved.'); setSaved(true); router.refresh() }
      else flash(r.error)
    })
  }

  const numberField = 'form-input mt-1 w-full text-sm font-mono-num tabular-nums'

  return (
    <section>
      <SectionHeading title="Chairs & recall" hint="Three practice-wide numbers that shape online-booking availability, when a patient is due for a routine recall, and when a quiet patient is flagged as lapsed." />

      {/* Chairs */}
      <div className="v2-card p-4">
        <label className="block max-w-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Chairs (operatories)</span>
          <input
            type="number"
            min={1}
            max={20}
            value={chairs}
            onChange={(e) => { setChairs(Math.min(20, Math.max(1, Number(e.target.value) || 1))); setSaved(false) }}
            className={numberField}
            aria-label="Number of chairs"
          />
          <span className="mt-1.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            How many patients can be seen at the same time. Online booking only blocks a time slot once this many visits already overlap it — so a multi-chair practice can take simultaneous bookings.
          </span>
        </label>
      </div>

      {/* Recall vs lapsed — deliberately paired + disambiguated. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="v2-card p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Routine recall — “due” every</span>
            <StatusPill tone="info" label="Reminders" title="Drives who shows as due for a recall visit." />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={RECALL_MIN}
              max={RECALL_MAX}
              value={months}
              onChange={(e) => { setMonths(Math.min(RECALL_MAX, Math.max(RECALL_MIN, Number(e.target.value) || 6))); setSaved(false) }}
              className="form-input w-20 text-sm font-mono-num tabular-nums"
              aria-label="Default recall interval in months"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">months</span>
          </div>
          <span className="mt-1.5 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            How often a patient is due for a routine recall (cleaning / checkup) by default. Most practices use 6. A per-patient override and a synced PMS recall date both win over this.
          </span>
        </div>

        <div className="v2-card p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Flag as lapsed after</span>
            <StatusPill tone="neutral" label="💤 quiet" title="Marks a patient lapsed / inactive." />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={LAPSED_MIN}
              max={LAPSED_MAX}
              value={lapsedMonths}
              // Clamp only the MAX while typing so a value whose first digit is
              // below LAPSED_MIN (e.g. "36") stays typeable; clamp the MIN on blur.
              onChange={(e) => { setLapsedMonths(Math.min(LAPSED_MAX, Number(e.target.value) || 0)); setSaved(false) }}
              onBlur={() => setLapsedMonths((v) => Math.min(LAPSED_MAX, Math.max(LAPSED_MIN, v || 18)))}
              className="form-input w-20 text-sm font-mono-num tabular-nums"
              aria-label="Flag a patient lapsed after this many months"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">months</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LAPSED_PRESETS.map((m) => {
              const on = lapsedMonths === m
              const note = m === 12 ? 'proactive' : m === 18 ? 'recommended' : 'ADA inactive'
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setLapsedMonths(m); setSaved(false) }}
                  aria-pressed={on}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on
                      ? 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                      : 'border-gray-200 text-gray-600 hover:text-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:text-gray-100'
                  }`}
                >
                  <span className="font-mono-num tabular-nums">{m}</span> mo · {note}
                </button>
              )
            })}
          </div>
          <span className="mt-2 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            How long with no visit before a patient is flagged lapsed / inactive (the 💤 “gone quiet” flag + the lapsed audience). The dental industry typically flags at 18 months; the ADA’s hard inactive line is 24. Type any value from {LAPSED_MIN}–{LAPSED_MAX}.
          </span>
        </div>
      </div>

      <SaveBar dirty={dirty} saved={saved} pending={pending} onSave={save} />
    </section>
  )
}
