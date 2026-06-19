'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  SEO_PAGE_KEYS,
  SEO_PAGE_LABELS,
  SEO_TITLE_RECOMMENDED,
  SEO_DESCRIPTION_RECOMMENDED,
  type PageSeoMeta,
  type SeoPageKey,
} from '@/lib/types/seo-meta'
import { saveSeoMetaAction } from './actions'
import { ActionButton } from '@/components/ui/action-button'
import { SettingsTabs } from '../settings-tabs'

/**
 * Settings → Search appearance. Per-page title + description overrides for the
 * clinic's public site, with a live Google-style preview snippet that shows the
 * EFFECTIVE value (their override, or the smart default we'd otherwise use) so
 * they can see exactly what searchers see. Owner/admin-gated server-side.
 */

interface Props {
  initial: PageSeoMeta
  clinicName: string
  tagline: string | null
  about: string | null
  /** Public host for the preview URL line. */
  domain: string
}

/** Path each page key maps to on the public site (for the preview URL). */
const PAGE_PATH: Record<SeoPageKey, string> = {
  home: '',
  about: '/about',
  book: '/book',
  services: '/services',
  team: '/team',
  insurance: '/insurance',
  'payment-financing': '/payment-financing',
  'dental-plans': '/dental-plans',
  faq: '/faq',
  careers: '/careers',
  'blog-index': '/blog',
}

function firstSentence(s: string): string {
  const m = s.match(/^[^.!?]*[.!?]/)
  return (m ? m[0] : s).trim()
}

/** Mirror each public page's derived title/description fallback so the preview
 *  shows the real default when an override is blank. Kept in lockstep with the
 *  generateMetadata blocks in app/site/[slug]/**. */
function derivedFor(
  key: SeoPageKey,
  name: string,
  tagline: string | null,
  about: string | null,
): { title: string; description: string } {
  switch (key) {
    case 'home':
      return {
        title: tagline ? `${name} — ${tagline}` : name,
        description: tagline ?? (about ? about.slice(0, 160) : `Welcome to ${name}.`),
      }
    case 'about':
      return {
        title: `About — ${name}`,
        description: tagline ?? (about ? firstSentence(about) : `About ${name}.`),
      }
    case 'book':
      return {
        title: `Book a Visit — ${name}`,
        description: `Book your appointment online with ${name}. Same-week availability.`,
      }
    case 'services':
      return { title: `Services — ${name}`, description: `Dental services at ${name}.` }
    case 'team':
      return {
        title: `Our team — ${name}`,
        description: about ? firstSentence(about) : `Meet the team behind ${name}.`,
      }
    case 'insurance':
      return {
        title: `Insurance — ${name}`,
        description: `Dental insurance accepted at ${name}. Verify your plan and learn how we handle in-network vs out-of-network benefits.`,
      }
    case 'payment-financing':
      return {
        title: `Payment & Financing — ${name}`,
        description: `Payment methods, HSA / FSA, and financing options at ${name}. Honest billing — no silent surprises.`,
      }
    case 'dental-plans':
      return {
        title: `Dental Plans — ${name}`,
        description: `No insurance? Join the ${name} dental plan — preventive care covered, savings on every treatment, no claims.`,
      }
    case 'faq':
      return { title: `FAQ — ${name}`, description: `Common questions answered for patients of ${name}.` }
    case 'careers':
      return {
        title: `Careers — ${name}`,
        description: `Join the team at ${name}. See our open dental positions and apply today.`,
      }
    case 'blog-index':
      return {
        title: `Blog — ${name}`,
        description: `Oral-health tips, treatment guides, and news from ${name}.`,
      }
  }
}

function CharCount({ value, recommended }: { value: string; recommended: number }) {
  const n = value.trim().length
  const over = n > recommended
  return (
    <span
      className={`text-xs tabular-nums ${
        over ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'
      }`}
    >
      {n} / {recommended}
      {over && ' · may be truncated in search'}
    </span>
  )
}

export default function SeoMetaForm({ initial, clinicName, tagline, about, domain }: Props) {
  // Local editable copy. We keep both fields per key as plain strings.
  const [draft, setDraft] = useState<PageSeoMeta>(() => {
    // Deep copy so edits don't mutate the prop.
    const out = {} as PageSeoMeta
    for (const k of SEO_PAGE_KEYS) out[k] = { ...(initial[k] ?? {}) }
    return out
  })
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const derived = useMemo(() => {
    const out = {} as Record<SeoPageKey, { title: string; description: string }>
    for (const k of SEO_PAGE_KEYS) out[k] = derivedFor(k, clinicName, tagline, about)
    return out
  }, [clinicName, tagline, about])

  function set(key: SeoPageKey, field: 'title' | 'description', value: string) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }))
  }

  function save() {
    setToast(null)
    setError(null)
    startTransition(async () => {
      const r = await saveSeoMetaAction(draft)
      if (r.ok) setToast('Saved.')
      else setError(r.error)
    })
  }

  return (
    <SettingsTabs
      tabs={[
        {
          id: 'seo',
          label: 'Search appearance',
          subtabs: [
            {
              id: 'meta',
              label: 'Page meta',
              content: (
    <section className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Aim for titles around <strong>{SEO_TITLE_RECOMMENDED}</strong> characters and descriptions around{' '}
        <strong>{SEO_DESCRIPTION_RECOMMENDED}</strong> — that&rsquo;s what Google tends to show before cutting off. Blank
        fields fall back to the default shown in the preview.
      </p>

      {SEO_PAGE_KEYS.map((key) => {
        const d = derived[key]
        const titleVal = draft[key].title ?? ''
        const descVal = draft[key].description ?? ''
        const effTitle = titleVal.trim() || d.title
        const effDesc = descVal.trim() || d.description
        const previewUrl = `${domain}${PAGE_PATH[key]}`
        return (
          <div
            key={key}
            className="v2-card p-5"
          >
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">{SEO_PAGE_LABELS[key]}</h3>

            {/* Live preview snippet (Google-result style) */}
            <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/40 p-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 truncate">{previewUrl}</p>
              <p className="text-[15px] leading-snug text-[#1a0dab] dark:text-sky-400 truncate">{effTitle}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{effDesc}</p>
            </div>

            <label className="block mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Title</span>
                <CharCount value={titleVal} recommended={SEO_TITLE_RECOMMENDED} />
              </div>
              <input
                type="text"
                value={titleVal}
                onChange={(e) => set(key, 'title', e.target.value)}
                placeholder={d.title}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              />
            </label>

            <label className="block">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Description</span>
                <CharCount value={descVal} recommended={SEO_DESCRIPTION_RECOMMENDED} />
              </div>
              <textarea
                value={descVal}
                onChange={(e) => set(key, 'description', e.target.value)}
                placeholder={d.description}
                rows={2}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 resize-y"
              />
            </label>
          </div>
        )
      })}

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex items-center gap-3 sticky bottom-0 bg-gray-50 dark:bg-gray-900/20 py-3">
        <ActionButton variant="primary" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save search appearance'}
        </ActionButton>
        {toast && <span className="text-xs text-emerald-600 dark:text-emerald-400">{toast}</span>}
      </div>
    </section>
              ),
            },
          ],
        },
      ]}
    />
  )
}
