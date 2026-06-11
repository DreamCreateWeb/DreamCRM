'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PipelineStage } from '@/lib/marketing/terminology'
import type { AudienceFilterT, PatientAudienceFilterT } from '@/lib/services/marketing'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { FilterChip } from '@/components/ui/filter-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import {
  createAudienceAction,
  deleteAudienceAction,
  previewAudienceAction,
  updateAudienceAction,
} from '../actions'

export interface AudienceRow {
  id: number
  name: string
  description: string | null
  recipientSource: 'customers' | 'patients'
  filter: AudienceFilterT
  patientFilter: PatientAudienceFilterT
  recipientCount: number
}

interface Props {
  initial: AudienceRow[]
  /** Drives whether the audience editor exposes patient-segment chips
   * (clinic) or pipeline-stage chips (platform). Phase A clinic users
   * see system audiences but can't yet create custom patient ones via UI
   * — UI for that lands in v1.1. */
  tenantType: 'platform' | 'clinic'
  stages: PipelineStage[]
  sources: string[]
  orgName: string
  /** "patients" (clinic) | "leads" (platform) — drives header copy. */
  leadsLabel: string
}

export default function AudiencesClient({ initial, tenantType, stages, sources, orgName, leadsLabel }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<AudienceRow | 'new' | null>(null)
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)

  function handleDelete(id: number) {
    if (!confirm('Delete this audience? Campaigns referencing it will lose their target list.')) return
    startTransition(async () => {
      await deleteAudienceAction(id)
      setToast('Audience deleted.')
      router.refresh()
    })
  }

  return (
    <>
      <PageHeader
        eyebrow={`Growth · ${orgName}`}
        title="Audiences"
        subtitle={`Saved segments of ${leadsLabel} you can target with a campaign send.`}
        actions={
          <>
            <ActionButton variant="secondary" href="/marketing">
              ← Recall dashboard
            </ActionButton>
            <ActionButton variant="primary" onClick={() => setEditing('new')}>
              + New audience
            </ActionButton>
          </>
        }
      />

      {initial.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="No saved segments yet."
          body='Use "+ New audience" above to slice your roster into a reusable list for campaign sends.'
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {initial.map((a) => (
            <div
              key={a.id}
              className="v2-card p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-100">
                  {a.name}
                </h3>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0 tabular-nums font-mono-num">
                  {a.recipientCount} {a.recipientCount === 1 ? 'recipient' : 'recipients'}
                </span>
              </div>
              {a.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {a.description}
                </p>
              )}
              <AudienceFilterSummary audience={a} stages={stages} />
              <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-[color:var(--color-hairline)]">
                <ActionButton variant="ghost" size="sm" onClick={() => setEditing(a)}>
                  Edit
                </ActionButton>
                <ActionButton variant="danger" size="sm" onClick={() => handleDelete(a.id)} disabled={pending}>
                  Delete
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (() => {
        // Branch the editor by recipientSource. Clinic-source ('patients')
        // audiences get a dental-segment chip set; customer-source ones
        // get the SaaS pipeline-stage chip set. New audiences default to
        // 'patients' for clinic tenants, 'customers' for platform.
        const audience = editing === 'new' ? null : editing
        const source = audience?.recipientSource
          ?? (tenantType === 'clinic' ? 'patients' : 'customers')
        if (source === 'patients') {
          return (
            <PatientAudienceEditor
              audience={audience}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null)
                setToast('Audience saved.')
                router.refresh()
              }}
            />
          )
        }
        return (
          <CustomerAudienceEditor
            audience={audience}
            stages={stages}
            sources={sources}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              setToast('Audience saved.')
              router.refresh()
            }}
          />
        )
      })()}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}

/** Read-only summary of an audience's filters — descriptive badges, not
 * interactive filters, so these stay plain spans (not FilterChip). */
function AudienceFilterSummary({
  audience,
  stages,
}: {
  audience: AudienceRow
  stages: PipelineStage[]
}) {
  const chips: string[] = []
  if (audience.recipientSource === 'patients') {
    const f = audience.patientFilter ?? ({} as PatientAudienceFilterT)
    if (f.lifecycles?.length) chips.push(`Lifecycle: ${f.lifecycles.join(', ')}`)
    if (f.recallStatuses?.length) chips.push(`Recall: ${f.recallStatuses.join(', ')}`)
    if (f.sources?.length) chips.push(`Source: ${f.sources.join(', ')}`)
    if (f.lastVisitAtLeastDaysAgo != null) chips.push(`Last visit ≥ ${f.lastVisitAtLeastDaysAgo}d`)
    if (f.lastVisitWithinDays != null) chips.push(`Last visit ≤ ${f.lastVisitWithinDays}d`)
    if (f.hasOutstandingBalance) chips.push('Has balance')
    if (f.birthdayThisMonth) chips.push('Birthday this month')
    if (f.requireSmsOptIn) chips.push('SMS opt-in only')
    if (chips.length === 0) chips.push('All patients with email opt-in')
  } else {
    const f = audience.filter ?? ({} as AudienceFilterT)
    if (f.stages?.length) {
      chips.push(
        `Stage: ${f.stages
          .map((k) => stages.find((s) => s.key === k)?.label ?? k)
          .join(', ')}`,
      )
    }
    if (f.sources?.length) chips.push(`Source: ${f.sources.join(', ')}`)
    if (f.lifecycleStages?.length) chips.push(`Lifecycle: ${f.lifecycleStages.join(', ')}`)
    if (f.lastActivityWithinDays != null) {
      chips.push(
        f.lastActivityWithinDays >= 0
          ? `Active last ${f.lastActivityWithinDays}d`
          : `Inactive ≥ ${Math.abs(f.lastActivityWithinDays)}d`,
      )
    }
    if (chips.length === 0) chips.push('All non-opted-out contacts')
  }
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span
          key={i}
          className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300"
        >
          {c}
        </span>
      ))}
    </div>
  )
}

function CustomerAudienceEditor({
  audience,
  stages,
  sources,
  onClose,
  onSaved,
}: {
  audience: AudienceRow | null
  stages: PipelineStage[]
  sources: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(audience?.name ?? '')
  const [description, setDescription] = useState(audience?.description ?? '')
  const [filter, setFilter] = useState<AudienceFilterT>(audience?.filter ?? {})
  const [preview, setPreview] = useState<{ count: number; sample: { name: string; email: string }[] } | null>(null)
  const [pending, startTransition] = useTransition()

  function refreshPreview() {
    startTransition(async () => {
      const p = await previewAudienceAction({ recipientSource: 'customers', filter })
      setPreview(p)
    })
  }

  function toggleStage(key: string) {
    setFilter((f) => {
      const cur = new Set(f.stages ?? [])
      if (cur.has(key)) cur.delete(key)
      else cur.add(key)
      return { ...f, stages: Array.from(cur) }
    })
  }
  function toggleSource(key: string) {
    setFilter((f) => {
      const cur = new Set(f.sources ?? [])
      if (cur.has(key)) cur.delete(key)
      else cur.add(key)
      return { ...f, sources: Array.from(cur) }
    })
  }

  function save() {
    startTransition(async () => {
      if (audience) {
        await updateAudienceAction(audience.id, {
          name,
          description: description || null,
          recipientSource: 'customers',
          filter,
        })
      } else {
        await createAudienceAction({
          name,
          description: description || null,
          recipientSource: 'customers',
          filter,
        })
      }
      onSaved()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            {audience ? 'Edit audience' : 'New audience'}
          </h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Trial users week 1"
              className="form-input w-full"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this segment is used for"
              className="form-input w-full"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-2">
              Pipeline stages
            </label>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((s) => (
                <FilterChip key={s.key} active={filter.stages?.includes(s.key) ?? false} onClick={() => toggleStage(s.key)}>
                  {s.label}
                </FilterChip>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Empty = all stages
            </p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-2">
              Sources
            </label>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <FilterChip key={s} active={filter.sources?.includes(s) ?? false} onClick={() => toggleSource(s)}>
                  {s}
                </FilterChip>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
              Activity window
            </label>
            <select
              value={filter.lastActivityWithinDays?.toString() ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setFilter((f) => ({
                  ...f,
                  lastActivityWithinDays: v === '' ? undefined : Number(v),
                }))
              }}
              className="form-select w-full"
            >
              <option value="">Any</option>
              <option value="7">Active in last 7 days</option>
              <option value="30">Active in last 30 days</option>
              <option value="90">Active in last 90 days</option>
              <option value="-30">Inactive ≥ 30 days</option>
              <option value="-90">Inactive ≥ 90 days</option>
            </select>
          </div>

          <div className="bg-stone-50 dark:bg-gray-900/40 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                Preview
              </span>
              <ActionButton variant="secondary" size="sm" onClick={refreshPreview} disabled={pending}>
                Refresh
              </ActionButton>
            </div>
            {preview ? (
              <>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">
                  {preview.count} {preview.count === 1 ? 'recipient' : 'recipients'}
                </p>
                {preview.sample.length > 0 && (
                  <ul className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
                    {preview.sample.map((s, i) => (
                      <li key={i}>{s.name} · {s.email}</li>
                    ))}
                    {preview.count > preview.sample.length && (
                      <li className="text-gray-500 dark:text-gray-400 italic">
                        … and {preview.count - preview.sample.length} more
                      </li>
                    )}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                Click Refresh to see who's in this audience.
              </p>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-gray-800">
          <ActionButton variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={save} disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : audience ? 'Save' : 'Create'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

// ── Patient audience editor (clinic tenant) ───────────────────────────
// Dental-segment chips replacing the SaaS pipeline-stage chips. Every
// product surveyed (Lighthouse 360, RevenueWell, NexHealth, Weave)
// exposes some flavor of these filters; the live recipient count below
// is universal table stakes per the research.

const PATIENT_LIFECYCLES = [
  { key: 'new', label: 'New' },
  { key: 'active', label: 'Active' },
  { key: 'at_risk', label: 'At risk' },
  { key: 'lapsed', label: 'Lapsed' },
]

const PATIENT_RECALL_STATUSES = [
  { key: 'due', label: 'Recall due' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'na', label: 'N/A (no past visit)' },
]

const PATIENT_SOURCES = [
  { key: 'walk_in', label: 'Walk-in' },
  { key: 'website', label: 'Website' },
  { key: 'referral', label: 'Referral' },
  { key: 'booking', label: 'Booking widget' },
  { key: 'lead_form', label: 'Lead form' },
  { key: 'invite', label: 'Invite' },
  { key: 'manual', label: 'Front-desk added' },
]

const LAST_VISIT_OPTIONS = [
  { key: '', label: 'Any' },
  { key: '90', label: '90+ days ago' },
  { key: '180', label: '180+ days ago' },
  { key: '270', label: '270+ days ago' },
  { key: '365', label: '365+ days ago' },
]

function PatientAudienceEditor({
  audience,
  onClose,
  onSaved,
}: {
  audience: AudienceRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(audience?.name ?? '')
  const [description, setDescription] = useState(audience?.description ?? '')
  // Seed defaults on new audience: require email opt-in, exclude archived.
  // Research recommendation: never let a clinic create an "everyone unseen
  // for 2 years" segment by accident (Demandforce's cautionary tale).
  const [filter, setFilter] = useState<PatientAudienceFilterT>(
    audience?.patientFilter ?? ({
      requireEmailOptIn: true,
      requireSmsOptIn: false,
      includeArchived: false,
    } as PatientAudienceFilterT),
  )
  const [preview, setPreview] = useState<{ count: number; sample: { name: string; email: string }[] } | null>(null)
  const [pending, startTransition] = useTransition()

  function refreshPreview() {
    startTransition(async () => {
      const p = await previewAudienceAction({
        recipientSource: 'patients',
        patientFilter: filter,
      })
      setPreview(p)
    })
  }

  function toggleInArray<K extends keyof PatientAudienceFilterT>(key: K, value: string) {
    setFilter((f) => {
      const cur = new Set(((f[key] as unknown as string[] | undefined) ?? []))
      if (cur.has(value)) cur.delete(value)
      else cur.add(value)
      const next = Array.from(cur)
      return { ...f, [key]: next.length === 0 ? undefined : next } as PatientAudienceFilterT
    })
  }

  function save() {
    startTransition(async () => {
      if (audience) {
        await updateAudienceAction(audience.id, {
          name,
          description: description || null,
          recipientSource: 'patients',
          patientFilter: filter,
        })
      } else {
        await createAudienceAction({
          name,
          description: description || null,
          recipientSource: 'patients',
          patientFilter: filter,
        })
      }
      onSaved()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60 sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur z-10">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            {audience ? 'Edit patient segment' : 'New patient segment'}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Filter the patient roster into a reusable list for campaign sends.
          </p>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lapsed family patients"
              className="form-input w-full"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
              Description (optional)
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this segment is used for"
              className="form-input w-full"
            />
          </div>

          <ChipRow
            label="Lifecycle"
            help="Where the patient is in their relationship with the practice"
            options={PATIENT_LIFECYCLES}
            selected={filter.lifecycles ?? []}
            onToggle={(v) => toggleInArray('lifecycles', v)}
          />

          <ChipRow
            label="Recall status"
            help="Derived from last completed visit + future bookings"
            options={PATIENT_RECALL_STATUSES}
            selected={filter.recallStatuses ?? []}
            onToggle={(v) => toggleInArray('recallStatuses', v)}
          />

          <ChipRow
            label="Where they came from"
            help="Acquisition source from the patient row"
            options={PATIENT_SOURCES}
            selected={filter.sources ?? []}
            onToggle={(v) => toggleInArray('sources', v)}
          />

          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
              Last visit was at least
            </label>
            <select
              value={filter.lastVisitAtLeastDaysAgo?.toString() ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setFilter((f) => ({
                  ...f,
                  lastVisitAtLeastDaysAgo: v === '' ? undefined : Number(v),
                }))
              }}
              className="form-select w-full"
            >
              {LAST_VISIT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToggleField
              label="Has outstanding balance"
              help="Pending or overdue invoice"
              checked={filter.hasOutstandingBalance === true}
              onChange={(v) => setFilter((f) => ({ ...f, hasOutstandingBalance: v ? true : undefined }))}
            />
            <ToggleField
              label="Birthday this month"
              help="DOB month matches current month"
              checked={filter.birthdayThisMonth === true}
              onChange={(v) => setFilter((f) => ({ ...f, birthdayThisMonth: v ? true : undefined }))}
            />
          </div>

          <div className="bg-stone-50 dark:bg-gray-900/40 rounded-lg p-3 space-y-2">
            <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
              Channel eligibility
            </p>
            <ToggleField
              label="Require email opt-in"
              help="Recommended on for email sends — excludes opted-out patients"
              checked={filter.requireEmailOptIn !== false}
              onChange={(v) => setFilter((f) => ({ ...f, requireEmailOptIn: v }))}
            />
            <ToggleField
              label="Require SMS opt-in"
              help="Required for SMS sends (Phase B). Excludes patients without explicit TCPA opt-in"
              checked={filter.requireSmsOptIn === true}
              onChange={(v) => setFilter((f) => ({ ...f, requireSmsOptIn: v }))}
            />
            <ToggleField
              label="Include lapsed + archived patients"
              help="Off by default — archived patients are generally not for marketing"
              checked={filter.includeArchived === true}
              onChange={(v) => setFilter((f) => ({ ...f, includeArchived: v }))}
            />
          </div>

          {/* Live preview — every product researched ships this */}
          <div className="bg-violet-50 dark:bg-violet-500/10 rounded-lg p-3 border border-violet-200 dark:border-violet-500/30">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-violet-800 dark:text-violet-300">
                Live preview
              </span>
              <ActionButton variant="secondary" size="sm" onClick={refreshPreview} disabled={pending}>
                {pending ? 'Counting…' : 'Refresh'}
              </ActionButton>
            </div>
            {preview ? (
              <>
                <p className="text-base font-bold text-violet-900 dark:text-violet-200 tabular-nums">
                  {preview.count} {preview.count === 1 ? 'patient' : 'patients'} match
                </p>
                {preview.sample.length > 0 && (
                  <ul className="text-xs text-violet-800/80 dark:text-violet-300/80 mt-1 space-y-0.5">
                    {preview.sample.map((s, i) => (
                      <li key={i}>{s.name}{s.email && <span className="text-violet-700/70 dark:text-violet-400/70"> · {s.email}</span>}</li>
                    ))}
                    {preview.count > preview.sample.length && (
                      <li className="italic opacity-80">… and {preview.count - preview.sample.length} more</li>
                    )}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-xs text-violet-700/80 dark:text-violet-300/80 italic">
                Click Refresh to see who matches.
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-gray-800">
          <ActionButton variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={save} disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : audience ? 'Save' : 'Create'}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function ChipRow({
  label,
  help,
  options,
  selected,
  onToggle,
}: {
  label: string
  help: string
  options: { key: string; label: string }[]
  selected: string[]
  onToggle: (key: string) => void
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
        {label}
      </label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{help}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <FilterChip key={o.key} active={selected.includes(o.key)} onClick={() => onToggle(o.key)}>
            {o.label}
          </FilterChip>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Empty = no filter on this dimension</p>
      )}
    </div>
  )
}

function ToggleField({
  label,
  help,
  checked,
  onChange,
}: {
  label: string
  help: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-400"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 leading-tight">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{help}</p>
      </div>
    </label>
  )
}
