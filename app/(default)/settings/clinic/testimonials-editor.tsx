'use client'

import { useState, useRef } from 'react'
import type { ClinicTestimonial } from '@/lib/types/clinic-content'

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
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            No testimonials yet. Long-form quotes from real patients are one of the strongest
            trust signals on a clinic site — aim for 3 with a first name and city.
          </p>
        )}
        {items.map((t, i) => (
          <TestimonialRow
            key={t.id}
            value={t}
            onChange={(patch) => update(i, patch)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-3 btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
      >
        + Add Testimonial
      </button>
    </div>
  )
}

function TestimonialRow({
  value,
  onChange,
  onRemove,
}: {
  value: ClinicTestimonial
  onChange: (patch: Partial<ClinicTestimonial>) => void
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
    <div className="p-3 border border-gray-100 dark:border-gray-700/60 rounded-lg space-y-3">
      <textarea
        value={value.quote}
        onChange={(e) => onChange({ quote: e.target.value })}
        className="form-textarea w-full text-sm"
        rows={3}
        placeholder="What did this patient say about their experience? 2–4 sentences works best."
        maxLength={500}
      />
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-[10px] text-gray-400 hover:border-gray-300 relative"
          aria-label="Upload patient photo"
        >
          {value.authorPhotoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={value.authorPhotoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            'Photo'
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-[10px]">
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
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={value.authorName}
            onChange={(e) => onChange({ authorName: e.target.value })}
            className="form-input"
            placeholder="Sarah K."
            aria-label="Author name"
            maxLength={64}
          />
          <input
            type="text"
            value={value.authorLocation ?? ''}
            onChange={(e) => onChange({ authorLocation: e.target.value })}
            className="form-input"
            placeholder="Austin, TX"
            aria-label="Author location"
            maxLength={64}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-600 mt-2"
        >
          Remove
        </button>
      </div>
    </div>
  )
}
