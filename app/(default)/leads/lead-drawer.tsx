'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import type { LeadRow, LeadStatus } from '@/lib/services/leads'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import type { Tone } from '@/lib/ui/encodings'
import {
  markLeadContactedAction,
  archiveLeadAction,
  reopenLeadAction,
  convertLeadAction,
  previewLeadConvertAction,
} from './actions'

// Same tone-contract mapping the list uses (see leads-view): new=special,
// contacted=info (ball is theirs once we reach out), converted=ok,
// archived=neutral.
const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: 'special',
  contacted: 'info',
  converted: 'ok',
  archived: 'neutral',
}
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  archived: 'Archived',
}
const STATUS_PILL_MEANING: Record<LeadStatus, string> = {
  new: 'Just arrived — needs a first call',
  contacted: "We reached out — ball's in their court",
  converted: 'Became a patient',
  archived: 'Spam, wrong number, or not a fit',
}

const LABEL_CLASS = 'text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold'

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
  // Surfaced on drawer OPEN (not just inside Convert): if this lead's
  // email/phone already matches a patient, show a heads-up chip so staff
  // know before they call/convert. Same dry-run the convert step uses.
  const [existingHint, setExistingHint] = useState<string | null>(null)

  // Run the dedupe dry-run when the drawer opens for an actionable lead
  // (new / contacted). Converted leads already link to their patient; the
  // chip would be redundant. Best-effort — a failed preview just hides it.
  useEffect(() => {
    if (row.status !== 'new' && row.status !== 'contacted') return
    let cancelled = false
    async function checkExisting() {
      try {
        const res = await previewLeadConvertAction(row.id)
        if (cancelled) return
        if ('ok' in res && res.ok && res.matchedPatientName) {
          setExistingHint(res.matchedPatientName)
        }
      } catch {
        // non-blocking — leave the chip hidden
      }
    }
    void checkExisting()
    return () => { cancelled = true }
  }, [row.id, row.status])

  function flash(msg: string) {
    setToast(msg)
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
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-5 py-5 space-y-4 flex-1">
          {/* Identity + status */}
          <div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{row.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusPill
                tone={STATUS_TONE[row.status]}
                label={STATUS_LABEL[row.status]}
                title={STATUS_PILL_MEANING[row.status]}
              />
              {row.status === 'new' && row.ageHours <= 1 && (
                <StatusPill
                  tone="ok"
                  label="Fresh — call now"
                  title="Conversion is highest in the first hour — call now"
                />
              )}
              {row.status === 'converted' && row.convertedPatientName && (
                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                  → {row.convertedPatientName}
                </span>
              )}
            </div>
            {/* Existing-patient heads-up surfaced on open (info/sky — the
                ball isn't ours, it's just useful context before converting). */}
            {existingHint && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-sky-500/10 px-2 py-1 text-xs text-sky-700 dark:text-sky-300">
                <span aria-hidden="true">↪</span>
                <span>
                  Looks like an existing patient:{' '}
                  <span className="font-semibold">{existingHint}</span>
                </span>
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className={`${LABEL_CLASS} w-16`}>Phone</span>
              <a href={`tel:${row.phone}`} className="text-gray-800 dark:text-gray-100 hover:underline">{row.phone}</a>
            </div>
            {row.email && (
              <div className="flex items-center gap-2">
                <span className={`${LABEL_CLASS} w-16`}>Email</span>
                <a href={`mailto:${row.email}`} className="text-gray-800 dark:text-gray-100 hover:underline">{row.email}</a>
              </div>
            )}
            {row.preferredDate && (
              <div className="flex items-center gap-2">
                <span className={`${LABEL_CLASS} w-16`}>Prefers</span>
                <span className="text-gray-800 dark:text-gray-100">{row.preferredDate}</span>
              </div>
            )}
          </div>

          {/* Message */}
          {row.message && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
              <p className={`${LABEL_CLASS} mb-1`}>Message</p>
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap italic">
                &ldquo;{row.message}&rdquo;
              </p>
            </div>
          )}

          {/* Action ladder — ONE primary, following the lifecycle:
              new → Mark contacted · contacted → Convert · converted → Open
              patient. Archive/Reopen are secondary (not destructive). */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-700/60">
            {row.status === 'new' && (
              <>
                <ActionButton variant="primary" size="sm" onClick={onMarkContacted} disabled={pending}>
                  Mark contacted
                </ActionButton>
                <ActionButton variant="secondary" size="sm" onClick={onConvert} disabled={pending}>
                  Convert to patient
                </ActionButton>
                <ActionButton variant="secondary" size="sm" onClick={() => setArchiveOpen(true)} disabled={pending}>
                  Archive
                </ActionButton>
              </>
            )}
            {row.status === 'contacted' && (
              <>
                <ActionButton variant="primary" size="sm" onClick={onConvert} disabled={pending}>
                  Convert to patient
                </ActionButton>
                <ActionButton variant="secondary" size="sm" onClick={() => setArchiveOpen(true)} disabled={pending}>
                  Archive
                </ActionButton>
              </>
            )}
            {row.status === 'converted' && row.convertedToPatientId && (
              <ActionButton variant="primary" size="sm" href={`/patients/${row.convertedToPatientId}`}>
                Open patient
              </ActionButton>
            )}
            {row.status === 'archived' && (
              <ActionButton variant="secondary" size="sm" onClick={onReopen} disabled={pending}>
                Reopen
              </ActionButton>
            )}
          </div>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

          {/* Dedupe confirmation — convert matched an existing patient. */}
          {dedupeMatch && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                This lead&rsquo;s email or phone matches an existing patient:{' '}
                <span className="font-semibold">{dedupeMatch}</span>. Link this lead to
                them, or create a separate patient (e.g. a family member on a shared number)?
              </p>
              <div className="flex flex-wrap gap-2">
                <ActionButton variant="primary" size="sm" onClick={() => runConvert(false)} disabled={pending}>
                  Link to {dedupeMatch.split(' ')[0]}
                </ActionButton>
                <ActionButton variant="secondary" size="sm" onClick={() => runConvert(true)} disabled={pending}>
                  Create separate patient
                </ActionButton>
                <ActionButton variant="ghost" size="sm" onClick={() => setDedupeMatch(null)} disabled={pending}>
                  Cancel
                </ActionButton>
              </div>
            </div>
          )}

          {/* Source attribution */}
          {(row.sourcePage || row.referrer || row.utmSource) && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
              <p className={`${LABEL_CLASS} mb-1`}>Where they came from</p>
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
            <p className={`${LABEL_CLASS} mb-1`}>Timeline</p>
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
              <button onClick={() => setArchiveOpen(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Back</button>
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
              <ActionButton variant="ghost" size="sm" onClick={() => setArchiveOpen(false)} disabled={pending}>
                Cancel
              </ActionButton>
              <ActionButton variant="primary" size="sm" onClick={onArchive} disabled={pending}>
                {pending ? 'Archiving…' : 'Confirm archive'}
              </ActionButton>
            </div>
          </div>
        )}

        {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
      </div>
    </div>
  )
}
