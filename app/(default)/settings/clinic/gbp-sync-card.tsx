'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import {
  syncFromGoogleAction,
  revertFieldToManualAction,
  importGooglePhotosAction,
} from './gbp-actions'
import {
  SYNCABLE_FIELDS,
  SYNCABLE_FIELD_LABELS,
  type GbpSyncState,
  type GbpSyncResult,
  type SyncableField,
} from '@/lib/types/zernio'

/**
 * Settings → "Sync from Google" card. Surfaces honest per-field provenance
 * (From Google · synced {date} vs You've customized this), an explicit "Sync
 * from Google" button (force), per-field "use Google's version" / "keep my
 * version" controls, and an "Import photos from Google" gallery that adds
 * selected google_photos into officePhotos. Disconnected → a calm prompt to
 * connect at /integrations. Premium + owner/admin gating lives in the actions.
 */

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fieldLabels(fields: SyncableField[]): string {
  return fields.map((f) => SYNCABLE_FIELD_LABELS[f].toLowerCase()).join(', ')
}

function summarize(r: GbpSyncResult): string {
  if (!r.ok) return r.error ?? 'Sync failed.'
  if (r.skipped === 'no_connection') return 'No Google Business Profile is connected.'
  const parts: string[] = []
  if (r.applied.length > 0) parts.push(`Updated ${fieldLabels(r.applied)} from Google`)
  if (r.skippedManual.length > 0) parts.push(`kept your edited ${fieldLabels(r.skippedManual)}`)
  if (r.photoCount > 0) parts.push(`${r.photoCount} ${r.photoCount === 1 ? 'photo' : 'photos'} available to import`)
  if (parts.length === 0) return 'Already up to date with Google.'
  // Capitalize the first segment.
  const joined = parts.join(' · ')
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

/** Per-field provenance row with the right indicator + control. */
function FieldRow({
  field,
  source,
  lastSyncedAtIso,
  busy,
  onUseGoogle,
  onKeepMine,
}: {
  field: SyncableField
  source: 'manual' | 'google'
  lastSyncedAtIso: string | null
  busy: boolean
  onUseGoogle: () => void
  onKeepMine: () => void
}) {
  const synced = fmtDate(lastSyncedAtIso)
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {SYNCABLE_FIELD_LABELS[field]}
        </span>
        {source === 'google' ? (
          <StatusPill
            tone="info"
            label={synced ? `From Google · synced ${synced}` : 'From Google'}
            title="This field is kept in sync with your Google Business Profile"
          />
        ) : (
          <StatusPill
            tone="neutral"
            label="You've customized this"
            title="You edited this manually — automatic Google syncs won't change it"
          />
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {source === 'google' ? (
          <button
            type="button"
            onClick={onKeepMine}
            disabled={busy}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
          >
            Stop syncing
          </button>
        ) : (
          <button
            type="button"
            onClick={onUseGoogle}
            disabled={busy}
            className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 disabled:opacity-50"
          >
            Use Google&apos;s version
          </button>
        )}
      </div>
    </div>
  )
}

/** Import-from-Google photo gallery (checkbox picker). */
function PhotoGallery({
  state,
  busy,
  onImport,
}: {
  state: GbpSyncState
  busy: boolean
  onImport: (urls: string[]) => void
}) {
  const imported = new Set(state.importedPhotoUrls)
  const importable = state.googlePhotos.filter((p) => !imported.has(p.url))
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (state.googlePhotos.length === 0) return null

  function toggle(url: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100">Photos from Google</h4>
        {importable.length > 0 && (
          <ActionButton
            variant="secondary"
            size="sm"
            disabled={busy || selected.size === 0}
            onClick={() => onImport(Array.from(selected))}
          >
            {busy ? 'Importing…' : `Import ${selected.size || ''} to my gallery`.trim()}
          </ActionButton>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Pick photos from your Google Business Profile to add to your website&apos;s office gallery.
        Your existing photos stay as they are.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {state.googlePhotos.map((p) => {
          const already = imported.has(p.url)
          const isSelected = selected.has(p.url)
          return (
            <button
              key={p.url}
              type="button"
              disabled={already || busy}
              onClick={() => toggle(p.url)}
              aria-pressed={isSelected}
              className={`relative aspect-square overflow-hidden rounded-lg border-2 transition ${
                already
                  ? 'border-emerald-400 opacity-60 cursor-default'
                  : isSelected
                    ? 'border-teal-500 ring-2 ring-teal-200'
                    : 'border-transparent hover:border-gray-300'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.category ?? 'Google photo'} className="h-full w-full object-cover" loading="lazy" decoding="async" />
              {already && (
                <span className="absolute bottom-1 right-1 rounded bg-emerald-600 px-1 text-[10px] font-medium text-white">
                  Added
                </span>
              )}
              {isSelected && !already && (
                <span className="absolute top-1 right-1 rounded-full bg-teal-600 px-1.5 text-[11px] font-bold text-white">
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function GbpSyncCard({ state }: { state: GbpSyncState }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ tone: 'ok' | 'urgent'; message: string } | null>(null)

  // Disconnected → calm connect prompt (no dead buttons).
  if (!state.connected) {
    return (
      <section className="p-6 border-t border-gray-200 dark:border-gray-700/60">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
          Sync from Google
        </h3>
        <div className="v2-card p-5">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
            Connect your Google Business Profile to pull in your verified hours, address, phone, and photos
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-3 max-w-prose">
            Once connected, your website, online booking, and search listing all stay in step with the
            hours and details patients see on Google — and you can keep any field you&apos;d rather set yourself.
          </p>
          <ActionButton href="/integrations" variant="secondary" size="sm">
            Connect Google Business →
          </ActionButton>
        </div>
      </section>
    )
  }

  function runSync() {
    startTransition(async () => {
      const r = await syncFromGoogleAction()
      setToast({ tone: r.ok ? 'ok' : 'urgent', message: summarize(r) })
      if (r.ok) router.refresh()
    })
  }

  function keepMine(field: SyncableField) {
    startTransition(async () => {
      const r = await revertFieldToManualAction(field)
      if (r.ok) {
        setToast({ tone: 'ok', message: `We'll keep your ${SYNCABLE_FIELD_LABELS[field].toLowerCase()} as-is.` })
        router.refresh()
      } else {
        setToast({ tone: 'urgent', message: r.error })
      }
    })
  }

  function importPhotos(urls: string[]) {
    startTransition(async () => {
      const r = await importGooglePhotosAction(urls)
      if (r.ok) {
        setToast({ tone: 'ok', message: r.added > 0 ? `Added ${r.added} ${r.added === 1 ? 'photo' : 'photos'} to your gallery.` : 'Those photos are already in your gallery.' })
        router.refresh()
      } else {
        setToast({ tone: 'urgent', message: r.error })
      }
    })
  }

  return (
    <section className="p-6 border-t border-gray-200 dark:border-gray-700/60">
      {toast && <FlashToast tone={toast.tone} message={toast.message} onDone={() => setToast(null)} />}
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Sync from Google</h3>
        <ActionButton variant="primary" size="sm" onClick={runSync} disabled={pending}>
          {pending ? 'Syncing…' : 'Sync from Google'}
        </ActionButton>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-prose">
        Pull your verified hours, address, and phone from your Google Business Profile. We never overwrite a
        field you&apos;ve customized unless you ask us to — and Google only flows one way (we can&apos;t change
        your Google listing from here).
        {state.isDemo && ' This is demo data.'}
      </p>

      <div className="v2-card p-4">
        {SYNCABLE_FIELDS.map((field) => (
          <FieldRow
            key={field}
            field={field}
            source={state.sources[field]}
            lastSyncedAtIso={state.lastSyncedAtIso}
            busy={pending}
            onUseGoogle={runSync}
            onKeepMine={() => keepMine(field)}
          />
        ))}
        <PhotoGallery state={state} busy={pending} onImport={importPhotos} />
      </div>
    </section>
  )
}
