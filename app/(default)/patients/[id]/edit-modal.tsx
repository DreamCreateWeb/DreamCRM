'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import type { PatientHeader } from '@/lib/services/patients'
import { ActionButton } from '@/components/ui/action-button'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { FieldError } from '@/components/ui/field-error'
import { validateRequired, validateEmail, validatePhone, collectErrors } from '@/lib/validation'
import { updatePatientAction } from '../actions'

export default function EditPatientModal({
  header,
  patientOptions = [],
  onClose,
}: {
  header: PatientHeader
  /** id+name candidates for the guardian picker (family portal access). */
  patientOptions?: Array<{ id: string; name: string }>
  onClose: () => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, dialogRef, { onEscape: onClose })

  const [firstName, setFirstName] = useState(header.firstName)
  const [lastName, setLastName] = useState(header.lastName)
  const [email, setEmail] = useState(header.email ?? '')
  const [phone, setPhone] = useState(header.phone ?? '')
  const [dob, setDob] = useState(header.dateOfBirth ?? '')
  const [address, setAddress] = useState(header.addressLine1 ?? '')
  const [city, setCity] = useState(header.city ?? '')
  const [stateField, setStateField] = useState(header.state ?? '')
  const [postal, setPostal] = useState(header.postalCode ?? '')
  const [insProvider, setInsProvider] = useState(header.insuranceProvider ?? '')
  const [insPolicy, setInsPolicy] = useState(header.insurancePolicyNumber ?? '')
  const [insGroup, setInsGroup] = useState(header.insuranceGroupNumber ?? '')
  const [guardianId, setGuardianId] = useState(header.guardianPatientId ?? '')
  // '' = use the clinic default recall cadence; otherwise a per-patient override.
  const [recallInterval, setRecallInterval] = useState(
    header.recallIntervalMonths != null ? String(header.recallIntervalMonths) : '',
  )
  // '' = English (the default); 'es' = prefers Spanish.
  const [language, setLanguage] = useState(header.preferredLanguage ?? '')

  function save() {
    setError(null)
    const errs = collectErrors({
      firstName: validateRequired(firstName, 'First name'),
      lastName: validateRequired(lastName, 'Last name'),
      email: validateEmail(email),
      phone: validatePhone(phone),
    })
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return
    startTransition(async () => {
      const r = await updatePatientAction(header.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        dateOfBirth: dob || null,
        addressLine1: address.trim() || null,
        city: city.trim() || null,
        state: stateField.trim() || null,
        postalCode: postal.trim() || null,
        insuranceProvider: insProvider.trim() || null,
        insurancePolicyNumber: insPolicy.trim() || null,
        insuranceGroupNumber: insGroup.trim() || null,
        guardianPatientId: guardianId || null,
        recallIntervalMonths: recallInterval ? parseInt(recallInterval, 10) : null,
        preferredLanguage: language || null,
      })
      if ('ok' in r && r.ok === false) { setError(r.error); return }
      router.refresh()
      onClose()
    })
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit patient" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px] px-2 sm:px-4">
      <div className="section-enter bg-[color:var(--color-surface-2)] rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-[color:var(--color-hairline)]">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Edit {header.fullName}</h2>
        </div>
        <div className="px-6 py-5 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" value={firstName} onChange={setFirstName} error={fieldErrors.firstName} />
            <Field label="Last name" value={lastName} onChange={setLastName} error={fieldErrors.lastName} />
          </div>
          <Field label="Email" value={email} onChange={setEmail} type="email" error={fieldErrors.email} />
          <Field label="Phone" value={phone} onChange={setPhone} type="tel" error={fieldErrors.phone} />
          <Field label="Date of birth" value={dob} onChange={setDob} type="date" />
          <div className="grid grid-cols-1 gap-3 pt-2">
            <Field label="Street address" value={address} onChange={setAddress} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="City" value={city} onChange={setCity} />
              <Field label="State" value={stateField} onChange={setStateField} />
              <Field label="Postal" value={postal} onChange={setPostal} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[color:var(--color-hairline)]">
            <Field label="Insurance provider" value={insProvider} onChange={setInsProvider} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Policy #" value={insPolicy} onChange={setInsPolicy} />
              <Field label="Group #" value={insGroup} onChange={setInsGroup} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[color:var(--color-hairline)]">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                Recall interval
              </span>
              <select
                value={recallInterval}
                onChange={(e) => setRecallInterval(e.target.value)}
                className="form-select w-full text-sm mt-1"
              >
                <option value="">Clinic default</option>
                <option value="3">Every 3 months</option>
                <option value="4">Every 4 months</option>
                <option value="6">Every 6 months</option>
                <option value="12">Every 12 months</option>
              </select>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                How often this patient is due for a recall visit. Leave on
                &ldquo;Clinic default&rdquo; unless they need a different cadence (e.g. a
                3-month perio recall). A synced PMS recall date still takes priority.
              </span>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                Preferred language
              </span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="form-select w-full text-sm mt-1"
              >
                <option value="">English</option>
                <option value="es">Spanish (Español)</option>
              </select>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                Shows a &ldquo;prefers Spanish&rdquo; chip in Messages and enables one-tap
                translation in the reply composer. Set automatically when a patient fills
                their intake in Spanish.
              </span>
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[color:var(--color-hairline)]">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                Family portal access (guardian)
              </span>
              <select
                value={guardianId}
                onChange={(e) => setGuardianId(e.target.value)}
                className="form-select w-full text-sm mt-1"
              >
                <option value="">No guardian — manages their own portal</option>
                {patientOptions
                  .filter((p) => p.id !== header.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                The guardian sees and manages this patient&apos;s visits and forms from their own
                portal login — for kids and family members who don&apos;t sign in themselves.
              </span>
            </label>
          </div>
          {error && <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-[color:var(--color-hairline)] flex justify-end gap-2">
          <ActionButton variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  error?: string
}) {
  const errId = error ? `err-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={errId}
        className="form-input w-full text-sm mt-1"
      />
      <FieldError id={errId} message={error} />
    </label>
  )
}
