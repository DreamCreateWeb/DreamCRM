'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Drawer from '@/components/ui/drawer'
import { stageAccentClasses, type PipelineStage } from '@/lib/marketing/terminology'
import { ActionButton } from '@/components/ui/action-button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { FlashToast } from '@/components/ui/flash-toast'
import {
  archiveLeadAction,
  setOptedOutAction,
  updateLeadAction,
} from '../actions'

export interface PipelineLeadDetail {
  id: number
  name: string
  email: string
  phone: string | null
  location: string | null
  pipelineStage: string
  leadSource: string | null
  lifecycleStage: string
  notes: string | null
  optedOut: boolean
  lastActivityAt: string | null
  createdAt: string
}

interface Props {
  lead: PipelineLeadDetail | null
  stages: PipelineStage[]
  sources: string[]
}

export default function PipelineLeadDrawer({ lead, stages, sources }: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<PipelineLeadDetail | null>(lead)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setDraft(lead)
    setDirty(false)
  }, [lead?.id])

  function close() {
    const params = new URLSearchParams(sp.toString())
    params.delete('lead')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function save() {
    if (!draft || !lead) return
    startTransition(async () => {
      await updateLeadAction(lead.id, {
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        location: draft.location,
        pipelineStage: draft.pipelineStage,
        leadSource: draft.leadSource,
        notes: draft.notes,
      })
      setDirty(false)
      setToast('Lead saved.')
      router.refresh()
    })
  }

  async function archive() {
    if (!lead) return
    if (
      !(await confirm({
        title: 'Archive this lead?',
        message: 'You can find it again in the archived view.',
        confirmLabel: 'Archive',
        danger: true,
      }))
    )
      return
    startTransition(async () => {
      await archiveLeadAction(lead.id)
      close()
      router.refresh()
    })
  }

  function toggleOptedOut() {
    if (!lead || !draft) return
    const next = !draft.optedOut
    setDraft((d) => (d ? { ...d, optedOut: next } : d))
    startTransition(async () => {
      await setOptedOutAction(lead.id, next)
      setToast(next ? 'Opted out of marketing.' : 'Re-subscribed to marketing.')
      router.refresh()
    })
  }

  if (!draft || !lead) {
    return <Drawer open={false} onClose={close} title={null} size="md"><div /></Drawer>
  }

  const stage = stages.find((s) => s.key === draft.pipelineStage)
  const accent = stageAccentClasses(stage?.accent ?? 'stone')

  return (
    <>
    <Drawer
      open={true}
      onClose={close}
      size="md"
      title={
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} aria-hidden="true" />
          <span className="truncate">{draft.name}</span>
        </div>
      }
      actions={
        <ActionButton variant="danger" size="sm" onClick={archive} disabled={pending}>
          Archive
        </ActionButton>
      }
      footer={
        dirty ? (
          <div className="flex justify-end gap-2">
            <ActionButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(lead)
                setDirty(false)
              }}
              disabled={pending}
            >
              Revert
            </ActionButton>
            <ActionButton variant="primary" size="sm" onClick={save} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </ActionButton>
          </div>
        ) : null
      }
    >
      <div className="px-5 py-4 space-y-4 overflow-y-auto">
        <Section label="Stage">
          <select
            value={draft.pipelineStage}
            onChange={(e) => {
              setDraft((d) => (d ? { ...d, pipelineStage: e.target.value } : d))
              setDirty(true)
            }}
            className="form-select w-full"
          >
            {stages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Section>

        <Section label="Source">
          <select
            value={draft.leadSource ?? ''}
            onChange={(e) => {
              setDraft((d) => (d ? { ...d, leadSource: e.target.value || null } : d))
              setDirty(true)
            }}
            className="form-select w-full"
          >
            <option value="">—</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Section>

        <Section label="Name">
          <input
            value={draft.name}
            onChange={(e) => {
              setDraft((d) => (d ? { ...d, name: e.target.value } : d))
              setDirty(true)
            }}
            className="form-input w-full"
          />
        </Section>
        <Section label="Email">
          <input
            type="email"
            value={draft.email}
            onChange={(e) => {
              setDraft((d) => (d ? { ...d, email: e.target.value } : d))
              setDirty(true)
            }}
            className="form-input w-full"
          />
        </Section>
        <div className="grid grid-cols-2 gap-3">
          <Section label="Phone">
            <input
              type="tel"
              value={draft.phone ?? ''}
              onChange={(e) => {
                setDraft((d) => (d ? { ...d, phone: e.target.value || null } : d))
                setDirty(true)
              }}
              className="form-input w-full"
            />
          </Section>
          <Section label="Location">
            <input
              value={draft.location ?? ''}
              onChange={(e) => {
                setDraft((d) => (d ? { ...d, location: e.target.value || null } : d))
                setDirty(true)
              }}
              className="form-input w-full"
            />
          </Section>
        </div>
        <Section label="Notes">
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => {
              setDraft((d) => (d ? { ...d, notes: e.target.value || null } : d))
              setDirty(true)
            }}
            rows={6}
            className="form-textarea w-full resize-y"
          />
        </Section>

        <div className="flex items-center justify-between gap-3 v2-well px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
              Marketing emails
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {draft.optedOut
                ? "This contact has opted out — they won't receive campaign sends."
                : 'This contact is included in campaign sends targeted at their stage.'}
            </p>
          </div>
          <ActionButton variant="secondary" size="sm" onClick={toggleOptedOut} disabled={pending} className="shrink-0">
            {draft.optedOut ? 'Re-subscribe' : 'Opt out'}
          </ActionButton>
        </div>

        <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num pt-2 border-t border-[color:var(--color-hairline)]">
          Added {new Date(draft.createdAt).toLocaleDateString()}
          {draft.lastActivityAt && ` · Last activity ${new Date(draft.lastActivityAt).toLocaleDateString()}`}
        </div>
      </div>
    </Drawer>
    {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
