'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { addJob } from './actions'
import { JOB_TYPES } from '@/lib/types/jobs'

export default function PostJobModal() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [type, setType] = useState<(typeof JOB_TYPES)[number]>('full-time')
  const [remote, setRemote] = useState(false)
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await addJob({
          title,
          companyName,
          description: description || null,
          location: location || null,
          type,
          remote,
          salaryMinCents: salaryMin ? Math.round(parseFloat(salaryMin) * 100) : null,
          salaryMaxCents: salaryMax ? Math.round(parseFloat(salaryMax) * 100) : null,
        })
        setOpen(false)
        setTitle('')
        setDescription('')
        setLocation('')
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
        className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
      >
        Post A Job
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
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">Post a Job</h2>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-4">
                    <div className="flex space-x-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Job title <span className="text-red-500">*</span></label>
                        <input className="form-input w-full" required value={title} onChange={(e) => setTitle(e.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Company <span className="text-red-500">*</span></label>
                        <input className="form-input w-full" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Description</label>
                      <textarea className="form-textarea w-full" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="flex space-x-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Location</label>
                        <input className="form-input w-full" value={location} onChange={(e) => setLocation(e.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Type</label>
                        <select className="form-select w-full" value={type} onChange={(e) => setType(e.target.value as any)}>
                          {JOB_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex space-x-3">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Salary min ($/yr)</label>
                        <input type="number" min="0" className="form-input w-full" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">Salary max ($/yr)</label>
                        <input type="number" min="0" className="form-input w-full" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
                      </div>
                    </div>
                    <label className="flex items-center">
                      <input type="checkbox" className="form-checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
                      <span className="ml-2 text-sm">Remote-friendly</span>
                    </label>
                    {error && (
                      <div className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded">{error}</div>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end space-x-2">
                    <button type="button" onClick={() => setOpen(false)} className="btn-sm border-gray-200 dark:border-gray-700/60 text-gray-800 dark:text-gray-300">Cancel</button>
                    <button type="submit" disabled={pending} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 disabled:opacity-60">
                      {pending ? 'Posting…' : 'Post Job'}
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
