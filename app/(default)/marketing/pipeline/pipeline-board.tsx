'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn, relativeTime } from '@/lib/utils'
import { stageAccentClasses, type PipelineStage } from '@/lib/marketing/terminology'
import { StatusPill } from '@/components/ui/status-pill'
import { moveLeadAction } from '../actions'

export interface PipelineLead {
  id: number
  name: string
  email: string
  phone: string | null
  pipelineStage: string
  leadSource: string | null
  lastActivityAt: string | null
  optedOut: boolean
}

interface Props {
  initialByStage: Record<string, PipelineLead[]>
  stages: PipelineStage[]
}

/**
 * Lead pipeline kanban. Mirrors the tasks kanban shape (dnd-kit + DragOverlay,
 * optimistic local state, router.refresh() reconciliation after the server
 * action persists). Column count is dynamic — driven by the terminology
 * helper — so platform (6 stages) and clinic (4 stages) get different boards
 * from the same component.
 */
export default function PipelineBoard({ initialByStage, stages }: Props) {
  const router = useRouter()
  const [byStage, setByStage] = useState(initialByStage)
  const [activeLead, setActiveLead] = useState<PipelineLead | null>(null)
  const [, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  function findContainer(leadId: number): string | null {
    for (const stage of stages) {
      if ((byStage[stage.key] ?? []).some((l) => l.id === leadId)) return stage.key
    }
    return null
  }

  function handleDragStart(e: DragStartEvent) {
    const id = Number(e.active.id)
    for (const stage of stages) {
      const lead = (byStage[stage.key] ?? []).find((l) => l.id === id)
      if (lead) {
        setActiveLead(lead)
        return
      }
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = e
    if (!over) return

    const activeId = Number(active.id)
    const overId = String(over.id)

    const sourceStage = findContainer(activeId)
    if (!sourceStage) return

    let destStage: string
    if (overId.startsWith('col:')) {
      destStage = overId.slice(4)
    } else {
      const targetId = Number(overId)
      const target = findContainer(targetId)
      if (!target) return
      destStage = target
    }

    if (sourceStage === destStage) return

    // Optimistic move
    setByStage((prev) => {
      const sourceList = [...(prev[sourceStage] ?? [])]
      const idx = sourceList.findIndex((l) => l.id === activeId)
      if (idx === -1) return prev
      const [moved] = sourceList.splice(idx, 1)
      moved.pipelineStage = destStage
      const destList = [moved, ...(prev[destStage] ?? [])]
      return { ...prev, [sourceStage]: sourceList, [destStage]: destList }
    })

    startTransition(async () => {
      try {
        await moveLeadAction(activeId, destStage)
        router.refresh()
      } catch (err) {
        console.warn('[pipeline] move failed', err)
        router.refresh()
      }
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(220px, 1fr))` }}
      >
        {stages.map((stage) => (
          <Column key={stage.key} stage={stage} leads={byStage[stage.key] ?? []} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeLead ? (
          <div className="opacity-95 rotate-1 shadow-[var(--shadow-pop)] rounded-[var(--r-md)]">
            <LeadCard lead={activeLead} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ stage, leads }: { stage: PipelineStage; leads: PipelineLead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage.key}` })
  const sortableIds = leads.map((l) => l.id)
  const accent = stageAccentClasses(stage.accent)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-[var(--r-lg)] border border-[color:var(--color-hairline)] bg-[color:var(--color-surface-sunk)] p-2 min-h-[10rem]',
        isOver && 'ring-2 ring-teal-500/45',
      )}
    >
      <div className="px-1.5 pb-2 pt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', accent.dot)} aria-hidden="true" />
          <h2 className="text-xs uppercase tracking-wider font-semibold text-gray-600 dark:text-gray-300 truncate">
            {stage.label}
          </h2>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
          {leads.length}
        </span>
      </div>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {leads.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 italic px-1.5 py-1.5">
              Drop here
            </div>
          ) : (
            leads.map((lead) => <SortableLeadCard key={lead.id} lead={lead} />)
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableLeadCard({ lead }: { lead: PipelineLead }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard lead={lead} />
    </div>
  )
}

function LeadCard({ lead, isDragging }: { lead: PipelineLead; isDragging?: boolean }) {
  const pathname = usePathname()
  const sp = useSearchParams()
  const params = new URLSearchParams(sp.toString())
  params.set('lead', String(lead.id))
  const drawerHref = `${pathname}?${params.toString()}`

  return (
    <Link
      href={drawerHref}
      scroll={false}
      onClick={(e) => {
        if (isDragging) e.preventDefault()
      }}
      className={cn(
        'block bg-[color:var(--color-surface-2)] rounded-[var(--r-md)] border border-[color:var(--color-hairline)] p-2.5 transition-colors',
        isDragging
          ? 'cursor-grabbing'
          : 'hover:border-[color:var(--color-hairline-strong)] cursor-grab',
      )}
    >
      <div className="min-w-0">
        <h3 className="font-medium text-sm leading-snug text-gray-800 dark:text-gray-100 truncate">
          {lead.name}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{lead.email}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
        {lead.leadSource && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
            {lead.leadSource}
          </span>
        )}
        {lead.optedOut && (
          <StatusPill tone="neutral" label="Opted out" title="Opted out of marketing — campaign sends skip this contact" />
        )}
        {lead.lastActivityAt && (
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
            {relativeTime(lead.lastActivityAt)}
          </span>
        )}
      </div>
    </Link>
  )
}
