'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import BookFromPatientDrawer from './book-from-patient-drawer'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { patientOptionByIdAction, searchPatientOptionsAction } from './actions'
import type { PatientOption } from '@/lib/services/patients'

/** Keystrokes settle for this long before a search round-trip. */
const SEARCH_DEBOUNCE_MS = 200

/**
 * "+ New booking" entry point on /appointments.
 *
 * The full booking form (BookFromPatientDrawer) needs a patient, so this
 * drawer runs in two stages: pick the patient (a SERVER search over the org's
 * active patients — name, email or phone digits, most recently active first),
 * then hand off to the existing booking drawer unchanged. Staff who can't
 * find the patient jump to /patients?new=1 to add them first — booking always
 * hangs off a real patient record (no free-text bookings that orphan the
 * relationship history).
 *
 * The first cut loaded the first 500 patients by FIRST NAME and filtered that
 * array in the browser: a PMS-connected office could not book anyone whose
 * name sorted past the cap, and nobody could search by phone.
 */
export default function NewBookingDrawer({
  onClose,
  initialPatientId = null,
}: {
  onClose: () => void
  /** A patient already chosen by the caller (`/appointments?new=1&patient=<id>`,
   *  the inbox's patient card): the picker is skipped once an org-scoped read
   *  confirms the id belongs to this clinic. An unknown id leaves the picker up. */
  initialPatientId?: string | null
}) {
  const [options, setOptions] = useState<PatientOption[] | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Only the LATEST search may land: a slow "ma" answer arriving after the
  // fast "mar" one would put the wrong list under the cursor.
  const searchSeq = useRef(0)
  // Active only on the picker stage; once `picked`, BookFromPatientDrawer (its
  // own trap) takes over and this returns early (ref is null → no-op).
  useFocusTrap(true, dialogRef, {}) // keeps the component's own Escape handler

  useEffect(() => {
    const seq = ++searchSeq.current
    // The empty query (mount) searches at once — recent patients fill the
    // list before the first keystroke; typing waits for the keys to settle.
    const delay = query.trim() ? SEARCH_DEBOUNCE_MS : 0
    const t = setTimeout(() => {
      // Never bare-await a server action in a client component: a redeploy
      // under this tab makes Next THROW, and the list would sit on "Loading"
      // forever. Promise chain + catch, exactly like the composer's sends.
      searchPatientOptionsAction(query)
        .then((rows) => {
          if (searchSeq.current !== seq) return
          setError(null)
          setOptions(rows)
        })
        .catch(() => {
          if (searchSeq.current !== seq) return
          setError('Could not search your patients — refresh and try again.')
        })
    }, delay)
    return () => clearTimeout(t)
  }, [query])

  // A caller that already chose the patient skips the picker — after an
  // org-scoped read says the id is ours. Promise chain + catch for the same
  // redeploy reason as the search; a miss or a failure keeps the picker up.
  useEffect(() => {
    if (!initialPatientId) return
    let alive = true
    patientOptionByIdAction(initialPatientId)
      .then((match) => {
        if (alive && match) setPicked(match)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [initialPatientId])

  // Esc closes the picker (parity with the shared Drawer primitive).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = options ?? []

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
            className="p-1.5 rounded-[var(--r-sm)] text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
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
            placeholder="Type a name or phone…"
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
            <>
              {!query.trim() && (
                <p className="px-3 pt-1 pb-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Recently active — type a name or phone to find anyone else.
                </p>
              )}
              {filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => setPicked({ id: o.id, name: o.name })}
                  className="w-full text-left px-3 py-2 rounded-[var(--r-sm)] text-sm text-gray-700 dark:text-gray-200 hover:bg-teal-500/10 flex items-baseline justify-between gap-3"
                >
                  <span className="truncate">{o.name}</span>
                  {o.hint && (
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400 font-mono-num tabular-nums">{o.hint}</span>
                  )}
                </button>
              ))}
            </>
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
