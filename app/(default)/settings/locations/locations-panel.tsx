'use client'

import { useState, useTransition } from 'react'
import { addLocation, deleteLocation, setPrimaryLocation } from './actions'
import type { ClinicLocation } from '@/lib/db/schema/platform'

interface Props {
  locations: ClinicLocation[]
  canEdit: boolean
}

export default function LocationsPanel({ locations, canEdit }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    try {
      await addLocation(fd)
      setShowForm(false)
      e.currentTarget.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add location')
    }
  }

  return (
    <div className="grow">
      <div className="p-6 space-y-6">

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl text-gray-800 dark:text-gray-100 font-bold mb-1">Locations</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Physical practice locations for your clinic. Most clinics have one — multi-location practices can add more.
            </p>
          </div>
          {canEdit && !showForm && (
            <button onClick={() => setShowForm(true)} className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">
              + Add Location
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleAdd} className="p-5 bg-gray-50 dark:bg-gray-900/30 rounded-lg space-y-4">
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1" htmlFor="name">Location Name <span className="text-red-500">*</span></label>
                <input id="name" name="name" type="text" required className="form-input w-full" placeholder="e.g. Main Office, Downtown" />
              </div>
              <div className="w-48">
                <label className="block text-sm font-medium mb-1" htmlFor="phone">Phone</label>
                <input id="phone" name="phone" type="tel" className="form-input w-full" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="addressLine1">Street Address</label>
              <input id="addressLine1" name="addressLine1" type="text" className="form-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="addressLine2">Suite / Apt</label>
              <input id="addressLine2" name="addressLine2" type="text" className="form-input w-full" />
            </div>
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1" htmlFor="city">City</label>
                <input id="city" name="city" type="text" className="form-input w-full" />
              </div>
              <div className="w-24">
                <label className="block text-sm font-medium mb-1" htmlFor="state">State</label>
                <input id="state" name="state" type="text" className="form-input w-full" />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium mb-1" htmlFor="postalCode">Postal Code</label>
                <input id="postalCode" name="postalCode" type="text" className="form-input w-full" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPrimary" className="form-checkbox" defaultChecked={locations.length === 0} />
              <span>Set as primary location</span>
            </label>
            {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <div className="flex items-center gap-2">
              <button type="submit" className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">
                Save Location
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError(null) }} className="btn-sm bg-white border-gray-200 hover:border-gray-300 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600 dark:text-gray-300">
                Cancel
              </button>
            </div>
          </form>
        )}

        {locations.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400 dark:text-gray-500">
            No locations yet. Add one to power your clinic website's address block.
          </div>
        ) : (
          <div className="space-y-3">
            {locations.map((loc) => (
              <div key={loc.id} className="flex items-start justify-between p-4 border border-gray-100 dark:border-gray-700/60 rounded-lg">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{loc.name}</span>
                    {loc.isPrimary === 1 && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full text-violet-700 bg-violet-500/20">Primary</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {[loc.addressLine1, loc.addressLine2].filter(Boolean).join(', ') || <span className="italic">No address</span>}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {[loc.city, loc.state, loc.postalCode].filter(Boolean).join(', ')}
                  </div>
                  {loc.phone && <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{loc.phone}</div>}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-3 text-xs">
                    {loc.isPrimary !== 1 && (
                      <button
                        onClick={() => startTransition(() => setPrimaryLocation(loc.id))}
                        disabled={pending}
                        className="font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-50"
                      >
                        Make Primary
                      </button>
                    )}
                    <button
                      onClick={() => startTransition(() => deleteLocation(loc.id))}
                      disabled={pending}
                      className="font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
