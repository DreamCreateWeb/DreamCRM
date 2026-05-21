import { FlyoutProvider } from '@/app/flyout-context'
import MessagesSidebar, { type ConvoListItem } from './messages-sidebar'
import ClientMessagingSidebar from './client-messaging-sidebar'
import MessagesBody, { type ChatMessage } from './messages-body'
import ClinicMessagesView from './clinic-messages-view'
import { requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import {
  computeClientMessagingStats,
  listClientConversations,
  listClinicContacts,
  listConversationsForUser,
  listMessages,
  listTeamContacts,
  markConversationRead,
} from '@/lib/services/messages'
import { listCommunityUsers } from '@/lib/services/community'

export const metadata = {
  title: 'Messages - DreamCRM',
  description: 'Patient communications',
}

export const dynamic = 'force-dynamic'

interface MessagesSearchParams {
  c?: string
  thread?: string
  status?: string
  assignedTo?: string
  q?: string
  unread?: string
}

export default async function Messages({ searchParams }: { searchParams: Promise<MessagesSearchParams> }) {
  const user = await requireUser()
  const ctx = await getTenantContext()
  const params = await searchParams
  const requestedId = params.c ? Number(params.c) : NaN

  // Clinic tenant gets the new Patient Communications view (Front-style
  // unified inbox, one thread per patient across channels). Platform and
  // patient tenants keep the existing generic chat surfaces — different
  // mental model, different abstraction.
  if (ctx?.tenantType === 'clinic') {
    return <ClinicMessagesView ctx={ctx} searchParams={params} />
  }

  if (ctx?.tenantType === 'platform') {
    const [clientConvos, clientContacts, teamContacts] = await Promise.all([
      listClientConversations(user.id),
      listClinicContacts(),
      listTeamContacts(user.id),
    ])
    const stats = computeClientMessagingStats(clientConvos)

    let activeId: number | null = null
    if (!Number.isNaN(requestedId) && clientConvos.some((c) => c.id === requestedId)) {
      activeId = requestedId
    } else if (clientConvos.length > 0) {
      activeId = clientConvos[0].id
    }

    let chatMessages: ChatMessage[] = []
    let activeTitle = ''
    if (activeId) {
      // Opening a conversation marks it read for the current viewer.
      await markConversationRead(activeId, user.id)
      const msgs = await listMessages(activeId, user.id)
      chatMessages = msgs.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        authorId: m.authorId,
        authorName: m.authorName,
      }))
      const active = clientConvos.find((c) => c.id === activeId)
      activeTitle = active
        ? active.counterpartName
          ? `${active.counterpartName}${active.clinicName ? ` — ${active.clinicName}` : ''}`
          : active.title ?? `Conversation #${activeId}`
        : `Conversation #${activeId}`
    }

    return (
      <FlyoutProvider initialState={true}>
        <div className="relative flex h-full">
          <ClientMessagingSidebar
            conversations={clientConvos}
            clientContacts={clientContacts}
            teamContacts={teamContacts}
            stats={stats}
            activeId={activeId}
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

  // Clinic and patient tenants — generic chat surface.
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
    await markConversationRead(activeId, user.id)
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
