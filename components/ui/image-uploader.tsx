'use client'

import { useRef, useState } from 'react'

interface Props {
  /** Form field name — the resolved blob URL is set on a hidden input with this name. */
  name: string
  /** Current image URL (rendered as preview). */
  defaultValue?: string | null
  /** Storage folder under /api/upload (e.g. 'clinic-logos'). */
  folder: string
  /** Display label above the picker. */
  label: string
  /** Hint text below the input. */
  hint?: string
  /** Aspect ratio class for the preview box (e.g. 'aspect-square', 'aspect-[3/1]'). */
  previewClass?: string
  /** Max upload size in bytes (default 5MB). */
  maxBytes?: number
  /** Optional callback fired whenever the resolved URL changes (upload or
   * remove). Lets callers that autosave (rather than submit a form) keep the
   * value in React state. Form-based callers can ignore it. */
  onChange?: (url: string | null) => void
}

export default function ImageUploader({
  name,
  defaultValue,
  folder,
  label,
  hint,
  previewClass = 'aspect-[3/1]',
  maxBytes = 5 * 1024 * 1024,
  onChange,
}: Props) {
  const [url, setUrlState] = useState<string | null>(defaultValue ?? null)
  const setUrl = (next: string | null) => {
    setUrlState(next)
    onChange?.(next)
  }
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file')
      return
    }
    if (file.size > maxBytes) {
      setError(`File too large (max ${Math.floor(maxBytes / 1024 / 1024)}MB)`)
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('folder', folder)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Upload failed')
      }
      const { url: blobUrl } = (await res.json()) as { url: string }
      setUrl(blobUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="block text-[12px] font-medium text-stone-600 dark:text-stone-300 mb-1.5">{label}</label>
      <input type="hidden" name={name} value={url ?? ''} />
      <div
        className={`${previewClass} w-full max-w-md rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-600 overflow-hidden bg-stone-50 dark:bg-stone-800/40 flex items-center justify-center relative`}
      >
        {url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-stone-400">No image</span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs">
            Uploading…
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2.5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center justify-center rounded-lg px-3.5 py-1.5 text-[13px] font-semibold bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700/60 transition disabled:opacity-60"
        >
          {url ? 'Replace' : 'Upload'}
        </button>
        {url && (
          <button
            type="button"
            onClick={() => setUrl(null)}
            disabled={uploading}
            className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[13px] font-medium text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition disabled:opacity-60"
          >
            Remove
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      </div>
      {hint && <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1.5">{hint}</p>}
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  )
}
