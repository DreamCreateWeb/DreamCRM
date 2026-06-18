'use client'

import { useRef, useState, useTransition } from 'react'
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_LABEL_SUGGESTIONS,
  MAX_DOCUMENT_BYTES,
  formatFileSize,
  isImageDocument,
  type PatientDocumentRow,
} from '@/lib/types/patient-documents'
import { uploadPatientDocumentAction, deletePatientDocumentAction } from '../actions'

/**
 * Documents panel on the patient detail. Upload a PDF or image (referral
 * letters, x-ray/photo exports, signed forms, insurance cards), see the list
 * with download links, delete. Mirrors the notes-panel server-action pattern;
 * the upload goes through a server action so the S3 PUT + the DB row are one
 * atomic call.
 */
export default function DocumentsPanel({
  patientId,
  initial,
}: {
  patientId: string
  initial: PatientDocumentRow[]
}) {
  const [docs, setDocs] = useState<PatientDocumentRow[]>(initial)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError('File is too large (max 15MB).')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    const fd = new FormData()
    fd.set('patientId', patientId)
    fd.set('file', file)
    if (label.trim()) fd.set('label', label.trim())
    startTransition(async () => {
      const res = await uploadPatientDocumentAction(fd)
      if (res.ok) {
        setDocs((cur) => [res.document, ...cur])
        setLabel('')
      } else {
        setError(res.error)
      }
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  function remove(id: string) {
    const prev = docs
    setDocs((cur) => cur.filter((d) => d.id !== id))
    startTransition(async () => {
      const res = await deletePatientDocumentAction(patientId, id)
      if (!res.ok) {
        setDocs(prev)
        setError(res.error)
      }
    })
  }

  return (
    <div className="v2-card px-4 py-4">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Documents</h2>

      {/* Upload control */}
      <div className="mb-3">
        <div className="flex gap-2">
          <input
            list="doc-label-suggestions"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="form-input flex-1 text-xs py-1"
            disabled={pending}
          />
          <datalist id="doc-label-suggestions">
            {DOCUMENT_LABEL_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="shrink-0 rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-2)] px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:border-gray-300 disabled:opacity-60"
          >
            {pending ? 'Uploading…' : '+ Upload'}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          onChange={onPick}
          className="hidden"
        />
        <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">PDF or image, up to 15MB.</p>
        {error && <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
      </div>

      {docs.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No documents yet. Attach referral letters, x-rays, signed forms, or an insurance card.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-start gap-2">
              <DocIcon doc={d} />
              <div className="min-w-0 flex-1">
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 truncate"
                  title={d.fileName}
                >
                  {d.label || d.fileName}
                </a>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {d.label ? `${d.fileName} · ` : ''}
                  {formatFileSize(d.sizeBytes)}
                  {d.uploadedByName ? ` · ${d.uploadedByName}` : ''}
                  <span suppressHydrationWarning>
                    {' · '}
                    {d.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(d.id)}
                disabled={pending}
                aria-label={`Remove ${d.label || d.fileName}`}
                className="shrink-0 text-[11px] text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 px-1 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DocIcon({ doc }: { doc: PatientDocumentRow }) {
  if (isImageDocument(doc.contentType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={doc.fileUrl}
        alt=""
        className="h-9 w-9 shrink-0 rounded object-cover ring-1 ring-[color:var(--color-hairline)]"
      />
    )
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-rose-50 text-[9px] font-bold text-rose-600 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800">
      PDF
    </span>
  )
}
