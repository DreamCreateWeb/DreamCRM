'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import { JobInput, createJob } from '@/lib/services/jobs'

export async function addJob(input: unknown) {
  const user = await requireUser()
  const job = await createJob(JobInput.parse(input), user.id)
  revalidatePath('/jobs')
  return job
}
