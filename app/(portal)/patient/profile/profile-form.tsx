'use client'

import { useState, useTransition } from 'react'
import { updateMyProfileAction, setMarketingEmailOptInAction } from './actions'
import { signOut } from '@/lib/auth-client'
import { PORTAL_SUCCESS_INK, PORTAL_DANGER_INK } from '@/components/patient-portal/ui'

/**
 * Profile editor + communication preferences + sign out. Single-column,
 * 56px inputs, native input types — the mobile-form basics.
 */

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

export interface ProfileFormValues {
  firstName: string
  lastName: string
  email: string
  phone: string
  dateOfBirth: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
  insuranceProvider: string
  insurancePolicyNumber: string
  insuranceGroupNumber: string
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  autoComplete,
  half = false,
}: {
  label: string
  name: string
  defaultValue: string
  type?: string
  autoComplete?: string
  half?: boolean
}) {
  return (
    <label className={`block ${half ? 'sm:col-span-1' : 'sm:col-span-2'}`}>
      <span className="mb-1.5 block text-[0.82rem] font-semibold" style={{ color: INK }}>
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        className="h-[52px] w-full rounded-2xl bg-white px-4 text-[0.95rem] outline-none"
        style={{ border: `1px solid ${BORDER}`, color: INK }}
      />
    </label>
  )
}

export default function ProfileForm({
  values,
  marketingEmailOptIn,
  brand,
}: {
  values: ProfileFormValues
  marketingEmailOptIn: boolean
  brand: string
}) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [optIn, setOptIn] = useState(marketingEmailOptIn)
  const [pending, startTransition] = useTransition()
  const [prefPending, startPrefTransition] = useTransition()

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaved(false)
    setError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateMyProfileAction(fd)
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 4000)
      } else setError(res.error)
    })
  }

  const togglePref = () => {
    const next = !optIn
    setOptIn(next)
    startPrefTransition(async () => {
      const res = await setMarketingEmailOptInAction(next)
      if (!res.ok) setOptIn(!next) // revert on failure
    })
  }

  return (
    <div className="space-y-7">
      <form onSubmit={onSubmit}>
        <div
          className="rounded-2xl bg-white p-5 sm:p-6"
          style={{ border: `1px solid ${BORDER}` }}
        >
          <p className="mb-4 text-[0.95rem] font-semibold" style={{ color: INK }}>
            About you
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" name="firstName" defaultValue={values.firstName} autoComplete="given-name" half />
            <Field label="Last name" name="lastName" defaultValue={values.lastName} autoComplete="family-name" half />
            <Field label="Email" name="email" type="email" defaultValue={values.email} autoComplete="email" half />
            <Field label="Phone" name="phone" type="tel" defaultValue={values.phone} autoComplete="tel" half />
            <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={values.dateOfBirth} autoComplete="bday" half />
          </div>

          <p className="mb-4 mt-7 text-[0.95rem] font-semibold" style={{ color: INK }}>
            Address
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Street address" name="addressLine1" defaultValue={values.addressLine1} autoComplete="address-line1" />
            <Field label="City" name="city" defaultValue={values.city} autoComplete="address-level2" half />
            <div className="grid grid-cols-2 gap-4 sm:col-span-1">
              <Field label="State" name="state" defaultValue={values.state} autoComplete="address-level1" half />
              <Field label="ZIP" name="postalCode" defaultValue={values.postalCode} autoComplete="postal-code" half />
            </div>
          </div>

          <p className="mb-4 mt-7 text-[0.95rem] font-semibold" style={{ color: INK }}>
            Insurance
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Carrier" name="insuranceProvider" defaultValue={values.insuranceProvider} half />
            <Field label="Member ID" name="insurancePolicyNumber" defaultValue={values.insurancePolicyNumber} half />
            <Field label="Group number" name="insuranceGroupNumber" defaultValue={values.insuranceGroupNumber} half />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full px-6 py-2.5 text-[0.9rem] font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: brand }}
            >
              {pending ? 'Saving…' : 'Save changes'}
            </button>
            {saved && (
              <span className="text-[0.85rem] font-medium" style={{ color: PORTAL_SUCCESS_INK }}>
                Saved — thanks for keeping us current.
              </span>
            )}
            {error && (
              <span className="text-[0.85rem] font-medium" style={{ color: PORTAL_DANGER_INK }}>
                {error}
              </span>
            )}
          </div>
        </div>
      </form>

      <div className="rounded-2xl bg-white p-5 sm:p-6" style={{ border: `1px solid ${BORDER}` }}>
        <p className="text-[0.95rem] font-semibold" style={{ color: INK }}>
          How we stay in touch
        </p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.9rem] font-medium" style={{ color: INK }}>
              Helpful reminders & news
            </p>
            <p className="mt-0.5 text-[0.8rem] leading-relaxed" style={{ color: MUTED }}>
              Cleaning-due nudges, birthday notes, occasional practice news. Visit confirmations
              and reminders always come through — this only covers the extras.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={optIn}
            onClick={togglePref}
            disabled={prefPending}
            className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50"
            style={{ backgroundColor: optIn ? brand : '#D8D1C7' }}
          >
            <span
              className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all"
              style={{ left: optIn ? 'calc(100% - 1.625rem)' : '0.125rem' }}
            />
          </button>
        </div>
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={async () => {
            await signOut()
            window.location.assign('/signin')
          }}
          className="rounded-full bg-white px-6 py-2.5 text-[0.88rem] font-semibold"
          style={{ border: `1px solid ${BORDER}`, color: MUTED }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
