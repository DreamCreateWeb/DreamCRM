'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Drawer from '@/components/ui/drawer'
import { stageAccentClasses, type PipelineStage } from '@/lib/marketing/terminology'
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
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState<PipelineLeadDetail | null>(lead)
  const [dirty, setDirty] = useState(false)

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
      router.refresh()
    })
  }

  function archive() {
    if (!lead) return
    if (!confirm('Archive this lead? You can find it again in the archived view.')) return
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
      router.refresh()
    })
  }

  if (!draft || !lead) {
    return <Drawer open={false} onClose={close} title={null} size="md"><div /></Drawer>
  }

  const stage = stages.find((s) => s.key === draft.pipelineStage)
  const accent = stageAccentClasses(stage?.accent ?? 'stone')

  return (
    <Drawer
      open={true}
      onClose={close}
      size="md"
      title={
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
          <span className="truncate">{draft.name}</span>
        </div>
      }
      actions={
        <button
          onClick={archive}
          disabled={pending}
          className="text-[12px] font-medium px-2 py-1 rounded-md text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 disabled:opacity-50"
        >
          Archive
        </button>
      }
      footer={
        dirty ? (
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setDraft(lead)
                setDirty(false)
              }}
              disabled={pending}
              className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              Revert
            </button>
            <button
              onClick={save}
              disabled={pending}
              className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
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
            className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
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
            className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
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
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
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
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
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
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
            />
          </Section>
          <Section label="Location">
            <input
              value={draft.location ?? ''}
              onChange={(e) => {
                setDraft((d) => (d ? { ...d, location: e.target.value || null } : d))
                setDirty(true)
              }}
              className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
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
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 resize-y"
          />
        </Section>

        <div className="flex items-center justify-between bg-stone-50 dark:bg-stone-800/50 rounded-lg px-3 py-2.5">
          <div>
            <p className="text-[12px] font-medium text-stone-800 dark:text-stone-100">
              Marketing emails
            </p>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              {draft.optedOut
                ? "This contact has opted out — they won't receive campaign sends."
                : 'This contact is included in campaign sends targeted at their stage.'}
            </p>
          </div>
          <button
            onClick={toggleOptedOut}
            disabled={pending}
            className={
              draft.optedOut
                ? 'text-[12px] font-medium px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20'
                : 'text-[12px] font-medium px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-600'
            }
          >
            {draft.optedOut ? 'Re-subscribe' : 'Opt out'}
          </button>
        </div>

        <div className="text-[11px] text-stone-400 dark:text-stone-500 pt-2 border-t border-stone-100 dark:border-stone-700/40">
          Added {new Date(draft.createdAt).toLocaleDateString()}
          {draft.lastActivityAt && ` · Last activity ${new Date(draft.lastActivityAt).toLocaleDateString()}`}
        </div>
      </div>
    </Drawer>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
