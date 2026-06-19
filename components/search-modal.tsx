'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { globalSearchAction } from '@/app/(default)/search/actions'
import { createFollowupAction } from '@/app/(default)/patients/actions'
import { addDaysYmd, todayYmd, MAX_FOLLOWUP_TITLE_LEN } from '@/lib/types/followups'
import type { SearchGroup, SearchResult, SearchResultKind } from '@/lib/types/global-search'

/**
 * Global ⌘K command palette — replaces the Mosaic template's fake search
 * stub with real, org-scoped search across patients, visits, leads,
 * conversations, and every page. Empty query shows quick actions + nav;
 * typing searches everything. Full keyboard support: ↑↓ to move, Enter to
 * go, Esc to close.
 */

interface SearchModalProps {
  isOpen: boolean
  setIsOpen: (value: boolean) => void
}

const KIND_GLYPHS: Record<SearchResultKind, React.ReactNode> = {
  patient: <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-2.7 0-5.5 1.4-5.5 4V15h11v-1.5c0-2.6-2.8-4-5.5-4Z" />,
  appointment: <path d="M5 1v2h6V1h2v2h1.5A1.5 1.5 0 0 1 16 4.5v9A1.5 1.5 0 0 1 14.5 15h-13A1.5 1.5 0 0 1 0 13.5v-9A1.5 1.5 0 0 1 1.5 3H3V1h2Zm9 6H2v6h12V7Z" />,
  lead: <path d="M14.6 1.4a1.4 1.4 0 0 0-1.5-.3L1.5 5.6a1.4 1.4 0 0 0 .1 2.6l4.5 1.5 1.5 4.5a1.4 1.4 0 0 0 2.6.1L14.9 2.9a1.4 1.4 0 0 0-.3-1.5Z" />,
  thread: <path d="M8 1a7 7 0 0 0-6 10.5L1 15l3.6-1A7 7 0 1 0 8 1Z" />,
  clinic: <path d="M8 1 1 5v10h5v-4h4v4h5V5L8 1Z" />,
  page: <path d="M9 1H3.5A1.5 1.5 0 0 0 2 2.5v11A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V6L9 1Zm0 5V2.5L12.5 6H9Z" />,
  action: <path d="M9.5 1 2 9h4.5L6 15l7.5-8H9l.5-6Z" />,
}

/** Pull the patient id + first name off a `kind: 'patient'` result so the
 *  palette can compose a follow-up against it (href is `/patients/{id}`). */
function patientFromResult(r: SearchResult): { patientId: string; firstName: string } | null {
  if (r.kind !== 'patient') return null
  const patientId = r.href.startsWith('/patients/') ? r.href.slice('/patients/'.length) : ''
  if (!patientId) return null
  return { patientId, firstName: r.label.split(' ')[0] || 'this patient' }
}

export default function SearchModal({ isOpen, setIsOpen }: SearchModalProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [pending, startTransition] = useTransition()
  // Composer sub-mode: when set, the palette body swaps to "new follow-up for
  // {patient}" instead of the results list. `flash` confirms the last add.
  const [composer, setComposer] = useState<{ patientId: string; firstName: string } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const requestSeq = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flat = useMemo(() => groups.flatMap((g) => g.results), [groups])

  const runSearch = useCallback((q: string) => {
    const seq = ++requestSeq.current
    startTransition(async () => {
      try {
        const res = await globalSearchAction(q)
        if (seq !== requestSeq.current) return
        setGroups(res)
        setActiveIdx(0)
      } catch {
        if (seq !== requestSeq.current) return
        setGroups([])
      }
    })
  }, [])

  // Load the launcher view (quick actions + pages) on open; debounce typing.
  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setComposer(null)
    setFlash(null)
    runSearch('')
  }, [isOpen, runSearch])

  const onQueryChange = (q: string) => {
    setQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(q), 180)
  }

  const go = useCallback(
    (href: string) => {
      setIsOpen(false)
      router.push(href)
    },
    [router, setIsOpen],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    // The composer owns its own inputs; don't run list nav underneath it.
    if (composer) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = flat[activeIdx]
      if (target) go(target.href)
    }
  }

  let runningIdx = -1

  return (
    <Transition appear show={isOpen}>
      <Dialog as="div" onClose={() => setIsOpen(false)}>
        <TransitionChild
          as="div"
          className="fixed inset-0 bg-[color:var(--color-ink-900)]/30 z-50 transition-opacity"
          enter="transition-opacity ease-[var(--ease-out)] duration-[var(--dur-base)]"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity ease-[var(--ease-out)] duration-[var(--dur-fast)]"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          aria-hidden="true"
        />
        <TransitionChild
          as="div"
          className="fixed inset-0 z-50 overflow-hidden flex items-start top-20 mb-4 justify-center px-4 sm:px-6"
          enter="transition ease-[var(--ease-out)] duration-[var(--dur-base)]"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-[var(--ease-out)] duration-[var(--dur-fast)]"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-4"
        >
          <DialogPanel className="bg-[color:var(--color-surface-2)] overflow-auto max-w-2xl w-full max-h-full rounded-[var(--r-lg)] shadow-[var(--shadow-modal)]">
            <div className="border-b border-gray-200 dark:border-gray-700/60">
              <div className="relative">
                <label htmlFor="search-modal" className="sr-only">
                  Search
                </label>
                <input
                  id="search-modal"
                  className="w-full dark:text-gray-300 bg-white dark:bg-gray-800 border-0 focus:ring-transparent placeholder-gray-400 dark:placeholder-gray-500 appearance-none py-3 pl-10 pr-16 disabled:opacity-50"
                  type="search"
                  placeholder="Search patients, visits, leads, pages…"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onKeyDown={onKeyDown}
                  autoComplete="off"
                  disabled={!!composer}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                />
                <div className="absolute inset-0 flex items-center justify-center right-auto pointer-events-none">
                  <svg className="shrink-0 fill-current text-gray-400 dark:text-gray-500 ml-4 mr-2" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 14c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7zM7 2C4.243 2 2 4.243 2 7s2.243 5 5 5 5-2.243 5-5-2.243-5-5-5z" />
                    <path d="M15.707 14.293L13.314 11.9a8.019 8.019 0 01-1.414 1.414l2.393 2.393a.997.997 0 001.414 0 .999.999 0 000-1.414z" />
                  </svg>
                </div>
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 dark:border-gray-700 dark:text-gray-500">
                  esc
                </kbd>
              </div>
            </div>

            <div className="px-2 py-4">
              {flash && !composer && (
                <div className="mx-1 mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
                  ✓ {flash}
                </div>
              )}
              {composer ? (
                <FollowupComposer
                  patientId={composer.patientId}
                  firstName={composer.firstName}
                  onCancel={() => setComposer(null)}
                  onDone={(msg) => { setComposer(null); setFlash(msg) }}
                />
              ) : groups.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  {pending
                    ? 'Searching…'
                    : query.trim().length >= 2
                      ? 'Nothing matched — try a name, email, or phone number.'
                      : 'Type to search across your whole practice.'}
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.label} className="mb-3 last:mb-0">
                    <div className="mb-2 px-2 text-xs font-semibold uppercase text-gray-400 dark:text-gray-500">
                      {group.label}
                    </div>
                    <ul className="text-sm">
                      {group.results.map((r) => {
                        runningIdx += 1
                        const idx = runningIdx
                        const active = idx === activeIdx
                        const patientTarget = patientFromResult(r)
                        return (
                          <li key={r.id} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => go(r.href)}
                              onMouseEnter={() => setActiveIdx(idx)}
                              className={`flex flex-1 min-w-0 items-center rounded-lg p-2 text-left text-gray-800 dark:text-gray-100 ${
                                active ? 'bg-gray-100 dark:bg-gray-700/30' : ''
                              }`}
                            >
                              <svg
                                className={`mr-3 shrink-0 fill-current ${active ? 'text-violet-500' : 'text-gray-400 dark:text-gray-500'}`}
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                aria-hidden="true"
                              >
                                {KIND_GLYPHS[r.kind]}
                              </svg>
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-medium">{r.label}</span>
                                {r.sublabel && (
                                  <span className="text-gray-500 dark:text-gray-400"> — {r.sublabel}</span>
                                )}
                              </span>
                              {active && (
                                <kbd className="ml-2 shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 dark:border-gray-600 dark:text-gray-500">
                                  ↵
                                </kbd>
                              )}
                            </button>
                            {patientTarget && (
                              <button
                                type="button"
                                onClick={() => { setFlash(null); setComposer(patientTarget) }}
                                title={`Add a follow-up for ${patientTarget.firstName}`}
                                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-500/10 dark:text-teal-400"
                              >
                                ＋ Follow-up
                              </button>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  )
}

/**
 * The palette's "new follow-up for {patient}" sub-mode — reached by the
 * ＋ Follow-up affordance on a patient result. Reuses createFollowupAction so
 * the new item flows into My Day / the digest / the board / the timeline like
 * any other. Returns to the results list (with a flash) on success.
 */
function FollowupComposer({
  patientId,
  firstName,
  onCancel,
  onDone,
}: {
  patientId: string
  firstName: string
  onCancel: () => void
  onDone: (msg: string) => void
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(addDaysYmd(todayYmd(), 3))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!title.trim()) { setError('Add a short reminder.'); return }
    setError(null)
    startTransition(async () => {
      const res = await createFollowupAction({ patientId, title, dueDate: dueDate || null })
      if (res.ok) {
        // Keep the sidebar "Follow-ups due" badge honest if this one is due now.
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nav-badges:refresh'))
        onDone(`Follow-up added for ${firstName}`)
      } else setError(res.error)
    })
  }

  return (
    <div className="px-1 py-1">
      <button
        type="button"
        onClick={onCancel}
        className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        ← Back to results
      </button>
      <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
        Add a follow-up for {firstName}
      </h3>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, MAX_FOLLOWUP_TITLE_LEN))}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder={`e.g. Call ${firstName} about the crown estimate`}
        className="form-input w-full text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="form-input flex-1 text-sm"
          aria-label="Due date"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="shrink-0 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add follow-up'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  )
}
