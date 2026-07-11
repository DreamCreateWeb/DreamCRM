'use client'

import { useState, useRef } from 'react'
import type { ClinicColoringPage } from '@/lib/types/clinic-content'
import { EmptyHint } from '@/components/ui/editor-kit'

interface Props {
  name: string
  defaultValue?: ClinicColoringPage[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Studio editor for the kids' coloring pages — upload line-art (simple black
 * outlines on white color best), give each sheet a friendly name. They appear
 * at the public /coloring page where kids print them or color them right in
 * the browser. Same hidden-input + JSON contract as OfficePhotosEditor so the
 * section-save action parses it identically.
 */
export default function ColoringPagesEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicColoringPage[]>(defaultValue ?? [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function update(idx: number, patch: Partial<ClinicColoringPage>) {
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
        fd.set('folder', 'clinic-coloring-pages')
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const body = (await res.json()) as { url?: string }
        if (body.url) {
          setItems((prev) => [...prev, { id: uid(), title: null, imageUrl: body.url! }])
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
            Upload black-and-white line art — a friendly tooth, a superhero toothbrush, your
            mascot. Kids can print them or color them right on your website. Simple bold
            outlines on a white background color best.
          </EmptyHint>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {items.map((p, i) => (
            <div key={p.id} className="relative group rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt={p.title ?? 'Coloring page'} className="w-full aspect-[3/4] object-contain bg-white" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 hover:bg-white text-gray-700 hover:text-red-600 text-sm font-semibold opacity-0 group-hover:opacity-100 transition shadow z-10"
                aria-label="Remove coloring page"
              >
                ×
              </button>
              <input
                type="text"
                value={p.title ?? ''}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="Name (e.g. Brushing Buddy)"
                className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs bg-white/95 border-t border-gray-200 focus:outline-none focus:bg-white z-10"
                maxLength={80}
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
            Add coloring pages
          </>
        )}
      </button>
    </div>
  )
}
