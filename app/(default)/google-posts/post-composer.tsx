'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { uploadFileWithProgress, UploadCancelledError, type UploadHandle } from '@/lib/upload-with-progress'
import {
  GBP_POST_TYPES,
  GBP_POST_TYPE_LABELS,
  GBP_CTA_TYPES,
  GBP_CTA_LABELS,
  GBP_POST_MAX_CHARS,
  ctaNeedsUrl,
  type GbpPostType,
  type GbpCtaType,
  type CreateGbpPostFormInput,
} from '@/lib/types/zernio'
import { createGbpPostAction } from './actions'

/**
 * Google Business post composer. Post type (Update / Offer / Event) switches the
 * revealed fields; a live char counter caps at 1,500; an image uploads via the
 * shared XHR helper (same as the website editors) and the resulting PUBLIC S3
 * URL is what we pass to Zernio; the CTA picker defaults Book → the clinic's
 * /book URL. "Post to Google" publishes now; "Schedule" hands a future time to
 * Zernio (which publishes it). All wired to the gated `createGbpPostAction`.
 *
 * Honest: no per-post metrics are promised (Google deprecated them) — the page
 * points to /seo for local performance.
 */
export default function PostComposer({ bookUrl }: { bookUrl: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [postType, setPostType] = useState<GbpPostType>('standard')
  const [summary, setSummary] = useState('')

  // Image
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleRef = useRef<UploadHandle | null>(null)

  // CTA
  const [ctaType, setCtaType] = useState<GbpCtaType | ''>('')
  const [ctaUrl, setCtaUrl] = useState('')

  // Event
  const [eventTitle, setEventTitle] = useState('')
  const [eventStartAt, setEventStartAt] = useState('')
  const [eventEndAt, setEventEndAt] = useState('')

  // Offer
  const [offerCouponCode, setOfferCouponCode] = useState('')
  const [offerRedeemUrl, setOfferRedeemUrl] = useState('')
  const [offerTerms, setOfferTerms] = useState('')

  // Schedule
  const [scheduleOn, setScheduleOn] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const remaining = GBP_POST_MAX_CHARS - summary.length
  const overLimit = remaining < 0

  // When the user picks the Book CTA, prefill the clinic's /book URL.
  function onCtaTypeChange(next: GbpCtaType | '') {
    setCtaType(next)
    if (next === 'BOOK' && bookUrl && !ctaUrl.trim()) setCtaUrl(bookUrl)
  }

  async function handleFile(file: File) {
    setUploadError(null)
    if (!file.type.startsWith('image/')) {
      setUploadError('Pick an image file (JPEG or PNG).')
      return
    }
    // Google requires ≤5MB for GBP post images.
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image too large — Google allows up to 5MB.')
      return
    }
    setUploading(true)
    setUploadPct(0)
    const handle = uploadFileWithProgress(file, 'gbp-posts', setUploadPct)
    handleRef.current = handle
    try {
      const url = await handle.promise
      setImageUrl(url)
    } catch (err) {
      if (!(err instanceof UploadCancelledError)) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      }
    } finally {
      setUploading(false)
      handleRef.current = null
    }
  }

  const canSubmit = useMemo(() => {
    if (pending || uploading) return false
    if (!summary.trim() || overLimit) return false
    return true
  }, [pending, uploading, summary, overLimit])

  function reset() {
    setPostType('standard')
    setSummary('')
    setImageUrl(null)
    setCtaType('')
    setCtaUrl('')
    setEventTitle('')
    setEventStartAt('')
    setEventEndAt('')
    setOfferCouponCode('')
    setOfferRedeemUrl('')
    setOfferTerms('')
    setScheduleOn(false)
    setScheduledAt('')
  }

  function submit() {
    setError(null)
    setSuccess(null)
    const input: CreateGbpPostFormInput = {
      postType,
      summary: summary.trim(),
      imageUrl,
      ctaType: ctaType || null,
      ctaUrl: ctaType && ctaNeedsUrl(ctaType) ? ctaUrl.trim() : null,
      eventTitle: postType === 'event' ? eventTitle.trim() : null,
      eventStartAt: postType === 'event' ? toIso(eventStartAt) : null,
      eventEndAt: postType === 'event' ? toIso(eventEndAt) : null,
      offerCouponCode: postType === 'offer' ? offerCouponCode.trim() || null : null,
      offerRedeemUrl: postType === 'offer' ? offerRedeemUrl.trim() || null : null,
      offerTerms: postType === 'offer' ? offerTerms.trim() || null : null,
      scheduledAt: scheduleOn ? toIso(scheduledAt) : null,
    }
    start(async () => {
      const r = await createGbpPostAction(input)
      if (r.ok) {
        setSuccess(r.status === 'scheduled' ? 'Scheduled — Google will publish it at the time you set.' : 'Posted to Google.')
        reset()
        router.refresh()
      } else {
        setError(r.error ?? 'Could not publish the post.')
      }
    })
  }

  const counterCls = overLimit
    ? 'text-rose-600 dark:text-rose-400'
    : remaining < 100
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-gray-400'

  return (
    <div className="v2-panel p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Write a post</h2>

      {/* Post type selector */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Post type">
        {GBP_POST_TYPES.map((t) => {
          const active = postType === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setPostType(t)}
              aria-pressed={active}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition border ${
                active
                  ? 'bg-teal-500 text-white border-teal-500 dark:bg-teal-400 dark:text-gray-900 dark:border-teal-400'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
              }`}
            >
              {GBP_POST_TYPE_LABELS[t]}
            </button>
          )
        })}
      </div>

      {/* Event fields */}
      {postType === 'event' && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Event title</Label>
            <input
              type="text"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Free Kids' Smile Day"
              className={inputCls}
              maxLength={120}
            />
          </div>
          <div>
            <Label>Starts</Label>
            <input
              type="datetime-local"
              value={eventStartAt}
              onChange={(e) => setEventStartAt(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <Label>Ends (optional)</Label>
            <input
              type="datetime-local"
              value={eventEndAt}
              onChange={(e) => setEventEndAt(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* Summary + counter */}
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="mb-0">{postType === 'standard' ? "What's new" : 'Details'}</Label>
        <span className={`text-[11px] font-mono-num ${counterCls}`}>{remaining}</span>
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={5}
        placeholder={PLACEHOLDERS[postType]}
        className={`${inputCls} resize-y`}
        aria-label="Post text"
      />

      {/* Offer fields */}
      {postType === 'offer' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Coupon code (optional)</Label>
            <input
              type="text"
              value={offerCouponCode}
              onChange={(e) => setOfferCouponCode(e.target.value)}
              placeholder="SMILE99"
              className={inputCls}
              maxLength={58}
            />
          </div>
          <div>
            <Label>Redeem link (optional)</Label>
            <input
              type="url"
              value={offerRedeemUrl}
              onChange={(e) => setOfferRedeemUrl(e.target.value)}
              placeholder="https://…"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Terms &amp; conditions (optional)</Label>
            <textarea
              value={offerTerms}
              onChange={(e) => setOfferTerms(e.target.value)}
              rows={2}
              placeholder="New patients only. Cannot be combined with other offers."
              className={`${inputCls} resize-y`}
            />
          </div>
        </div>
      )}

      {/* Image uploader */}
      <div className="mt-4">
        <Label>Photo (optional)</Label>
        {imageUrl ? (
          <div className="relative w-full max-w-xs aspect-[4/3] rounded-[var(--r-md)] overflow-hidden ring-1 ring-inset ring-[color:var(--color-hairline)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              className="absolute top-1.5 right-1.5 rounded-full bg-black/60 text-white text-xs px-2 py-0.5 hover:bg-black/80"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <ActionButton variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? `Uploading… ${uploadPct}%` : 'Add a photo'}
            </ActionButton>
            {uploading && (
              <button
                type="button"
                onClick={() => handleRef.current?.cancel()}
                className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600"
              >
                Cancel
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
          </div>
        )}
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">JPEG or PNG, up to 5MB.</p>
        {uploadError && <p className="text-xs text-rose-600 mt-1" role="alert">{uploadError}</p>}
      </div>

      {/* CTA picker */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Button (optional)</Label>
          <select value={ctaType} onChange={(e) => onCtaTypeChange(e.target.value as GbpCtaType | '')} className={inputCls}>
            <option value="">No button</option>
            {GBP_CTA_TYPES.map((c) => (
              <option key={c} value={c}>
                {GBP_CTA_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        {ctaType && ctaNeedsUrl(ctaType) && (
          <div>
            <Label>Button link</Label>
            <input
              type="url"
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="https://…"
              className={inputCls}
            />
          </div>
        )}
        {ctaType === 'CALL' && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 self-end pb-2">
            Uses your Google listing&apos;s phone number.
          </p>
        )}
      </div>

      {/* Schedule */}
      <div className="mt-4">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={scheduleOn} onChange={(e) => setScheduleOn(e.target.checked)} className="rounded" />
          Schedule for later
        </label>
        {scheduleOn && (
          <div className="mt-2 max-w-xs">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={inputCls}
            />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <ActionButton variant="primary" size="md" onClick={submit} disabled={!canSubmit}>
          {pending ? 'Posting…' : scheduleOn ? 'Schedule' : 'Post to Google'}
        </ActionButton>
        <p className="text-[11px] text-gray-400">Posts appear on your Google listing. Updates expire after ~7 days on Google.</p>
      </div>

      {error && (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-300 bg-rose-500/15 rounded-[var(--r-md)] px-3 py-2" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 rounded-[var(--r-md)] px-3 py-2">
          {success}
        </p>
      )}
    </div>
  )
}

const inputCls =
  'w-full rounded-[var(--r-md)] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40'

function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <label className={`block text-[12px] font-medium text-gray-600 dark:text-gray-300 mb-1.5 ${className}`}>{children}</label>
}

const PLACEHOLDERS: Record<GbpPostType, string> = {
  standard: "Share what's new — a same-week opening, a new service, a friendly hello…",
  offer: 'Describe the offer — what it is, who it’s for, and how to claim it.',
  event: 'Tell patients what to expect at the event and why they should come.',
}

/** Convert a `datetime-local` value (local wall-clock, no zone) to an ISO
 *  string. `new Date(local)` interprets it in the browser's zone — fine for a
 *  human-picked time. Empty → null. */
function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
