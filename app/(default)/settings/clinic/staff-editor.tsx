'use client'

import { useState, useRef } from 'react'
import type { ClinicStaff } from '@/lib/types/clinic-content'

interface Props {
  name: string
  defaultValue?: ClinicStaff[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export default function StaffEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicStaff[]>(defaultValue ?? [])

  function update(idx: number, patch: Partial<ClinicStaff>) {
    setItems((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  function add() {
    setItems((prev) => [...prev, { id: uid(), name: '', title: '', bio: '', photoUrl: null }])
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            No staff added yet. Add doctors and team members to display them on your website.
          </p>
        )}
        {items.map((s, i) => (
          <StaffRow
            key={s.id}
            value={s}
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
        + Add Staff Member
      </button>
    </div>
  )
}

function StaffRow({
  value,
  onChange,
  onRemove,
}: {
  value: ClinicStaff
  onChange: (patch: Partial<ClinicStaff>) => void
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
      fd.set('folder', 'clinic-staff')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const body = (await res.json()) as { url?: string }
      if (body.url) onChange({ photoUrl: body.url })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-start gap-3 p-3 border border-gray-100 dark:border-gray-700/60 rounded-lg">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="shrink-0 w-16 h-16 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs text-gray-400 hover:border-gray-300 relative"
        aria-label="Upload photo"
      >
        {value.photoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={value.photoUrl} alt="" className="w-full h-full object-cover" />
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
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="form-input flex-1"
            placeholder="Dr. Jane Smith"
          />
          <input
            type="text"
            value={value.title ?? ''}
            onChange={(e) => onChange({ title: e.target.value })}
            className="form-input flex-1"
            placeholder="Dentist / Hygienist / Office Manager"
          />
        </div>
        <textarea
          value={value.bio ?? ''}
          onChange={(e) => onChange({ bio: e.target.value })}
          className="form-textarea w-full text-sm"
          rows={2}
          placeholder="Short bio (optional)"
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
  )
}
