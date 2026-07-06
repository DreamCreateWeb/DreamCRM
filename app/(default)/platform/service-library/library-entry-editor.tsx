'use client'

import { useState } from 'react'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import type { ServiceCategory, ServiceFaqItem, ServiceProcessStep } from '@/lib/types/clinic-content'
import { updateLibraryEntryAction } from './admin-actions'
import {
  AddButton,
  EditorCard,
  EmptyHint,
  Field,
  inputCls,
  selectCls,
  textareaCls,
} from '@/components/ui/editor-kit'

/**
 * Platform-admin editor for a service library entry's CANONICAL content — the
 * default state every clinic starts from when they pick this service. Saving
 * writes the `service_library` row (via updateLibraryEntryAction → marks
 * `editedByAdmin` so the deploy seed stops overwriting it) and does NOT touch
 * any clinic's per-site `customized` copy. Slug is fixed (it's the stable
 * identity clinics link to + the public URL), so a rename keeps the slug.
 */

function swapAt<T>(arr: T[], a: number, b: number): T[] {
  if (b < 0 || b >= arr.length) return arr
  const next = [...arr]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

export default function LibraryEntryEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: ServiceLibraryEntryWithStatus
  onClose: () => void
  onSaved: (slug: string) => void
}) {
  const [name, setName] = useState(entry.name)
  const [category, setCategory] = useState<ServiceCategory>(entry.category)
  const [icon, setIcon] = useState(entry.icon ?? '')
  const [shortDescription, setShortDescription] = useState(entry.shortDescription ?? '')
  const [bullets, setBullets] = useState<string[]>(entry.heroBullets ?? [])
  const [body, setBody] = useState(entry.body ?? '')
  const [steps, setSteps] = useState<ServiceProcessStep[]>(entry.processSteps ?? [])
  const [faq, setFaq] = useState<ServiceFaqItem[]>(entry.faq ?? [])
  const [related, setRelated] = useState((entry.relatedSlugs ?? []).join(', '))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setErr('')
    if (!name.trim()) {
      setErr('A service name is required')
      return
    }
    if (!body.trim()) {
      setErr('The description can’t be empty')
      return
    }
    setSaving(true)
    try {
      const out = await updateLibraryEntryAction(entry.slug, {
        name,
        category,
        icon: icon.trim() || null,
        shortDescription,
        heroBullets: bullets,
        body,
        processSteps: steps,
        faq,
        relatedSlugs: related
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      })
      if (!out.ok) {
        setErr(out.error)
        return
      }
      onSaved(entry.slug)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto rounded-l-2xl">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 sticky -top-px -mt-1 pt-1 bg-white dark:bg-gray-900 z-10">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 truncate">
                Edit default · {entry.name}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                The default content every clinic starts from. URL stays{' '}
                <code className="font-mono">{entry.slug}</code>. Clinics that customized their own
                copy keep it.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1.5 w-8 h-8 inline-flex shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg>
            </button>
          </div>

          {err && (
            <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg px-3 py-2">
              {err}
            </p>
          )}

          {/* Basics */}
          <section className="space-y-3">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3">
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputCls} />
              </Field>
              <Field label="Category">
                <select value={category} onChange={(e) => setCategory(e.target.value as ServiceCategory)} className={selectCls}>
                  <option value="core">Core</option>
                  <option value="special">Special</option>
                </select>
              </Field>
              <Field label="Icon">
                <input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  maxLength={8}
                  placeholder="🦷"
                  className={`${inputCls} w-16 text-center`}
                />
              </Field>
            </div>
            <Field label="Short description" hint="The one-liner on service cards + nav.">
              <textarea value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} rows={2} maxLength={280} className={textareaCls} />
            </Field>
          </section>

          {/* Highlights */}
          <section>
            <SectionHead title="Highlights" hint="The short checkmark points at the top of the page." />
            <div className="space-y-2">
              {bullets.length === 0 && <EmptyHint>No highlights yet — add a few.</EmptyHint>}
              {bullets.map((b, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={b}
                    onChange={(e) => setBullets((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))}
                    maxLength={120}
                    placeholder="e.g. Gentle, same-day care"
                    className={inputCls}
                  />
                  <RowBtn label="Move up" disabled={i === 0} onClick={() => setBullets((p) => swapAt(p, i, i - 1))} icon="up" />
                  <RowBtn label="Move down" disabled={i === bullets.length - 1} onClick={() => setBullets((p) => swapAt(p, i, i + 1))} icon="down" />
                  <RowBtn label="Remove" danger onClick={() => setBullets((p) => p.filter((_, idx) => idx !== i))} icon="trash" />
                </div>
              ))}
            </div>
            {bullets.length < 6 && <AddButton onClick={() => setBullets((p) => [...p, ''])}>Add a highlight</AddButton>}
          </section>

          {/* Description */}
          <section>
            <SectionHead title="Description" hint="The main paragraph patients read." />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000} className={textareaCls} />
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{body.length} / 2000</div>
          </section>

          {/* What to expect */}
          <section>
            <SectionHead title="What to expect" hint="The numbered steps from start to finish." />
            <div className="space-y-3">
              {steps.length === 0 && <EmptyHint>No steps yet — add the visit flow.</EmptyHint>}
              {steps.map((s, i) => (
                <EditorCard
                  key={i}
                  label={`Step ${i + 1}`}
                  canMoveUp={i > 0}
                  canMoveDown={i < steps.length - 1}
                  onMoveUp={() => setSteps((p) => swapAt(p, i, i - 1))}
                  onMoveDown={() => setSteps((p) => swapAt(p, i, i + 1))}
                  onRemove={() => setSteps((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Field label="Title">
                    <input value={s.title} onChange={(e) => setSteps((p) => p.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)))} maxLength={120} className={inputCls} />
                  </Field>
                  <Field label="What happens">
                    <textarea value={s.body} onChange={(e) => setSteps((p) => p.map((x, idx) => (idx === i ? { ...x, body: e.target.value } : x)))} rows={2} maxLength={800} className={textareaCls} />
                  </Field>
                </EditorCard>
              ))}
            </div>
            {steps.length < 8 && <AddButton onClick={() => setSteps((p) => [...p, { title: '', body: '' }])}>Add a step</AddButton>}
          </section>

          {/* Common questions */}
          <section>
            <SectionHead title="Common questions" hint="For cost, describe the estimate-first process — no dollar figures." />
            <div className="space-y-3">
              {faq.length === 0 && <EmptyHint>No questions yet — add a few.</EmptyHint>}
              {faq.map((f, i) => (
                <EditorCard
                  key={i}
                  label={`Question ${i + 1}`}
                  canMoveUp={i > 0}
                  canMoveDown={i < faq.length - 1}
                  onMoveUp={() => setFaq((p) => swapAt(p, i, i - 1))}
                  onMoveDown={() => setFaq((p) => swapAt(p, i, i + 1))}
                  onRemove={() => setFaq((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Field label="Question">
                    <input value={f.question} onChange={(e) => setFaq((p) => p.map((x, idx) => (idx === i ? { ...x, question: e.target.value } : x)))} maxLength={240} className={inputCls} />
                  </Field>
                  <Field label="Answer">
                    <textarea value={f.answer} onChange={(e) => setFaq((p) => p.map((x, idx) => (idx === i ? { ...x, answer: e.target.value } : x)))} rows={3} maxLength={1200} className={textareaCls} />
                  </Field>
                </EditorCard>
              ))}
            </div>
            {faq.length < 10 && <AddButton onClick={() => setFaq((p) => [...p, { question: '', answer: '' }])}>Add a question</AddButton>}
          </section>

          {/* Related */}
          <section>
            <Field
              label="Related services"
              hint="Slugs shown in the related-services carousel, comma-separated. Optional."
            >
              <input value={related} onChange={(e) => setRelated(e.target.value)} placeholder="teeth-whitening, dental-exams" className={inputCls} />
            </Field>
          </section>

          {/* Footer */}
          <div className="flex gap-2 pt-4 border-t border-gray-200/70 dark:border-gray-700/50 sticky bottom-0 -mb-6 pb-6 bg-white dark:bg-gray-900">
            <button
              type="button"
              disabled={saving || !name.trim() || !body.trim()}
              onClick={save}
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save default'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-2.5">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
    </div>
  )
}

function RowBtn({
  label,
  onClick,
  disabled,
  danger,
  icon,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  icon: 'up' | 'down' | 'trash'
}) {
  const d =
    icon === 'up' ? 'M5 12.5L10 7.5l5 5' : icon === 'down' ? 'M5 7.5L10 12.5l5-5' : 'M5.5 6.5h9M8 6.5V5h4v1.5M6.5 6.5l.5 8h6l.5-8'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md transition disabled:opacity-25 ${
        danger
          ? 'text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/25'
          : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700/60'
      }`}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
    </button>
  )
}
