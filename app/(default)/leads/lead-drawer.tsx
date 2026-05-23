'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { LeadRow, LeadStatus } from '@/lib/services/leads'
import {
  markLeadContactedAction,
  archiveLeadAction,
  reopenLeadAction,
  convertLeadAction,
  previewLeadConvertAction,
} from './actions'

const STATUS_PILL: Record<LeadStatus, string> = {
  new: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  contacted: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  converted: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  archived: 'bg-stone-500/15 text-stone-600 dark:text-stone-300',
}
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  archived: 'Archived',
}

function fmtFull(d: Date): string {
  return d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function LeadDrawer({
  row,
  onClose,
}: {
  row: LeadRow
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Set when convert would link to an existing patient (email/phone match)
  // — we confirm before merging so a shared family phone doesn't silently
  // fold a child lead into a parent's record.
  const [dedupeMatch, setDedupeMatch] = useState<string | null>(null)

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function refreshAndClose() {
    router.refresh()
    onClose()
  }

  function onMarkContacted() {
    startTransition(async () => {
      await markLeadContactedAction(row.id)
      flash('Marked contacted.')
      refreshAndClose()
    })
  }

  function onArchive() {
    startTransition(async () => {
      await archiveLeadAction(row.id, archiveReason.trim() || null)
      flash('Archived.')
      refreshAndClose()
    })
  }

  function onReopen() {
    startTransition(async () => {
      await reopenLeadAction(row.id)
      flash('Reopened.')
      refreshAndClose()
    })
  }

  // Step 1: dry-run the dedupe check. If the lead's email/phone matches an
  // existing patient, surface a confirm step instead of silently merging.
  function onConvert() {
    setError(null)
    setDedupeMatch(null)
    startTransition(async () => {
      const preview = await previewLeadConvertAction(row.id)
      if ('ok' in preview && preview.ok && preview.matchedPatientName) {
        setDedupeMatch(preview.matchedPatientName)
        return
      }
      if ('error' in preview && !preview.ok) { setError(preview.error); return }
      await runConvert(false)
    })
  }

  // Step 2: commit the convert. forceNew=true skips the dedupe and creates
  // a separate patient (the "not the same person" escape hatch).
  function runConvert(forceNew: boolean) {
    startTransition(async () => {
      const r = await convertLeadAction(row.id, { forceNewPatient: forceNew })
      if ('ok' in r && r.ok === true) {
        flash(r.deduped ? `Linked to existing patient ${r.patientName}.` : `Created patient ${r.patientName}.`)
        router.refresh()
        router.push(`/patients/${r.patientId}`)
      } else if ('error' in r) {
        setError(r.error)
        setDedupeMatch(null)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="bg-white dark:bg-gray-800 w-full sm:w-[480px] h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Lead</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-5 py-5 space-y-4 flex-1">
          {/* Identity + status */}
          <div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{row.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_PILL[row.status]}`}>
                {STATUS_LABEL[row.status]}
              </span>
              {row.status === 'new' && row.ageHours <= 1 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  Fresh — call now
                </span>
              )}
              {row.status === 'converted' && row.convertedPatientName && (
                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                  → {row.convertedPatientName}
                </span>
              )}
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold w-16">Phone</span>
              <a href={`tel:${row.phone}`} className="text-gray-800 dark:text-gray-100 hover:underline">{row.phone}</a>
            </div>
            {row.email && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold w-16">Email</span>
                <a href={`mailto:${row.email}`} className="text-gray-800 dark:text-gray-100 hover:underline">{row.email}</a>
              </div>
            )}
            {row.preferredDate && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold w-16">Prefers</span>
                <span className="text-gray-800 dark:text-gray-100">{row.preferredDate}</span>
              </div>
            )}
          </div>

          {/* Message */}
          {row.message && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Message</p>
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap italic">
                &ldquo;{row.message}&rdquo;
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-700/60">
            {row.status === 'new' && (
              <>
                <button onClick={onMarkContacted} disabled={pending} className="btn-sm bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
                  Mark contacted
                </button>
                <button onClick={onConvert} disabled={pending} className="btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                  Convert to patient
                </button>
              </>
            )}
            {row.status === 'contacted' && (
              <button onClick={onConvert} disabled={pending} className="btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                Convert to patient
              </button>
            )}
            {(row.status === 'new' || row.status === 'contacted') && (
              <button onClick={() => setArchiveOpen(true)} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-red-600 disabled:opacity-50">
                Archive
              </button>
            )}
            {row.status === 'archived' && (
              <button onClick={onReopen} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50">
                Reopen
              </button>
            )}
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {/* Dedupe confirmation — convert matched an existing patient. */}
          {dedupeMatch && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                This lead&rsquo;s email or phone matches an existing patient:{' '}
                <span className="font-semibold">{dedupeMatch}</span>. Link this lead to
                them, or create a separate patient (e.g. a family member on a shared number)?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => runConvert(false)}
                  disabled={pending}
                  className="btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Link to {dedupeMatch.split(' ')[0]}
                </button>
                <button
                  onClick={() => runConvert(true)}
                  disabled={pending}
                  className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                >
                  Create separate patient
                </button>
                <button
                  onClick={() => setDedupeMatch(null)}
                  disabled={pending}
                  className="btn-sm text-gray-500 dark:text-gray-400 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Source attribution */}
          {(row.sourcePage || row.referrer || row.utmSource) && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Where they came from</p>
              <div className="space-y-0.5 text-xs text-gray-700 dark:text-gray-300">
                {row.sourcePage && <p>Page · <span className="text-gray-500 dark:text-gray-400">{row.sourcePage}</span></p>}
                {row.referrer && <p>Referrer · <span className="text-gray-500 dark:text-gray-400">{row.referrer}</span></p>}
                {row.utmSource && <p>UTM source · <span className="text-gray-500 dark:text-gray-400">{row.utmSource}</span></p>}
                {row.utmMedium && <p>UTM medium · <span className="text-gray-500 dark:text-gray-400">{row.utmMedium}</span></p>}
                {row.utmCampaign && <p>Campaign · <span className="text-violet-600 dark:text-violet-400">{row.utmCampaign}</span></p>}
              </div>
            </div>
          )}

          {/* Lifecycle audit */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Timeline</p>
            <ul className="space-y-0.5 text-xs text-gray-700 dark:text-gray-300">
              <li>Landed · {fmtFull(row.createdAt)}</li>
              {row.contactedAt && <li>Contacted · {fmtFull(row.contactedAt)}</li>}
              {row.convertedAt && <li>Converted · {fmtFull(row.convertedAt)}</li>}
              {row.archivedAt && (
                <li>
                  Archived · {fmtFull(row.archivedAt)}
                  {row.archivedReason && <span className="text-gray-500 dark:text-gray-400"> · {row.archivedReason}</span>}
                </li>
              )}
            </ul>
          </div>
        </div>

        {archiveOpen && (
          <div className="absolute inset-0 bg-white dark:bg-gray-800 flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Archive lead</h3>
              <button onClick={() => setArchiveOpen(false)} className="text-gray-400 hover:text-gray-600">← Back</button>
            </div>
            <div className="px-5 py-5 space-y-3 flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Why are you archiving <strong>{row.name}</strong>? (optional — for your own records)
              </p>
              <select
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                className="form-select w-full text-sm"
              >
                <option value="">(no reason)</option>
                <option value="spam">Spam</option>
                <option value="wrong_number">Wrong number / bad info</option>
                <option value="duplicate">Duplicate of another lead</option>
                <option value="not_interested">Not interested</option>
                <option value="out_of_area">Out of service area</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/60 flex justify-end gap-2">
              <button onClick={() => setArchiveOpen(false)} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                Cancel
              </button>
              <button onClick={onArchive} disabled={pending} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 disabled:opacity-50">
                {pending ? 'Archiving…' : 'Confirm archive'}
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="absolute bottom-4 right-4 bg-emerald-700 text-white text-xs px-3 py-2 rounded shadow">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
