'use client'

import { useRef, useState } from 'react'
import { uploadFileWithProgress, UploadCancelledError, type UploadHandle } from '@/lib/upload-with-progress'

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
  /** Max upload size in bytes (default 8MB — matches the server's IMAGE_MAX_BYTES). */
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
  // 8MB matches the server's IMAGE_MAX_BYTES — the old 5MB default rejected
  // files client-side that the server would have happily accepted.
  maxBytes = 8 * 1024 * 1024,
  onChange,
}: Props) {
  const [url, setUrlState] = useState<string | null>(defaultValue ?? null)
  const setUrl = (next: string | null) => {
    setUrlState(next)
    onChange?.(next)
  }
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleRef = useRef<UploadHandle | null>(null)

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
    setProgress(0)
    const handle = uploadFileWithProgress(file, folder, setProgress)
    handleRef.current = handle
    try {
      const blobUrl = await handle.promise
      setUrl(blobUrl)
    } catch (err) {
      // A user-initiated cancel is not an error to surface.
      if (!(err instanceof UploadCancelledError)) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    } finally {
      setUploading(false)
      handleRef.current = null
    }
  }

  const maxMb = Math.floor(maxBytes / 1024 / 1024)
  const hintText = hint ? `${hint} Up to ${maxMb}MB.` : `Up to ${maxMb}MB.`

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
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 text-white text-xs">
            <span>Uploading… {progress}%</span>
            <div className="w-3/4 h-1 rounded-full bg-white/25 overflow-hidden">
              <div className="h-full bg-white transition-[width] duration-150" style={{ width: `${progress}%` }} />
            </div>
            <button
              type="button"
              onClick={() => handleRef.current?.cancel()}
              className="mt-0.5 underline underline-offset-2 hover:text-white/80"
            >
              Cancel
            </button>
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
        {url && !uploading && (
          <button
            type="button"
            onClick={() => setUrl(null)}
            className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[13px] font-medium text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition"
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
      <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5">{hintText}</p>
      {error && <p className="text-xs text-rose-600 mt-1" role="alert">{error}</p>}
    </div>
  )
}
