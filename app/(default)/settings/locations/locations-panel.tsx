'use client'

import { useState, useTransition } from 'react'
import { addLocation, deleteLocation, setPrimaryLocation, updateLocation } from './actions'
import type { ClinicLocation } from '@/lib/db/schema/platform'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { SettingsSection } from '../settings-kit'

interface Props {
  locations: ClinicLocation[]
  canEdit: boolean
}

/** A phone "looks wrong" if, once you strip formatting, it has fewer than 10 or
 *  more than 15 digits (E.164 max). We WARN, never block — international / vanity
 *  numbers are real; the field is optional. */
function phoneLooksOff(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 0 && (digits.length < 10 || digits.length > 15)
}

/** Pretty-print a plain 10-digit US number as (512) 555-0134; anything else
 *  (already-formatted, +1 prefixed, international) is shown verbatim. */
function displayPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1'))
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return raw
}

export default function LocationsPanel({ locations, canEdit }: Props) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="p-6">
      <SettingsSection
        title="Practice locations"
        description="Most clinics have one — multi-location practices can add more. Your primary location powers the address block, map, and “open today” note on your public website."
        action={
          canEdit && !adding && locations.length > 0 ? (
            <ActionButton variant="primary" size="sm" onClick={() => { setAdding(true); setEditingId(null) }}>
              + Add location
            </ActionButton>
          ) : undefined
        }
      >
        {adding && (
          <LocationForm
            mode="add"
            isFirst={locations.length === 0}
            onClose={() => setAdding(false)}
          />
        )}

        {locations.length === 0 && !adding ? (
          <EmptyState
            icon="📍"
            title="No locations yet"
            body="Add one to power your clinic website's address block."
            action={
              canEdit ? (
                <ActionButton variant="primary" onClick={() => setAdding(true)}>
                  + Add location
                </ActionButton>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3 mt-1">
            {locations.map((loc) =>
              editingId === loc.id ? (
                <LocationForm
                  key={loc.id}
                  mode="edit"
                  location={loc}
                  isFirst={false}
                  onClose={() => setEditingId(null)}
                />
              ) : (
                <LocationCard
                  key={loc.id}
                  location={loc}
                  canEdit={canEdit}
                  onEdit={() => { setEditingId(loc.id); setAdding(false) }}
                />
              ),
            )}
          </div>
        )}
      </SettingsSection>
    </div>
  )
}

// ───────────────────────── One location, read-only ─────────────────────────

function LocationCard({
  location: loc,
  canEdit,
  onEdit,
}: {
  location: ClinicLocation
  canEdit: boolean
  onEdit: () => void
}) {
  const confirm = useConfirm()
  const [pending, start] = useTransition()

  const streetLine = [loc.addressLine1, loc.addressLine2].filter(Boolean).join(', ')
  const cityLine = [
    loc.city,
    [loc.state, loc.postalCode].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')

  async function handleDelete() {
    if (!(await confirm({
      title: `Remove ${loc.name}?`,
      message: "This can't be undone.",
      confirmLabel: 'Remove',
      danger: true,
    }))) return
    start(() => deleteLocation(loc.id))
  }

  return (
    <div className="v2-card p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-gray-800 dark:text-gray-100">{loc.name}</span>
          {loc.isPrimary === 1 && <StatusPill tone="special" label="Primary" />}
        </div>
        {/* Street on its own line, then city/state/zip — no comma-cram. */}
        <address className="not-italic text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          {streetLine ? (
            <div>{streetLine}</div>
          ) : (
            <div className="italic">No address</div>
          )}
          {cityLine && <div>{cityLine}</div>}
        </address>
        {loc.phone && (
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono-num tabular-nums">
            {displayPhone(loc.phone)}
          </div>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-2 shrink-0">
          {loc.isPrimary !== 1 && (
            <ActionButton
              variant="ghost"
              size="sm"
              onClick={() => start(() => setPrimaryLocation(loc.id))}
              disabled={pending}
            >
              Make primary
            </ActionButton>
          )}
          <ActionButton variant="secondary" size="sm" onClick={onEdit} disabled={pending}>
            Edit
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={pending}
            className="text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400"
          >
            Remove
          </ActionButton>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Add / edit form (shared) ─────────────────────────

function LocationForm({
  mode,
  location,
  isFirst,
  onClose,
}: {
  mode: 'add' | 'edit'
  location?: ClinicLocation
  /** True only for the very first location — it's forced primary (see copy). */
  isFirst: boolean
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState(location?.phone ?? '')
  const [pending, start] = useTransition()

  const isPrimary = location?.isPrimary === 1
  // The first location is always primary (there's nothing to demote it below),
  // and you can't un-primary the current primary from here — pick a different
  // one to switch. Both cases render a locked, checked box with an explainer.
  const primaryLocked = isFirst || isPrimary

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      try {
        if (mode === 'edit' && location) await updateLocation(location.id, fd)
        else await addLocation(fd)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save location')
      }
    })
  }

  const phoneOff = phoneLooksOff(phone)

  return (
    <form
      onSubmit={handleSubmit}
      className="v2-well p-5 rounded-[var(--r-md)] space-y-4 mb-3"
    >
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1" htmlFor="loc-name">
            Location name <span className="text-rose-500">*</span>
          </label>
          <input
            id="loc-name"
            name="name"
            type="text"
            required
            defaultValue={location?.name ?? ''}
            className="form-input w-full"
            placeholder="e.g. Main Office, Downtown"
          />
        </div>
        <div className="sm:w-56">
          <label className="block text-sm font-medium mb-1" htmlFor="loc-phone">Phone</label>
          <input
            id="loc-phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`form-input w-full ${phoneOff ? 'border-amber-400 dark:border-amber-500/60' : ''}`}
            placeholder="(512) 555-0134"
            aria-describedby={phoneOff ? 'loc-phone-warn' : undefined}
          />
          {phoneOff && (
            <p id="loc-phone-warn" className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              That doesn’t look like a full phone number — you can still save it.
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="loc-address1">Street address</label>
        <input id="loc-address1" name="addressLine1" type="text" defaultValue={location?.addressLine1 ?? ''} className="form-input w-full" placeholder="123 Main St" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="loc-address2">Suite / unit</label>
        <input id="loc-address2" name="addressLine2" type="text" defaultValue={location?.addressLine2 ?? ''} className="form-input w-full" placeholder="Suite 200" />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1" htmlFor="loc-city">City</label>
          <input id="loc-city" name="city" type="text" defaultValue={location?.city ?? ''} className="form-input w-full" />
        </div>
        <div className="sm:w-24">
          <label className="block text-sm font-medium mb-1" htmlFor="loc-state">State</label>
          <input id="loc-state" name="state" type="text" defaultValue={location?.state ?? ''} className="form-input w-full" placeholder="TX" maxLength={20} />
        </div>
        <div className="sm:w-36">
          <label className="block text-sm font-medium mb-1" htmlFor="loc-postal">ZIP / postal</label>
          <input id="loc-postal" name="postalCode" type="text" defaultValue={location?.postalCode ?? ''} className="form-input w-full" inputMode="numeric" />
        </div>
      </div>

      <div className="rounded-[var(--r-sm)] bg-gray-50 dark:bg-gray-900/30 px-3 py-2.5">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="isPrimary"
            className="form-checkbox mt-0.5"
            defaultChecked={primaryLocked}
            disabled={primaryLocked}
          />
          <span>
            <span className="font-medium text-gray-800 dark:text-gray-100">Primary location</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
              {isFirst
                ? 'Your first location is automatically your primary — it’s the address, map, and hours your public website shows. Add more later and you can switch which one is primary.'
                : isPrimary
                  ? 'This is your primary location — the one your public website shows. To switch, make a different location primary.'
                  : 'Make this the address, map, and hours shown on your public website. It replaces whichever location is primary now.'}
            </span>
          </span>
        </label>
      </div>

      {error && <div className="text-sm text-rose-700 dark:text-rose-300">{error}</div>}

      <div className="flex items-center gap-2">
        <ActionButton variant="primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save location'}
        </ActionButton>
        <ActionButton variant="secondary" onClick={() => { onClose(); setError(null) }} disabled={pending}>
          Cancel
        </ActionButton>
      </div>
    </form>
  )
}
