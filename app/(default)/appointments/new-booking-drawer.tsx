'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import BookFromPatientDrawer from './book-from-patient-drawer'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { listPatientOptionsAction } from './actions'

/**
 * "+ New booking" entry point on /appointments.
 *
 * The full booking form (BookFromPatientDrawer) needs a patient, so this
 * drawer runs in two stages: pick the patient (search over the org's active
 * patients), then hand off to the existing booking drawer unchanged. Staff
 * who can't find the patient jump to /patients?new=1 to add them first —
 * booking always hangs off a real patient record (no free-text bookings
 * that orphan the relationship history).
 */
export default function NewBookingDrawer({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<Array<{ id: string; name: string }> | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Active only on the picker stage; once `picked`, BookFromPatientDrawer (its
  // own trap) takes over and this returns early (ref is null → no-op).
  useFocusTrap(true, dialogRef, {}) // keeps the component's own Escape handler

  useEffect(() => {
    let alive = true
    listPatientOptionsAction()
      .then((rows) => {
        if (alive) setOptions(rows)
      })
      .catch(() => {
        if (alive) setError('Could not load your patient list — refresh and try again.')
      })
    return () => {
      alive = false
    }
  }, [])

  // Esc closes the picker (parity with the shared Drawer primitive).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    if (!options) return []
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 30)
    return options.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 30)
  }, [options, query])

  if (picked) {
    return <BookFromPatientDrawer patientId={picked.id} patientName={picked.name} onClose={onClose} />
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="New booking — pick a patient"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px] px-2 sm:px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="section-enter bg-[color:var(--color-surface-2)] rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md max-h-[85vh] flex flex-col"
      >
        <div className="px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">New booking</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Who is the visit for?</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
            className="p-1.5 rounded-[var(--r-sm)] text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 pb-3">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patients by name…"
            aria-label="Search patients"
            className="form-input w-full"
          />
        </div>
        <div className="px-2 pb-2 overflow-y-auto grow" role="listbox" aria-label="Matching patients">
          {error ? (
            <p className="px-3 py-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : options === null ? (
            <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">Loading patients…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
              {query.trim() ? `No patients match “${query.trim()}”.` : 'No active patients yet.'}
            </p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => setPicked(o)}
                className="w-full text-left px-3 py-2 rounded-[var(--r-sm)] text-sm text-gray-700 dark:text-gray-200 hover:bg-teal-500/10"
              >
                {o.name}
              </button>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t border-[color:var(--color-hairline)] flex items-center justify-between">
          <Link
            href="/patients?new=1"
            className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
          >
            + Add a new patient first
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
