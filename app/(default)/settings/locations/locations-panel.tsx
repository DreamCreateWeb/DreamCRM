'use client'

import { useState, useTransition } from 'react'
import { addLocation, deleteLocation, setPrimaryLocation } from './actions'
import type { ClinicLocation } from '@/lib/db/schema/platform'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { SettingsSection } from '../settings-kit'

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
    <div className="p-6">
      <SettingsSection
        title="Locations"
        description="Most clinics have one — multi-location practices can add more. Your primary location powers your website's address block."
        action={
          canEdit && !showForm && locations.length > 0 ? (
            <ActionButton variant="primary" size="sm" onClick={() => setShowForm(true)}>
              + Add location
            </ActionButton>
          ) : undefined
        }
      >
        {showForm && (
          <form onSubmit={handleAdd} className="p-5 bg-gray-50 dark:bg-gray-900/30 rounded-lg space-y-4">
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1" htmlFor="name">Location Name <span className="text-rose-500">*</span></label>
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
            {error && <div className="text-sm text-rose-700 dark:text-rose-300">{error}</div>}
            <div className="flex items-center gap-2">
              <ActionButton variant="primary" type="submit">
                Save Location
              </ActionButton>
              <ActionButton variant="secondary" onClick={() => { setShowForm(false); setError(null) }}>
                Cancel
              </ActionButton>
            </div>
          </form>
        )}

        {locations.length === 0 ? (
          <EmptyState
            icon="📍"
            title="No locations yet"
            body="Add one to power your clinic website's address block."
            action={
              canEdit && !showForm ? (
                <ActionButton variant="primary" onClick={() => setShowForm(true)}>
                  + Add Location
                </ActionButton>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3 mt-1">
            {locations.map((loc) => (
              <div key={loc.id} className="v2-card p-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{loc.name}</span>
                    {loc.isPrimary === 1 && <StatusPill tone="special" label="Primary" />}
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
                  <div className="flex items-center gap-2">
                    {loc.isPrimary !== 1 && (
                      <ActionButton
                        variant="ghost"
                        size="sm"
                        onClick={() => startTransition(() => setPrimaryLocation(loc.id))}
                        disabled={pending}
                      >
                        Make Primary
                      </ActionButton>
                    )}
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      onClick={() => startTransition(() => deleteLocation(loc.id))}
                      disabled={pending}
                      className="text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400"
                    >
                      Remove
                    </ActionButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  )
}
