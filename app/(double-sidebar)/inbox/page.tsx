import { FlyoutProvider } from '@/app/flyout-context'
import InboxSidebar from './inbox-sidebar'
import InboxBody, { type Mail } from './inbox-body'
import { requireUser } from '@/lib/session'
import { listInboxMessages, type InboxFolder } from '@/lib/services/inbox'
import { formatShortDate, formatTime } from '@/lib/utils'

export const metadata = {
  title: 'Inbox - DreamCRM',
  description: 'Messages',
}

export const dynamic = 'force-dynamic'

const VALID_FOLDERS: InboxFolder[] = ['inbox', 'sent', 'drafts', 'starred', 'archived', 'spam', 'trash']

export default async function Inbox({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const user = await requireUser()
  const params = await searchParams
  const folder = (VALID_FOLDERS.includes(params.folder as InboxFolder) ? params.folder : 'inbox') as InboxFolder
  const messages = await listInboxMessages(user.id, folder)

  const mails: Mail[] = messages.map((m, idx) => ({
    id: m.id,
    open: idx === 0,
    name: m.fromName,
    email: m.fromEmail,
    date: `${formatShortDate(m.receivedAt)}, ${formatTime(m.receivedAt)}`,
    recipients: [m.toEmail],
    excerpt: m.body.replace(/<[^>]+>/g, '').slice(0, 140),
    message: m.body.startsWith('<')
      ? m.body
      : `<p>${m.body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`,
  }))

  return (
    <FlyoutProvider>
      <div className="relative flex h-full">
        <InboxSidebar />
        <InboxBody mails={mails} />
      </div>
    </FlyoutProvider>
  )
}
