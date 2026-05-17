'use client'

import Link from 'next/link'
import { useFlyoutContext } from '@/app/flyout-context'
import { relativeTime } from '@/lib/utils'
import NewConversationButton from './new-conversation-button'

export interface ConvoListItem {
  id: number
  title: string | null
  lastMessage: string | null
  lastAt: Date | string | null
}

export default function MessagesSidebar({
  conversations,
  activeId,
  users,
}: {
  conversations: ConvoListItem[]
  activeId: number | null
  users: { id: string; name: string }[]
}) {
  const { flyoutOpen, setFlyoutOpen } = useFlyoutContext()

  return (
    <div
      id="messages-sidebar"
      className={`absolute z-20 top-0 bottom-0 w-full md:w-auto md:static md:top-auto md:bottom-auto -mr-px md:translate-x-0 transform transition-transform duration-200 ease-in-out ${
        flyoutOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="sticky top-16 bg-white dark:bg-gray-900 overflow-x-hidden overflow-y-auto no-scrollbar shrink-0 border-r border-gray-200 dark:border-gray-700/60 md:w-[18rem] xl:w-[20rem] h-[calc(100dvh-64px)]">
        <div className="px-5 py-4">
          <header className="flex items-center justify-between mb-4">
            <div className="text-lg font-semibold text-gray-800 dark:text-gray-100">Conversations</div>
            <NewConversationButton users={users} />
          </header>
          {conversations.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              No conversations yet. Start a new one.
            </div>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => {
                const isActive = c.id === activeId
                return (
                  <li key={c.id}>
                    <Link
                      href={`/messages?c=${c.id}`}
                      onClick={() => setFlyoutOpen(false)}
                      className={`flex flex-col p-2 rounded-lg ${
                        isActive
                          ? 'bg-violet-500/10 text-violet-600 dark:text-violet-300'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                          {c.title ?? `Conversation #${c.id}`}
                        </div>
                        {c.lastAt && (
                          <div className="text-xs text-gray-500">{relativeTime(c.lastAt)}</div>
                        )}
                      </div>
                      {c.lastMessage && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.lastMessage}</div>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
