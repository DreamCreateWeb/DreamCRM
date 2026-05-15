'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { postThread } from '../actions'

export default function NewThreadModal({ trigger = 'block' }: { trigger?: 'block' | 'inline' }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('general')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await postThread({ title, body, category })
        setOpen(false)
        setTitle('')
        setBody('')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  const triggerCls =
    trigger === 'inline'
      ? 'btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800'
      : 'btn md:w-full bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerCls}>
        Create Post
      </button>
      <Transition show={open} as={Fragment}>
        <Dialog onClose={() => setOpen(false)} className="relative z-50">
          <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-gray-900/60" />
          </TransitionChild>
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">Start a thread</h2>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Title <span className="text-red-500">*</span></label>
                      <input className="form-input w-full" required value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Category</label>
                      <select className="form-select w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
                        {['general', 'questions', 'announcements', 'feedback', 'showcase'].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Body <span className="text-red-500">*</span></label>
                      <textarea className="form-textarea w-full" rows={6} required value={body} onChange={(e) => setBody(e.target.value)} />
                    </div>
                    {error && (
                      <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{error}</div>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end space-x-2">
                    <button type="button" onClick={() => setOpen(false)} className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300">Cancel</button>
                    <button type="submit" disabled={pending} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60">
                      {pending ? 'Posting…' : 'Post'}
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
