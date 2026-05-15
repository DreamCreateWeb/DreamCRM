'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { InboxMessageInput, markInboxRead, sendInboxMessage } from '@/lib/services/inbox'

export async function markRead(id: number) {
  const user = await requireUser()
  await markInboxRead(user.id, id)
  revalidatePath('/inbox')
}

export async function sendMessage(input: unknown) {
  const user = await requireUser()
  const data = InboxMessageInput.parse(input)
  const row = await sendInboxMessage(user.id, user.name ?? 'You', user.email ?? '', data)
  revalidatePath('/inbox')
  return row
}
