'use client'

import { useState, useRef } from 'react'
import type { ClinicTestimonial } from '@/lib/types/clinic-content'
import { AddButton, EditorCard, EmptyHint, Field, inputCls, textareaCls } from '@/components/ui/editor-kit'

interface Props {
  name: string
  defaultValue?: ClinicTestimonial[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export default function TestimonialsEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicTestimonial[]>(defaultValue ?? [])

  function update(idx: number, patch: Partial<ClinicTestimonial>) {
    setItems((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  function move(idx: number, dir: -1 | 1) {
    setItems((prev) => {
      const swap = idx + dir
      if (swap < 0 || swap >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }
  function add() {
    setItems((prev) => [
      ...prev,
      { id: uid(), quote: '', authorName: '', authorLocation: '', authorPhotoUrl: null },
    ])
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="space-y-3">
        {items.length === 0 && (
          <EmptyHint>
            No reviews yet. Long-form quotes from real patients are one of the strongest trust
            signals on a clinic site — aim for three with a first name and city.
          </EmptyHint>
        )}
        {items.map((t, i) => (
          <TestimonialRow
            key={t.id}
            index={i}
            total={items.length}
            value={t}
            onChange={(patch) => update(i, patch)}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>
      <AddButton onClick={add}>Add review</AddButton>
    </div>
  )
}

function TestimonialRow({
  index,
  total,
  value,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  index: number
  total: number
  value: ClinicTestimonial
  onChange: (patch: Partial<ClinicTestimonial>) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('folder', 'clinic-testimonials')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const body = (await res.json()) as { url?: string }
      if (body.url) onChange({ authorPhotoUrl: body.url })
    } finally {
      setUploading(false)
    }
  }

  return (
    <EditorCard
      label={`Review ${index + 1}`}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      canMoveUp={index > 0}
      canMoveDown={index < total - 1}
      onRemove={onRemove}
      headerExtra={
        value.patientId ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            🔗 Linked to a patient
          </span>
        ) : undefined
      }
    >
      <Field label="Quote">
        <textarea
          value={value.quote}
          onChange={(e) => onChange({ quote: e.target.value })}
          className={textareaCls}
          rows={3}
          placeholder="What did this patient say about their experience? 2–4 sentences works best."
          maxLength={500}
        />
      </Field>
      <div className="flex items-end gap-3">
        <div className="shrink-0">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Photo</label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-xs text-gray-400 hover:border-gray-400 transition relative"
            aria-label="Upload patient photo"
          >
            {value.authorPhotoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={value.authorPhotoUrl} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
            ) : (
              'Add'
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs">
                …
              </div>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
              e.target.value = ''
            }}
          />
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Patient name">
            <input
              type="text"
              value={value.authorName}
              onChange={(e) => onChange({ authorName: e.target.value })}
              className={inputCls}
              placeholder="Sarah K."
              maxLength={64}
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={value.authorLocation ?? ''}
              onChange={(e) => onChange({ authorLocation: e.target.value })}
              className={inputCls}
              placeholder="Austin, TX"
              maxLength={64}
            />
          </Field>
        </div>
      </div>
    </EditorCard>
  )
}
