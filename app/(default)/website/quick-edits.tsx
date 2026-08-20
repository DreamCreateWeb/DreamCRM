'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { FlashToast } from '@/components/ui/flash-toast'
import HoursGrid, { type HoursGridEntry } from '../settings/clinic/hours-grid'
import StaffEditor from '../settings/clinic/staff-editor'
import OfficePhotosEditor from '../settings/clinic/office-photos-editor'
import ServicesLibraryPicker from '../settings/clinic/services-library-picker'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'
import type { ClinicService, ClinicStaff, ClinicOfficePhoto, ClinicAnnouncement } from '@/lib/types/clinic-content'
import { saveHours, saveStaff, saveOfficePhotos, saveAnnouncement, type SectionResult } from './editor/website-actions'
import { ActionButton } from '@/components/ui/action-button'

/**
 * The hub's Quick edits — the things a front desk actually changes (hours,
 * services, team, photos) as MODALS right on the hub, not trips into a
 * settings maze. Each modal reuses the exact editor + scoped server action
 * the Content page uses (one saver, N doors), so a quick edit can never
 * touch a section it didn't open.
 *
 * The two save semantics stay honest in each modal's footer:
 *   hours     → identity column, LIVE the moment it saves;
 *   the rest  → stages to the website draft; Publish makes it live (the
 *               amber publish card appears on the hub after saving).
 */

type EditKey = 'announcement' | 'hours' | 'services' | 'team' | 'photos'

export interface QuickEditsData {
  orgId: string
  clinicName: string
  city: string | null
  hours: Record<string, HoursGridEntry>
  services: ClinicService[]
  staff: ClinicStaff[] | null
  officePhotos: ClinicOfficePhoto[] | null
  announcement: ClinicAnnouncement | null
  library: ServiceLibraryEntryWithStatus[]
}

const BUTTONS: { key: EditKey; icon: string; title: string }[] = [
  { key: 'announcement', icon: '📣', title: 'Announcement' },
  { key: 'hours', icon: '🕐', title: 'Hours' },
  { key: 'services', icon: '🦷', title: 'Services' },
  { key: 'team', icon: '👋', title: 'Team' },
  { key: 'photos', icon: '📸', title: 'Photos' },
]

export default function QuickEdits({ data, states }: { data: QuickEditsData; states: Record<EditKey, string> }) {
  const [open, setOpen] = useState<EditKey | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const router = useRouter()

  function done(message: string) {
    setOpen(null)
    setToast(message)
    // Refresh the hub so the publish card / stats reflect the save.
    router.refresh()
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {BUTTONS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setOpen(b.key)}
            className="v2-card-interactive px-4 py-3.5 h-full flex items-center gap-3 text-left w-full cursor-pointer"
          >
            <span className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--r-sm)] bg-gradient-to-br from-teal-500/10 to-teal-500/20">
              <span className="text-xl leading-none" aria-hidden="true">
                {b.icon}
              </span>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">{b.title}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 truncate tabular-nums" title={states[b.key]}>
                {states[b.key]}
              </span>
            </span>
          </button>
        ))}
      </div>

      {open === 'announcement' && (
        <QuickEditModal title="Announcement bar" onClose={() => setOpen(null)}>
          <SaveForm
            action={saveAnnouncement}
            saveLabel={data.announcement?.message ? 'Update announcement' : 'Show announcement'}
            liveNote="Live right away — a thin bar shows at the top of every page. Clear the message to hide it."
            onSaved={() => done('Announcement updated — live on your site now.')}
          >
            <label className="block">
              <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Message</span>
              <textarea
                name="message"
                defaultValue={data.announcement?.message ?? ''}
                rows={2}
                maxLength={200}
                placeholder="Closed Dec 24–26 for the holidays — see you in the new year!"
                className="w-full rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Leave blank to take the bar down.
              </span>
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
                Automatically hide after <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <input
                type="date"
                name="endsAt"
                defaultValue={data.announcement?.endsAt ?? ''}
                className="rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                The bar shows through this day, then disappears on its own.
              </span>
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
                Link the bar to <span className="font-normal text-gray-400">(optional)</span>
              </span>
              <input
                type="text"
                name="href"
                defaultValue={data.announcement?.href ?? ''}
                placeholder="/book  or  https://…"
                className="w-full rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
            </label>
          </SaveForm>
        </QuickEditModal>
      )}

      {open === 'hours' && (
        <QuickEditModal title="Office hours" onClose={() => setOpen(null)}>
          <SaveForm
            action={saveHours}
            saveLabel="Save hours"
            liveNote="Live right away — your site (and booking slots) update the moment you save."
            onSaved={() => done('Hours saved — live on your site now.')}
          >
            <HoursGrid initial={data.hours} />
          </SaveForm>
        </QuickEditModal>
      )}

      {open === 'services' && (
        // The picker AUTO-saves (no Save button), so refresh on close to
        // surface the publish card + updated "N offered" state on the hub.
        <QuickEditModal
          title="Services"
          onClose={() => {
            setOpen(null)
            router.refresh()
          }}
          wide
        >
          <ServicesLibraryPicker
            name="services"
            initialServices={data.services}
            library={data.library}
            orgId={data.orgId}
            clinicName={data.clinicName}
            city={data.city}
          />
          <ModalFootnote>
            Changes save automatically to your draft — hit Publish on the hub when you’re ready for
            patients to see them.
          </ModalFootnote>
        </QuickEditModal>
      )}

      {open === 'team' && (
        <QuickEditModal title="Team" onClose={() => setOpen(null)} wide>
          <SaveForm
            action={saveStaff}
            saveLabel="Save team"
            liveNote="Saves to your draft — Publish on the hub makes it live."
            onSaved={() => done('Team saved to your draft — publish when ready.')}
          >
            <StaffEditor name="staff" defaultValue={data.staff} />
          </SaveForm>
        </QuickEditModal>
      )}

      {open === 'photos' && (
        <QuickEditModal title="Office photos" onClose={() => setOpen(null)} wide>
          <SaveForm
            action={saveOfficePhotos}
            saveLabel="Save photos"
            liveNote="Saves to your draft — Publish on the hub makes it live."
            onSaved={() => done('Photos saved to your draft — publish when ready.')}
          >
            <OfficePhotosEditor name="officePhotos" defaultValue={data.officePhotos} />
          </SaveForm>
        </QuickEditModal>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}

/** The modal shell — surface-2, panel radius, modal shadow, scrim, Esc + ✕. */
function QuickEditModal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string
  onClose: () => void
  wide?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div
        className="fixed inset-0 bg-[#1A2440]/40 dark:bg-black/60"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} my-auto rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] shadow-[var(--shadow-modal)]`}
      >
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5">
          <h2 className="text-base font-extrabold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-pill)] text-gray-400 hover:text-gray-700 hover:bg-gray-500/10 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
        <div className="px-5 sm:px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

/** Form wrapper: scoped action + one save button + the honest semantics line. */
function SaveForm({
  action,
  saveLabel,
  liveNote,
  onSaved,
  children,
}: {
  action: (fd: FormData) => Promise<SectionResult>
  saveLabel: string
  liveNote: string
  onSaved: () => void
  children: ReactNode
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const res = await action(fd)
      if (res.ok) onSaved()
      else setError(res.error)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {children}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <ActionButton variant="primary" size="sm" type="submit" pending={pending}>
          {saveLabel}
        </ActionButton>
        <span className="text-xs text-gray-500 dark:text-gray-400">{liveNote}</span>
        {error && (
          <span role="alert" className="text-sm text-rose-600 dark:text-rose-400 w-full">
            {error}
          </span>
        )}
      </div>
    </form>
  )
}

function ModalFootnote({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">{children}</p>
}
