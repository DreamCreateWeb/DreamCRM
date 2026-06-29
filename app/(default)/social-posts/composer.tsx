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
  ctaNeedsUrl,
  postCharLimitForTargets,
  GOOGLE_BUSINESS_PLATFORM,
  type GbpPostType,
  type GbpCtaType,
  type ComposerChannel,
  type CreateSocialPostFormInput,
} from '@/lib/types/zernio'
import { createSocialPostAction } from './actions'
import PostPreviews, { type PreviewChannel } from '@/components/social-posts/post-preview'
import { BrandLogo, BRAND_ACCENTS, type BrandLogoId } from '@/components/integrations/brand-logos'
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_IMAGE_MB,
  MAX_VIDEO_MB,
  isVideoFile,
  isVideoUrl,
} from '@/lib/media'

/** Platform slugs that have a brand-accurate logo (the connectable shortlist). */
const BRAND_IDS: Record<string, BrandLogoId> = {
  googlebusiness: 'googlebusiness',
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  linkedin: 'linkedin',
}

/**
 * Unified multi-platform post composer. Compose once → publish/schedule to one
 * OR MORE connected channels (Google Business + Instagram / Facebook / TikTok /
 * YouTube / LinkedIn). A channel picker (checkboxes over the org's connected
 * accounts) decides targets; the GBP-specific options (post type / CTA / event /
 * offer) only appear when a Google Business channel is selected. A live char
 * counter reflects the tightest cap across the picked channels (GBP=1,500). An
 * image uploads via the shared XHR helper → public S3 URL passed to Zernio.
 * "Post now" publishes; "Schedule" hands a future time to Zernio (which
 * publishes it — no cron on our side).
 *
 * Honest: no per-post metrics are promised (deprecated on Google, not yet
 * pulled for the socials) — the page points to /seo for local GBP performance.
 */
export default function Composer({
  channels,
  bookUrl,
  clinicName = '',
}: {
  channels: ComposerChannel[]
  bookUrl: string | null
  /** Org name — used for the live-preview avatar + Google Business name. Falls
   *  back to each channel's handle/label when absent (e.g. in tests). */
  clinicName?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  // Channel selection — default: all connected channels checked.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(channels.map((c) => c.accountId)))

  const [postType, setPostType] = useState<GbpPostType>('standard')
  const [summary, setSummary] = useState('')

  // Image
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleRef = useRef<UploadHandle | null>(null)

  // CTA (GBP only)
  const [ctaType, setCtaType] = useState<GbpCtaType | ''>('')
  const [ctaUrl, setCtaUrl] = useState('')

  // Event (GBP only)
  const [eventTitle, setEventTitle] = useState('')
  const [eventStartAt, setEventStartAt] = useState('')
  const [eventEndAt, setEventEndAt] = useState('')

  // Offer (GBP only)
  const [offerCouponCode, setOfferCouponCode] = useState('')
  const [offerRedeemUrl, setOfferRedeemUrl] = useState('')
  const [offerTerms, setOfferTerms] = useState('')

  // Schedule
  const [scheduleOn, setScheduleOn] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Resolve the targeted platforms from the selection.
  const selectedPlatforms = useMemo(
    () => channels.filter((c) => selected.has(c.accountId)).map((c) => c.platform),
    [channels, selected],
  )
  const targetsGbp = selectedPlatforms.includes(GOOGLE_BUSINESS_PLATFORM)
  const charLimit = useMemo(() => postCharLimitForTargets(selectedPlatforms), [selectedPlatforms])
  const remaining = charLimit - summary.length
  const overLimit = remaining < 0

  function toggleChannel(accountId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

  // When the user picks the Book CTA, prefill the clinic's /book URL.
  function onCtaTypeChange(next: GbpCtaType | '') {
    setCtaType(next)
    if (next === 'BOOK' && bookUrl && !ctaUrl.trim()) setCtaUrl(bookUrl)
  }

  async function handleFile(file: File) {
    setUploadError(null)
    const video = isVideoFile(file)
    const image = file.type.startsWith('image/')
    if (!image && !video) {
      setUploadError('Pick an image (JPEG, PNG) or a video (MP4, MOV, WebM).')
      return
    }
    const cap = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (file.size > cap) {
      setUploadError(
        video ? `Video too large — up to ${MAX_VIDEO_MB}MB.` : `Image too large — up to ${MAX_IMAGE_MB}MB.`,
      )
      return
    }
    setUploading(true)
    setUploadPct(0)
    const handle = uploadFileWithProgress(file, 'social-posts', setUploadPct)
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
    if (selected.size === 0) return false
    if (!summary.trim() || overLimit) return false
    return true
  }, [pending, uploading, selected, summary, overLimit])

  function reset() {
    setSelected(new Set(channels.map((c) => c.accountId)))
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
    const accountIds = channels.filter((c) => selected.has(c.accountId)).map((c) => c.accountId)
    const input: CreateSocialPostFormInput = {
      accountIds,
      postType: targetsGbp ? postType : 'standard',
      summary: summary.trim(),
      imageUrl,
      ctaType: targetsGbp && ctaType ? ctaType : null,
      ctaUrl: targetsGbp && ctaType && ctaNeedsUrl(ctaType) ? ctaUrl.trim() : null,
      eventTitle: targetsGbp && postType === 'event' ? eventTitle.trim() : null,
      eventStartAt: targetsGbp && postType === 'event' ? toIso(eventStartAt) : null,
      eventEndAt: targetsGbp && postType === 'event' ? toIso(eventEndAt) : null,
      offerCouponCode: targetsGbp && postType === 'offer' ? offerCouponCode.trim() || null : null,
      offerRedeemUrl: targetsGbp && postType === 'offer' ? offerRedeemUrl.trim() || null : null,
      offerTerms: targetsGbp && postType === 'offer' ? offerTerms.trim() || null : null,
      scheduledAt: scheduleOn ? toIso(scheduledAt) : null,
    }
    start(async () => {
      const r = await createSocialPostAction(input)
      if (r.ok) {
        setSuccess(
          r.status === 'scheduled'
            ? 'Scheduled — your channels will publish it at the time you set.'
            : 'Posted to your channels.',
        )
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

  // The live-preview feed reads the same state the form edits — true WYSIWYG.
  const previewChannels: PreviewChannel[] = channels
    .filter((c) => selected.has(c.accountId))
    .map((c) => ({ accountId: c.accountId, platform: c.platform, label: c.label, handle: c.handle }))
  const previewContent = {
    summary,
    imageUrl,
    clinicName,
    postType: (targetsGbp ? postType : 'standard') as GbpPostType,
    ctaLabel: targetsGbp && ctaType ? GBP_CTA_LABELS[ctaType] : null,
    eventTitle,
    eventStartLabel: targetsGbp && postType === 'event' && eventStartAt ? fmtEventStart(eventStartAt) : null,
    offerCouponCode,
  }

  return (
    <div className="v2-panel p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Compose a post</h2>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-6 lg:gap-8 items-start">
        {/* ── Compose (left) ─────────────────────────────────────────────── */}
        <div className="min-w-0">

      {/* Channel selector — tap an account to broadcast to it */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <Label className="mb-0">Post to</Label>
          <span className={`text-[11px] font-medium ${selected.size === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
            {selected.size === 0
              ? 'Pick at least one'
              : `${selected.size} of ${channels.length} selected`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Channels">
          {channels.map((ch) => {
            const on = selected.has(ch.accountId)
            const logoId = BRAND_IDS[ch.platform]
            const accent = logoId ? BRAND_ACCENTS[logoId] : null
            return (
              <button
                key={ch.accountId}
                type="button"
                onClick={() => toggleChannel(ch.accountId)}
                aria-pressed={on}
                title={ch.handle ?? ch.label}
                className={`group relative inline-flex items-center gap-2.5 rounded-[var(--r-md)] border px-3 py-2 text-left transition ${
                  on
                    ? 'shadow-sm'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
                style={on && accent ? { borderColor: accent, backgroundColor: `color-mix(in srgb, ${accent} 9%, transparent)` } : undefined}
              >
                <span className="relative inline-flex shrink-0">
                  {logoId ? (
                    <BrandLogo
                      id={logoId}
                      size={26}
                      className={on ? '' : 'opacity-45 grayscale transition group-hover:opacity-90 group-hover:grayscale-0'}
                    />
                  ) : (
                    <span className="text-xl" aria-hidden="true">{ch.icon}</span>
                  )}
                  {on && (
                    <span
                      className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white ring-2 ring-white dark:ring-gray-800"
                      style={{ backgroundColor: accent ?? '#14b8a6' }}
                    >
                      <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden="true">
                        <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[13px] font-medium leading-tight ${on ? 'text-gray-900 dark:text-gray-50' : 'text-gray-600 dark:text-gray-300'}`}>
                    {ch.label}
                  </span>
                  {ch.handle && (
                    <span className="block text-[11px] text-gray-400 truncate max-w-[130px]">{ch.handle}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Post type selector — GBP only — a segmented control */}
      {targetsGbp && (
        <div className="mb-4">
          <Label>Google post type</Label>
          <div
            className="inline-flex rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] ring-1 ring-inset ring-[color:var(--color-hairline)] p-0.5"
            role="group"
            aria-label="Post type"
          >
            {GBP_POST_TYPES.map((t) => {
              const active = postType === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPostType(t)}
                  aria-pressed={active}
                  className={`rounded-[calc(var(--r-md)-2px)] px-4 py-1.5 text-[13px] font-medium transition ${
                    active
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-50 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {GBP_POST_TYPE_LABELS[t]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Event fields — GBP only */}
      {targetsGbp && postType === 'event' && (
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
        <Label className="mb-0">{targetsGbp && postType === 'standard' ? "What's new" : 'Message'}</Label>
        <span className={`text-[11px] font-mono-num ${counterCls}`}>{remaining}</span>
      </div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={5}
        placeholder={targetsGbp ? PLACEHOLDERS[postType] : 'Write your post — it goes out to every channel you picked above.'}
        className={`${inputCls} resize-y`}
        aria-label="Post text"
      />
      {selectedPlatforms.length > 1 && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
          Same text goes to every channel. Counter shows the tightest limit ({charLimit}).
        </p>
      )}

      {/* Offer fields — GBP only */}
      {targetsGbp && postType === 'offer' && (
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

      {/* Media uploader — photo or video */}
      <div className="mt-4">
        <Label>Photo or video (optional)</Label>
        {imageUrl ? (
          <div className="relative w-full max-w-xs aspect-[4/3] rounded-[var(--r-md)] overflow-hidden ring-1 ring-inset ring-[color:var(--color-hairline)] bg-black/5">
            {isVideoUrl(imageUrl) ? (
              <video src={imageUrl} controls muted playsInline className="w-full h-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              className="absolute top-1.5 right-1.5 rounded-full bg-black/60 text-white text-xs px-2 py-0.5 hover:bg-black/80 z-10"
            >
              Remove
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              if (!dragging) setDragging(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setDragging(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-[var(--r-lg)] border-2 border-dashed px-4 py-7 text-center cursor-pointer transition ${
              dragging
                ? 'border-teal-400 bg-teal-500/5'
                : 'border-[color:var(--color-hairline-strong)] hover:border-teal-300 hover:bg-gray-50 dark:hover:bg-gray-800/40'
            }`}
          >
            {uploading ? (
              <>
                <div className="w-full max-w-[200px] h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div className="h-full bg-teal-500 dark:bg-teal-400 transition-[width]" style={{ width: `${uploadPct}%` }} />
                </div>
                <p className="text-[12px] text-gray-500 dark:text-gray-400 font-mono-num">Uploading… {uploadPct}%</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRef.current?.cancel()
                  }}
                  className="text-[11px] text-gray-400 underline underline-offset-2 hover:text-gray-600"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 dark:text-gray-500" aria-hidden="true">
                  <path d="M7 18a4 4 0 01-.9-7.9 5 5 0 019.7-1.6A3.5 3.5 0 0117 18" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 12.5v5m0-5l-2 2m2-2l2 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-[13px] font-medium text-gray-700 dark:text-gray-200">
                  Drag a photo or video here, or <span className="text-teal-700 dark:text-teal-400">browse</span>
                </p>
                <p className="text-[11px] text-gray-400">
                  Photos up to {MAX_IMAGE_MB}MB · video up to {MAX_VIDEO_MB}MB
                </p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
          </div>
        )}
        {uploadError && <p className="text-xs text-rose-600 mt-1" role="alert">{uploadError}</p>}
      </div>

      {/* CTA picker — GBP only */}
      {targetsGbp && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Button (Google only, optional)</Label>
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
      )}

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
          {pending
            ? 'Posting…'
            : scheduleOn
              ? 'Schedule post'
              : selected.size > 1
                ? `Post to ${selected.size} channels`
                : 'Post now'}
        </ActionButton>
        <p className="text-[11px] text-gray-400">
          Posts go out through your connected channels. Google Updates drop off your listing after about 7 days.
        </p>
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

        {/* ── Live preview (right) ───────────────────────────────────────── */}
        <div className="lg:sticky lg:top-4">
          <PostPreviews channels={previewChannels} content={previewContent} />
        </div>
      </div>
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
 *  string. Empty → null. */
function toIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Friendly label for the GBP event-start preview ("Jun 20, 2:00 PM"). */
function fmtEventStart(local: string): string | null {
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
