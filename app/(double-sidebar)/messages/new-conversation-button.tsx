'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { newConversation } from './actions'

export default function NewConversationButton({ users }: { users: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggleUser(id: string) {
    setParticipantIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const convo = await newConversation({ title: title || null, participantIds })
        setOpen(false)
        setTitle('')
        setParticipantIds([])
        router.push(`/messages?c=${convo.id}`)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-violet-500 hover:text-violet-600"
        aria-label="New conversation"
        title="New conversation"
      >
        <svg className="fill-current" width="20" height="20" viewBox="0 0 16 16">
          <path d="M15 7H9V1c0-.6-.4-1-1-1S7 .4 7 1v6H1c-.6 0-1 .4-1 1s.4 1 1 1h6v6c0 .6.4 1 1 1s1-.4 1-1V9h6c.6 0 1-.4 1-1s-.4-1-1-1z" />
        </svg>
      </button>
      <Transition show={open} as={Fragment}>
        <Dialog onClose={() => setOpen(false)} className="relative z-50">
          <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-gray-900/60" />
          </TransitionChild>
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">New conversation</h2>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Title (optional)</label>
                      <input className="form-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Members</label>
                      <div className="max-h-48 overflow-y-auto rounded border border-gray-200 dark:border-gray-700/60">
                        {users.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">No other members yet.</div>
                        ) : (
                          users.map((u) => (
                            <label key={u.id} className="flex items-center px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                              <input
                                type="checkbox"
                                className="form-checkbox"
                                checked={participantIds.includes(u.id)}
                                onChange={() => toggleUser(u.id)}
                              />
                              <span className="ml-2 text-sm">{u.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                    {error && (
                      <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{error}</div>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end space-x-2">
                    <button type="button" onClick={() => setOpen(false)} className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300">Cancel</button>
                    <button type="submit" disabled={pending || participantIds.length === 0} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60">
                      {pending ? 'Creating…' : 'Start'}
                    </button>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
