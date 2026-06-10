'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import {
  AGENCY_PROJECT_TYPES,
  AGENCY_PROJECT_TYPE_LABELS,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'
import { createPipelineProject } from './pipeline-actions'
import { ActionButton } from '@/components/ui/action-button'

interface Props {
  clinics: { id: string; name: string }[]
}

export default function NewProjectModal({ clinics }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<AgencyProjectType>('website')
  const [organizationId, setOrganizationId] = useState<string>('')
  const [budget, setBudget] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setTitle('')
    setType('website')
    setOrganizationId('')
    setBudget('')
    setDueDate('')
    setDescription('')
    setError(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await createPipelineProject({
          title,
          type,
          organizationId: organizationId || null,
          budgetDollars: budget ? Number(budget) : null,
          dueDateIso: dueDate || null,
          description: description || null,
        })
        setOpen(false)
        reset()
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <>
      <ActionButton variant="primary" onClick={() => setOpen(true)}>
        + New project
      </ActionButton>
      <Transition show={open} as={Fragment}>
        <Dialog onClose={() => setOpen(false)} className="relative z-50">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/60" />
          </TransitionChild>
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">New project</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Track a new engagement with one of your clinics or a prospect.
                  </p>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Title <span className="text-rose-500">*</span>
                      </label>
                      <input
                        className="form-input w-full"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Smile Spa — site refresh"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Type</label>
                        <select
                          className="form-select w-full"
                          value={type}
                          onChange={(e) => setType(e.target.value as AgencyProjectType)}
                        >
                          {AGENCY_PROJECT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {AGENCY_PROJECT_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Clinic</label>
                        <select
                          className="form-select w-full"
                          value={organizationId}
                          onChange={(e) => setOrganizationId(e.target.value)}
                        >
                          <option value="">— Unassigned —</option>
                          {clinics.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Budget ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="form-input w-full"
                          value={budget}
                          onChange={(e) => setBudget(e.target.value)}
                          placeholder="2500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Due date</label>
                        <input
                          type="date"
                          className="form-input w-full"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Notes</label>
                      <textarea
                        className="form-textarea w-full"
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Scope, deliverables, anything to remember…"
                      />
                    </div>
                    {error && (
                      <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded">
                        {error}
                      </div>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-2">
                    <ActionButton
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setOpen(false)
                        reset()
                      }}
                    >
                      Cancel
                    </ActionButton>
                    <ActionButton variant="primary" size="sm" type="submit" disabled={pending || !title}>
                      {pending ? 'Creating…' : 'Create project'}
                    </ActionButton>
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
