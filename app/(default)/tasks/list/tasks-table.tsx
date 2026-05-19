'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { cn, relativeTime } from '@/lib/utils'
import { TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatus } from '@/lib/types/tasks'
import { moveTask, removeTasks } from '../actions'
import DueDateChip from '../_components/due-date-chip'

export interface TasksTableRow {
  id: number
  title: string
  status: TaskStatus
  priority: string
  dueDate: string | null
  tags: string[]
  authorName: string | null
  createdAt: string
}

interface Props {
  tasks: TasksTableRow[]
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-stone-400',
}
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

/**
 * Flat sortable task table powered by TanStack Table. Replaces the
 * status-grouped list — the grouped view is good for triage but a sortable
 * spreadsheet is much better for "show me everything by due date" or
 * multi-select bulk operations.
 *
 * Per-column sort, sticky header, multi-select checkbox column with bulk
 * actions toolbar that appears when any row is selected. Row click opens
 * the drawer (URL ?t=ID), checkbox click does not navigate.
 */
export default function TasksTable({ tasks }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [pending, startTransition] = useTransition()

  const columns = useMemo<ColumnDef<TasksTableRow>[]>(
    () => [
      {
        id: 'select',
        size: 36,
        enableSorting: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = !table.getIsAllRowsSelected() && table.getIsSomeRowsSelected()
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            className="accent-stone-900 dark:accent-stone-100 w-3.5 h-3.5"
            title="Select all"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
            className="accent-stone-900 dark:accent-stone-100 w-3.5 h-3.5"
          />
        ),
      },
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => {
          const t = row.original
          const isDone = t.status === 'completed'
          return (
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn('w-1.5 h-1.5 rounded-full shrink-0', PRIORITY_DOT[t.priority] ?? 'bg-stone-300')}
                title={`Priority: ${t.priority}`}
              />
              <span
                className={cn(
                  'truncate font-medium',
                  isDone
                    ? 'text-stone-400 dark:text-stone-500 line-through'
                    : 'text-stone-800 dark:text-stone-100',
                )}
              >
                {t.title}
              </span>
              {t.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300 shrink-0"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        size: 130,
        cell: ({ row }) => (
          <span className="text-[12px] text-stone-600 dark:text-stone-300">
            {TASK_STATUS_LABEL[row.original.status]}
          </span>
        ),
      },
      {
        id: 'priority',
        accessorKey: 'priority',
        header: 'Priority',
        size: 100,
        sortingFn: (a, b) => (PRIORITY_RANK[a.original.priority] ?? 99) - (PRIORITY_RANK[b.original.priority] ?? 99),
        cell: ({ row }) => (
          <span className="text-[12px] text-stone-600 dark:text-stone-300 capitalize">
            {row.original.priority}
          </span>
        ),
      },
      {
        id: 'dueDate',
        accessorKey: 'dueDate',
        header: 'Due',
        size: 140,
        sortingFn: (a, b) => {
          const da = a.original.dueDate ? new Date(a.original.dueDate).getTime() : Number.POSITIVE_INFINITY
          const db = b.original.dueDate ? new Date(b.original.dueDate).getTime() : Number.POSITIVE_INFINITY
          return da - db
        },
        cell: ({ row }) =>
          row.original.dueDate ? (
            <DueDateChip dueDate={row.original.dueDate} completed={row.original.status === 'completed'} />
          ) : (
            <span className="text-[12px] text-stone-300 dark:text-stone-600">—</span>
          ),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Created',
        size: 110,
        cell: ({ row }) => (
          <span className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
            {relativeTime(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const selectedIds = Object.keys(rowSelection).map(Number).filter(Number.isInteger)
  const selectedCount = selectedIds.length

  function handleRowClick(id: number) {
    const params = new URLSearchParams(sp.toString())
    params.set('t', String(id))
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function handleBulkDelete() {
    if (!selectedCount) return
    if (!confirm(`Delete ${selectedCount} task${selectedCount === 1 ? '' : 's'}? This cannot be undone.`)) return
    startTransition(async () => {
      await removeTasks(selectedIds)
      setRowSelection({})
      router.refresh()
    })
  }

  function handleBulkStatus(status: TaskStatus) {
    if (!selectedCount) return
    startTransition(async () => {
      await Promise.all(selectedIds.map((id) => moveTask(id, status)))
      setRowSelection({})
      router.refresh()
    })
  }

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
      {selectedCount > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-stone-50 dark:bg-stone-800/60 border-b border-stone-200 dark:border-stone-700/60">
          <span className="text-[12px] font-medium text-stone-700 dark:text-stone-200">
            {selectedCount} selected
          </span>
          <div className="w-px h-4 bg-stone-200 dark:bg-stone-700" />
          <span className="text-[11px] text-stone-500 dark:text-stone-400">Move to:</span>
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => handleBulkStatus(s)}
              disabled={pending}
              className="text-[11px] font-medium px-2 py-1 rounded-md text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-300 dark:hover:text-stone-100 dark:hover:bg-stone-700 disabled:opacity-50"
            >
              {TASK_STATUS_LABEL[s]}
            </button>
          ))}
          <button
            onClick={handleBulkDelete}
            disabled={pending}
            className="ml-auto text-[11px] font-medium px-2 py-1 rounded-md text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
      {tasks.length === 0 ? (
        <div className="text-center text-[13px] text-stone-400 dark:text-stone-500 italic py-12">
          No tasks match the current filters.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-stone-50/80 dark:bg-stone-900/80 backdrop-blur z-10 border-b border-stone-200 dark:border-stone-700/60">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sortable = header.column.getCanSort() && header.column.id !== 'select'
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn(
                        'text-left text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 px-3 py-2',
                        sortable && 'cursor-pointer hover:text-stone-800 dark:hover:text-stone-200',
                      )}
                      onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortable && (
                          <span className="text-stone-400 dark:text-stone-600 text-[10px]">
                            {header.column.getIsSorted() === 'asc' ? '▲' : header.column.getIsSorted() === 'desc' ? '▼' : ''}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => handleRowClick(Number(row.original.id))}
                className={cn(
                  'border-b border-stone-100 dark:border-stone-700/40 last:border-b-0 cursor-pointer transition-colors',
                  row.getIsSelected()
                    ? 'bg-stone-50 dark:bg-stone-800/40'
                    : 'hover:bg-stone-50/60 dark:hover:bg-stone-800/30',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    className="px-3 py-2.5 align-middle"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
