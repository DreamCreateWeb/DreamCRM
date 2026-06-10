'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PipelineStage } from '@/lib/marketing/terminology'
import { createLeadAction } from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'

interface Props {
  stages: PipelineStage[]
  sources: string[]
}

export default function AddLeadButton({ stages, sources }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    pipelineStage: stages[0]?.key ?? 'new',
    leadSource: sources[0] ?? '',
    notes: '',
  })

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        await createLeadAction({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          pipelineStage: form.pipelineStage,
          leadSource: form.leadSource || null,
          notes: form.notes.trim() || null,
        })
        setForm({
          name: '',
          email: '',
          phone: '',
          pipelineStage: stages[0]?.key ?? 'new',
          leadSource: sources[0] ?? '',
          notes: '',
        })
        setOpen(false)
        setToast('Lead added.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create')
      }
    })
  }

  return (
    <>
      <ActionButton variant="primary" onClick={() => setOpen(true)}>
        + Add {stages[0]?.label === 'New' ? 'lead' : 'contact'}
      </ActionButton>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-gray-900/40 dark:bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Add lead
            </h2>
            <div className="space-y-3">
              <Field label="Name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600"
                  placeholder="Jane Smith"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600"
                  placeholder="jane@example.com"
                />
              </Field>
              <Field label="Phone (optional)">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600"
                  placeholder="+1 555 123 4567"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stage">
                  <select
                    value={form.pipelineStage}
                    onChange={(e) => setForm((f) => ({ ...f, pipelineStage: e.target.value }))}
                    className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  >
                    {stages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Source">
                  <select
                    value={form.leadSource}
                    onChange={(e) => setForm((f) => ({ ...f, leadSource: e.target.value }))}
                    className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  >
                    {sources.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Notes (optional)">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 resize-none"
                  placeholder="Anything to remember about this lead…"
                />
              </Field>
              {error && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <ActionButton variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </ActionButton>
              <ActionButton
                variant="primary"
                size="sm"
                onClick={submit}
                disabled={pending || !form.name.trim() || !form.email.trim()}
              >
                {pending ? 'Saving…' : 'Add'}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
