'use client'

import { useRef, useState } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { uploadFileWithProgress } from '@/lib/upload-with-progress'
import { TONE_TEXT } from '@/lib/ui/encodings'
import type { InsuranceCardFields } from '@/lib/services/insurance-ocr'
import { scanCardAction } from './actions'

/**
 * "Scan a card" (polish phase 5). Photograph the card (one or two shots —
 * front, and the back if the plan name is there), upload to our storage,
 * read it, and hand the fields back as a PREFILL. The copy says what it is:
 * "We read what we could — check it against the card." Nothing here runs a
 * check; the carrier becomes the payer picker's query, and staff still pick
 * the exact payer and confirm every box.
 *
 * Max 8MB a photo (the upload route's own ceiling); two photos at most (the
 * OCR reads a front and a back, nothing more).
 */

const UPLOAD_FOLDER = 'insurance-cards'
const MAX_BYTES = 8 * 1024 * 1024
const MAX_PHOTOS = 2

export interface CardScanHints {
  planName: string | null
  subscriberName: string | null
}

export function CardScanner({
  patientId,
  onFields,
}: {
  patientId: string | null
  /** The fields read off the card; the form decides what to fill. */
  onFields: (fields: InsuranceCardFields) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'read' | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [hints, setHints] = useState<CardScanHints | null>(null)
  const [done, setDone] = useState<{ read: number; attached: number } | null>(null)

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_PHOTOS)
    if (files.length === 0) return
    setError(null)
    setHints(null)
    setDone(null)
    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        setError('Pick a photo of the card (JPEG, PNG or HEIC).')
        return
      }
      if (f.size > MAX_BYTES) {
        setError('That photo is over 8MB — take it again at a smaller size.')
        return
      }
    }
    try {
      setBusy('upload')
      const uploaded = []
      for (const f of files) {
        const url = await uploadFileWithProgress(f, UPLOAD_FOLDER, setProgress).promise
        uploaded.push({ url, name: f.name, contentType: f.type, sizeBytes: f.size })
      }
      setBusy('read')
      const r = await scanCardAction({ images: uploaded, patientId })
      if (!r.ok) {
        setError(r.error)
        return
      }
      const readCount = [r.fields.provider, r.fields.memberId, r.fields.groupNumber].filter(Boolean).length
      setHints({ planName: r.fields.planName, subscriberName: r.fields.subscriberName })
      setDone({ read: readCount, attached: r.attached })
      onFields(r.fields)
    } catch {
      setError('The upload didn’t finish. Check the connection and try again.')
    } finally {
      setBusy(null)
      setProgress(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="v2-well px-3 py-2.5" data-testid="card-scanner">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label htmlFor="ins-card-photo" className="sr-only">
          Photo of the insurance card
        </label>
        <input
          ref={fileRef}
          id="ins-card-photo"
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <ActionButton variant="secondary" size="sm" pending={busy != null} onClick={() => fileRef.current?.click()}>
          📷 Scan a card
        </ActionButton>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {busy === 'upload'
            ? `Uploading… ${progress}%`
            : busy === 'read'
              ? 'Reading the card…'
              : 'Photograph the front (and the back, if the plan is there). We fill in what we can read.'}
        </span>
      </div>
      {done && (
        <p className="mt-1.5 text-xs text-gray-700 dark:text-gray-200" aria-live="polite">
          We read what we could — check it against the card.
          {done.attached > 0 && <span className="text-gray-500 dark:text-gray-400"> The photo is on their record.</span>}
        </p>
      )}
      {hints && (hints.planName || hints.subscriberName) && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400" data-testid="card-hints">
          Card says{hints.planName ? ` plan: ${hints.planName}` : ''}
          {hints.planName && hints.subscriberName ? ' ·' : ''}
          {hints.subscriberName ? ` subscriber: ${hints.subscriberName}` : ''}
          {hints.subscriberName ? ' — pick whose name the policy is in below.' : ''}
        </p>
      )}
      {error && (
        <p className={`mt-1.5 text-xs ${TONE_TEXT.warn}`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
