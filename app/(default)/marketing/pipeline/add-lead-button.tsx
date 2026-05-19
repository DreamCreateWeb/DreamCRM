'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PipelineStage } from '@/lib/marketing/terminology'
import { createLeadAction } from '../actions'

interface Props {
  stages: PipelineStage[]
  sources: string[]
}

export default function AddLeadButton({ stages, sources }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
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
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900"
      >
        + Add {stages[0]?.label === 'New' ? 'Lead' : 'Contact'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-stone-900/40 dark:bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-4">
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
                <p className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={pending || !form.name.trim() || !form.email.trim()}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 disabled:opacity-50"
              >
                {pending ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
