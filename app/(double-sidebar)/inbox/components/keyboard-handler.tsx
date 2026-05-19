'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import {
  archiveMessageAction,
  markMessage,
  toggleStar,
  trashMessageAction,
} from '../mailbox-actions'
import { useSelection } from './selection-context'

interface Props {
  messageIds: string[]
  activeMessageId: string | null
  activeIsRead: boolean
  activeIsStarred: boolean
  baseUrl: string // e.g. "/inbox" or "/inbox?account=xxx"
}

/**
 * Global keyboard shortcuts for the inbox. Bound on the window at this
 * component's mount so they work regardless of which sub-element is focused
 * — except when the user is typing in an input/textarea, which we explicitly
 * exempt to avoid trapping the j/k navigation on top of normal typing.
 *
 * Bindings:
 *   j/k     next / previous message
 *   u       toggle read/unread on the active message
 *   s       toggle star
 *   e       archive
 *   #       trash
 *   r       open quick-reply (dispatches a custom event the reply pane listens to)
 *   c       open compose (same)
 *   x       toggle bulk selection on the active message
 *   ⌘/⌃-A   select all visible messages
 *   Esc     clear bulk selection
 *   ?       show shortcut help (future)
 */
export default function KeyboardHandler({
  messageIds,
  activeMessageId,
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

      // Cmd/Ctrl-A: select all visible. Allow this one modifier combo through;
      // every other shortcut below requires no modifiers.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && messageIds.length > 0) {
        e.preventDefault()
        selection.selectAll(messageIds)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const idx = activeMessageId ? messageIds.indexOf(activeMessageId) : -1

      switch (e.key) {
        case 'j':
          e.preventDefault()
          if (messageIds.length === 0) return
          go(messageIds[Math.min(messageIds.length - 1, idx + 1)] ?? messageIds[0])
          return
        case 'k':
          e.preventDefault()
          if (messageIds.length === 0) return
          go(messageIds[Math.max(0, idx - 1)] ?? messageIds[0])
          return
        case 'u':
          if (!activeMessageId) return
          e.preventDefault()
          startTransition(async () => {
            try {
              await markMessage(activeMessageId, !activeIsRead)
              router.refresh()
            } catch {}
          })
          return
        case 's':
          if (!activeMessageId) return
          e.preventDefault()
          startTransition(async () => {
            try {
              await toggleStar(activeMessageId, !activeIsStarred)
              router.refresh()
            } catch {}
          })
          return
        case 'e':
          if (!activeMessageId) return
          e.preventDefault()
          startTransition(async () => {
            try {
              const nextId = messageIds[idx + 1] ?? messageIds[idx - 1] ?? null
              await archiveMessageAction(activeMessageId)
              go(nextId)
            } catch {}
          })
          return
        case '#':
          if (!activeMessageId) return
          e.preventDefault()
          startTransition(async () => {
            try {
              const nextId = messageIds[idx + 1] ?? messageIds[idx - 1] ?? null
              await trashMessageAction(activeMessageId)
              go(nextId)
            } catch {}
          })
          return
        case 'r':
          if (!activeMessageId) return
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('inbox:quickreply'))
          return
        case 'c':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('inbox:compose'))
          return
        case 'x':
          if (!activeMessageId) return
          e.preventDefault()
          selection.toggle(activeMessageId)
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
  }, [messageIds, activeMessageId, activeIsRead, activeIsStarred, baseUrl, router, selection])

  return null
}
