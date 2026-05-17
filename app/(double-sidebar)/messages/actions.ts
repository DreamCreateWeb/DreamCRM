'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  ConversationInput,
  MessageInput,
  createConversation,
  postMessage,
} from '@/lib/services/messages'

export async function newConversation(input: unknown) {
  const user = await requireUser()
  const data = ConversationInput.parse(input)
  const convo = await createConversation(data, user.id)
  revalidatePath('/messages')
  return convo
}

export async function sendChatMessage(input: unknown) {
  const user = await requireUser()
  const data = MessageInput.parse(input)
  const row = await postMessage(data, user.id)
  revalidatePath('/messages')
  return row
}
