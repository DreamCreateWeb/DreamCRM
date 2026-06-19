'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ClinicProfile } from '@/lib/db/schema/platform'
import type {
  ClinicStat,
  ClinicTestimonial,
  ClinicStaff,
  ClinicOfficePhoto,
  ClinicFaqItem,
  ClinicFinancingPartner,
  ClinicService,
} from '@/lib/types/clinic-content'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import ImageUploader from '@/components/ui/image-uploader'
import { ActionButton } from '@/components/ui/action-button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import StudioAiBar, { type UndoData } from './studio-ai-bar'
import RewriteWithAiButton from './rewrite-with-ai-button'
import HeroTaglineRewrite from './hero-tagline-rewrite'
import type { AiUsageSnapshot, GeneratedContent } from '@/lib/types/ai-website'
import { Field, TagListEditor, inputCls, textareaCls } from '@/components/ui/editor-kit'
import FocalPointPicker from '@/components/ui/focal-point-picker'
import LeadFormBuilder from './lead-form-builder'
import { resolveLeadForm, type LeadFormsConfig } from '@/lib/types/lead-forms'
import StatsEditor from '../settings/clinic/stats-editor'
import TestimonialsEditor from '../settings/clinic/testimonials-editor'
import StaffEditor from '../settings/clinic/staff-editor'
import OfficePhotosEditor from '../settings/clinic/office-photos-editor'
import FinancingPartnersEditor from '../settings/clinic/financing-partners-editor'
import FaqEditor from './faq-editor'
import HoursEditor from './hours-editor'
import ServicesLibraryPicker from '../settings/clinic/services-library-picker'
import {
  saveInlineField,
  saveImageField,
  saveStats,
  saveTestimonials,
  saveAbout,
  saveStaff,
  saveOfficePhotos,
  saveFaq,
  saveInsurance,
  savePaymentFinancing,
  saveDifferenceChips,
  saveLeadForm,
  saveHours,
  saveDifferenceVideo,
  type SectionResult,
} from './website-actions'
import { isValidVideoUrl } from '@/lib/website-url'

interface Props {
  slug: string
  siteUrl: string
  profile: ClinicProfile
  orgId: string
  library: ServiceLibraryEntryWithStatus[]
  initialAiUsage: AiUsageSnapshot
}

type Status = 'idle' | 'saving' | 'saved' | 'error'
// `stale` opens the refresh-to-edit fallback for an affordance this (older) tab
// can't render — an image field a newer deploy added that isn't in IMAGE_FIELDS.
type ModalState = { kind: 'image' | 'section' | 'stale'; field: string } | null

const IMAGE_FIELDS: Record<
  string,
  { label: string; folder: string; previewClass: string; hint: string; focalAspect?: string }
> = {
  heroImageUrl: {
    label: 'Hero image',
    folder: 'clinic-hero',
    previewClass: 'aspect-[3/1]',
    hint: 'A real interior or team shot — 16:9 or wider beats a stock smile.',
    focalAspect: 'aspect-[4/5]',
  },
  heroImageUrl2: {
    label: 'Second hero image',
    folder: 'clinic-hero',
    previewClass: 'aspect-[4/5] w-48',
    hint: 'The right-hand hero photo — a portrait-orientation shot of a person or your space works best.',
    focalAspect: 'aspect-[4/5]',
  },
  logoUrl: {
    label: 'Logo',
    folder: 'clinic-logos',
    previewClass: 'aspect-square w-40',
    hint: 'Square logo, 256×256 or larger. Leave blank (Remove) to fall back to a letter-mark.',
  },
}

/** Section modals that render an editor in a <form> and save via FormData. */
const FORM_SECTION_SAVES: Record<string, (fd: FormData) => Promise<SectionResult>> = {
  stats: saveStats,
  testimonials: saveTestimonials,
  about: saveAbout,
  staff: saveStaff,
  officePhotos: saveOfficePhotos,
  faq: saveFaq,
  acceptedInsuranceCarriers: saveInsurance,
  paymentFinancing: savePaymentFinancing,
  differenceChips: saveDifferenceChips,
  insurance_verifier: saveLeadForm,
  contact: saveLeadForm,
  hours: saveHours,
}

const SECTION_TITLES: Record<string, string> = {
  stats: 'Trust stats',
  differenceVideoUrl: 'Intro video',
  testimonials: 'Featured reviews',
  about: 'About your practice',
  staff: 'Meet the team',
  officePhotos: 'Office photos',
  faq: 'Frequently asked questions',
  acceptedInsuranceCarriers: 'Insurance carriers',
  paymentFinancing: 'Payment & financing',
  differenceChips: '“Why us” highlights',
  insurance_verifier: 'Insurance check form',
  contact: 'Contact form',
  hours: 'Office hours',
  services: 'Services',
  blog: 'Blog posts',
  careers: 'Job postings',
  dental_plans: 'Membership plans',
}

/**
 * Sections whose content lives in a dedicated manager (not clinic_profile), so
 * their modal is a link-out to that manager rather than an inline editor.
 */
const LINK_OUTS: Record<string, { href: string; cta: string; desc: string }> = {
  blog: {
    href: '/posts',
    cta: 'Open the blog manager',
    desc: 'Your blog posts — drafts, scheduling, and publishing — live in the blog manager, which has the full editor and a publishing calendar. Anything you publish there appears on your site automatically.',
  },
  careers: {
    href: '/careers',
    cta: 'Open the careers manager',
    desc: 'Your open roles and applicants live in the careers manager. Post, edit, or close roles there; published roles appear on your site (and Google for Jobs) automatically.',
  },
  dental_plans: {
    href: '/shop/memberships',
    cta: 'Open the membership manager',
    desc: 'Your in-house dental plans live in the membership manager — set pricing, benefits, and which plans are active. Active plans appear on your site automatically.',
  },
}

/**
 * Reduce a list of AI edits to the ordered, de-duplicated set of canvas "stops"
 * the Follow-along tour visits — one per distinct (page, anchor). Edits with no
 * anchor (nothing to flash on the canvas, e.g. a phone-number change) are
 * dropped, and a (page, anchor) seen earlier wins so we don't bounce back to a
 * spot we already flashed. Pure + exported so the tour/single-jump branch logic
 * is unit-testable without the iframe.
 */
export function tourStops(
  edits: { anchor: string | null; page: string }[],
): { anchor: string; page: string }[] {
  return edits
    .filter((e): e is { anchor: string; page: string } => !!e.anchor)
    .filter((e, i, arr) => arr.findIndex((x) => x.anchor === e.anchor && x.page === e.page) === i)
}

const btnPrimary =
  'inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition disabled:opacity-60'
const btnSecondary =
  'inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition'

/**
 * Website Studio — the full-screen, chrome-less editor. Hosts the clinic's real
 * site in an edit-mode iframe; the EditBridge inside drives inline text edits
 * and emits intents (save / editImage / openModal). The studio is the authed
 * half: it calls the server actions (persistence is always gated server-side),
 * reloads the canvas on success, and renders the image / section modals on top.
 */
export default function WebsiteStudio({ slug, siteUrl, profile, orgId, library, initialAiUsage }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  // AI usage + the one-click undo target are LIFTED here so the floating AI bar
  // and the per-section "Rewrite with AI" buttons share one monthly counter,
  // and so the Undo survives a section modal opening on top of the bar.
  const [aiUsage, setAiUsage] = useState<AiUsageSnapshot>(initialAiUsage)
  const [undoData, setUndoData] = useState<UndoData | null>(null)
  // The pending "Saved ✓ → idle" timer. Tracked so a second save can clear a
  // stale one — otherwise the old timer fires mid-save and flips the live
  // "Saving…" indicator back to idle while a write is still in flight.
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The page the OWNER is currently editing on the canvas. We track it from the
  // bridge's `ready` ping (fired on every page load in edit mode) so that when a
  // manual save cancels an in-flight AI tour, we reload the page they were on —
  // not wherever the tour had wandered. Path is relative to /site/<slug> ('' = home).
  const ownerPage = useRef<string>('')
  // Resolver for the next bridge `ready` ack — lets navigateFrame wait for the
  // canvas to actually be mounted before flashing, instead of a blind sleep.
  const readyResolve = useRef<(() => void) | null>(null)

  const currentCanvasPath = (): string => {
    const f = iframeRef.current
    try {
      const p = f?.contentWindow?.location.pathname ?? ''
      const m = p.match(new RegExp(`^/site/${slug}(/.*)?$`))
      return m?.[1] ?? ''
    } catch {
      return ''
    }
  }

  const reloadFrame = (pagePath?: string) => {
    const f = iframeRef.current
    if (!f) return
    // Reload the iframe's CURRENT page — the clinic may have navigated to a
    // subpage in edit mode, so resetting `src` (the homepage) would bounce
    // them off it. Same-origin, so reading contentWindow is allowed. When an
    // explicit page is given (tour-cancel recovery), load THAT page instead.
    if (pagePath !== undefined) {
      const path = pagePath && pagePath !== '/' ? pagePath : ''
      const url = `/site/${slug}${path}?edit=1`
      try {
        f.contentWindow!.location.assign(url)
      } catch {
        f.src = url
      }
      return
    }
    try {
      f.contentWindow?.location.reload()
    } catch {
      f.src = f.src
    }
  }

  // "Follow the AI": bring the canvas to the most-affected page and pass the
  // changed element as `?reveal=` so the EditBridge scrolls to + flashes it.
  // The `_` nonce forces a fresh load even when the page is unchanged. The edits
  // are already persisted + revalidated server-side, so the load shows them.
  const navigateFrame = (page: string, anchor?: string | null) => {
    const f = iframeRef.current
    if (!f) return
    const path = page && page !== '/' ? page : ''
    const params = new URLSearchParams({ edit: '1' })
    if (anchor) params.set('reveal', anchor)
    params.set('_', String(Date.now()))
    const url = `/site/${slug}${path}?${params.toString()}`
    try {
      f.contentWindow!.location.assign(url)
    } catch {
      f.src = url
    }
  }

  // Resolve once the next `ready` ack lands, or after `timeoutMs` as a fallback
  // (a page that fails to ping shouldn't stall the whole tour).
  const waitForReady = (timeoutMs: number) =>
    new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        readyResolve.current = null
        resolve()
      }
      readyResolve.current = finish
      window.setTimeout(finish, timeoutMs)
    })

  // Flash a changed element in place (no reload) — used while touring same-page
  // edits so the page visibly morphs change-by-change.
  const postReveal = (field: string) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { source: 'dreamcrm-studio', type: 'reveal', field },
        window.location.origin,
      )
    } catch {
      /* cross-origin guard — never happens (same origin) */
    }
  }

  // Swap an image's `src` in place so the new photo shows the instant the save
  // lands, before the (also-issued) reload re-renders the page. The EditBridge
  // applies it to the matching `[data-edit-field]` <img>.
  const postSetImage = (field: string, url: string) => {
    if (!url) return
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { source: 'dreamcrm-studio', type: 'setImage', field, url },
        window.location.origin,
      )
    } catch {
      /* cross-origin guard — never happens (same origin) */
    }
  }

  // Restore a failed inline edit's original text in place (item: inline-save
  // failure reverts the element) — keeps the no-reload behaviour for other edits.
  const postRestore = (field: string) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { source: 'dreamcrm-studio', type: 'restore', field },
        window.location.origin,
      )
    } catch {
      /* same-origin guard */
    }
  }

  // Confirm a saved inline edit so the bridge can flash a saving→saved tick on
  // the element (in the window before the canvas reload re-renders it).
  const postSaved = (field: string) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { source: 'dreamcrm-studio', type: 'saved', field },
        window.location.origin,
      )
    } catch {
      /* same-origin guard */
    }
  }

  // A monotonically-increasing token so a new edit cancels a still-running tour.
  const tourSeq = useRef(0)
  // Abandon any in-flight AI tour. Bumping the token makes the running loop bail
  // on its next `tourSeq.current !== mine` check, so a manual save's reload (or
  // an Undo) never fights the tour still navigating the canvas underneath it.
  const cancelTour = () => {
    tourSeq.current++
  }

  async function runTour(stops: { page: string; anchor: string }[]) {
    const mine = ++tourSeq.current
    let cur = ''
    for (let i = 0; i < stops.length; i++) {
      if (tourSeq.current !== mine) return // a newer edit started — abandon this tour
      const s = stops[i]
      if (s.page !== cur) {
        navigateFrame(s.page, s.anchor) // full load + on-load reveal/flash
        cur = s.page
        // Gate on the canvas actually mounting (bridge `ready` ack) instead of a
        // blind sleep, with a generous timeout fallback so a slow/failed load
        // can't hang the tour. A small settle pause lets the flash read.
        await waitForReady(2500)
        if (tourSeq.current !== mine) return
        await new Promise<void>((r) => window.setTimeout(r, 450))
      } else {
        postReveal(s.anchor) // same page — just scroll + flash the next change
        await new Promise<void>((r) => window.setTimeout(r, 1050))
      }
    }
  }

  // After an AI edit: follow off → keep the canvas current without moving;
  // follow on → tour the canvas through each change (flashing each in turn) so
  // the page visibly morphs. A single change is just one jump + flash.
  const onAiApplied = (opts: {
    page: string
    anchor: string | null
    edits: { anchor: string | null; page: string }[]
    follow: boolean
  }) => {
    // A fresh AI result (or an Undo) supersedes any tour still running from the
    // previous edit. runTour bumps the token itself, but the single-jump and
    // follow-off branches below don't — so cancel here to cover every path.
    cancelTour()
    if (!opts.follow) {
      reloadFrame()
      return
    }
    const stops = tourStops(opts.edits)
    if (stops.length <= 1) {
      navigateFrame(opts.page, opts.anchor)
      return
    }
    void runTour(stops)
  }

  async function persist(
    fn: () => Promise<SectionResult>,
    onOkBeforeReload?: () => void,
  ): Promise<SectionResult> {
    // A manual save and a running AI tour both drive the canvas. Remember where
    // the owner actually is BEFORE cancelling the tour, so the post-save reload
    // lands on their page rather than wherever the tour had navigated to.
    const wasTouring = tourSeq.current > 0
    const ownerAt = ownerPage.current
    cancelTour()
    // Clear a stale "→ idle" timer from a previous save so it can't fire mid-
    // write and flip the live "Saving…" indicator back to idle.
    if (savedTimer.current) {
      clearTimeout(savedTimer.current)
      savedTimer.current = null
    }
    setStatus('saving')
    setErrorMsg(null)
    const res = await fn()
    if (res.ok) {
      setStatus('saved')
      // Fire any pre-reload hook (e.g. the inline saved-tick) while the canvas
      // still holds the edited element, before the reload re-renders it.
      onOkBeforeReload?.()
      savedTimer.current = setTimeout(() => {
        setStatus('idle')
        savedTimer.current = null
      }, 1800)
      // If a tour was mid-flight, the canvas may be parked on a tour page — bring
      // it back to the owner's page. Otherwise just reload in place.
      if (wasTouring && currentCanvasPath() !== ownerAt) reloadFrame(ownerAt)
      else reloadFrame()
    } else {
      setStatus('error')
      setErrorMsg(res.error)
      // Don't reload on error — the canvas already holds the owner's in-progress
      // edits (e.g. other open inline fields); reloading would silently discard
      // them. Only a confirmed save refreshes the canvas.
    }
    return res
  }

  useEffect(() => {
    const origin = window.location.origin
    async function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return
      const d = e.data as { source?: string; type?: string; field?: string; value?: string }
      if (!d || d.source !== 'dreamcrm-edit') return
      if (d.type === 'ready') {
        // Track the owner's current page + release any tour waiter.
        ownerPage.current = currentCanvasPath()
        readyResolve.current?.()
      } else if (d.type === 'save' && d.field) {
        const field = d.field
        const res = await persist(
          () => saveInlineField(field, d.value ?? ''),
          () => postSaved(field), // saved-tick before the reload re-renders
        )
        // On failure, restore the element's pre-edit text in the canvas so the
        // owner doesn't see an unsaved value masquerading as saved.
        if (!res.ok) postRestore(field)
      } else if (d.type === 'editImage' && d.field) {
        // Unknown image field from a newer deploy → refresh-to-edit, not a blank modal.
        setModal({ kind: IMAGE_FIELDS[d.field] ? 'image' : 'stale', field: d.field })
      } else if (d.type === 'openModal' && d.field) {
        setModal({ kind: 'section', field: d.field })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drop any pending saved-state timer if the Studio unmounts mid-save.
  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-900">
      <div className="aura-chrome h-12 shrink-0 flex items-center justify-between gap-3 px-4 bg-gray-900 text-gray-100 border-b border-[color:var(--color-hairline-strong)]">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="text-sm text-gray-300 hover:text-white whitespace-nowrap">
            ← Exit
          </Link>
          <button
            type="button"
            onClick={() => {
              const f = iframeRef.current
              if (!f) return
              const home = `/site/${slug}?edit=1`
              try {
                f.contentWindow!.location.assign(home)
              } catch {
                f.src = home
              }
            }}
            className="text-sm text-gray-300 hover:text-white whitespace-nowrap"
            title="Return to your homepage (the logo isn't clickable in edit mode)"
          >
            🏠 Home
          </button>
          <span className="text-sm font-semibold whitespace-nowrap">Editing your website</span>
          <span className="hidden sm:inline text-xs text-gray-300 truncate">
            Click text to edit it · hover a section for its “Edit” button · click the hero image to replace it.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status === 'saving' && <span className="text-xs text-gray-300">Saving…</span>}
          {status === 'saved' && <span className="text-xs text-emerald-400">Saved ✓ live</span>}
          {status === 'error' && (
            <span className="text-xs text-rose-400 max-w-[16rem] truncate">{errorMsg ?? 'Could not save'}</span>
          )}
          {/* Hero tagline rewrite — the tagline edits inline (no modal), so its
              AI affordance lives in the top bar, presenting the draft for review
              before it saves. */}
          <HeroTaglineRewrite
            currentTagline={profile.tagline ?? null}
            usage={aiUsage}
            onUsage={setAiUsage}
            onSaved={() => reloadFrame()}
          />
          <Link href="/settings/clinic" className="hidden sm:inline text-xs text-gray-300 hover:text-white">
            Advanced edits
          </Link>
          <ActionButton variant="secondary" size="sm" href={siteUrl} target="_blank">
            View live ↗
          </ActionButton>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src={`/site/${slug}?edit=1`}
        title="Your website — edit mode"
        className="flex-1 w-full border-0 bg-white"
      />

      {/* The AI command bar stays MOUNTED while a modal is open (CSS-hidden) so
          its done-panel + one-click Undo survive opening a section editor. */}
      <StudioAiBar
        onApplied={onAiApplied}
        usage={aiUsage}
        onUsage={setAiUsage}
        undoData={undoData}
        onUndoData={setUndoData}
        hidden={!!modal}
      />

      {modal && (
        <StudioModal
          modal={modal}
          profile={profile}
          orgId={orgId}
          library={library}
          aiUsage={aiUsage}
          onAiUsage={setAiUsage}
          onClose={() => setModal(null)}
          persist={persist}
          reload={reloadFrame}
          onImageSaved={postSetImage}
        />
      )}
    </div>
  )
}

function StudioModal({
  modal,
  profile,
  orgId,
  library,
  aiUsage,
  onAiUsage,
  onClose,
  persist,
  reload,
  onImageSaved,
}: {
  modal: NonNullable<ModalState>
  profile: ClinicProfile
  orgId: string
  library: ServiceLibraryEntryWithStatus[]
  aiUsage: AiUsageSnapshot
  onAiUsage: (next: AiUsageSnapshot) => void
  onClose: () => void
  persist: (fn: () => Promise<SectionResult>) => Promise<SectionResult>
  reload: () => void
  /** Instant in-canvas image swap once an image save lands (before the reload). */
  onImageSaved: (field: string, url: string) => void
}) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(
    modal.kind === 'image' ? ((profile[modal.field as keyof ClinicProfile] as string | null) ?? null) : null,
  )
  const [position, setPosition] = useState<string>(
    modal.kind === 'image'
      ? (((profile.imagePositions as Record<string, string> | null) ?? {})[modal.field] ?? '50% 50%')
      : '50% 50%',
  )
  const [videoUrl, setVideoUrl] = useState<string>(
    modal.kind === 'section' && modal.field === 'differenceVideoUrl'
      ? ((profile.differenceVideoUrl as string | null) ?? '')
      : '',
  )
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  const videoFileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const videoUploadHandle = useRef<{ cancel: () => void } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Dirty tracking: each editor reports whether the owner has changed anything,
  // so closing (ESC / backdrop / X / Cancel) can confirm before discarding.
  const [dirty, setDirty] = useState(false)
  // AI draft → re-key the editor so an uncontrolled editor re-reads its default.
  // The draft fills the form for REVIEW (never auto-saved); the owner still hits Save.
  const [aiDraft, setAiDraft] = useState<GeneratedContent | null>(null)
  const [aiNonce, setAiNonce] = useState(0)
  // differenceVideoUrl tracks its own dirtiness via videoUrl vs the initial.
  const initialVideo = useRef(
    modal.kind === 'section' && modal.field === 'differenceVideoUrl'
      ? ((profile.differenceVideoUrl as string | null) ?? '')
      : '',
  )

  // A close that respects unsaved work.
  async function requestClose() {
    if (busy || uploading) return
    if (dirty && !(await confirm({ title: 'Discard unsaved changes?', message: 'Any edits you haven’t saved will be lost.', confirmLabel: 'Discard', danger: true }))) return
    onClose()
  }

  // ESC closes the modal — matching the backdrop-click affordance (the two were
  // inconsistent before: only backdrop closed). Held off while a save or upload
  // is in flight so an accidental ESC can't drop work mid-write, and routed
  // through the dirty-confirm. Inline contentEditable lives in the iframe, not
  // here, so there's no conflict.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy && !uploading) {
        e.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, uploading, dirty])

  // Direct video upload — reuses the auth-gated /api/upload route (S3), the
  // same path ImageUploader uses, now with progress + cancel. On success the
  // resolved URL fills the URL field, so upload and paste-a-URL converge.
  async function handleVideoFile(file: File) {
    setUploadError(null)
    if (!file.type.startsWith('video/')) {
      setUploadError('Please choose a video file (MP4, MOV, or WebM).')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('That video is over 50MB — trim it, or paste a hosted URL instead.')
      return
    }
    setUploading(true)
    setUploadProgress(0)
    const { uploadFileWithProgress, UploadCancelledError } = await import('@/lib/upload-with-progress')
    const handle = uploadFileWithProgress(file, 'clinic-video', setUploadProgress)
    videoUploadHandle.current = handle
    try {
      const url = await handle.promise
      setVideoUrl(url)
      setDirty(true)
    } catch (e) {
      if (!(e instanceof UploadCancelledError)) {
        setUploadError(e instanceof Error ? e.message : 'Upload failed')
      }
    } finally {
      setUploading(false)
      videoUploadHandle.current = null
    }
  }

  const imageCfg = modal.kind === 'image' ? IMAGE_FIELDS[modal.field] : null
  const isStale = modal.kind === 'stale'
  const title = isStale
    ? 'Refresh to edit'
    : modal.kind === 'image'
      ? `Replace ${imageCfg?.label ?? 'image'}`
      : (SECTION_TITLES[modal.field] ?? 'Edit section')
  // Services embeds the autosaving library picker — it persists each change
  // itself, so the modal just shows a "Done" button that reloads the canvas.
  const isServices = modal.kind === 'section' && modal.field === 'services'
  // Blog management lives in the full /blog manager (editor + scheduling
  // calendar), so its modal is a link-out rather than an inline form.
  const isLinkOut = modal.kind === 'section' && !!LINK_OUTS[modal.field]
  // Content-heavy repeater editors get a wider sheet so cards aren't cramped.
  const WIDE_FIELDS = new Set([
    'staff', 'faq', 'testimonials', 'stats', 'officePhotos', 'hours',
    'paymentFinancing', 'insurance_verifier', 'contact',
  ])
  const isWide = isServices || (modal.kind === 'section' && WIDE_FIELDS.has(modal.field))

  // Whether this section's editor reports dirtiness via a changed-flag form. The
  // editors don't all emit one, so we treat any `change`/`input` event in the
  // form region as "dirty" — a pragmatic, false-positive-safe signal.
  const onFormChanged = () => setDirty(true)

  async function onSave() {
    setBusy(true)
    let res: SectionResult
    if (modal.kind === 'image') {
      res = await persist(() => saveImageField(modal.field, imageUrl ?? '', position))
      // Show the new photo instantly in the canvas (the reload also re-renders
      // it, but this avoids a flash of the old image while the page reloads).
      if (res.ok && imageUrl) onImageSaved(modal.field, imageUrl)
    } else if (modal.field === 'differenceVideoUrl') {
      // Client-side URL-shape guard before the round-trip (server re-validates).
      if (!isValidVideoUrl(videoUrl)) {
        setUploadError('Enter a valid video link (https://…) or upload a file.')
        setBusy(false)
        return
      }
      res = await persist(() => saveDifferenceVideo(videoUrl))
    } else if (FORM_SECTION_SAVES[modal.field]) {
      const save = FORM_SECTION_SAVES[modal.field]
      const fd = new FormData(formRef.current!)
      res = await persist(() => save(fd))
    } else {
      res = { ok: false, error: 'This section isn’t editable yet' }
    }
    setBusy(false)
    if (res.ok) {
      setDirty(false)
      onClose()
    }
  }

  // Apply an AI draft to the open editor's fields (review-then-Save). Re-keying
  // the editor makes the uncontrolled field re-read its (new) default value.
  function applyAiDraft(content: GeneratedContent) {
    setAiDraft(content)
    setAiNonce((n) => n + 1)
    setDirty(true)
  }

  // Compute the effective defaultValue for editors that can be AI-filled.
  const aboutDefault =
    aiDraft?.section === 'about' ? aiDraft.about : (profile.about ?? '')
  const statsDefault: ClinicStat[] | null =
    aiDraft?.section === 'stats'
      ? aiDraft.stats.map((s, i) => ({ id: `stat_${i}`, value: s.value, label: s.label }))
      : ((profile.stats as ClinicStat[] | null) ?? null)
  const faqDefault: ClinicFaqItem[] | null =
    aiDraft?.section === 'faq'
      ? aiDraft.faq.map((f, i) => ({ id: `faq_${i}`, category: f.category, question: f.question, answer: f.answer }))
      : ((profile.faq as ClinicFaqItem[] | null) ?? null)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[color:var(--color-ink-900)]/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div
        className={`w-full ${isWide ? 'max-w-2xl' : 'max-w-lg'} max-h-[88vh] flex flex-col overflow-hidden rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] shadow-[var(--shadow-modal)]`}
      >
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[color:var(--color-hairline)]">
          <h2 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
            className="-mr-1.5 w-8 h-8 inline-flex items-center justify-center rounded-[var(--r-md)] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
              <path d="M6 6l8 8M14 6l-8 8" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {isStale && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                This editor was added in a newer version of the Studio than this tab is running.
                Refresh to pick it up — your saved edits are safe.
              </p>
              <ActionButton variant="primary" size="sm" onClick={() => window.location.reload()}>
                Refresh to edit
              </ActionButton>
            </div>
          )}
          {modal.kind === 'image' && imageCfg && (
            <>
              <ImageUploader
                name={modal.field}
                defaultValue={imageUrl}
                folder={imageCfg.folder}
                label={imageCfg.label}
                hint={imageCfg.hint}
                previewClass={imageCfg.previewClass}
                onChange={(u) => {
                  setImageUrl(u)
                  setDirty(true)
                }}
              />
              {imageCfg.focalAspect && imageUrl && (
                <div className="mt-4 pt-4 border-t border-[color:var(--color-hairline)]">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                    Focus point
                  </label>
                  <FocalPointPicker
                    src={imageUrl}
                    aspectClass={imageCfg.focalAspect}
                    value={position}
                    onChange={(p) => {
                      setPosition(p)
                      setDirty(true)
                    }}
                  />
                </div>
              )}
            </>
          )}
          {modal.kind === 'section' && modal.field === 'stats' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Three short trust signals shown under your hero — “8,000+ five-star reviews,”
                “Same-week appointments,” “Most insurance accepted.”
              </p>
              <div className="mb-3">
                <RewriteWithAiButton section="stats" usage={aiUsage} onUsage={onAiUsage} onContent={applyAiDraft} />
              </div>
              <StatsEditor key={`stats-${aiNonce}`} name="stats" defaultValue={statsDefault} />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'testimonials' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Patient quotes shown on your homepage. Reviews submitted through the Reviews
                module can be featured here too — and you can add your own.
              </p>
              <TestimonialsEditor
                name="testimonials"
                defaultValue={(profile.testimonials as ClinicTestimonial[] | null) ?? null}
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'about' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Your story — who you are, your approach, and what patients can expect. A few
                short paragraphs work best.
              </p>
              <div className="mb-3">
                <RewriteWithAiButton section="about" usage={aiUsage} onUsage={onAiUsage} onContent={applyAiDraft} />
              </div>
              <textarea
                key={`about-${aiNonce}`}
                name="about"
                defaultValue={aboutDefault}
                rows={10}
                placeholder="We're a family-first dental practice…"
                className={textareaCls}
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'staff' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                The people patients will meet. Add a photo, name, title, and a short bio for
                each — they appear on your homepage and the Team page.
              </p>
              <StaffEditor name="staff" defaultValue={(profile.staff as ClinicStaff[] | null) ?? null} />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'officePhotos' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                A few warm shots of your space — the waiting room, an operatory, the front
                desk. They appear in your office-tour gallery.
              </p>
              <OfficePhotosEditor
                name="officePhotos"
                defaultValue={(profile.officePhotos as ClinicOfficePhoto[] | null) ?? null}
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'faq' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Questions patients ask before booking — insurance, first visits, billing,
                anxiety. They’re grouped by category on your FAQ page.
              </p>
              <div className="mb-3">
                <RewriteWithAiButton section="faq" usage={aiUsage} onUsage={onAiUsage} onContent={applyAiDraft} />
              </div>
              <FaqEditor key={`faq-${aiNonce}`} name="faq" defaultValue={faqDefault} />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'acceptedInsuranceCarriers' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                The insurance carriers you accept. They appear on your homepage Insurance band
                and Insurance page. Leave blank to show “call to verify.”
              </p>
              <TagListEditor
                name="acceptedInsuranceCarriers"
                defaultValue={(profile.acceptedInsuranceCarriers as string[] | null) ?? []}
                placeholder="Delta Dental, Cigna, Aetna…"
                addLabel="Add a carrier…"
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'differenceChips' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                The short “Why us” highlight chips next to your homepage intro. Leave blank to
                auto-build from your top services + standard reassurances (“No judgment, ever,”
                “Same-week visits,” …).
              </p>
              <TagListEditor
                name="differenceChips"
                defaultValue={(profile.differenceChips as string[] | null) ?? []}
                placeholder="Family dental care, Same-week visits…"
                addLabel="Add a highlight…"
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'insurance_verifier' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                The fields on your “Check your insurance” form. Add, remove, reorder, or
                rename fields. Keep an email or phone so you can reach the lead — the carrier
                and service dropdowns pull their options from your live lists.
              </p>
              <LeadFormBuilder
                formKey="insurance_verifier"
                defaultValue={resolveLeadForm(
                  (profile.leadForms as LeadFormsConfig | null) ?? null,
                  'insurance_verifier',
                )}
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'contact' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                The fields on your homepage contact form. Add, remove, reorder, or rename
                fields. Keep a phone or email so you can reach the lead. Submissions land in
                your Leads queue.
              </p>
              <LeadFormBuilder
                formKey="contact"
                defaultValue={resolveLeadForm(
                  (profile.leadForms as LeadFormsConfig | null) ?? null,
                  'contact',
                )}
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'paymentFinancing' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged} className="space-y-5">
              <Field label="Payment methods">
                <TagListEditor
                  name="paymentMethods"
                  defaultValue={(profile.paymentMethods as string[] | null) ?? []}
                  placeholder="Cash, Credit cards, HSA / FSA…"
                  addLabel="Add a method…"
                />
              </Field>
              <Field
                label="Financing partners"
                hint="Only partners you actually work with — the section hides when empty."
              >
                <FinancingPartnersEditor
                  name="financingPartners"
                  defaultValue={(profile.financingPartners as ClinicFinancingPartner[] | null) ?? null}
                />
              </Field>
              <Field label="Cancellation policy" hint="Leave blank to hide — no fake fees.">
                <textarea
                  name="cancellationPolicy"
                  defaultValue={(profile.cancellationPolicy as string | null) ?? ''}
                  rows={4}
                  placeholder="We ask for 48 hours’ notice to reschedule…"
                  className={textareaCls}
                />
              </Field>
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'hours' && (
            <form ref={formRef} onChange={onFormChanged} onInput={onFormChanged}>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Your weekly office hours, shown in the footer of every page. Check “Closed” for
                days you’re not open.
              </p>
              <HoursEditor
                defaultValue={
                  (profile.hours as Record<
                    string,
                    { open?: string | null; close?: string | null; closed?: boolean }
                  > | null) ?? null
                }
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'services' && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                The services shown across your site. Add from the library, reorder, swap
                photos, or rewrite copy with AI — each change saves automatically.
              </p>
              <ServicesLibraryPicker
                name="services"
                initialServices={(profile.services as ClinicService[] | null) ?? []}
                library={library}
                orgId={orgId}
                clinicName={profile.displayName ?? ''}
                city={profile.city ?? null}
              />
            </div>
          )}
          {modal.kind === 'section' && modal.field === 'differenceVideoUrl' && (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                A short, muted, looping clip that plays in your “Why us?” section. Upload one
                from your computer, or paste a direct video URL. Leave it blank to show a photo
                there instead.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => videoFileRef.current?.click()}
                  disabled={uploading}
                  className="btn-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-gray-800 dark:text-gray-300 disabled:opacity-60"
                >
                  {uploading
                    ? `Uploading… ${uploadProgress}%`
                    : videoUrl
                      ? 'Upload a different video'
                      : 'Upload a video'}
                </button>
                {uploading && (
                  <button
                    type="button"
                    onClick={() => videoUploadHandle.current?.cancel()}
                    className="btn-sm text-gray-500 hover:text-rose-600"
                  >
                    Cancel
                  </button>
                )}
                {videoUrl && !uploading && (
                  <button
                    type="button"
                    onClick={() => {
                      setVideoUrl('')
                      setDirty(true)
                    }}
                    className="btn-sm text-rose-500 hover:text-rose-600"
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={videoFileRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleVideoFile(file)
                    e.target.value = ''
                  }}
                />
              </div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                …or paste a video URL
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => {
                  setVideoUrl(e.target.value)
                  setDirty(e.target.value !== initialVideo.current)
                }}
                placeholder="https://…/clinic-intro.mp4"
                className={`${inputCls} ${!isValidVideoUrl(videoUrl) ? 'border-rose-400 focus:ring-rose-300' : ''}`}
                aria-invalid={!isValidVideoUrl(videoUrl)}
              />
              {!isValidVideoUrl(videoUrl) && (
                <p className="text-xs text-rose-600 mt-1" role="alert">
                  That doesn’t look like a valid link — use https://… or upload a file.
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                MP4, MOV, or WebM · up to 50MB · short, muted &amp; looping looks best.
              </p>
              {uploadError && <p className="text-xs text-rose-600 mt-2" role="alert">{uploadError}</p>}
              {videoUrl.trim() && (
                <video
                  key={videoUrl}
                  src={videoUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  className="mt-3 w-full max-h-48 object-cover rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)]"
                />
              )}
            </div>
          )}
          {modal.kind === 'section' && LINK_OUTS[modal.field] && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {LINK_OUTS[modal.field].desc}
              </p>
              <a
                href={LINK_OUTS[modal.field].href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-sm inline-flex bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300"
              >
                {LINK_OUTS[modal.field].cta} ↗
              </a>
            </div>
          )}
          {modal.kind === 'section' && !SECTION_TITLES[modal.field] && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                This editor was added in a newer version of the Studio than this tab is running.
                Refresh to pick it up — your saved edits are safe.
              </p>
              <ActionButton variant="primary" size="sm" onClick={() => window.location.reload()}>
                Refresh to edit
              </ActionButton>
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2.5 px-5 sm:px-6 py-3.5 border-t border-[color:var(--color-hairline)] bg-[color:var(--color-surface-sunk)]">
          {isStale ? (
            <button type="button" onClick={onClose} className={btnSecondary}>
              Close
            </button>
          ) : isServices ? (
            <button type="button" onClick={() => { reload(); onClose() }} className={btnPrimary}>
              Done
            </button>
          ) : isLinkOut ? (
            <button type="button" onClick={onClose} className={btnPrimary}>
              Close
            </button>
          ) : (
            <>
              <button type="button" onClick={requestClose} className={btnSecondary}>
                Cancel
              </button>
              <button type="button" onClick={onSave} disabled={busy} className={btnPrimary}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
