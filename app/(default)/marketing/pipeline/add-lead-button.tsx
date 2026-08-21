'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PipelineStage } from '@/lib/marketing/terminology'
import { createLeadAction } from '../actions'
import { ActionButton } from '@/components/ui/action-button'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { useToast } from '@/components/ui/toast'

interface Props {
  stages: PipelineStage[]
  sources: string[]
}

export default function AddLeadButton({ stages, sources }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, panelRef, { onEscape: () => { if (!pending) setOpen(false) } })
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
        toast('Lead added.')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add the lead. Try again.")
      }
    })
  }

  return (
    <>
      <ActionButton variant="primary" breath onClick={() => setOpen(true)}>
        + Add {stages[0]?.label === 'New' ? 'lead' : 'contact'}
      </ActionButton>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-lead-title"
            className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <h2 id="add-lead-title" className="text-base font-semibold text-gray-800 dark:text-gray-100">
                Add lead
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-xs)] text-gray-400 hover:bg-[color:var(--color-surface-sunk)] hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close (Esc)"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="form-input w-full"
                  placeholder="Jane Smith"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="form-input w-full"
                  placeholder="jane@example.com"
                />
              </Field>
              <Field label="Phone (optional)">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="form-input w-full"
                  placeholder="+1 555 123 4567"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stage">
                  <select
                    value={form.pipelineStage}
                    onChange={(e) => setForm((f) => ({ ...f, pipelineStage: e.target.value }))}
                    className="form-select w-full"
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
                    className="form-select w-full"
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
                  className="form-textarea w-full resize-none"
                  placeholder="Anything to remember about this lead…"
                />
              </Field>
              {error && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {error}
                </p>
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
                pending={pending}
                disabled={pending || !form.name.trim() || !form.email.trim()}
              >
                Add
              </ActionButton>
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
      <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
