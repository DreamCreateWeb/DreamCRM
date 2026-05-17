'use client'

import { useTransition } from 'react'
import { useSelectedItems } from '@/app/selected-items-context'

interface DeleteButtonProps {
  onDelete?: (ids: number[]) => void | Promise<void>
  label?: string
  confirmMessage?: string
}

export default function DeleteButton({
  onDelete,
  label = 'Delete',
  confirmMessage = 'Delete the selected items? This cannot be undone.',
}: DeleteButtonProps) {
  const { selectedItems, setSelectedItems } = useSelectedItems()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (!selectedItems.length) return
    if (!confirm(confirmMessage)) return
    startTransition(async () => {
      await onDelete?.(selectedItems)
      setSelectedItems([])
    })
  }

  return (
    <div className={`${selectedItems.length < 1 && 'hidden'}`}>
      <div className="flex items-center">
        <div className="hidden xl:block text-sm italic mr-2 whitespace-nowrap">
          <span>{selectedItems.length}</span> items selected
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="btn bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 text-red-500 disabled:opacity-60"
        >
          {pending ? 'Deleting…' : label}
        </button>
      </div>
    </div>
  )
}
