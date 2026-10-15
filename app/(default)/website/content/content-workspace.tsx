'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ClinicProfile } from '@/lib/db/schema/platform'
import type {
  ClinicService,
  ClinicStaff,
  ClinicStat,
  ClinicOfficePhoto,
  ClinicFaqItem,
  ClinicColoringPage,
  ClinicFinancingPartner,
} from '@/lib/types/clinic-content'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import { CONTENT_GROUPS, type ContentSectionView } from '@/lib/website-content-sections'
import { Field, TagListEditor, inputCls, textareaCls } from '@/components/ui/editor-kit'
import { ActionButton } from '@/components/ui/action-button'
import { ProgressRing } from '@/components/ui/progress-ring'
import { StatusPill } from '@/components/ui/status-pill'
import StatsEditor from '../../settings/clinic/stats-editor'
import StaffEditor from '../../settings/clinic/staff-editor'
import OfficePhotosEditor from '../../settings/clinic/office-photos-editor'
import FinancingPartnersEditor from '../../settings/clinic/financing-partners-editor'
import ServicesLibraryPicker from '../../settings/clinic/services-library-picker'
import FaqEditor from '../editor/faq-editor'
import ColoringPagesEditor from '../editor/coloring-pages-editor'
import {
  saveStory,
  saveStaff,
  saveStats,
  saveOfficePhotos,
  saveFaq,
  saveDifferenceChips,
  saveColoringPages,
  saveInsurance,
  savePaymentMethods,
  saveFinancingPartners,
  saveCancellationPolicy,
  type SectionResult,
} from '../editor/website-actions'

/**
 * WEBSITE → CONTENT, THE WORKSPACE (2026-10-15 redesign).
 *
 * The first cut stacked every section's form down one long page under a
 * chip bar that clipped its last chips off the right edge — a monolith the
 * first client's office manager could not find her way around. This is a
 * rail-and-editor: the rail on the left is the table of contents, with each
 * section's honest state in its own words ("9 services", "Not set yet",
 * "Unsaved"), and the editor on the right shows ONE section at a time with
 * its own save, its own "See it on your site" door and its own way into the
 * Studio. Below `lg` the rail becomes a scrolling strip whose active pill
 * scrolls itself into view, with an edge fade that says there is more.
 *
 * Every section stays MOUNTED while another is active (the settings-tabs
 * law: in-progress edits survive switching away and back), so the rail can
 * also say which sections hold unsaved work. A successful save refreshes the
 * server tree so the rail's counts and the Publish card's tally stay live.
 *
 * Each form posts to the SAME scoped action the Studio's modal uses (one
 * saver, two doors); the three money columns each have their own.
 */

interface Props {
  profile: ClinicProfile
  orgId: string
  library: ServiceLibraryEntryWithStatus[]
  sections: ContentSectionView[]
  /** Which sections already hold content, by id — from the registry. */
  filledIds: string[]
  /** The rail's one-line status per section, by id (null = nothing yet). */
  summaries: Record<string, string | null>
  /** The clinic's public site, no trailing slash — the "See it" doors. */
  siteUrl: string
}

const NOT_SET = 'Not set yet'

export default function ContentWorkspace({ profile, orgId, library, sections, filledIds, summaries, siteUrl }: Props) {
  const params = useSearchParams()
  const router = useRouter()
  const ids = useMemo(() => sections.map((s) => s.id), [sections])
  const first = ids[0] ?? 'story'

  // The deep links every door into this page already uses: the settings
  // smart-search's `?sub=` / `?tab=`, and `#id` from the hub, ⌘K and the
  // help docs. An unknown target falls back to the first section.
  const [active, setActive] = useState<string>(() => {
    const target = params?.get('sub') || params?.get('tab')
    return target && ids.includes(target) ? target : first
  })
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
    if (hash && ids.includes(hash)) setActive(hash)
  }, [ids])

  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = useCallback((id: string, on: boolean) => {
    setDirty((d) => (d[id] === on ? d : { ...d, [id]: on }))
  }, [])
  const dirtyCount = Object.values(dirty).filter(Boolean).length

  // Leaving with unsaved edits asks first — the forms are plain inputs, and
  // the browser's own prompt is the honest one.
  useEffect(() => {
    if (dirtyCount === 0) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirtyCount])

  function pick(id: string) {
    setActive(id)
    if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`)
  }

  const filled = new Set(filledIds)
  const isPediatric = (profile.template ?? 'modern') === 'pediatric'
  const activeDef = sections.find((s) => s.id === active) ?? sections[0]

  return (
    <div className="lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-8 lg:items-start">
      <SectionRail
        sections={sections}
        active={active}
        filled={filled}
        dirty={dirty}
        summaries={summaries}
        onPick={pick}
      />

      <div className="min-w-0 mt-5 lg:mt-0">
        {activeDef && (
          <div className="v2-card p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 mb-6">
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
                  {activeDef.label}
                </h2>
                <p className="mt-1 max-w-prose text-sm text-gray-600 dark:text-gray-300">{activeDef.desc}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0" data-testid="section-doors">
                <ActionButton
                  variant="ghost"
                  size="sm"
                  href={`${siteUrl}${activeDef.sitePath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  See it on your site ↗
                </ActionButton>
                <ActionButton variant="ghost" size="sm" href={`/website/editor?page=${encodeURIComponent(activeDef.sitePath)}`}>
                  Edit on the page
                </ActionButton>
              </div>
            </div>

            <Panel id="story" active={active}>
              <SectionForm id="story" label="your story" action={saveStory} onDirty={markDirty} onSaved={router.refresh}>
                <Field label="Tagline" hint="One sentence — it’s your homepage headline.">
                  <input
                    name="tagline"
                    defaultValue={profile.tagline ?? ''}
                    placeholder="Dental care that finally feels human."
                    className={inputCls}
                  />
                </Field>
                <Field label="About your practice">
                  <textarea
                    name="about"
                    defaultValue={profile.about ?? ''}
                    rows={6}
                    placeholder="What makes your practice yours — patients read this on your About page."
                    className={textareaCls}
                  />
                </Field>
              </SectionForm>
            </Panel>

            <Panel id="services" active={active}>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">Changes here save automatically.</p>
              <ServicesLibraryPicker
                name="services"
                initialServices={(profile.services as ClinicService[] | null) ?? []}
                library={library}
                orgId={orgId}
                clinicName={profile.displayName ?? ''}
                city={profile.city ?? null}
              />
            </Panel>

            <Panel id="staff" active={active}>
              <SectionForm id="staff" label="team" action={saveStaff} onDirty={markDirty} onSaved={router.refresh}>
                <StaffEditor name="staff" defaultValue={(profile.staff as ClinicStaff[] | null) ?? null} />
              </SectionForm>
            </Panel>

            <Panel id="stats" active={active}>
              <SectionForm id="stats" label="trust stats" action={saveStats} onDirty={markDirty} onSaved={router.refresh}>
                <StatsEditor name="stats" defaultValue={(profile.stats as ClinicStat[] | null) ?? null} />
              </SectionForm>
            </Panel>

            <Panel id="photos" active={active}>
              <SectionForm id="photos" label="office photos" action={saveOfficePhotos} onDirty={markDirty} onSaved={router.refresh}>
                <OfficePhotosEditor
                  name="officePhotos"
                  defaultValue={(profile.officePhotos as ClinicOfficePhoto[] | null) ?? null}
                />
              </SectionForm>
            </Panel>

            <Panel id="faq" active={active}>
              <SectionForm id="faq" label="FAQ" action={saveFaq} onDirty={markDirty} onSaved={router.refresh}>
                <FaqEditor name="faq" defaultValue={(profile.faq as ClinicFaqItem[] | null) ?? null} />
              </SectionForm>
            </Panel>

            <Panel id="why-us" active={active}>
              <SectionForm id="why-us" label="highlights" action={saveDifferenceChips} onDirty={markDirty} onSaved={router.refresh}>
                <TagListEditor
                  name="differenceChips"
                  defaultValue={(profile.differenceChips as string[] | null) ?? []}
                  placeholder="No judgment, ever"
                  addLabel="Add a highlight…"
                />
              </SectionForm>
            </Panel>

            {isPediatric && (
              <Panel id="coloring" active={active}>
                <SectionForm id="coloring" label="coloring pages" action={saveColoringPages} onDirty={markDirty} onSaved={router.refresh}>
                  <ColoringPagesEditor
                    name="coloringPages"
                    defaultValue={(profile.coloringPages as ClinicColoringPage[] | null) ?? null}
                  />
                </SectionForm>
              </Panel>
            )}

            <Panel id="insurance" active={active}>
              <SectionForm id="insurance" label="insurance carriers" action={saveInsurance} onDirty={markDirty} onSaved={router.refresh}>
                <TagListEditor
                  name="acceptedInsuranceCarriers"
                  defaultValue={(profile.acceptedInsuranceCarriers as string[] | null) ?? []}
                  placeholder="Delta Dental"
                  addLabel="Add a carrier…"
                />
              </SectionForm>
            </Panel>

            <Panel id="methods" active={active}>
              <SectionForm id="methods" label="payment methods" action={savePaymentMethods} onDirty={markDirty} onSaved={router.refresh}>
                <TagListEditor
                  name="paymentMethods"
                  defaultValue={(profile.paymentMethods as string[] | null) ?? []}
                  placeholder="Cash, Credit cards, HSA / FSA…"
                  addLabel="Add a method…"
                />
              </SectionForm>
            </Panel>

            <Panel id="financing" active={active}>
              <SectionForm id="financing" label="financing" action={saveFinancingPartners} onDirty={markDirty} onSaved={router.refresh}>
                <FinancingPartnersEditor
                  name="financingPartners"
                  defaultValue={(profile.financingPartners as ClinicFinancingPartner[] | null) ?? null}
                />
              </SectionForm>
            </Panel>

            <Panel id="cancellation" active={active}>
              <SectionForm id="cancellation" label="cancellation policy" action={saveCancellationPolicy} onDirty={markDirty} onSaved={router.refresh}>
                <Field label="Cancellation policy" hint="Leave blank to hide it — no fake fees.">
                  <textarea
                    name="cancellationPolicy"
                    defaultValue={profile.cancellationPolicy ?? ''}
                    rows={5}
                    placeholder="We ask for 48 hours’ notice to reschedule…"
                    className={textareaCls}
                  />
                </Field>
              </SectionForm>
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── The rail ─────────────────────────────────────────────────────────── */

function SectionRail({
  sections,
  active,
  filled,
  dirty,
  summaries,
  onPick,
}: {
  sections: ContentSectionView[]
  active: string
  filled: Set<string>
  dirty: Record<string, boolean>
  summaries: Record<string, string | null>
  onPick: (id: string) => void
}) {
  const filledCount = sections.filter((s) => filled.has(s.id)).length
  const dirtyCount = sections.filter((s) => dirty[s.id]).length
  const activeRef = useRef<HTMLButtonElement>(null)

  // Below `lg` the rail is a horizontal strip: keep the active pill in view
  // (the first cut's chip bar let its last chips fall off the right edge).
  useEffect(() => {
    const el = activeRef.current
    if (el && typeof el.scrollIntoView === 'function' && window.innerWidth < 1024) {
      el.scrollIntoView({ block: 'nearest', inline: 'center' })
    }
  }, [active])

  return (
    <nav aria-label="Content sections" className="lg:sticky lg:top-20" data-testid="content-rail">
      {/* The honest count — a heartbeat for the whole page (law 7), never a nag. */}
      <div className="flex items-center gap-3 mb-3 lg:mb-4">
        <ProgressRing value={filledCount} max={sections.length} size={40} label={`${filledCount} of ${sections.length} sections have content`} />
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            <span className="font-mono-num tabular-nums">{filledCount}</span> of{' '}
            <span className="font-mono-num tabular-nums">{sections.length}</span> sections filled
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400" data-testid="rail-unsaved">
            {dirtyCount > 0 ? `${dirtyCount} with unsaved changes` : 'Every save here waits for Publish.'}
          </p>
        </div>
      </div>

      <div className="relative">
        <div
          role="tablist"
          aria-orientation="vertical"
          className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1 lg:flex-col lg:overflow-visible lg:mx-0 lg:px-0 lg:pb-0"
        >
          {CONTENT_GROUPS.map((g) => {
            const items = sections.filter((s) => s.group === g.id)
            if (items.length === 0) return null
            return (
              <div key={g.id} className="contents lg:block lg:mb-4">
                <p className="hidden lg:block px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {g.label}
                </p>
                {items.map((s) => {
                  const on = s.id === active
                  const has = filled.has(s.id)
                  const unsaved = !!dirty[s.id]
                  return (
                    <button
                      key={s.id}
                      ref={on ? activeRef : undefined}
                      type="button"
                      role="tab"
                      id={`tab-${s.id}`}
                      aria-selected={on}
                      aria-controls={`panel-${s.id}`}
                      onClick={() => onPick(s.id)}
                      data-testid={`rail-${s.id}`}
                      data-filled={has ? 'true' : 'false'}
                      className={`group shrink-0 lg:w-full text-left rounded-[var(--r-pill)] lg:rounded-[var(--r-sm)] px-3 py-1.5 lg:py-2 transition-colors ${
                        on
                          ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-500/[0.08] dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {/* Filled = ok-tone dot; empty = hollow ring. Status, never brand. */}
                        <span
                          aria-hidden="true"
                          className={`hidden lg:inline-block w-2 h-2 rounded-full shrink-0 ${
                            has ? 'bg-emerald-500' : 'ring-1 ring-inset ring-gray-400/70 dark:ring-gray-500/70'
                          }`}
                        />
                        <span className={`text-sm whitespace-nowrap ${on ? 'font-semibold' : 'font-medium'}`}>{s.label}</span>
                        {unsaved && (
                          <span className="ml-auto">
                            <StatusPill tone="warn" label="Unsaved" title="This section has changes you haven’t saved" />
                          </span>
                        )}
                      </span>
                      <span className="hidden lg:block pl-4 text-xs text-gray-500 dark:text-gray-400 truncate">
                        {summaries[s.id] ?? NOT_SET}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
        {/* The strip's edge fade (phones/tablets): more to the right. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 lg:hidden bg-gradient-to-l from-[color:var(--color-canvas)] to-transparent"
        />
      </div>
    </nav>
  )
}

/* ── One section's panel (mounted always, shown when active) ───────────── */

function Panel({ id, active, children }: { id: string; active: string; children: ReactNode }) {
  return (
    <section id={id} role="tabpanel" aria-labelledby={`tab-${id}`} hidden={active !== id} data-testid={`panel-${id}`} className="scroll-mt-28">
      <div id={`panel-${id}`}>{children}</div>
    </section>
  )
}

/* ── A section's form: its own save, its own feedback ──────────────────── */

function SectionForm({
  id,
  label,
  action,
  onDirty,
  onSaved,
  children,
}: {
  id: string
  /** Lower-case, for "Save financing". */
  label: string
  action: (fd: FormData) => Promise<SectionResult>
  onDirty: (id: string, on: boolean) => void
  onSaved: () => void
  children: ReactNode
}) {
  const [dirty, setDirtyLocal] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function touch() {
    if (!dirty) {
      setDirtyLocal(true)
      onDirty(id, true)
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const res = await action(fd)
      if (res.ok) {
        setDirtyLocal(false)
        onDirty(id, false)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
        onSaved()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} onChange={touch} onInput={touch} className="space-y-5">
      {children}
      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
        <ActionButton type="submit" variant="primary" size="sm" pending={pending}>
          Save {label}
        </ActionButton>
        {saved && !dirty && (
          <span className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
            Saved — publish to put it on your live site.
          </span>
        )}
        {dirty && !pending && !error && (
          <span className="text-sm text-gray-500 dark:text-gray-400">Unsaved changes</span>
        )}
        {error && (
          <span className="text-sm text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  )
}
