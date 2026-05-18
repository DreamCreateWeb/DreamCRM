'use client'

import { useState } from 'react'
import { updateClinicProfile } from './actions'
import type { ClinicProfile } from '@/lib/db/schema/platform'

interface Props {
  profile: ClinicProfile | null
  orgName: string
}

const DAYS = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' },
] as const

interface HoursEntry { open?: string | null; close?: string | null; closed?: boolean }

export default function ClinicProfilePanel({ profile, orgName }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initialHours = (profile?.hours ?? {}) as Record<string, HoursEntry>

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const fd = new FormData(e.currentTarget)
      await updateClinicProfile(fd)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grow">
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-1">Clinic Profile</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            These details power your public clinic website.
          </p>
        </div>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Basics</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="displayName">Display Name <span className="text-red-500">*</span></label>
              <input id="displayName" name="displayName" className="form-input w-full" type="text" required defaultValue={profile?.displayName ?? orgName} />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Shown on your website and in the dashboard.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="legalName">Legal Name</label>
              <input id="legalName" name="legalName" className="form-input w-full" type="text" defaultValue={profile?.legalName ?? ''} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="tagline">Tagline</label>
              <input id="tagline" name="tagline" className="form-input w-full" type="text" defaultValue={profile?.tagline ?? ''} placeholder="e.g. Modern family dentistry in Brooklyn" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="about">About</label>
              <textarea id="about" name="about" className="form-textarea w-full" rows={4} defaultValue={profile?.about ?? ''} placeholder="A short paragraph about your clinic, your team, and what makes you different." />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Contact</h3>
          <div className="space-y-4">
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1" htmlFor="phone">Phone</label>
                <input id="phone" name="phone" className="form-input w-full" type="tel" defaultValue={profile?.phone ?? ''} />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
                <input id="email" name="email" className="form-input w-full" type="email" defaultValue={profile?.email ?? ''} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="addressLine1">Street Address</label>
              <input id="addressLine1" name="addressLine1" className="form-input w-full" type="text" defaultValue={profile?.addressLine1 ?? ''} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="addressLine2">Suite / Apt</label>
              <input id="addressLine2" name="addressLine2" className="form-input w-full" type="text" defaultValue={profile?.addressLine2 ?? ''} />
            </div>
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1" htmlFor="city">City</label>
                <input id="city" name="city" className="form-input w-full" type="text" defaultValue={profile?.city ?? ''} />
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium mb-1" htmlFor="state">State</label>
                <input id="state" name="state" className="form-input w-full" type="text" defaultValue={profile?.state ?? ''} />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium mb-1" htmlFor="postalCode">Postal Code</label>
                <input id="postalCode" name="postalCode" className="form-input w-full" type="text" defaultValue={profile?.postalCode ?? ''} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="country">Country</label>
              <select id="country" name="country" className="form-select w-full" defaultValue={profile?.country ?? 'US'}>
                <option value="US">United States</option>
                <option value="CA">Canada</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Office Hours</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">24-hour format (HH:MM). Leave blank to omit a day.</p>
          <div className="space-y-2">
            {DAYS.map(({ id, label }) => {
              const day = initialHours[id]
              return (
                <div key={id} className="flex items-center gap-3 py-1">
                  <label className="w-28 text-sm font-medium text-gray-700 dark:text-gray-200">{label}</label>
                  <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      name={`hours[${id}].closed`}
                      defaultChecked={!!day?.closed}
                    />
                    Closed
                  </label>
                  <input
                    name={`hours[${id}].open`}
                    type="time"
                    defaultValue={day?.closed ? '' : day?.open ?? ''}
                    className="form-input w-32"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    name={`hours[${id}].close`}
                    type="time"
                    defaultValue={day?.closed ? '' : day?.close ?? ''}
                    className="form-input w-32"
                  />
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Branding</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="brandColor">Brand Color</label>
              <div className="flex items-center gap-3">
                <input id="brandColor" name="brandColor" className="form-input w-32" type="text" placeholder="#8b5cf6" defaultValue={profile?.brandColor ?? ''} />
                <span className="text-xs text-gray-500 dark:text-gray-400">Used as the accent color across your clinic website.</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="template">Website Template</label>
              <select id="template" name="template" className="form-select w-full" defaultValue={profile?.template ?? 'modern'}>
                <option value="modern">Modern</option>
                <option value="classic">Classic (coming soon)</option>
                <option value="editorial">Editorial (coming soon)</option>
              </select>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700/60">
          <button type="submit" disabled={saving} className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓</span>}
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </form>
    </div>
  )
}
