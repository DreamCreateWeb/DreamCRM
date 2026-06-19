'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import {
  previewImportAction,
  importPatientsAction,
  type ImportPreview,
} from './actions'
import type { ColumnMapping, ImportField, ImportSummary } from '@/lib/services/patient-import'
import { useFocusTrap } from '@/components/ui/use-focus-trap'

/**
 * CSV patient import — upload → auto-map columns (with manual remap) → preview
 * the first rows → import → result summary. The file is kept client-side and
 * re-sent with the confirmed mapping on commit (server re-parses; no temp
 * storage). Owner/admin gated server-side.
 */

// Human labels for the mappable fields, in the order shown in the remap UI.
const FIELD_LABELS: Array<{ field: ImportField; label: string; required?: boolean }> = [
  { field: 'firstName', label: 'First name' },
  { field: 'lastName', label: 'Last name' },
  { field: 'fullName', label: 'Full name (split into first/last)' },
  { field: 'email', label: 'Email' },
  { field: 'phone', label: 'Phone' },
  { field: 'dateOfBirth', label: 'Date of birth' },
  { field: 'addressLine1', label: 'Address' },
  { field: 'city', label: 'City' },
  { field: 'state', label: 'State' },
  { field: 'postalCode', label: 'Postal code' },
  { field: 'insuranceProvider', label: 'Insurance provider' },
]

type Stage =
  | { type: 'upload' }
  | { type: 'mapping'; preview: ImportPreview }
  | { type: 'result'; summary: ImportSummary }

export default function ImportPatientsModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, dialogRef, { onEscape: onClose })
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>({ type: 'upload' })
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function doPreview() {
    setError(null)
    if (!file) {
      setError('Choose a CSV file first.')
      return
    }
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const r = await previewImportAction(fd)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setMapping(r.mapping)
      setStage({ type: 'mapping', preview: r })
    })
  }

  function setFieldColumn(field: ImportField, columnIdx: number | null) {
    setMapping((cur) => {
      const next: ColumnMapping = { ...cur }
      // A column can only fill one field — clear any other field pointing at it.
      if (columnIdx !== null) {
        for (const k of Object.keys(next) as ImportField[]) {
          if (next[k] === columnIdx) delete next[k]
        }
        next[field] = columnIdx
      } else {
        delete next[field]
      }
      return next
    })
  }

  function doImport() {
    setError(null)
    if (!file) return
    const hasName = mapping.firstName !== undefined || mapping.fullName !== undefined
    if (!hasName) {
      setError('Map a column to the patient name (first name, or a single full-name column).')
      return
    }
    const fd = new FormData()
    fd.set('file', file)
    fd.set('mapping', JSON.stringify(mapping))
    startTransition(async () => {
      const r = await importPatientsAction(fd)
      if (!r.ok) {
        setError(r.error)
        return
      }
      const { ok: _ok, ...summary } = r
      setStage({ type: 'result', summary })
    })
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Import patients" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px] px-2 sm:px-4">
      <div className="section-enter bg-[color:var(--color-surface-2)] rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-5 border-b border-[color:var(--color-hairline)] flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Import patients</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Upload a CSV from your old system or a spreadsheet. We&apos;ll skip anyone who already
              has the same email or phone on file.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          {/* ── Stage: upload ─────────────────────────────────────── */}
          {stage.type === 'upload' && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  CSV file
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null)
                    setError(null)
                  }}
                  className="form-input w-full mt-1 text-sm"
                />
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                The first row should be column headers (e.g. First Name, Last Name, Email, Phone,
                Date of Birth). Up to 5,000 patients per file.
              </p>
            </div>
          )}

          {/* ── Stage: mapping + preview ──────────────────────────── */}
          {stage.type === 'mapping' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                  Match your columns
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  We guessed these from your headers — change any that look off. Leave a field as
                  &ldquo;— ignore —&rdquo; to skip it.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FIELD_LABELS.map(({ field, label }) => (
                    <label key={field} className="flex items-center gap-2 text-sm">
                      <span className="w-36 shrink-0 text-gray-600 dark:text-gray-300">{label}</span>
                      <select
                        value={mapping[field] ?? ''}
                        onChange={(e) =>
                          setFieldColumn(field, e.target.value === '' ? null : Number(e.target.value))
                        }
                        className="form-select text-xs py-1 flex-1 min-w-0"
                      >
                        <option value="">— ignore —</option>
                        {stage.preview.header.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
                  Preview{' '}
                  <span className="font-normal text-gray-500 dark:text-gray-400 tabular-nums">
                    (first {stage.preview.sample.length} of {stage.preview.totalRows.toLocaleString()})
                  </span>
                </h3>
                {stage.preview.truncated && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">
                    This file has more than 5,000 rows — only the first 5,000 will be imported.
                  </p>
                )}
                <div className="overflow-x-auto rounded-lg ring-1 ring-inset ring-[color:var(--color-hairline)]">
                  <table className="table-auto w-full text-xs">
                    <thead className="bg-[color:var(--color-surface-sunk)] text-gray-500 dark:text-gray-400">
                      <tr>
                        {stage.preview.header.map((h, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                            {h || `Column ${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--color-hairline)]">
                      {stage.preview.sample.map((row, r) => (
                        <tr key={r}>
                          {stage.preview.header.map((_, c) => (
                            <td key={c} className="px-2 py-1.5 text-gray-700 dark:text-gray-200 whitespace-nowrap max-w-[160px] truncate">
                              {row[c] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Stage: result ─────────────────────────────────────── */}
          {stage.type === 'result' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <ResultStat n={stage.summary.created} label="Created" tone="emerald" />
                <ResultStat n={stage.summary.duplicates} label="Skipped (duplicates)" tone="amber" />
                <ResultStat n={stage.summary.errors} label="Errors" tone="rose" />
              </div>
              {(stage.summary.duplicates > 0 || stage.summary.errors > 0) && (
                <div className="rounded-lg ring-1 ring-inset ring-[color:var(--color-hairline)] max-h-48 overflow-y-auto">
                  <table className="table-auto w-full text-xs">
                    <tbody className="divide-y divide-[color:var(--color-hairline)]">
                      {stage.summary.results
                        .filter((row) => row.status !== 'created')
                        .map((row) => (
                          <tr key={row.row}>
                            <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 tabular-nums w-12">
                              {row.row}
                            </td>
                            <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">{row.name}</td>
                            <td className={`px-3 py-1.5 ${row.status === 'duplicate' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`}>
                              {row.reason}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-rose-700 dark:text-rose-300 mt-3">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[color:var(--color-hairline)] flex justify-end gap-2">
          {stage.type === 'upload' && (
            <>
              <ActionButton variant="secondary" size="sm" onClick={onClose} disabled={pending}>
                Cancel
              </ActionButton>
              <ActionButton variant="primary" size="sm" onClick={doPreview} disabled={pending || !file}>
                {pending ? 'Reading…' : 'Next: match columns'}
              </ActionButton>
            </>
          )}
          {stage.type === 'mapping' && (
            <>
              <ActionButton variant="secondary" size="sm" onClick={() => setStage({ type: 'upload' })} disabled={pending}>
                Back
              </ActionButton>
              <ActionButton variant="primary" size="sm" onClick={doImport} disabled={pending}>
                {pending ? 'Importing…' : `Import ${stage.preview.truncated ? '5,000' : stage.preview.totalRows.toLocaleString()} patients`}
              </ActionButton>
            </>
          )}
          {stage.type === 'result' && (
            <ActionButton
              variant="primary"
              size="sm"
              onClick={() => {
                onClose()
                router.refresh()
              }}
            >
              Done
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultStat({ n, label, tone }: { n: number; label: string; tone: 'emerald' | 'amber' | 'rose' }) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-rose-700 dark:text-rose-300'
  return (
    <div className="v2-well px-3 py-3 text-center">
      <div className={`text-2xl font-bold font-mono-num tabular-nums ${toneClass}`}>{n}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
    </div>
  )
}
