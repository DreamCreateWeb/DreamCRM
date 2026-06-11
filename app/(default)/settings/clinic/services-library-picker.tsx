'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  addServiceFromLibrary,
  regenerateCustomization,
  removeService,
  reorderService,
  submitNewService,
  updateManualCustomization,
  updateServiceOverrides,
} from './services-actions'
import type { ClinicService } from '@/lib/types/clinic-content'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import { EmptyHint, inputCls, textareaCls } from '@/components/ui/editor-kit'

/**
 * The Checkpoint 1B services editor — the picker drawer + selected-services
 * list — that replaces the old free-text editor. Stays a client component
 * for state + transitions; the wrapping `/settings/clinic` page stays a
 * server component.
 *
 * Server actions live in `./services-actions.ts`. Each one returns a
 * discriminated `{ ok, error? }` so we can render polite inline errors.
 *
 * No external d-n-d library — small clinics rarely have >8 services and
 * up/down arrows are friendlier on mobile + keyboard than a custom DnD harness.
 */

interface Props {
  name: string
  initialServices: ClinicService[]
  library: ServiceLibraryEntryWithStatus[]
  /** Org id of the viewing clinic — used to identify own-pending entries
   *  in the picker for the "Pending review" indicator. */
  orgId: string
}

interface Toast {
  kind: 'success' | 'error'
  msg: string
}

function categoryLabel(cat: 'core' | 'special'): string {
  return cat === 'special' ? 'Special' : 'Core'
}

function formatGeneratedAt(iso?: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return null
  }
}

type DrawerMode =
  | { kind: 'closed' }
  | { kind: 'picker' }
  | { kind: 'overrides'; serviceId: string }
  | { kind: 'manual'; serviceId: string }

export default function ServicesLibraryPicker({
  name,
  initialServices,
  library,
  orgId,
}: Props) {
  const [services, setServices] = useState<ClinicService[]>(initialServices)
  const [drawer, setDrawer] = useState<DrawerMode>({ kind: 'closed' })
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [, startTransition] = useTransition()

  function showToast(t: Toast) {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  // Library entries minus what the clinic already offers — what the picker shows.
  const libraryAvailable = useMemo(() => {
    const taken = new Set(services.map((s) => s.librarySlug).filter(Boolean))
    return library.filter((e) => !taken.has(e.slug))
  }, [services, library])

  async function runAction<T extends { ok: true } | { ok: false; error: string }>(
    key: string,
    fn: () => Promise<T>,
    onSuccess?: (out: Extract<T, { ok: true }>) => void,
  ) {
    setBusy(key)
    try {
      const out = await fn()
      if (!out.ok) {
        showToast({ kind: 'error', msg: out.error ?? 'Something went wrong' })
        return
      }
      onSuccess?.(out as Extract<T, { ok: true }>)
    } catch (err) {
      showToast({
        kind: 'error',
        msg: err instanceof Error ? err.message : 'Something went wrong',
      })
    } finally {
      setBusy(null)
    }
  }

  // Optimistic patches — server actions revalidate /settings/clinic so the
  // page will refresh the canonical list on next render; we mirror in local
  // state so the UI doesn't blink between click and re-render.

  function patchServiceLocal(id: string, patch: Partial<ClinicService>) {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }
  function removeServiceLocal(id: string) {
    setServices((prev) => prev.filter((s) => s.id !== id))
  }
  function moveLocal(id: string, dir: 'up' | 'down') {
    setServices((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0) return prev
      const swap = dir === 'up' ? idx - 1 : idx + 1
      if (swap < 0 || swap >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  return (
    <div>
      {/* Hidden input keeps the parent form's services field in sync — the
          settings form's `services` field still survives a save of OTHER
          profile fields, so we mirror the picker's state. */}
      <input type="hidden" name={name} value={JSON.stringify(services)} />

      {/* Selected services list */}
      <div className="space-y-3">
        {services.length === 0 && (
          <EmptyHint>
            No services yet — click <span className="font-medium text-gray-700 dark:text-gray-200">Add a service</span>{' '}
            below to start building your menu from the library.
          </EmptyHint>
        )}
        {services.map((s, i) => (
          <SelectedServiceRow
            key={s.id}
            service={s}
            isFirst={i === 0}
            isLast={i === services.length - 1}
            busy={busy === s.id}
            onOpenOverrides={() => setDrawer({ kind: 'overrides', serviceId: s.id })}
            onOpenManual={() => setDrawer({ kind: 'manual', serviceId: s.id })}
            onMove={(dir) =>
              startTransition(() => {
                moveLocal(s.id, dir)
                void runAction(s.id, () => reorderService(s.id, dir))
              })
            }
            onRegenerate={() =>
              startTransition(() => {
                void runAction(
                  s.id,
                  () => regenerateCustomization(s.id),
                  (out) => {
                    const d = out.data as { generatedAt?: string } | undefined
                    patchServiceLocal(s.id, {
                      customized: {
                        ...(s.customized ?? {
                          heroBullets: [],
                          body: '',
                          processSteps: [],
                          faq: [],
                          modelId: 'claude-sonnet-4-6',
                          generatedAt: new Date().toISOString(),
                        }),
                        generatedAt: d?.generatedAt ?? new Date().toISOString(),
                      },
                    })
                    showToast({ kind: 'success', msg: 'Regenerated with AI ✨' })
                  },
                )
              })
            }
            onRemove={() =>
              startTransition(() => {
                if (!confirm(`Remove "${s.name}" from your services?`)) return
                removeServiceLocal(s.id)
                void runAction(s.id, () => removeService(s.id))
              })
            }
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDrawer({ kind: 'picker' })}
        className="w-full mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-2.5 text-[13px] font-semibold text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 5v10M5 10h10" />
        </svg>
        Add a service
      </button>

      {/* Drawer overlay — z-[80] so it sits above the Website Studio modal
          (z-[70]) when the picker is embedded there; harmless in Settings,
          where nothing else reaches that layer. */}
      {drawer.kind !== 'closed' && (
        <div
          className="fixed inset-0 z-[80] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawer({ kind: 'closed' })
          }}
        >
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto rounded-l-2xl">
            {drawer.kind === 'picker' && (
              <PickerDrawer
                library={libraryAvailable}
                orgId={orgId}
                onClose={() => setDrawer({ kind: 'closed' })}
                onAdded={(addedSlug, customized) => {
                  startTransition(() => {
                    const entry = library.find((l) => l.slug === addedSlug)
                    if (!entry) return
                    const optimistic: ClinicService = {
                      id: `svc_tmp_${Date.now()}`,
                      librarySlug: entry.slug,
                      name: entry.name,
                      category: entry.category,
                      icon: entry.icon ?? null,
                    }
                    setServices((prev) => [...prev, optimistic])
                    setDrawer({ kind: 'closed' })
                    showToast({
                      kind: 'success',
                      msg: customized
                        ? `Added ${entry.name} (rewritten for your clinic ✨)`
                        : `Added ${entry.name}`,
                    })
                  })
                }}
                onSubmittedNew={(slug, customized) => {
                  showToast({
                    kind: 'success',
                    msg: customized
                      ? `Added. Your service is live on your site and pending platform review ✨`
                      : 'Added. Your service is live on your site and pending platform review.',
                  })
                  setDrawer({ kind: 'closed' })
                  // The page will revalidate; reload local state minimally.
                  startTransition(() => {
                    setServices((prev) => [
                      ...prev,
                      {
                        id: `svc_tmp_${Date.now()}`,
                        librarySlug: slug,
                        name: slug,
                        category: 'core',
                        icon: null,
                      },
                    ])
                  })
                }}
                runAction={runAction}
                busy={busy}
              />
            )}
            {drawer.kind === 'overrides' && (
              <OverridesDrawer
                service={services.find((s) => s.id === drawer.serviceId)}
                onClose={() => setDrawer({ kind: 'closed' })}
                onSave={(photoUrl, offer) =>
                  startTransition(() => {
                    patchServiceLocal(drawer.serviceId, { photoUrl, offer })
                    void runAction(
                      drawer.serviceId,
                      () =>
                        updateServiceOverrides(drawer.serviceId, { photoUrl, offer }),
                      () => {
                        showToast({ kind: 'success', msg: 'Overrides saved' })
                        setDrawer({ kind: 'closed' })
                      },
                    )
                  })
                }
              />
            )}
            {drawer.kind === 'manual' && (
              <ManualEditDrawer
                service={services.find((s) => s.id === drawer.serviceId)}
                onClose={() => setDrawer({ kind: 'closed' })}
                onSave={(body) =>
                  startTransition(() => {
                    const target = services.find((s) => s.id === drawer.serviceId)
                    if (target?.customized) {
                      patchServiceLocal(drawer.serviceId, {
                        customized: { ...target.customized, body },
                      })
                    }
                    void runAction(
                      drawer.serviceId,
                      () => updateManualCustomization(drawer.serviceId, body),
                      () => {
                        showToast({ kind: 'success', msg: 'Edits saved' })
                        setDrawer({ kind: 'closed' })
                      },
                    )
                  })
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
            toast.kind === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:border-emerald-400/30'
              : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-400/30'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function SelectedServiceRow({
  service,
  isFirst,
  isLast,
  busy,
  onOpenOverrides,
  onOpenManual,
  onMove,
  onRegenerate,
  onRemove,
}: {
  service: ClinicService
  isFirst: boolean
  isLast: boolean
  busy: boolean
  onOpenOverrides: () => void
  onOpenManual: () => void
  onMove: (dir: 'up' | 'down') => void
  onRegenerate: () => void
  onRemove: () => void
}) {
  const generatedAt = formatGeneratedAt(service.customized?.generatedAt)
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/70 bg-gray-50/70 dark:bg-gray-800/40 p-3.5">
      <div className="flex items-start gap-3">
        <div className="text-2xl w-8 text-center shrink-0">{service.icon ?? '🦷'}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold text-sm text-gray-800 dark:text-gray-100">{service.name}</p>
            {service.category && (
              <span className="text-xs font-semibold uppercase tracking-wide bg-gray-200/70 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5">
                {categoryLabel(service.category)}
              </span>
            )}
            {service.customized ? (
              <span className="text-xs font-semibold uppercase tracking-wide bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 rounded px-1.5 py-0.5">
                Customized ✨
              </span>
            ) : service.librarySlug ? (
              <span className="text-xs font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200 rounded px-1.5 py-0.5">
                Library default
              </span>
            ) : null}
            {service.offer && (
              <span className="text-xs font-semibold uppercase tracking-wide bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 rounded px-1.5 py-0.5">
                Offer
              </span>
            )}
          </div>
          {generatedAt && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Rewritten {generatedAt}</p>
          )}
        </div>
      </div>
      <div className="flex items-center flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-200/70 dark:border-gray-700/50">
        <button
          type="button"
          onClick={() => onMove('up')}
          disabled={busy || isFirst}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 disabled:opacity-30 transition"
          aria-label="Move up"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5L10 7.5l5 5" /></svg>
        </button>
        <button
          type="button"
          onClick={() => onMove('down')}
          disabled={busy || isLast}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 disabled:opacity-30 transition"
          aria-label="Move down"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5L10 12.5l5-5" /></svg>
        </button>
        {service.librarySlug && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-violet-200 dark:border-violet-400/40 px-2.5 py-1 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/15 disabled:opacity-40 transition"
          >
            {busy ? 'Working…' : '✨ Regenerate'}
          </button>
        )}
        {service.customized && (
          <button
            type="button"
            onClick={onOpenManual}
            disabled={busy}
            className="inline-flex items-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-gray-300 disabled:opacity-40 transition"
          >
            Edit copy
          </button>
        )}
        <button
          type="button"
          onClick={onOpenOverrides}
          disabled={busy}
          className="inline-flex items-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-gray-300 disabled:opacity-40 transition"
        >
          Photo / offer
        </button>
        <div className="grow" />
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-40 transition"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

function PickerDrawer({
  library,
  orgId,
  onClose,
  onAdded,
  onSubmittedNew,
  runAction,
  busy,
}: {
  library: ServiceLibraryEntryWithStatus[]
  orgId: string
  onClose: () => void
  onAdded: (slug: string, customized: boolean) => void
  onSubmittedNew: (slug: string, customized: boolean) => void
  runAction: <T extends { ok: true } | { ok: false; error: string }>(
    key: string,
    fn: () => Promise<T>,
    onSuccess?: (out: Extract<T, { ok: true }>) => void,
  ) => Promise<void>
  busy: string | null
}) {
  const [query, setQuery] = useState('')
  const [highlightSlug, setHighlightSlug] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [duplicateNote, setDuplicateNote] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = library.filter((entry) => {
      if (!q) return true
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.shortDescription.toLowerCase().includes(q) ||
        entry.slug.includes(q)
      )
    })
    return {
      core: matches.filter((e) => e.category === 'core' && e.status === 'active'),
      special: matches.filter((e) => e.category === 'special' && e.status === 'active'),
      ownPending: matches.filter(
        (e) => e.status === 'pending' && e.submittedByOrgId === orgId,
      ),
    }
  }, [library, query, orgId])

  async function handleSubmitNew() {
    const name = newName.trim()
    if (!name) return
    setSubmitting(true)
    setDuplicateNote(null)
    try {
      const out = await submitNewService({
        name,
        description: newDesc.trim() || undefined,
      })
      if (!out.ok) {
        setDuplicateNote(out.error)
        return
      }
      if (out.kind === 'duplicate') {
        setHighlightSlug(out.existingSlug)
        setDuplicateNote(
          out.note ||
            'Looks like this is already in the library — try adding the existing service instead.',
        )
        return
      }
      // kind === 'added'
      setNewName('')
      setNewDesc('')
      onSubmittedNew(out.slug, out.customized)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          Add a service
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1.5 w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg>
        </button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search dental services…"
        className={inputCls}
      />

      <ServiceGroup
        label="Core services"
        entries={grouped.core}
        highlightSlug={highlightSlug}
        busySlug={busy}
        onAdd={(slug) =>
          void runAction(
            `add_${slug}`,
            () => addServiceFromLibrary(slug),
            (out) => {
              const data = out.data as { customized?: boolean } | undefined
              onAdded(slug, !!data?.customized)
            },
          )
        }
      />
      <ServiceGroup
        label="Special services"
        entries={grouped.special}
        highlightSlug={highlightSlug}
        busySlug={busy}
        onAdd={(slug) =>
          void runAction(
            `add_${slug}`,
            () => addServiceFromLibrary(slug),
            (out) => {
              const data = out.data as { customized?: boolean } | undefined
              onAdded(slug, !!data?.customized)
            },
          )
        }
      />
      {grouped.ownPending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
            Your pending submissions
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            These are live on your site but hidden from other clinics until a
            platform admin approves.
          </p>
          <ServiceGroup
            label=""
            entries={grouped.ownPending}
            highlightSlug={highlightSlug}
            busySlug={busy}
            ownPending
            onAdd={(slug) =>
              void runAction(
                `add_${slug}`,
                () => addServiceFromLibrary(slug),
                (out) => {
                  const data = out.data as { customized?: boolean } | undefined
                  onAdded(slug, !!data?.customized)
                },
              )
            }
          />
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700/60 pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Can&apos;t find your service?
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Type the service you offer and we&apos;ll add it to your site
          immediately. A platform admin will review it for other clinics —
          you can keep using it on your own site in the meantime.
        </p>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Service name (e.g. Same-Day Crowns)"
          className={inputCls}
        />
        <textarea
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          placeholder="Short description (optional)"
          className={textareaCls}
          rows={2}
        />
        {duplicateNote && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded px-2 py-1.5">
            {duplicateNote}
          </p>
        )}
        <button
          type="button"
          onClick={handleSubmitNew}
          disabled={submitting || !newName.trim()}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300 transition disabled:opacity-60"
        >
          {submitting ? 'Checking…' : 'Submit for review'}
        </button>
      </div>
    </div>
  )
}

function ServiceGroup({
  label,
  entries,
  highlightSlug,
  busySlug,
  onAdd,
  ownPending,
}: {
  label: string
  entries: ServiceLibraryEntryWithStatus[]
  highlightSlug: string | null
  busySlug: string | null
  onAdd: (slug: string) => void
  ownPending?: boolean
}) {
  if (entries.length === 0) return null
  return (
    <div>
      {label && (
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
          {label}
        </h3>
      )}
      <ul className="space-y-2">
        {entries.map((e) => {
          const isBusy = busySlug === `add_${e.slug}`
          const isHighlighted = highlightSlug === e.slug
          return (
            <li
              key={e.slug}
              className={`flex items-start gap-3 p-2.5 rounded-lg border ${
                isHighlighted
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-400/50 dark:bg-amber-500/10'
                  : 'border-gray-200 dark:border-gray-700/60'
              }`}
            >
              <div className="text-xl w-7 text-center">{e.icon ?? '🦷'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {e.name}
                  {ownPending && (
                    <span className="ml-2 text-xs uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200 rounded px-1.5 py-0.5 align-middle">
                      Pending review
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                  {e.shortDescription}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onAdd(e.slug)}
                disabled={isBusy}
                className="text-xs px-2.5 py-1 border border-teal-300 text-teal-700 dark:border-teal-400/40 dark:text-teal-300 rounded-[var(--r-xs)] hover:bg-teal-50 dark:hover:bg-teal-500/15 disabled:opacity-50"
              >
                {isBusy ? 'Adding…' : '+ Add'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function OverridesDrawer({
  service,
  onClose,
  onSave,
}: {
  service: ClinicService | undefined
  onClose: () => void
  onSave: (photoUrl: string | null, offer: string | null) => void
}) {
  const [photoUrl, setPhotoUrl] = useState(service?.photoUrl ?? '')
  const [offer, setOffer] = useState(service?.offer ?? '')
  if (!service) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">Service not found.</p>
      </div>
    )
  }
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          Photo &amp; offer · {service.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1.5 w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg>
        </button>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Hero photo URL</label>
        <input
          type="url"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://…"
          className={inputCls}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Shown as the hero photo on the service detail page. Leave blank to use
          the default hero image.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Promo ribbon text</label>
        <input
          type="text"
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          placeholder="New patient special"
          className={inputCls}
          maxLength={120}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Renders as a thin brand-color bar atop the detail page when set.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 transition disabled:opacity-60"
          onClick={() => onSave(photoUrl.trim() || null, offer.trim() || null)}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function ManualEditDrawer({
  service,
  onClose,
  onSave,
}: {
  service: ClinicService | undefined
  onClose: () => void
  onSave: (body: string) => void
}) {
  const [body, setBody] = useState(service?.customized?.body ?? '')
  if (!service) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">Service not found.</p>
      </div>
    )
  }
  if (!service.customized) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          Edit copy · {service.name}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No AI rewrite yet. Click <span className="font-medium">Regenerate with AI</span>{' '}
          on this row first, then come back to fine-tune the body.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition"
        >
          Close
        </button>
      </div>
    )
  }
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          Edit copy · {service.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1.5 w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg>
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Edit the description paragraph by hand. Hero bullets, process steps,
        and FAQs stay AI-managed — click <span className="font-medium">Regenerate with AI</span>{' '}
        to refresh those.
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        maxLength={2000}
        className={textareaCls}
      />
      <div className="text-xs text-gray-500 dark:text-gray-400 -mt-3">
        {body.length} / 2000
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 transition disabled:opacity-60"
          onClick={() => onSave(body)}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
