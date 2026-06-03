'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ClinicProfile } from '@/lib/db/schema/platform'
import type { ClinicStat, ClinicTestimonial, ClinicStaff, ClinicOfficePhoto } from '@/lib/types/clinic-content'
import ImageUploader from '@/components/ui/image-uploader'
import StatsEditor from '../settings/clinic/stats-editor'
import TestimonialsEditor from '../settings/clinic/testimonials-editor'
import StaffEditor from '../settings/clinic/staff-editor'
import OfficePhotosEditor from '../settings/clinic/office-photos-editor'
import {
  saveInlineField,
  saveStats,
  saveTestimonials,
  saveAbout,
  saveStaff,
  saveOfficePhotos,
  type SectionResult,
} from './website-actions'

interface Props {
  slug: string
  siteUrl: string
  profile: ClinicProfile
}

type Status = 'idle' | 'saving' | 'saved' | 'error'
type ModalState = { kind: 'image' | 'section'; field: string } | null

const IMAGE_FIELDS: Record<string, { label: string; folder: string; previewClass: string; hint: string }> = {
  heroImageUrl: {
    label: 'Hero image',
    folder: 'clinic-hero',
    previewClass: 'aspect-[3/1]',
    hint: 'A real interior or team shot — 16:9 or wider beats a stock smile.',
  },
  logoUrl: {
    label: 'Logo',
    folder: 'clinic-logos',
    previewClass: 'aspect-square w-40',
    hint: 'Square logo, 256×256 or larger.',
  },
}

/** Section modals that render an editor in a <form> and save via FormData. */
const FORM_SECTION_SAVES: Record<string, (fd: FormData) => Promise<SectionResult>> = {
  stats: saveStats,
  testimonials: saveTestimonials,
  about: saveAbout,
  staff: saveStaff,
  officePhotos: saveOfficePhotos,
}

const SECTION_TITLES: Record<string, string> = {
  stats: 'Trust stats',
  differenceVideoUrl: 'Intro video',
  testimonials: 'Featured reviews',
  about: 'About your practice',
  staff: 'Meet the team',
  officePhotos: 'Office photos',
}

/**
 * Website Studio — the full-screen, chrome-less editor. Hosts the clinic's real
 * site in an edit-mode iframe; the EditBridge inside drives inline text edits
 * and emits intents (save / editImage / openModal). The studio is the authed
 * half: it calls the server actions (persistence is always gated server-side),
 * reloads the canvas on success, and renders the image / section modals on top.
 */
export default function WebsiteStudio({ slug, siteUrl, profile }: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)

  const reloadFrame = () => {
    const f = iframeRef.current
    if (!f) return
    // Reload the iframe's CURRENT page — the clinic may have navigated to a
    // subpage in edit mode, so resetting `src` (the homepage) would bounce
    // them off it. Same-origin, so reading contentWindow is allowed.
    try {
      f.contentWindow?.location.reload()
    } catch {
      f.src = f.src
    }
  }

  async function persist(fn: () => Promise<SectionResult>): Promise<SectionResult> {
    setStatus('saving')
    setErrorMsg(null)
    const res = await fn()
    if (res.ok) {
      setStatus('saved')
      window.setTimeout(() => setStatus('idle'), 1800)
      reloadFrame()
    } else {
      setStatus('error')
      setErrorMsg(res.error)
      reloadFrame()
    }
    return res
  }

  useEffect(() => {
    const origin = window.location.origin
    async function onMessage(e: MessageEvent) {
      if (e.origin !== origin) return
      const d = e.data as { source?: string; type?: string; field?: string; value?: string }
      if (!d || d.source !== 'dreamcrm-edit') return
      if (d.type === 'save' && d.field) {
        await persist(() => saveInlineField(d.field!, d.value ?? ''))
      } else if (d.type === 'editImage' && d.field) {
        setModal({ kind: 'image', field: d.field })
      } else if (d.type === 'openModal' && d.field) {
        setModal({ kind: 'section', field: d.field })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-stone-900">
      <div className="h-12 shrink-0 flex items-center justify-between gap-3 px-4 bg-stone-900 text-stone-100 border-b border-stone-700">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="text-sm text-stone-300 hover:text-white whitespace-nowrap">
            ← Exit
          </Link>
          <span className="text-sm font-semibold whitespace-nowrap">Editing your website</span>
          <span className="hidden sm:inline text-[11px] text-stone-400 truncate">
            Click text to edit it · hover a section for its “Edit” button · click the hero image to replace it.
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status === 'saving' && <span className="text-[12px] text-stone-300">Saving…</span>}
          {status === 'saved' && <span className="text-[12px] text-emerald-400">Saved ✓ live</span>}
          {status === 'error' && (
            <span className="text-[12px] text-rose-400 max-w-[16rem] truncate">{errorMsg ?? 'Could not save'}</span>
          )}
          <Link href="/settings/clinic" className="hidden sm:inline text-[12px] text-stone-300 hover:text-white">
            Advanced edits
          </Link>
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-semibold px-3 py-1 rounded bg-white text-stone-900 hover:bg-stone-100"
          >
            View live ↗
          </a>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src={`/site/${slug}?edit=1`}
        title="Your website — edit mode"
        className="flex-1 w-full border-0 bg-white"
      />

      {modal && (
        <StudioModal
          modal={modal}
          profile={profile}
          onClose={() => setModal(null)}
          persist={persist}
        />
      )}
    </div>
  )
}

function StudioModal({
  modal,
  profile,
  onClose,
  persist,
}: {
  modal: NonNullable<ModalState>
  profile: ClinicProfile
  onClose: () => void
  persist: (fn: () => Promise<SectionResult>) => Promise<SectionResult>
}) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(
    modal.kind === 'image' ? ((profile[modal.field as keyof ClinicProfile] as string | null) ?? null) : null,
  )
  const [videoUrl, setVideoUrl] = useState<string>(
    modal.kind === 'section' && modal.field === 'differenceVideoUrl'
      ? ((profile.differenceVideoUrl as string | null) ?? '')
      : '',
  )
  const [busy, setBusy] = useState(false)
  const videoFileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Direct video upload — reuses the auth-gated /api/upload route (S3), the
  // same path ImageUploader uses. On success the resolved URL fills the URL
  // field, so upload and paste-a-URL converge on one value to save.
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
    try {
      const fd = new FormData()
      fd.set('file', file)
      fd.set('folder', 'clinic-video')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(b.error ?? 'Upload failed')
      }
      const { url } = (await res.json()) as { url: string }
      setVideoUrl(url)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const imageCfg = modal.kind === 'image' ? IMAGE_FIELDS[modal.field] : null
  const title =
    modal.kind === 'image'
      ? `Replace ${imageCfg?.label ?? 'image'}`
      : (SECTION_TITLES[modal.field] ?? 'Edit section')

  async function onSave() {
    setBusy(true)
    let res: SectionResult
    if (modal.kind === 'image') {
      res = await persist(() => saveInlineField(modal.field, imageUrl ?? ''))
    } else if (modal.field === 'differenceVideoUrl') {
      res = await persist(() => saveInlineField('differenceVideoUrl', videoUrl))
    } else if (FORM_SECTION_SAVES[modal.field]) {
      const save = FORM_SECTION_SAVES[modal.field]
      const fd = new FormData(formRef.current!)
      res = await persist(() => save(fd))
    } else {
      res = { ok: false, error: 'This section isn’t editable yet' }
    }
    setBusy(false)
    if (res.ok) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-2xl bg-white dark:bg-stone-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700/60">
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          {modal.kind === 'image' && imageCfg && (
            <ImageUploader
              name={modal.field}
              defaultValue={imageUrl}
              folder={imageCfg.folder}
              label={imageCfg.label}
              hint={imageCfg.hint}
              previewClass={imageCfg.previewClass}
              onChange={(u) => setImageUrl(u)}
            />
          )}
          {modal.kind === 'section' && modal.field === 'stats' && (
            <form ref={formRef}>
              <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-3">
                Three short trust signals shown under your hero — “8,000+ five-star reviews,”
                “Same-week appointments,” “Most insurance accepted.”
              </p>
              <StatsEditor
                name="stats"
                defaultValue={(profile.stats as ClinicStat[] | null) ?? null}
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'testimonials' && (
            <form ref={formRef}>
              <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-3">
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
            <form ref={formRef}>
              <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-3">
                Your story — who you are, your approach, and what patients can expect. A few
                short paragraphs work best.
              </p>
              <textarea
                name="about"
                defaultValue={profile.about ?? ''}
                rows={10}
                placeholder="We're a family-first dental practice…"
                className="form-textarea w-full text-sm"
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'staff' && (
            <form ref={formRef}>
              <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-3">
                The people patients will meet. Add a photo, name, title, and a short bio for
                each — they appear on your homepage and the Team page.
              </p>
              <StaffEditor name="staff" defaultValue={(profile.staff as ClinicStaff[] | null) ?? null} />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'officePhotos' && (
            <form ref={formRef}>
              <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-3">
                A few warm shots of your space — the waiting room, an operatory, the front
                desk. They appear in your office-tour gallery.
              </p>
              <OfficePhotosEditor
                name="officePhotos"
                defaultValue={(profile.officePhotos as ClinicOfficePhoto[] | null) ?? null}
              />
            </form>
          )}
          {modal.kind === 'section' && modal.field === 'differenceVideoUrl' && (
            <div>
              <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-3">
                A short, muted, looping clip that plays in your “Why us?” section. Upload one
                from your computer, or paste a direct video URL. Leave it blank to show a photo
                there instead.
              </p>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => videoFileRef.current?.click()}
                  disabled={uploading}
                  className="btn-sm bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 disabled:opacity-60"
                >
                  {uploading ? 'Uploading…' : videoUrl ? 'Upload a different video' : 'Upload a video'}
                </button>
                {videoUrl && !uploading && (
                  <button
                    type="button"
                    onClick={() => setVideoUrl('')}
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
              <label className="block text-[12px] font-semibold text-stone-600 dark:text-stone-300 mb-1">
                …or paste a video URL
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://…/clinic-intro.mp4"
                className="form-input w-full text-sm"
              />
              <p className="text-[11px] text-stone-400 mt-1">
                MP4, MOV, or WebM · up to 50MB · short, muted &amp; looping looks best.
              </p>
              {uploadError && <p className="text-[12px] text-rose-600 mt-2">{uploadError}</p>}
              {videoUrl.trim() && (
                <video
                  key={videoUrl}
                  src={videoUrl}
                  muted
                  loop
                  autoPlay
                  playsInline
                  className="mt-3 w-full max-h-48 object-cover rounded-lg bg-stone-100 dark:bg-stone-800"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-stone-200 dark:border-stone-700/60">
          <button
            type="button"
            onClick={onClose}
            className="btn-sm bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="btn-sm bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
