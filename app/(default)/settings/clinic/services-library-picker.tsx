'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  addServiceFromLibrary,
  regenerateCustomization,
  removeService,
  reorderService,
  submitNewService,
  updateServiceContent,
  updateServiceOverrides,
} from './services-actions'
import type {
  ClinicService,
  ClinicServiceCustomization,
  EditableServiceContent,
  ServiceFaqItem,
  ServiceProcessStep,
} from '@/lib/types/clinic-content'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import { AddButton, EditorCard, EmptyHint, Field, inputCls, textareaCls } from '@/components/ui/editor-kit'
import ImageUploader from '@/components/ui/image-uploader'
import { useConfirm } from '@/components/ui/confirm-dialog'

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
  /** Clinic display name + city — used to token-fill the library default
   *  content when seeding the content editor before a service is AI-rewritten,
   *  so the editor always starts from real copy, not raw `{clinic}` tokens. */
  clinicName?: string | null
  city?: string | null
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
  | { kind: 'content'; serviceId: string }

export default function ServicesLibraryPicker({
  name,
  initialServices,
  library,
  orgId,
  clinicName,
  city,
}: Props) {
  const [services, setServices] = useState<ClinicService[]>(initialServices)
  const [drawer, setDrawer] = useState<DrawerMode>({ kind: 'closed' })
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [, startTransition] = useTransition()
  const confirm = useConfirm()

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
            onOpenContent={() => setDrawer({ kind: 'content', serviceId: s.id })}
            onMove={(dir) =>
              startTransition(() => {
                moveLocal(s.id, dir)
                void runAction(s.id, () => reorderService(s.id, dir))
              })
            }
            onRemove={async () => {
              if (!(await confirm({ title: `Remove “${s.name}” from your services?`, confirmLabel: 'Remove', danger: true }))) return
              startTransition(() => {
                removeServiceLocal(s.id)
                void runAction(s.id, () => removeService(s.id))
              })
            }}
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
                key={drawer.serviceId}
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
            {drawer.kind === 'content' && (
              <ContentEditDrawer
                key={drawer.serviceId}
                service={services.find((s) => s.id === drawer.serviceId)}
                libraryEntry={(() => {
                  const svc = services.find((s) => s.id === drawer.serviceId)
                  return svc?.librarySlug
                    ? library.find((l) => l.slug === svc.librarySlug)
                    : undefined
                })()}
                clinicName={clinicName ?? ''}
                city={city ?? null}
                onClose={() => setDrawer({ kind: 'closed' })}
                onPatched={(id, customized) => patchServiceLocal(id, { customized })}
                onSaved={() => {
                  showToast({ kind: 'success', msg: 'Saved' })
                  setDrawer({ kind: 'closed' })
                }}
                onGenerated={() => showToast({ kind: 'success', msg: 'Filled in with AI ✨' })}
              />
            )}
          </div>
        </div>
      )}

      {/* Toast — z-[90] so it sits above the Website Studio modal (z-[70]) +
          its picker drawer (z-[80]) when the picker is embedded there. */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[90] px-4 py-2 rounded-lg shadow-lg text-sm font-medium ${
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
  onOpenContent,
  onMove,
  onRemove,
}: {
  service: ClinicService
  isFirst: boolean
  isLast: boolean
  busy: boolean
  onOpenOverrides: () => void
  onOpenContent: () => void
  onMove: (dir: 'up' | 'down') => void
  onRemove: () => void
}) {
  const generatedAt = formatGeneratedAt(service.customized?.generatedAt)
  const editedByHand = service.customized?.modelId === 'manual'
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
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {editedByHand ? 'Edited' : 'Rewritten'} {generatedAt}
            </p>
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
            onClick={onOpenContent}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-violet-200 dark:border-violet-400/40 px-2.5 py-1 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/15 disabled:opacity-40 transition"
          >
            ✨ Edit content
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
        <ImageUploader
          name="service-hero-photo"
          defaultValue={service.photoUrl ?? null}
          folder="service-photos"
          label="Hero photo"
          hint="Shown at the top of this service’s page. Leave empty to use your site’s default hero image."
          previewClass="aspect-[3/2]"
          onChange={(u) => setPhotoUrl(u ?? '')}
        />
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

// ── Full-page content editor ─────────────────────────────────────────────────
//
// Every section of a service's detail page is editable here — Highlights (hero
// bullets), Description (body), What to expect (process steps), Common questions
// (FAQ). "✨ Generate" fills all four with AI in the clinic's voice; the clinic
// fine-tunes from there. The editor seeds from the saved AI/manual blob when
// present, else from the library default (token-filled), so a freshly-added
// service opens with real content rather than blank fields.

function swapAt<T>(arr: T[], a: number, b: number): T[] {
  if (b < 0 || b >= arr.length) return arr
  const next = [...arr]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

function tokenFill(text: string | undefined | null, clinicName: string, city: string | null): string {
  const c = (city ?? '').trim() || 'our area'
  return (text ?? '')
    .replace(/\{\s*clinic\s*\}/gi, clinicName.trim() || 'our practice')
    .replace(/\{\s*city\s*\}/gi, c)
}

function seedContent(
  service: ClinicService | undefined,
  libraryEntry: ServiceLibraryEntryWithStatus | undefined,
  clinicName: string,
  city: string | null,
): EditableServiceContent {
  const c = service?.customized
  if (c) {
    return {
      heroBullets: Array.isArray(c.heroBullets) ? c.heroBullets : [],
      body: c.body ?? '',
      processSteps: Array.isArray(c.processSteps) ? c.processSteps : [],
      faq: Array.isArray(c.faq) ? c.faq : [],
    }
  }
  if (libraryEntry) {
    return {
      heroBullets: (libraryEntry.heroBullets ?? []).map((b) => tokenFill(b, clinicName, city)),
      body: tokenFill(libraryEntry.body, clinicName, city),
      processSteps: (libraryEntry.processSteps ?? []).map((s) => ({
        title: tokenFill(s.title, clinicName, city),
        body: tokenFill(s.body, clinicName, city),
      })),
      faq: (libraryEntry.faq ?? []).map((f) => ({
        question: tokenFill(f.question, clinicName, city),
        answer: tokenFill(f.answer, clinicName, city),
      })),
    }
  }
  return { heroBullets: [], body: '', processSteps: [], faq: [] }
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-2.5">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>
    </div>
  )
}

function ContentEditDrawer({
  service,
  libraryEntry,
  clinicName,
  city,
  onClose,
  onPatched,
  onSaved,
  onGenerated,
}: {
  service: ClinicService | undefined
  libraryEntry: ServiceLibraryEntryWithStatus | undefined
  clinicName: string
  city: string | null
  onClose: () => void
  onPatched: (id: string, customized: ClinicServiceCustomization) => void
  onSaved: () => void
  onGenerated: () => void
}) {
  // Hooks first (unconditional), guard render after.
  const seed = useMemo(
    () => seedContent(service, libraryEntry, clinicName, city),
    [service, libraryEntry, clinicName, city],
  )
  const [bullets, setBullets] = useState<string[]>(seed.heroBullets)
  const [body, setBody] = useState(seed.body)
  const [steps, setSteps] = useState<ServiceProcessStep[]>(seed.processSteps)
  const [faq, setFaq] = useState<ServiceFaqItem[]>(seed.faq)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [err, setErr] = useState('')
  const confirm = useConfirm()

  if (!service) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">Service not found.</p>
      </div>
    )
  }

  const canGenerate = !!service.librarySlug && !!libraryEntry
  const busy = saving || generating

  async function generate() {
    if (!service) return
    if (
      !(await confirm({
        title: 'Fill every section with a fresh AI draft?',
        message: 'This replaces what’s in the editor now — you can fine-tune afterward.',
        confirmLabel: 'Generate',
      }))
    )
      return
    setGenerating(true)
    setErr('')
    try {
      const out = await regenerateCustomization(service.id)
      if (!out.ok) {
        setErr(out.error)
        return
      }
      const c = (out.data as { customization?: ClinicServiceCustomization } | undefined)?.customization
      if (c) {
        setBullets(c.heroBullets ?? [])
        setBody(c.body ?? '')
        setSteps(c.processSteps ?? [])
        setFaq(c.faq ?? [])
        onPatched(service.id, c)
        onGenerated()
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not generate — try again')
    } finally {
      setGenerating(false)
    }
  }

  async function save() {
    if (!service) return
    if (!body.trim()) {
      setErr('The description can’t be empty')
      return
    }
    const content: EditableServiceContent = { heroBullets: bullets, body, processSteps: steps, faq }
    setSaving(true)
    setErr('')
    try {
      const out = await updateServiceContent(service.id, content)
      if (!out.ok) {
        setErr(out.error)
        return
      }
      onPatched(service.id, {
        ...content,
        generatedAt: new Date().toISOString(),
        modelId: 'manual',
      })
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between sticky -top-px -mt-1 pt-1 bg-white dark:bg-gray-900 z-10">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 truncate pr-2">
          Edit content · {service.name}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1.5 w-8 h-8 inline-flex shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg>
        </button>
      </div>

      {/* Generate-with-AI banner */}
      {canGenerate && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-400/40 bg-violet-50/70 dark:bg-violet-500/10 p-3.5 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">
              Write the whole page with AI
            </p>
            <p className="text-xs text-violet-700/80 dark:text-violet-300/80 mt-0.5">
              Fills all four sections in {clinicName.trim() || 'your clinic'}&apos;s voice. You can
              fine-tune anything after.
            </p>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-violet-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 transition"
          >
            {generating ? 'Writing…' : '✨ Generate'}
          </button>
        </div>
      )}

      {err && (
        <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

      {/* Highlights */}
      <section>
        <SectionHead title="Highlights" hint="The short checkmark points at the top of the page." />
        <div className="space-y-2">
          {bullets.length === 0 && (
            <EmptyHint>No highlights yet — add a few, or use ✨ Generate.</EmptyHint>
          )}
          {bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={b}
                onChange={(e) => setBullets((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))}
                placeholder="e.g. Gentle, same-day care"
                maxLength={120}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setBullets((p) => swapAt(p, i, i - 1))}
                disabled={i === 0}
                className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 disabled:opacity-25 transition"
                aria-label="Move up"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5L10 7.5l5 5" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setBullets((p) => swapAt(p, i, i + 1))}
                disabled={i === bullets.length - 1}
                className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 disabled:opacity-25 transition"
                aria-label="Move down"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M5 7.5L10 12.5l5-5" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setBullets((p) => p.filter((_, idx) => idx !== i))}
                className="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/25 transition"
                aria-label="Remove highlight"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 6.5h9M8 6.5V5h4v1.5M6.5 6.5l.5 8h6l.5-8" /></svg>
              </button>
            </div>
          ))}
        </div>
        {bullets.length < 6 && <AddButton onClick={() => setBullets((p) => [...p, ''])}>Add a highlight</AddButton>}
      </section>

      {/* Description */}
      <section>
        <SectionHead title="Description" hint="The main paragraph patients read on the page." />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={2000}
          placeholder="A warm sentence or two about how this works at your clinic…"
          className={textareaCls}
        />
        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{body.length} / 2000</div>
      </section>

      {/* What to expect */}
      <section>
        <SectionHead title="What to expect" hint="The numbered steps a patient can expect from start to finish." />
        <div className="space-y-3">
          {steps.length === 0 && (
            <EmptyHint>No steps yet — add the visit flow, or use ✨ Generate.</EmptyHint>
          )}
          {steps.map((s, i) => (
            <EditorCard
              key={i}
              label={`Step ${i + 1}`}
              canMoveUp={i > 0}
              canMoveDown={i < steps.length - 1}
              onMoveUp={() => setSteps((p) => swapAt(p, i, i - 1))}
              onMoveDown={() => setSteps((p) => swapAt(p, i, i + 1))}
              onRemove={() => setSteps((p) => p.filter((_, idx) => idx !== i))}
            >
              <Field label="Title">
                <input
                  value={s.title}
                  onChange={(e) => setSteps((p) => p.map((x, idx) => (idx === i ? { ...x, title: e.target.value } : x)))}
                  placeholder="e.g. A gentle exam"
                  maxLength={120}
                  className={inputCls}
                />
              </Field>
              <Field label="What happens">
                <textarea
                  value={s.body}
                  onChange={(e) => setSteps((p) => p.map((x, idx) => (idx === i ? { ...x, body: e.target.value } : x)))}
                  rows={2}
                  maxLength={800}
                  placeholder="One or two sentences describing this step…"
                  className={textareaCls}
                />
              </Field>
            </EditorCard>
          ))}
        </div>
        {steps.length < 8 && (
          <AddButton onClick={() => setSteps((p) => [...p, { title: '', body: '' }])}>Add a step</AddButton>
        )}
      </section>

      {/* Common questions */}
      <section>
        <SectionHead title="Common questions" hint="Answers to what patients ask most about this service." />
        <div className="space-y-3">
          {faq.length === 0 && (
            <EmptyHint>No questions yet — add a few, or use ✨ Generate.</EmptyHint>
          )}
          {faq.map((f, i) => (
            <EditorCard
              key={i}
              label={`Question ${i + 1}`}
              canMoveUp={i > 0}
              canMoveDown={i < faq.length - 1}
              onMoveUp={() => setFaq((p) => swapAt(p, i, i - 1))}
              onMoveDown={() => setFaq((p) => swapAt(p, i, i + 1))}
              onRemove={() => setFaq((p) => p.filter((_, idx) => idx !== i))}
            >
              <Field label="Question">
                <input
                  value={f.question}
                  onChange={(e) => setFaq((p) => p.map((x, idx) => (idx === i ? { ...x, question: e.target.value } : x)))}
                  placeholder="e.g. Does it hurt?"
                  maxLength={240}
                  className={inputCls}
                />
              </Field>
              <Field label="Answer">
                <textarea
                  value={f.answer}
                  onChange={(e) => setFaq((p) => p.map((x, idx) => (idx === i ? { ...x, answer: e.target.value } : x)))}
                  rows={3}
                  maxLength={1200}
                  placeholder="A calm, honest answer. For cost, describe the estimate-first process — don’t name a dollar figure."
                  className={textareaCls}
                />
              </Field>
            </EditorCard>
          ))}
        </div>
        {faq.length < 10 && (
          <AddButton onClick={() => setFaq((p) => [...p, { question: '', answer: '' }])}>Add a question</AddButton>
        )}
      </section>

      {/* Footer */}
      <div className="flex gap-2 pt-4 border-t border-gray-200/70 dark:border-gray-700/50 sticky bottom-0 -mb-6 pb-6 bg-white dark:bg-gray-900">
        <button
          type="button"
          disabled={busy || !body.trim()}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 transition disabled:opacity-50"
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save'}
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
