'use client'

import { useState, useTransition } from 'react'
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
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/types/tasks'
import TaskCard, { type TaskCardData } from './task-card'
import { reorderTaskAction } from '../actions'

interface Props {
  initialByStatus: Record<TaskStatus, TaskCardData[]>
}

/**
 * Drag-and-drop kanban board built on dnd-kit. Supports:
 *
 * - Drag a card to a different column → status change + reorder
 * - Drag a card within the same column → reorder
 * - Drag onto an empty column → adds at end
 *
 * Uses optimistic state: drop fires the server action async, the local
 * state is updated immediately so the card "sticks" where dropped without
 * waiting for the round-trip. Server response triggers a router.refresh()
 * to reconcile (catches the cross-column position renumbering).
 */
export default function KanbanBoard({ initialByStatus }: Props) {
  const router = useRouter()
  const [byStatus, setByStatus] = useState(initialByStatus)
  const [activeCard, setActiveCard] = useState<TaskCardData | null>(null)
  const [, startTransition] = useTransition()

  // Require a tiny drag distance before kicking off DnD — otherwise plain
  // clicks-to-open-drawer trip the drag handler.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function findContainer(taskId: number): TaskStatus | null {
    for (const status of TASK_STATUSES) {
      if (byStatus[status].some((t) => t.id === taskId)) return status
    }
    return null
  }

  function handleDragStart(e: DragStartEvent) {
    const id = Number(e.active.id)
    for (const status of TASK_STATUSES) {
      const card = byStatus[status].find((t) => t.id === id)
      if (card) { setActiveCard(card); return }
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = e
    if (!over) return

    const activeId = Number(active.id)
    const overId = String(over.id)

    const sourceStatus = findContainer(activeId)
    if (!sourceStatus) return

    // `over.id` is either a column key (e.g. "col:todo" — dropped on the
    // column itself) or another task id (dropped on a sibling card).
    let destStatus: TaskStatus
    let destIndex: number

    if (overId.startsWith('col:')) {
      destStatus = overId.slice(4) as TaskStatus
      destIndex = byStatus[destStatus].length // dropped on empty area → end
      if (sourceStatus === destStatus) destIndex = byStatus[destStatus].length - 1
    } else {
      const targetId = Number(overId)
      const targetStatus = findContainer(targetId)
      if (!targetStatus) return
      destStatus = targetStatus
      destIndex = byStatus[destStatus].findIndex((t) => t.id === targetId)
    }

    // No-op if dropping a card on itself.
    if (sourceStatus === destStatus && byStatus[destStatus][destIndex]?.id === activeId) return

    // Optimistic update.
    setByStatus((prev) => {
      const next = { ...prev, [sourceStatus]: [...prev[sourceStatus]] } as Record<TaskStatus, TaskCardData[]>
      const sourceIdx = next[sourceStatus].findIndex((t) => t.id === activeId)
      const [moved] = next[sourceStatus].splice(sourceIdx, 1)
      if (sourceStatus !== destStatus) {
        moved.status = destStatus
        next[destStatus] = [...prev[destStatus]]
      }
      const targetCol = next[destStatus]
      const insertAt = Math.max(0, Math.min(destIndex, targetCol.length))
      targetCol.splice(insertAt, 0, moved)
      next[destStatus] = targetCol
      return next
    })

    // Persist + reconcile.
    startTransition(async () => {
      try {
        await reorderTaskAction(activeId, destStatus, destIndex)
        router.refresh()
      } catch (err) {
        console.warn('[kanban] reorder failed', err)
        router.refresh() // refetch to undo the optimistic move
      }
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TASK_STATUSES.map((status) => (
          <Column key={status} status={status} tasks={byStatus[status]} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className="opacity-95 rotate-1 shadow-xl">
            <TaskCard task={activeCard} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({ status, tasks }: { status: TaskStatus; tasks: TaskCardData[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` })
  const sortableIds = tasks.map((t) => t.id)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl border border-stone-200 dark:border-stone-700/60 bg-stone-50/60 dark:bg-stone-900/40 p-2 min-h-[8rem]',
        isOver && 'ring-2 ring-stone-300 dark:ring-stone-600',
      )}
    >
      <div className="px-1.5 pb-2 pt-1 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-stone-600 dark:text-stone-300">
          {TASK_STATUS_LABEL[status]}
        </h2>
        <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">{tasks.length}</span>
      </div>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {tasks.length === 0 ? (
            <div className="text-xs text-stone-500 dark:text-stone-400 italic px-1.5 py-1.5">
              Drop a task here
            </div>
          ) : (
            tasks.map((task) => <SortableCard key={task.id} task={task} />)
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableCard({ task }: { task: TaskCardData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1, // hide the original while DragOverlay shows the floating clone
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} />
    </div>
  )
}
