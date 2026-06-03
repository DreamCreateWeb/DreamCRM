'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ClinicProfile } from '@/lib/db/schema/platform'
import type { ClinicStat, ClinicTestimonial } from '@/lib/types/clinic-content'
import ImageUploader from '@/components/ui/image-uploader'
import StatsEditor from '../settings/clinic/stats-editor'
import TestimonialsEditor from '../settings/clinic/testimonials-editor'
import { saveInlineField, saveStats, saveTestimonials, type SectionResult } from './website-actions'

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
    if (f) f.src = f.src
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

  const imageCfg = modal.kind === 'image' ? IMAGE_FIELDS[modal.field] : null
  const title =
    modal.kind === 'image'
      ? `Replace ${imageCfg?.label ?? 'image'}`
      : modal.field === 'stats'
        ? 'Trust stats'
        : modal.field === 'differenceVideoUrl'
          ? 'Intro video'
          : modal.field === 'testimonials'
            ? 'Featured reviews'
            : 'Edit section'

  async function onSave() {
    setBusy(true)
    let res: SectionResult
    if (modal.kind === 'image') {
      res = await persist(() => saveInlineField(modal.field, imageUrl ?? ''))
    } else if (modal.field === 'stats') {
      const fd = new FormData(formRef.current!)
      res = await persist(() => saveStats(fd))
    } else if (modal.field === 'differenceVideoUrl') {
      res = await persist(() => saveInlineField('differenceVideoUrl', videoUrl))
    } else if (modal.field === 'testimonials') {
      const fd = new FormData(formRef.current!)
      res = await persist(() => saveTestimonials(fd))
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
          {modal.kind === 'section' && modal.field === 'differenceVideoUrl' && (
            <div>
              <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-3">
                A short, muted, looping clip that plays in your “Why us?” section. Paste a
                direct video URL (an <code>.mp4</code> link). Leave it blank to show a photo
                there instead.
              </p>
              <label className="block text-[12px] font-semibold text-stone-600 dark:text-stone-300 mb-1">
                Video URL
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://…/clinic-intro.mp4"
                className="form-input w-full text-sm"
              />
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
