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
}

export default function ImageUploader({
  name,
  defaultValue,
  folder,
  label,
  hint,
  previewClass = 'aspect-[3/1]',
  maxBytes = 5 * 1024 * 1024,
}: Props) {
  const [url, setUrl] = useState<string | null>(defaultValue ?? null)
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
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input type="hidden" name={name} value={url ?? ''} />
      <div
        className={`${previewClass} w-full max-w-md rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900/30 flex items-center justify-center relative`}
      >
        {url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-gray-400">No image</span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs">
            Uploading…
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200 disabled:opacity-60"
        >
          {url ? 'Replace' : 'Upload'}
        </button>
        {url && (
          <button
            type="button"
            onClick={() => setUrl(null)}
            disabled={uploading}
            className="btn-sm text-red-500 hover:text-red-600 disabled:opacity-60"
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
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
