import { FlyoutProvider } from '@/app/flyout-context'
import MessagesSidebar, { type ConvoListItem } from './messages-sidebar'
import MessagesBody, { type ChatMessage } from './messages-body'
import { requireUser } from '@/lib/session'
import { listConversationsForUser, listMessages } from '@/lib/services/messages'
import { listCommunityUsers } from '@/lib/services/community'

export const metadata = {
  title: 'Messages - DreamCRM',
  description: 'Real-time chat',
}

export const dynamic = 'force-dynamic'

export default async function Messages({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const requestedId = params.c ? Number(params.c) : NaN

  const [convoRows, allUsers] = await Promise.all([listConversationsForUser(user.id), listCommunityUsers()])
  const conversations: ConvoListItem[] = convoRows.map((c) => ({
    id: c.id,
    title: c.title,
    lastMessage: c.lastMessage ?? null,
    lastAt: c.lastAt ?? null,
  }))

  let activeId: number | null = null
  if (!Number.isNaN(requestedId) && conversations.some((c) => c.id === requestedId)) {
    activeId = requestedId
  } else if (conversations.length > 0) {
    activeId = conversations[0].id
  }

  let chatMessages: ChatMessage[] = []
  let activeTitle = ''
  if (activeId) {
    const msgs = await listMessages(activeId, user.id)
    chatMessages = msgs.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      authorId: m.authorId,
      authorName: m.authorName,
    }))
    const active = conversations.find((c) => c.id === activeId)
    activeTitle = active?.title ?? `Conversation #${activeId}`
  }

  return (
    <FlyoutProvider initialState={true}>
      <div className="relative flex h-full">
        <MessagesSidebar
          conversations={conversations}
          activeId={activeId}
          users={allUsers.filter((u) => u.id !== user.id).map((u) => ({ id: u.id, name: u.name }))}
        />
        <MessagesBody
          conversationId={activeId}
          title={activeTitle}
          messages={chatMessages}
          currentUserId={user.id}
        />
      </div>
    </FlyoutProvider>
  )
}
