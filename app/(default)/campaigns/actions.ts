'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  CampaignInput,
  createCampaign,
  deleteCampaign,
  setCampaignStatus,
} from '@/lib/services/campaigns'

export async function addCampaign(input: unknown) {
  const user = await requireUser()
  const campaign = await createCampaign(CampaignInput.parse(input), user.id)
  revalidatePath('/campaigns')
  return campaign
}

export async function changeCampaignStatus(id: number, status: string) {
  await requireUser()
  const campaign = await setCampaignStatus(id, status as any)
  revalidatePath('/campaigns')
  return campaign
}

export async function removeCampaign(id: number) {
  await requireUser()
  const result = await deleteCampaign(id)
  revalidatePath('/campaigns')
  return result
}
