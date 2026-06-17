'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
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

export default function PracticePanel({ initial }: { initial: PracticeSettingsData }) {
  const [toast, setToast] = useState<string | null>(null)
  const flash = (m: string) => setToast(m)

  return (
    <div className="flex-1 p-6 space-y-10">
      <SelfBookingSection enabled={initial.selfBookingEnabled} flash={flash} />
      <ProvidersSection providers={initial.providers} flash={flash} />
      <VisitTypesSection initial={initial.visitTypes} flash={flash} />
      <OpsSection chairCount={initial.chairCount} recallDefaultMonths={initial.recallDefaultMonths} flash={flash} />
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

// ───────────────────────── Patient self-scheduling ─────────────────────────

function SelfBookingSection({ enabled, flash }: { enabled: boolean; flash: (m: string) => void }) {
  const router = useRouter()
  const [on, setOn] = useState(enabled)
  const [pending, start] = useTransition()

  function toggle(next: boolean) {
    // Optimistic: flip immediately, revert on error so the switch never lies.
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
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Let patients book their own appointment time online"
            disabled={pending}
            onClick={() => toggle(!on)}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
              on ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                on ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className="text-sm">
            <span className="font-medium text-gray-800 dark:text-gray-100">
              Let patients book their own appointment time online
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
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
    </section>
  )
}

function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>
    </div>
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
  const [pending, start] = useTransition()
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('dentist')
  const [error, setError] = useState<string | null>(null)

  function add() {
    setError(null)
    if (!newName.trim()) { setError('Enter a name'); return }
    start(async () => {
      const r = await createProviderAction({ displayName: newName.trim(), role: newRole })
      if (r.ok) { setNewName(''); flash('Provider added.'); router.refresh() }
      else setError(r.error)
    })
  }

  function setActive(id: string, isActive: boolean) {
    start(async () => {
      const r = isActive
        ? await updateProviderAction({ providerId: id, isActive: true })
        : await deactivateProviderAction(id)
      if (r.ok) { flash(isActive ? 'Provider reactivated.' : 'Provider deactivated.'); router.refresh() }
      else flash(r.error)
    })
  }

  function rename(id: string, displayName: string) {
    start(async () => {
      const r = await updateProviderAction({ providerId: id, displayName })
      if (r.ok) { flash('Saved.'); router.refresh() }
      else flash(r.error)
    })
  }

  function changeRole(id: string, role: string) {
    start(async () => {
      const r = await updateProviderAction({ providerId: id, role })
      if (r.ok) router.refresh()
      else flash(r.error)
    })
  }

  return (
    <section>
      <SectionHeading
        title="Providers"
        hint="The dentists + hygienists patients book with. Appointments attach to one for the “with …” label and the schedule filter. Deactivate (don’t delete) anyone who leaves — their past visits keep the attribution."
      />
      <ul className="space-y-2 mb-4">
        {providers.length === 0 && (
          <li className="text-sm text-gray-500 dark:text-gray-400 italic">No providers yet — add your first below.</li>
        )}
        {providers.map((p) => (
          <ProviderRowEditor key={p.id} provider={p} disabled={pending} onRename={rename} onRole={changeRole} onActive={setActive} />
        ))}
      </ul>
      <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-3">
        <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Add a provider</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[180px]">
            <span className="text-xs text-gray-500 dark:text-gray-400">Name</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dr. Jordan Reyes" className="form-input w-full text-sm mt-1" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">Role</span>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="form-select text-sm mt-1">
              {PROVIDER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <ActionButton variant="primary" size="sm" onClick={add} disabled={pending}>Add</ActionButton>
        </div>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
      </div>
    </section>
  )
}

function ProviderRowEditor({
  provider,
  disabled,
  onRename,
  onRole,
  onActive,
}: {
  provider: PracticeSettingsData['providers'][number]
  disabled: boolean
  onRename: (id: string, name: string) => void
  onRole: (id: string, role: string) => void
  onActive: (id: string, isActive: boolean) => void
}) {
  const [name, setName] = useState(provider.displayName)
  const dirty = name.trim() !== provider.displayName
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-lg border p-2.5 ${provider.isActive ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-60'}`}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="form-input text-sm flex-1 min-w-[160px]"
        aria-label={`Name for ${provider.displayName}`}
      />
      <select value={provider.role} onChange={(e) => onRole(provider.id, e.target.value)} disabled={disabled} className="form-select text-xs py-1.5" aria-label={`Role for ${provider.displayName}`}>
        {PROVIDER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        {!ROLE_LABEL[provider.role] && <option value={provider.role}>{provider.role}</option>}
      </select>
      {dirty && (
        <ActionButton variant="secondary" size="sm" onClick={() => onRename(provider.id, name.trim())} disabled={disabled || !name.trim()}>Save</ActionButton>
      )}
      <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
        <input type="checkbox" checked={provider.isActive} onChange={(e) => onActive(provider.id, e.target.checked)} disabled={disabled} className="form-checkbox" />
        Active
      </label>
    </li>
  )
}

// ───────────────────────── Visit types ─────────────────────────

function VisitTypesSection({ initial, flash }: { initial: VisitType[]; flash: (m: string) => void }) {
  const router = useRouter()
  const [types, setTypes] = useState<VisitType[]>(initial)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function update(i: number, patch: Partial<VisitType>) {
    setTypes((cur) => cur.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }
  function remove(i: number) {
    setTypes((cur) => cur.filter((_, idx) => idx !== i))
  }
  function add() {
    setTypes((cur) => [
      ...cur,
      { id: `visit_${cur.length + 1}`, label: 'New visit type', durationMinutes: 30, bookablePublic: true, bookablePortal: true },
    ])
  }
  function save() {
    setError(null)
    start(async () => {
      const r = await saveVisitTypesAction(types)
      if (r.ok) { flash('Visit types saved.'); router.refresh() }
      else setError(r.error)
    })
  }

  return (
    <section className="border-t border-gray-100 dark:border-gray-700/60 pt-8">
      <SectionHeading
        title="Visit types"
        hint="The appointment types the front desk, your website booking widget, and the patient portal offer. Duration drives how long each visit blocks the schedule. Toggle where each type can be booked online."
      />
      <ul className="space-y-2 mb-3">
        {types.map((t, i) => {
          const isOther = t.id === OTHER_VISIT_TYPE_ID
          return (
            <li key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
              <label className="block flex-1 min-w-[150px]">
                <span className="text-xs text-gray-500 dark:text-gray-400">Label</span>
                <input value={t.label} onChange={(e) => update(i, { label: e.target.value })} className="form-input w-full text-sm mt-1" />
              </label>
              <label className="block w-24">
                <span className="text-xs text-gray-500 dark:text-gray-400">Minutes</span>
                <input type="number" min={15} max={480} step={15} value={t.durationMinutes} onChange={(e) => update(i, { durationMinutes: Math.max(15, Number(e.target.value) || 30) })} className="form-input w-full text-sm mt-1" />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 pb-2">
                <input type="checkbox" checked={t.bookablePublic} onChange={(e) => update(i, { bookablePublic: e.target.checked })} className="form-checkbox" />
                Website
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 pb-2">
                <input type="checkbox" checked={t.bookablePortal} onChange={(e) => update(i, { bookablePortal: e.target.checked })} className="form-checkbox" />
                Portal
              </label>
              {isOther ? (
                <span className="text-xs text-gray-400 dark:text-gray-500 pb-2" title="The catch-all type can't be removed — it keeps booking from dead-ending.">Required</span>
              ) : (
                <button type="button" onClick={() => remove(i)} className="text-xs text-rose-600 dark:text-rose-400 hover:underline pb-2">Remove</button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-2">
        <ActionButton variant="secondary" size="sm" onClick={add} disabled={pending}>+ Add visit type</ActionButton>
        <ActionButton variant="primary" size="sm" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save visit types'}</ActionButton>
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
    </section>
  )
}

// ───────────────────────── Chairs + recall ─────────────────────────

function OpsSection({
  chairCount,
  recallDefaultMonths,
  flash,
}: {
  chairCount: number
  recallDefaultMonths: number
  flash: (m: string) => void
}) {
  const router = useRouter()
  const [chairs, setChairs] = useState(chairCount)
  const [months, setMonths] = useState(recallDefaultMonths)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const r = await savePracticeOpsAction({ chairCount: chairs, recallDefaultMonths: months })
      if (r.ok) { flash('Saved.'); router.refresh() }
      else flash(r.error)
    })
  }

  return (
    <section className="border-t border-gray-100 dark:border-gray-700/60 pt-8">
      <SectionHeading title="Booking & recall" hint="Two settings that shape how online booking and recall behave for your whole practice." />
      <div className="grid sm:grid-cols-2 gap-5 max-w-xl">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Chairs</span>
          <input type="number" min={1} max={20} value={chairs} onChange={(e) => setChairs(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className="form-input w-full text-sm mt-1" />
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">How many patients can be seen at the same time — drives online-booking availability.</span>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Default recall interval (months)</span>
          <input type="number" min={1} max={36} value={months} onChange={(e) => setMonths(Math.min(36, Math.max(1, Number(e.target.value) || 6)))} className="form-input w-full text-sm mt-1" />
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">How often patients are due for a recall visit by default. Individual patients can override this; a synced PMS recall date always wins.</span>
        </label>
      </div>
      <div className="mt-4">
        <ActionButton variant="primary" size="sm" onClick={save} disabled={pending}>{pending ? 'Saving…' : 'Save'}</ActionButton>
      </div>
    </section>
  )
}
