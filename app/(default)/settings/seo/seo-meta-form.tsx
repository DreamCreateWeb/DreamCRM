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
import { StatusPill } from '@/components/ui/status-pill'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'
import { SettingsTabs } from '../settings-tabs'

/**
 * Settings → Search appearance. Per-page title + description overrides for the
 * clinic's public site, with a live Google-style preview snippet that shows the
 * EFFECTIVE value (their override, or the smart default we'd otherwise use) so
 * they can see exactly what searchers see. Owner/admin-gated server-side.
 *
 * The 11 pages are an ACCORDION — each collapsed row shows the page name, a
 * Customized vs Using-default pill, and the current effective title; expanding a
 * row reveals the editable fields + the live preview. Far less scroll than the
 * old wall of always-open cards. Only the pages a clinic actually HAS are
 * offered (careers/blog/dental-plans/team/services gate on their data —
 * computed server-side and passed in as `applicablePages`).
 */

interface Props {
  initial: PageSeoMeta
  clinicName: string
  tagline: string | null
  about: string | null
  /** Public host for the preview URL line. */
  domain: string
  /** The subset of SEO_PAGE_KEYS the clinic's site actually renders. The editor
   *  hides overrides for pages that don't exist (e.g. no Careers page → no
   *  careers row). Defaults to every key so a caller that doesn't gate still
   *  gets the full set. */
  applicablePages?: SeoPageKey[]
}

/** Path each page key maps to on the public site (for the preview URL). */
const PAGE_PATH: Record<SeoPageKey, string> = {
  home: '',
  about: '/about',
  'new-patients': '/new-patients',
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
    case 'new-patients':
      return {
        title: `New Patients — ${name}`,
        description: `Your first visit at ${name}: what to expect, what to bring, and how insurance and payment work. No surprises, no judgment.`,
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

/** Emerald while comfortably within, amber as it nears the sweet spot ceiling,
 *  rose once over — so the counter reads as a live traffic light, not just a
 *  number. Empty (using the default) stays neutral. */
function countTone(len: number, recommended: number): Tone {
  if (len === 0) return 'neutral'
  if (len > recommended) return 'urgent'
  // "Nearing" band: within ~10% of the cap (or the last few chars for short caps).
  if (len >= recommended - Math.max(6, Math.round(recommended * 0.1))) return 'warn'
  return 'ok'
}

function CharCount({ value, recommended }: { value: string; recommended: number }) {
  const n = value.trim().length
  const tone = countTone(n, recommended)
  const over = n > recommended
  return (
    <span className={`text-xs tabular-nums font-mono-num ${TONE_TEXT[tone]}`}>
      {n} / {recommended}
      {over && ' · may be truncated'}
    </span>
  )
}

export default function SeoMetaForm({
  initial,
  clinicName,
  tagline,
  about,
  domain,
  applicablePages,
}: Props) {
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
  // Which accordion row is expanded (single-open keeps the surface calm). Open
  // the first customized page by default so the clinic lands on something they
  // set; otherwise start fully collapsed.
  const pages = useMemo<SeoPageKey[]>(() => {
    const allow = applicablePages && applicablePages.length > 0 ? new Set(applicablePages) : null
    return SEO_PAGE_KEYS.filter((k) => (allow ? allow.has(k) : true))
  }, [applicablePages])

  const derived = useMemo(() => {
    const out = {} as Record<SeoPageKey, { title: string; description: string }>
    for (const k of SEO_PAGE_KEYS) out[k] = derivedFor(k, clinicName, tagline, about)
    return out
  }, [clinicName, tagline, about])

  const [open, setOpen] = useState<SeoPageKey | null>(() => {
    for (const k of pages) if (initial[k]?.title || initial[k]?.description) return k
    return null
  })

  function set(key: SeoPageKey, field: 'title' | 'description', value: string) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }))
    setToast(null)
  }

  /** Clear one field's override → it falls back to the derived default. */
  function useDefault(key: SeoPageKey, field: 'title' | 'description') {
    set(key, field, '')
  }

  const customizedCount = useMemo(
    () => pages.filter((k) => (draft[k].title ?? '').trim() || (draft[k].description ?? '').trim()).length,
    [pages, draft],
  )

  function save() {
    setToast(null)
    setError(null)
    startTransition(async () => {
      const r = await saveSeoMetaAction(draft)
      if (r.ok) setToast('Saved.')
      else setError(r.error)
    })
  }

  const body = (
    <section className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Aim for titles around <strong>{SEO_TITLE_RECOMMENDED}</strong> characters and descriptions around{' '}
        <strong>{SEO_DESCRIPTION_RECOMMENDED}</strong> — that&rsquo;s what Google tends to show before cutting off. Leave a
        field blank and we use the smart default shown in the preview.{' '}
        <span className="tabular-nums font-mono-num text-gray-600 dark:text-gray-300">{customizedCount}</span>
        {' '}of {pages.length} customized.
      </p>

      <div className="v2-card divide-y divide-gray-100 dark:divide-gray-700/50">
        {pages.map((key) => {
          const d = derived[key]
          const titleVal = draft[key].title ?? ''
          const descVal = draft[key].description ?? ''
          const effTitle = titleVal.trim() || d.title
          const effDesc = descVal.trim() || d.description
          const previewUrl = `${domain}${PAGE_PATH[key]}`
          const customized = !!(titleVal.trim() || descVal.trim())
          const isOpen = open === key
          const panelId = `seo-panel-${key}`
          return (
            <div key={key}>
              {/* Collapsed summary row — click to toggle. */}
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen((o) => (o === key ? null : key))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/30 first:rounded-t-[var(--r-md)] last:rounded-b-[var(--r-md)]"
              >
                <svg
                  className={`h-3 w-3 shrink-0 fill-current text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path d="M6 4l4 4-4 4V4z" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {SEO_PAGE_LABELS[key]}
                    </span>
                    {customized ? (
                      <StatusPill tone="special" label="Customized" title="This page uses your own title/description." />
                    ) : (
                      <StatusPill tone="neutral" label="Using default" title="This page uses the smart default we generate." />
                    )}
                  </div>
                  {!isOpen && (
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" title={effTitle}>
                      {effTitle}
                    </p>
                  )}
                </div>
              </button>

              {/* Expanded editor. */}
              {isOpen && (
                <div id={panelId} className="section-enter px-4 pb-5 pt-1">
                  {/* Live preview snippet (Google-result style). */}
                  <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-700/40 dark:bg-gray-900/40">
                    <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">{previewUrl}</p>
                    <p className="truncate text-[15px] leading-snug text-[#1a0dab] dark:text-sky-400">{effTitle}</p>
                    <p className="line-clamp-2 text-xs text-gray-600 dark:text-gray-300">{effDesc}</p>
                  </div>

                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Title</span>
                      <div className="flex items-center gap-3">
                        <CharCount value={titleVal} recommended={SEO_TITLE_RECOMMENDED} />
                        {titleVal.trim() && (
                          <button
                            type="button"
                            onClick={() => useDefault(key, 'title')}
                            className="text-xs text-teal-700 hover:underline dark:text-teal-300"
                          >
                            Use default
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="text"
                      value={titleVal}
                      onChange={(e) => set(key, 'title', e.target.value)}
                      placeholder={d.title}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                    />
                    {!titleVal.trim() && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Blank → default: <span className="text-gray-500 dark:text-gray-400">{d.title}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Description</span>
                      <div className="flex items-center gap-3">
                        <CharCount value={descVal} recommended={SEO_DESCRIPTION_RECOMMENDED} />
                        {descVal.trim() && (
                          <button
                            type="button"
                            onClick={() => useDefault(key, 'description')}
                            className="text-xs text-teal-700 hover:underline dark:text-teal-300"
                          >
                            Use default
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea
                      value={descVal}
                      onChange={(e) => set(key, 'description', e.target.value)}
                      placeholder={d.description}
                      rows={2}
                      className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                    />
                    {!descVal.trim() && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Blank → default: <span className="text-gray-500 dark:text-gray-400">{d.description}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="sticky bottom-0 flex items-center gap-3 bg-gray-50 py-3 dark:bg-gray-900/20">
        <ActionButton variant="primary" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save search appearance'}
        </ActionButton>
        {toast && <span className="text-xs text-emerald-600 dark:text-emerald-400">{toast}</span>}
      </div>
    </section>
  )

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
              content: body,
            },
          ],
        },
      ]}
    />
  )
}
