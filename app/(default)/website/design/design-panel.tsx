'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { SITE_TEMPLATE_CATALOG } from '@/lib/site-templates/catalog'
import BrandColorField from '../../settings/clinic/brand-color-field'
import DifferenceVideoField from '../../settings/clinic/difference-video-field'
import ImageUploader from '@/components/ui/image-uploader'
import { StatusPill } from '@/components/ui/status-pill'
import { isValidVideoUrl } from '@/lib/website-url'
import {
  saveBrandColor,
  saveImageField,
  saveDifferenceVideo,
} from '../editor/website-actions'

/**
 * The Design panel — templates (preview in the editor / apply), brand color,
 * hero media, intro video. Every save rides the Studio's scoped actions, so
 * everything here lands in the undo history and repaints the live site.
 */

interface Props {
  currentTemplate: string
  brandColor: string | null
  heroImageUrl: string | null
  heroImageUrl2: string | null
  differenceVideoUrl: string | null
  imagePositions: Record<string, string>
}

export default function DesignPanel({
  currentTemplate,
  brandColor,
  heroImageUrl,
  heroImageUrl2,
  differenceVideoUrl,
  imagePositions,
}: Props) {
  return (
    <div className="space-y-6">
      <TemplatesCard currentTemplate={currentTemplate} />
      <BrandColorCard brandColor={brandColor} />
      <HeroImageCard
        field="heroImageUrl"
        title="Hero image"
        hint="A real interior or team shot — 16:9 or wider beats a stock smile."
        initialUrl={heroImageUrl}
        position={imagePositions.heroImageUrl ?? null}
      />
      <HeroImageCard
        field="heroImageUrl2"
        title="Second hero image"
        hint="The right-hand hero photo — a portrait-orientation shot works best."
        initialUrl={heroImageUrl2}
        position={imagePositions.heroImageUrl2 ?? null}
      />
      <IntroVideoCard initialUrl={differenceVideoUrl} />
      <section className="v2-well p-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Your logo lives with your business identity —{' '}
          <Link
            href="/settings/clinic"
            className="font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
          >
            open your Business profile →
          </Link>
        </p>
      </section>
    </div>
  )
}

/** A slim current-design summary — the full browsing experience (live
 *  previews on your own content, practice-type categories, filters, sorting)
 *  lives in the Templates gallery. */
function TemplatesCard({ currentTemplate }: { currentTemplate: string }) {
  const current = SITE_TEMPLATE_CATALOG.find((t) => t.id === currentTemplate)
  return (
    <section className="v2-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Design</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-700 dark:text-gray-200">
              {current?.label ?? currentTemplate}
            </span>
            <StatusPill tone="ok" label="Current design" />
          </div>
          {current && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-prose">{current.description}</p>
          )}
        </div>
        <Link
          href="/website/templates"
          className="shrink-0 text-xs font-semibold px-3 py-2 rounded-[var(--r-sm)] bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition-colors"
        >
          Browse all designs →
        </Link>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Every design previews live on your own content — nothing migrates, nothing breaks, and you
        can switch back anytime.
      </p>
    </section>
  )
}

function BrandColorCard({ brandColor }: { brandColor: string | null }) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const hex = fd.get('brandColor')?.toString() ?? ''
    setError(null)
    startTransition(async () => {
      const res = await saveBrandColor(hex)
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <section className="v2-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Brand color</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        The one color your whole site derives its palette from — every page repaints when you change it.
      </p>
      <form onSubmit={onSubmit} className="space-y-4 max-w-md">
        <BrandColorField name="brandColor" defaultValue={brandColor} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save brand color'}
          </button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓ — publish to go live</span>}
          {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
      </form>
    </section>
  )
}

function HeroImageCard({
  field,
  title,
  hint,
  initialUrl,
  position,
}: {
  field: 'heroImageUrl' | 'heroImageUrl2'
  title: string
  hint: string
  initialUrl: string | null
  position: string | null
}) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSave() {
    setError(null)
    startTransition(async () => {
      // Thread the CURRENT focal point through so a plain URL swap here never
      // silently clears a focus set in the editor.
      const res = await saveImageField(field, url ?? '', position)
      if (res.ok) {
        setDirty(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <section className="v2-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">{title}</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        {hint} Fine-tune the focus point in the editor.
      </p>
      <div className="max-w-md space-y-4">
        <ImageUploader
          name={field}
          defaultValue={initialUrl}
          folder="clinic-hero"
          label={title}
          previewClass={field === 'heroImageUrl2' ? 'aspect-[4/5] w-48' : 'aspect-[3/1]'}
          onChange={(next) => {
            setUrl(next)
            setDirty(true)
          }}
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={pending || !dirty}
            className="inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save image'}
          </button>
          {saved && !dirty && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓ — publish to go live</span>}
          {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
      </div>
    </section>
  )
}

function IntroVideoCard({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const next = fd.get('differenceVideoUrl')?.toString() ?? ''
    if (next && !isValidVideoUrl(next)) {
      setError('Enter a valid video link (https://…) or upload a file.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await saveDifferenceVideo(next)
      if (res.ok) {
        setUrl(next)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <section className="v2-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Intro video</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        The short ambient clip behind your “why us” section — leave blank to skip it.
      </p>
      <form onSubmit={onSubmit} className="space-y-4 max-w-md" key={url}>
        <DifferenceVideoField name="differenceVideoUrl" defaultValue={url || null} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 py-2 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save video'}
          </button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓ — publish to go live</span>}
          {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
      </form>
    </section>
  )
}
