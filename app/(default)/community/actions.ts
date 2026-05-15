'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  FeedPostInput,
  MeetupInput,
  ReplyInput,
  ThreadInput,
  createFeedPost,
  createMeetup,
  createReply,
  createThread,
  likeFeedPost,
  rsvpMeetup,
} from '@/lib/services/community'

export async function postThread(input: unknown) {
  const user = await requireUser()
  const row = await createThread(ThreadInput.parse(input), user.id)
  revalidatePath('/community/forum')
  return row
}

export async function postReply(input: unknown) {
  const user = await requireUser()
  const row = await createReply(ReplyInput.parse(input), user.id)
  revalidatePath('/community/forum/post')
  return row
}

export async function postFeedPost(input: unknown) {
  const user = await requireUser()
  const row = await createFeedPost(FeedPostInput.parse(input), user.id)
  revalidatePath('/community/feed')
  return row
}

export async function likeFeedPostAction(id: number) {
  await requireUser()
  const row = await likeFeedPost(id)
  revalidatePath('/community/feed')
  return row
}

export async function postMeetup(input: unknown) {
  const user = await requireUser()
  const row = await createMeetup(MeetupInput.parse(input), user.id)
  revalidatePath('/community/meetups')
  return row
}

export async function rsvpToMeetup(meetupId: number, status: 'going' | 'maybe' | 'not_going') {
  const user = await requireUser()
  const row = await rsvpMeetup(meetupId, user.id, status)
  revalidatePath(`/community/meetups`)
  revalidatePath(`/community/meetups/post`)
  return row
}
