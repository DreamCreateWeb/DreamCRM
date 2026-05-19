'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import {
  archiveThreadAction,
  markThreadAction,
  toggleThreadStarAction,
  trashThreadAction,
} from '../mailbox-actions'
import { useSelection } from './selection-context'

interface ThreadStub {
  threadId: string
  latestMessageId: string
}

interface Props {
  threadList: ThreadStub[]
  activeThreadId: string | null
  activeIsRead: boolean
  activeIsStarred: boolean
  baseUrl: string
}

/**
 * Global keyboard shortcuts for the inbox. j/k now moves through threads
 * (not individual messages) since the sidebar lists conversations. The
 * URL still uses `m=<messageId>` for back-compat — j/k navigates to the
 * latest message id of the next/previous thread.
 *
 * Bindings:
 *   j/k     next / previous thread
 *   u       toggle read/unread on the active thread
 *   s       toggle star
 *   e       archive the active thread
 *   #       trash the active thread
 *   r       open quick-reply
 *   c       open compose
 *   x       toggle bulk selection on the active thread
 *   ⌘/⌃-A   select all visible threads
 *   Esc     clear bulk selection
 */
export default function KeyboardHandler({
  threadList,
  activeThreadId,
  activeIsRead,
  activeIsStarred,
  baseUrl,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const selection = useSelection()

  useEffect(() => {
    function isTextInput(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    function go(messageId: string | null) {
      const url = messageId ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}m=${messageId}` : baseUrl
      router.replace(url, { scroll: false })
    }

    function onKey(e: KeyboardEvent) {
      if (isTextInput(e.target)) return

      const threadIds = threadList.map((t) => t.threadId)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && threadIds.length > 0) {
        e.preventDefault()
        selection.selectAll(threadIds)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const idx = activeThreadId ? threadIds.indexOf(activeThreadId) : -1

      switch (e.key) {
        case 'j': {
          e.preventDefault()
          if (threadList.length === 0) return
          const next = threadList[Math.min(threadList.length - 1, idx + 1)] ?? threadList[0]
          go(next.latestMessageId)
          return
        }
        case 'k': {
          e.preventDefault()
          if (threadList.length === 0) return
          const next = threadList[Math.max(0, idx - 1)] ?? threadList[0]
          go(next.latestMessageId)
          return
        }
        case 'u':
          if (!activeThreadId) return
          e.preventDefault()
          startTransition(async () => {
            try {
              await markThreadAction(activeThreadId, !activeIsRead)
              router.refresh()
            } catch {}
          })
          return
        case 's':
          if (!activeThreadId) return
          e.preventDefault()
          startTransition(async () => {
            try {
              await toggleThreadStarAction(activeThreadId, !activeIsStarred)
              router.refresh()
            } catch {}
          })
          return
        case 'e':
          if (!activeThreadId) return
          e.preventDefault()
          startTransition(async () => {
            try {
              const nextThread = threadList[idx + 1] ?? threadList[idx - 1] ?? null
              await archiveThreadAction(activeThreadId)
              go(nextThread?.latestMessageId ?? null)
            } catch {}
          })
          return
        case '#':
          if (!activeThreadId) return
          e.preventDefault()
          startTransition(async () => {
            try {
              const nextThread = threadList[idx + 1] ?? threadList[idx - 1] ?? null
              await trashThreadAction(activeThreadId)
              go(nextThread?.latestMessageId ?? null)
            } catch {}
          })
          return
        case 'r':
          if (!activeThreadId) return
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('inbox:quickreply'))
          return
        case 'c':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('inbox:compose'))
          return
        case 'x':
          if (!activeThreadId) return
          e.preventDefault()
          selection.toggle(activeThreadId)
          return
        case 'Escape':
          if (selection.count === 0) return
          e.preventDefault()
          selection.clear()
          return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [threadList, activeThreadId, activeIsRead, activeIsStarred, baseUrl, router, selection])

  return null
}
