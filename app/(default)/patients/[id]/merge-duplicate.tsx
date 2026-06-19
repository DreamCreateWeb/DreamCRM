'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { mergePatientsAction } from '../actions'

type Candidate = { id: string; name: string; email: string | null; phone: string | null; reason: string }
type Option = { id: string; name: string }

/**
 * Merge a duplicate patient into this record (the survivor). Suggests likely
 * dupes (same email/phone) and lets you pick any other patient. The current
 * patient is always the survivor — the picked record is folded in + archived.
 * Owner/admin only (the caller gates rendering).
 */
export default function MergeDuplicate({
  survivorId,
  survivorName,
  candidates,
  allPatients,
}: {
  survivorId: string
  survivorName: string
  candidates: Candidate[]
  allPatients: Option[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Option | null>(null)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const others = useMemo(() => allPatients.filter((p) => p.id !== survivorId), [allPatients, survivorId])
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return others.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6)
  }, [others, search])

  function doMerge(dupId: string) {
    startTransition(async () => {
      const res = await mergePatientsAction(survivorId, dupId)
      if (res.ok) {
        setOpen(false)
        setPicked(null)
        setToast('Merged. Their history now lives on this record.')
        router.refresh()
      } else {
        setToast(res.error)
      }
    })
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        Merge a duplicate into this record
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !pending && setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Merge a duplicate</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Pick the duplicate record. Its appointments, messages, documents, tags, follow-ups, and history move onto{' '}
              <span className="font-medium text-gray-700 dark:text-gray-200">{survivorName}</span>, and the duplicate is archived. This can&apos;t be undone.
            </p>

            {picked ? (
              <div className="mt-4 rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 p-3">
                <p className="text-sm text-gray-800 dark:text-gray-100">
                  Merge <span className="font-semibold">{picked.name}</span> into <span className="font-semibold">{survivorName}</span>?
                </p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <ActionButton variant="ghost" size="sm" onClick={() => setPicked(null)} disabled={pending}>Back</ActionButton>
                  <ActionButton variant="danger" size="sm" onClick={() => doMerge(picked.id)} disabled={pending}>
                    {pending ? 'Merging…' : 'Merge + archive'}
                  </ActionButton>
                </div>
              </div>
            ) : (
              <>
                {candidates.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Likely duplicates</p>
                    <ul className="space-y-1">
                      {candidates.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setPicked({ id: c.id, name: c.name })}
                            className="w-full flex items-center justify-between rounded-lg border border-[color:var(--color-hairline)] px-3 py-2 text-left hover:border-teal-400"
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{c.name}</span>
                              <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{c.email ?? c.phone ?? ''}</span>
                            </span>
                            <span className="shrink-0 text-[11px] text-amber-700 dark:text-amber-300">{c.reason}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Or find another</p>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search patients by name…"
                    className="form-input w-full text-sm"
                  />
                  {matches.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {matches.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setPicked(m)}
                            className="w-full text-left text-sm px-3 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700/40 text-gray-700 dark:text-gray-200"
                          >
                            {m.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <ActionButton variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</ActionButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
