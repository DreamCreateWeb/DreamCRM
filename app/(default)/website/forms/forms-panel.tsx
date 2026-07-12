'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LeadFormField, LeadFormKey } from '@/lib/types/lead-forms'
import LeadFormBuilder from '../editor/lead-form-builder'
import { saveLeadForm, type SectionResult } from '../editor/website-actions'
import { saveChatWidgetAction } from '../../settings/practice/actions'
import { StatusPill } from '@/components/ui/status-pill'
import { Toggle } from '@/components/ui/toggle'
import type { Tone } from '@/lib/ui/encodings'

// Same status→tone/label encoding the Leads list uses (leads-view.tsx).
const STATUS_TONE: Record<string, Tone> = {
  new: 'special',
  contacted: 'info',
  converted: 'ok',
  archived: 'neutral',
}
const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  archived: 'Archived',
}

/**
 * The Forms panel — each site form as its own card (the SAME builder + saver
 * the editor's modal uses), the "Message us" bubble toggle (renders on every
 * public page, so it lives with the site's other intake points now), and an
 * honest submissions glance.
 */

interface FormCard {
  key: LeadFormKey
  label: string
  fields: LeadFormField[]
  customized: boolean
}

interface RecentLead {
  id: string
  name: string
  status: string
  ageHours: number
  sourcePage: string | null
}

export default function FormsPanel({
  forms,
  chatEnabled,
  recent,
  count7d,
}: {
  forms: FormCard[]
  chatEnabled: boolean
  recent: RecentLead[]
  count7d: number
}) {
  return (
    <div className="space-y-6">
      {forms.map((f) => (
        <FormBuilderCard key={f.key} form={f} />
      ))}
      <ChatWidgetCard initialEnabled={chatEnabled} />

      {/* ── Where submissions land ─────────────────────────────────────────── */}
      <section className="v2-card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Submissions</h2>
          <span className="text-xs tabular-nums font-mono-num text-gray-500 dark:text-gray-400">
            {count7d} in the last 7 days
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Every form submission lands in Leads, where you can reply, track, and convert to a patient.
        </p>
        {recent.length > 0 ? (
          <ul className="divide-y divide-[color:var(--color-hairline)]">
            {recent.map((l) => (
              <li key={l.id} className="py-2 flex items-center justify-between gap-3">
                <span className="text-sm text-gray-800 dark:text-gray-100 truncate">{l.name}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    {l.ageHours < 24 ? `${l.ageHours}h ago` : `${Math.round(l.ageHours / 24)}d ago`}
                  </span>
                  <StatusPill
                    tone={STATUS_TONE[l.status] ?? 'neutral'}
                    label={STATUS_LABEL[l.status] ?? l.status}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No submissions yet — they’ll appear here the moment someone reaches out.
          </p>
        )}
        <Link
          href="/leads"
          className="mt-3 inline-block text-xs font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
        >
          All leads →
        </Link>
      </section>

      {/* ── Booking lives with practice ops ────────────────────────────────── */}
      <section className="v2-well p-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Online booking, visit types, and providers live with your practice settings —{' '}
          <Link
            href="/settings/practice?tab=booking"
            className="font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
          >
            open Practice settings →
          </Link>
        </p>
      </section>
    </div>
  )
}

function FormBuilderCard({ form }: { form: FormCard }) {
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const res: SectionResult = await saveLeadForm(fd)
      if (res.ok) {
        setDirty(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <section className="v2-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{form.label}</h2>
        <StatusPill
          tone={form.customized ? 'ok' : 'neutral'}
          label={form.customized ? 'Customized' : 'Using the standard fields'}
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        {form.key === 'contact'
          ? 'The contact / consultation-request form on your site.'
          : 'The insurance coverage-check form — carriers come from your Content page.'}
      </p>
      <form onSubmit={onSubmit} onChange={() => setDirty(true)} onInput={() => setDirty(true)} className="space-y-4">
        <LeadFormBuilder formKey={form.key} defaultValue={form.fields} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save form'}
          </button>
          {saved && !dirty && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓ — publish to go live</span>}
          {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
      </form>
    </section>
  )
}

function ChatWidgetCard({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(initialEnabled)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(next: boolean) {
    // The switch IS its own Save — flip optimistically, revert on error.
    setOn(next)
    setError(null)
    startTransition(async () => {
      const r = await saveChatWidgetAction(next)
      if (r.ok) {
        router.refresh()
      } else {
        setOn(!next)
        setError(r.error)
      }
    })
  }

  return (
    <section className="v2-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">“Message us” bubble</h2>
      <label className="flex cursor-pointer items-start gap-3">
        <span className="mt-0.5">
          <Toggle
            checked={on}
            onChange={toggle}
            disabled={pending}
            srLabel="Show the “Message us” bubble on your website"
          />
        </span>
        <span className="text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-100">
            Show the chat bubble on every page of your site
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            A visitor’s message lands in <span className="font-medium">Messages</span> like any patient
            conversation, and your reply goes to the email they leave — no account needed on their end.
            The switch saves the moment you flip it.
          </span>
        </span>
      </label>
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </section>
  )
}
