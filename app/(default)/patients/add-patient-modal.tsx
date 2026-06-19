'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { FieldError } from '@/components/ui/field-error'
import { validateRequired, validateEmail, validatePhone, collectErrors } from '@/lib/validation'
import { createPatientAction } from './actions'

export default function AddPatientModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, dialogRef, { onEscape: onClose })

  function runSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const r = await createPatientAction(formData)
      if ('duplicateOf' in r && r.duplicateOf) {
        setDuplicate(r.duplicateOf)
        return
      }
      if (!r.ok) {
        setError('error' in r ? r.error : 'Could not save patient')
        return
      }
      router.push(`/patients/${r.id}`)
    })
  }

  function submit(formData: FormData) {
    // Inline, pre-submit validation — show errors next to the fields instead of
    // a native browser bubble or a round-trip to the server.
    const errs = collectErrors({
      firstName: validateRequired(String(formData.get('firstName') ?? ''), 'First name'),
      lastName: validateRequired(String(formData.get('lastName') ?? ''), 'Last name'),
      email: validateEmail(String(formData.get('email') ?? '')),
      phone: validatePhone(String(formData.get('phone') ?? '')),
    })
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return
    setDuplicate(null)
    runSubmit(formData)
  }

  // "Add anyway" — re-submit the same form fields with forceNew set so the
  // dedupe pre-check is skipped.
  function addAnyway() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    fd.set('forceNew', '1')
    setDuplicate(null)
    runSubmit(fd)
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Add patient" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px] px-2 sm:px-4">
      <div className="section-enter bg-[color:var(--color-surface-2)] rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md flex flex-col">
        <div className="px-6 py-5 border-b border-[color:var(--color-hairline)]">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add patient</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Just the basics: name, contact, and date of birth. You can fill in the rest from the patient page.
          </p>
        </div>
        <form ref={formRef} action={submit} className="px-6 py-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">First name</span>
              <input
                name="firstName"
                aria-invalid={!!fieldErrors.firstName}
                aria-describedby={fieldErrors.firstName ? 'err-firstName' : undefined}
                className="form-input w-full mt-1 text-sm"
              />
              <FieldError id="err-firstName" message={fieldErrors.firstName} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Last name</span>
              <input
                name="lastName"
                aria-invalid={!!fieldErrors.lastName}
                aria-describedby={fieldErrors.lastName ? 'err-lastName' : undefined}
                className="form-input w-full mt-1 text-sm"
              />
              <FieldError id="err-lastName" message={fieldErrors.lastName} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Email</span>
            <input
              name="email"
              type="email"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? 'err-email' : undefined}
              className="form-input w-full mt-1 text-sm"
            />
            <FieldError id="err-email" message={fieldErrors.email} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Phone</span>
            <input
              name="phone"
              type="tel"
              aria-invalid={!!fieldErrors.phone}
              aria-describedby={fieldErrors.phone ? 'err-phone' : undefined}
              className="form-input w-full mt-1 text-sm"
            />
            <FieldError id="err-phone" message={fieldErrors.phone} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Date of birth</span>
            <input name="dateOfBirth" type="date" className="form-input w-full mt-1 text-sm" />
          </label>
          {error && <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
          {duplicate && (
            <div className="rounded-lg bg-amber-500/10 ring-1 ring-inset ring-amber-500/30 px-3 py-2.5">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Looks like <span className="font-semibold">{duplicate.name}</span> already exists with
                this email or phone — open their record instead?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton
                  variant="primary"
                  size="sm"
                  onClick={() => router.push(`/patients/${duplicate.id}`)}
                >
                  Open their record
                </ActionButton>
                <ActionButton variant="secondary" size="sm" onClick={addAnyway} disabled={pending}>
                  {pending ? 'Adding…' : 'Add anyway'}
                </ActionButton>
              </div>
            </div>
          )}
          <div className="pt-2 flex justify-end gap-2">
            <ActionButton variant="secondary" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </ActionButton>
            <ActionButton variant="primary" size="sm" type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save & open'}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  )
}
