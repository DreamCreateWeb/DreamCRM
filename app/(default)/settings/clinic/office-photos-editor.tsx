'use client'

import { useState, useRef } from 'react'
import type { ClinicOfficePhoto } from '@/lib/types/clinic-content'
import FocalPointPicker from '@/components/ui/focal-point-picker'
import { EmptyHint } from '@/components/ui/editor-kit'

interface Props {
  name: string
  defaultValue?: ClinicOfficePhoto[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export default function OfficePhotosEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicOfficePhoto[]>(defaultValue ?? [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function update(idx: number, patch: Partial<ClinicOfficePhoto>) {
    setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleFiles(files: FileList) {
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        if (file.size > 8 * 1024 * 1024) continue
        const fd = new FormData()
        fd.set('file', file)
        fd.set('folder', 'clinic-office-photos')
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const body = (await res.json()) as { url?: string }
        if (body.url) {
          setItems((prev) => [...prev, { id: uid(), url: body.url!, alt: null, caption: null }])
        }
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      {items.length === 0 ? (
        <div className="mb-3">
          <EmptyHint>
            Add 3–4 photos of your office — reception, a treatment room, the waiting area. Real
            interior shots beat stock photography by a mile. Drag the focus dot after uploading
            to choose what stays in frame.
          </EmptyHint>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {items.map((p, i) => (
            <div key={p.id} className="relative group">
              <FocalPointPicker
                compact
                src={p.url}
                aspectClass="aspect-[4/5]"
                value={p.position ?? '50% 50%'}
                onChange={(pos) => update(i, { position: pos })}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 hover:bg-white text-gray-700 hover:text-red-600 text-sm font-semibold opacity-0 group-hover:opacity-100 transition shadow z-10"
                aria-label="Remove photo"
              >
                ×
              </button>
              <input
                type="text"
                value={p.caption ?? ''}
                onChange={(e) => update(i, { caption: e.target.value })}
                placeholder="Caption (optional)"
                className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs bg-white/95 border-t border-gray-200 focus:outline-none focus:bg-white z-10"
                maxLength={120}
              />
            </div>
          ))}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-2.5 text-[13px] font-semibold text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition disabled:opacity-50"
      >
        {uploading ? (
          'Uploading…'
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 5v10M5 10h10" />
            </svg>
            Add photos
          </>
        )}
      </button>
    </div>
  )
}
