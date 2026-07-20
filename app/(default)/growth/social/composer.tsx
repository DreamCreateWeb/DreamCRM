'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { EmojiPicker } from '@/components/ui/emoji-picker'
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
 * The post widget — one compact card that does everything the old form
 * sprawl did (2026-07-20 composer-widget pass). Compose once → publish or
 * schedule to any set of connected channels (Google Business + Instagram /
 * Facebook / TikTok / YouTube / LinkedIn).
 *
 * Anatomy: a channels dropdown (overlapping brand logos + count for the
 * face; the full picker in a popover), one borderless text field, and a
 * toolbar — emoji drawer, photo/video button (the whole card is also a drop
 * target), schedule toggle, Google-options drawer (post type / CTA / event /
 * offer — only when a Google channel is targeted), live char counter (the
 * tightest cap across picked channels), and the Post button. The live
 * preview column is unchanged and reads the same state — true WYSIWYG.
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
  const [channelsOpen, setChannelsOpen] = useState(false)
  const channelsRef = useRef<HTMLDivElement>(null)

  const [postType, setPostType] = useState<GbpPostType>('standard')
  const [summary, setSummary] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Google-options drawer (post type / CTA / event / offer)
  const [gbpOpen, setGbpOpen] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Close the channels popover on Esc / outside click.
  useEffect(() => {
    if (!channelsOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setChannelsOpen(false)
    }
    function onDown(e: MouseEvent) {
      if (channelsRef.current && !channelsRef.current.contains(e.target as Node)) setChannelsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [channelsOpen])

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

  /** Splice an emoji in at the caret (falls back to appending). */
  function insertEmoji(emoji: string) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? summary.length
    const end = el?.selectionEnd ?? start
    setSummary(summary.slice(0, start) + emoji + summary.slice(end))
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const caret = start + emoji.length
      el.setSelectionRange(caret, caret)
      autoSize()
    })
  }

  /** Grow the text field with its content (bounded — the card stays a card). */
  function autoSize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`
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
    setGbpOpen(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
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

  // Dropdown face: the selected channels' logos, overlapped Hootsuite-style.
  const selectedChannels = channels.filter((c) => selected.has(c.accountId))
  const faceChannels = selectedChannels.slice(0, 4)
  const faceLabel =
    selected.size === 0
      ? 'Pick channels'
      : selected.size === channels.length
        ? channels.length === 1
          ? selectedChannels[0].label
          : 'All channels'
        : selected.size === 1
          ? selectedChannels[0].label
          : `${selected.size} of ${channels.length} channels`

  // Google-options badge: something non-default is set inside the drawer.
  const gbpCustomized = postType !== 'standard' || ctaType !== ''

  return (
    <div className="v2-panel p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Compose a post</h2>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] gap-6 lg:gap-8 items-start">
        {/* ── The post widget (left) ─────────────────────────────────────── */}
        <div className="min-w-0">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!dragging) setDragging(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              setDragging(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            className={`relative rounded-[var(--r-lg)] bg-white dark:bg-gray-800 ring-1 ring-inset transition focus-within:ring-2 focus-within:ring-teal-500/40 ${
              dragging ? 'ring-2 ring-teal-400' : 'ring-[color:var(--color-hairline)]'
            }`}
          >
            {/* Drop overlay — the whole card is the drop target */}
            {dragging && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[var(--r-lg)] bg-teal-500/10">
                <p className="rounded-full bg-white dark:bg-gray-900 px-4 py-1.5 text-[13px] font-semibold text-teal-700 dark:text-teal-300 shadow-sm">
                  Drop to attach
                </p>
              </div>
            )}

            {/* Header — the channels dropdown */}
            <div className="flex items-center justify-between gap-2 px-3 pt-3">
              <div ref={channelsRef} className="relative">
                <button
                  type="button"
                  onClick={() => setChannelsOpen((o) => !o)}
                  aria-expanded={channelsOpen}
                  aria-label="Choose channels"
                  className={`inline-flex items-center gap-2 rounded-full py-1 pl-1.5 pr-2.5 text-[13px] font-medium transition ring-1 ring-inset ${
                    selected.size === 0
                      ? 'ring-amber-300 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'ring-[color:var(--color-hairline)] bg-[color:var(--color-surface-sunk)] text-gray-700 dark:text-gray-200 hover:ring-[color:var(--color-hairline-strong)]'
                  }`}
                >
                  {faceChannels.length > 0 ? (
                    <span className="flex -space-x-1.5" aria-hidden="true">
                      {faceChannels.map((ch) => {
                        const logoId = BRAND_IDS[ch.platform]
                        return (
                          <span
                            key={ch.accountId}
                            className="inline-flex rounded-full ring-2 ring-white dark:ring-gray-800 bg-white dark:bg-gray-800"
                          >
                            {logoId ? (
                              <BrandLogo id={logoId} size={20} />
                            ) : (
                              <span className="text-sm leading-5">{ch.icon}</span>
                            )}
                          </span>
                        )
                      })}
                    </span>
                  ) : (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-xs" aria-hidden="true">
                      !
                    </span>
                  )}
                  <span>{faceLabel}</span>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className={`transition-transform ${channelsOpen ? 'rotate-180' : ''}`}>
                    <path d="M3 6l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {channelsOpen && (
                  <div
                    role="dialog"
                    aria-label="Choose channels"
                    className="pop-in absolute left-0 top-9 z-30 w-72 origin-top-left rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-2 shadow-[var(--shadow-pop)]"
                  >
                    <div role="group" aria-label="Channels" className="space-y-0.5">
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
                            className="flex w-full items-center gap-2.5 rounded-[var(--r-md)] px-2 py-1.5 text-left transition hover:bg-[color:var(--color-surface-sunk)]"
                          >
                            <span className="relative inline-flex shrink-0">
                              {logoId ? (
                                <BrandLogo id={logoId} size={24} className={on ? '' : 'opacity-45 grayscale'} />
                              ) : (
                                <span className="text-lg" aria-hidden="true">{ch.icon}</span>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block text-[13px] font-medium leading-tight ${on ? 'text-gray-900 dark:text-gray-50' : 'text-gray-500 dark:text-gray-400'}`}>
                                {ch.label}
                              </span>
                              {ch.handle && (
                                <span className="block text-xs text-gray-400 truncate">{ch.handle}</span>
                              )}
                            </span>
                            <span
                              className={`inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full transition ${
                                on ? 'text-white' : 'ring-1 ring-inset ring-[color:var(--color-hairline-strong)]'
                              }`}
                              style={on ? { backgroundColor: accent ?? '#14b8a6' } : undefined}
                              aria-hidden="true"
                            >
                              {on && (
                                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3.5">
                                  <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* GBP flavor pill — quiet reminder of the non-default post type */}
              {targetsGbp && postType !== 'standard' && (
                <span className="rounded-full bg-[color:var(--color-surface-sunk)] px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Google: {GBP_POST_TYPE_LABELS[postType]}
                </span>
              )}
            </div>

            {/* The single text field */}
            <textarea
              ref={textareaRef}
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value)
                autoSize()
              }}
              rows={3}
              placeholder={targetsGbp ? PLACEHOLDERS[postType] : 'Write your post — it goes out to every channel you picked.'}
              className="block w-full resize-none bg-transparent px-3.5 py-3 text-[15px] leading-relaxed text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
              aria-label="Post text"
            />

            {/* Attached media — a compact chip, not a hero zone */}
            {(imageUrl || uploading) && (
              <div className="px-3.5 pb-2">
                {uploading ? (
                  <div className="flex items-center gap-3 rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] px-3 py-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div className="h-full bg-teal-500 dark:bg-teal-400 transition-[width]" style={{ width: `${uploadPct}%` }} />
                    </div>
                    <span className="text-[12px] font-mono-num text-gray-500 dark:text-gray-400">{uploadPct}%</span>
                    <button
                      type="button"
                      onClick={() => handleRef.current?.cancel()}
                      className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                ) : imageUrl ? (
                  <div className="relative inline-flex overflow-hidden rounded-[var(--r-md)] ring-1 ring-inset ring-[color:var(--color-hairline)] bg-black/5">
                    {isVideoUrl(imageUrl) ? (
                      <video src={imageUrl} muted playsInline className="h-20 w-28 object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="h-20 w-28 object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => setImageUrl(null)}
                      aria-label="Remove media"
                      className="absolute right-1 top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path d="M4 4l8 8m0-8l-8 8" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </div>
            )}
            {uploadError && (
              <p className="px-3.5 pb-2 text-xs text-rose-600" role="alert">{uploadError}</p>
            )}

            {/* Schedule — revealed by the clock toggle */}
            {scheduleOn && (
              <div className="flex items-center gap-2 px-3.5 pb-2">
                <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400">Post at</span>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  aria-label="Schedule time"
                  className="rounded-[var(--r-md)] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-[13px] text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                />
              </div>
            )}

            {/* Google options drawer — post type / event / offer / CTA */}
            {targetsGbp && gbpOpen && (
              <div className="mx-3.5 mb-3 space-y-3 rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] p-3">
                <div>
                  <Label>Google post type</Label>
                  <div
                    className="inline-flex rounded-[var(--r-md)] bg-white dark:bg-gray-800 ring-1 ring-inset ring-[color:var(--color-hairline)] p-0.5"
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
                          className={`rounded-[calc(var(--r-md)-2px)] px-3.5 py-1 text-[13px] font-medium transition ${
                            active
                              ? 'bg-[color:var(--color-surface-sunk)] text-gray-900 dark:bg-gray-700 dark:text-gray-50 shadow-sm'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                          }`}
                        >
                          {GBP_POST_TYPE_LABELS[t]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {postType === 'event' && (
                  <div className="grid gap-3 sm:grid-cols-2">
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

                {postType === 'offer' && (
                  <div className="grid gap-3 sm:grid-cols-2">
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

                <div className="grid gap-3 sm:grid-cols-2">
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
                    <p className="self-end pb-2 text-xs text-gray-500 dark:text-gray-400">
                      Uses your Google listing&apos;s phone number.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 border-t border-[color:var(--color-hairline)] px-2 py-1.5">
              <EmojiPicker onPick={insertEmoji} />

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Attach a photo or video"
                title={`Attach a photo (up to ${MAX_IMAGE_MB}MB) or video (up to ${MAX_VIDEO_MB}MB)`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 dark:text-gray-400 transition hover:bg-[color:var(--color-surface-sunk)] hover:text-gray-700 dark:hover:text-gray-200"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" />
                  <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
                  <path d="M5 17l4.5-4.5 3 3 3.5-3.5L21 17" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setScheduleOn((v) => !v)}
                aria-pressed={scheduleOn}
                aria-label="Schedule for later"
                title="Schedule for later"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[color:var(--color-surface-sunk)] ${
                  scheduleOn
                    ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {targetsGbp && (
                <button
                  type="button"
                  onClick={() => setGbpOpen((v) => !v)}
                  aria-pressed={gbpOpen}
                  aria-label="Google options"
                  title="Google options — post type, button, event, offer"
                  className={`relative inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition hover:bg-[color:var(--color-surface-sunk)] ${
                    gbpOpen
                      ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  <BrandLogo id="googlebusiness" size={15} />
                  <span>Options</span>
                  {gbpCustomized && !gbpOpen && (
                    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
                  )}
                </button>
              )}

              <span className="flex-1" />

              <span className={`px-1.5 text-xs font-mono-num ${counterCls}`} title={`Characters left (limit ${charLimit})`}>
                {remaining}
              </span>

              <ActionButton variant="primary" size="sm" onClick={submit} disabled={!canSubmit}>
                {pending
                  ? 'Posting…'
                  : scheduleOn
                    ? 'Schedule post'
                    : selected.size > 1
                      ? `Post to ${selected.size} channels`
                      : 'Post now'}
              </ActionButton>
            </div>

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

          {/* Quiet footnotes under the card */}
          <p className="mt-2 text-xs text-gray-400">
            {selectedPlatforms.length > 1
              ? `Same text goes to every channel — counter shows the tightest limit (${charLimit}). `
              : ''}
            Drag a photo or video onto the card to attach it. Google Updates drop off your listing after about 7 days.
          </p>

          {error && (
            <p className="mt-3 rounded-[var(--r-md)] bg-rose-500/15 px-3 py-2 text-sm text-rose-700 dark:text-rose-300" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="mt-3 rounded-[var(--r-md)] bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
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
