'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import {
  AGENCY_PROJECT_STATUSES,
  AGENCY_PROJECT_TYPES,
  type AgencyProjectStatus,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'
import { createProject, deleteProject, updateProject } from '@/lib/services/projects'

async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || (ctx.role !== 'owner' && ctx.role !== 'admin')) {
    throw new Error('Forbidden: platform admin only')
  }
  return ctx
}

function revalidate() {
  revalidatePath('/ecommerce/orders')
}

const StatusEnum = z.enum(AGENCY_PROJECT_STATUSES as unknown as [AgencyProjectStatus, ...AgencyProjectStatus[]])
const TypeEnum = z.enum(AGENCY_PROJECT_TYPES as unknown as [AgencyProjectType, ...AgencyProjectType[]])

const MoveInput = z.object({
  id: z.string().min(1),
  status: StatusEnum,
})

export async function moveProjectStage(input: unknown) {
  await requirePlatformAdmin()
  const data = MoveInput.parse(input)
  await updateProject(data.id, { status: data.status })
  revalidate()
  return { ok: true }
}

const CreateInput = z.object({
  title: z.string().min(1).max(200),
  type: TypeEnum,
  status: StatusEnum.default('lead'),
  organizationId: z.string().optional().nullable(),
  budgetDollars: z.number().min(0).optional().nullable(),
  dueDateIso: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
})

export async function createPipelineProject(input: unknown) {
  await requirePlatformAdmin()
  const data = CreateInput.parse(input)
  const project = await createProject({
    organizationId: data.organizationId ?? null,
    type: data.type,
    title: data.title,
    description: data.description ?? null,
    status: data.status,
    budgetCents: data.budgetDollars != null ? Math.round(data.budgetDollars * 100) : null,
    dueDate: data.dueDateIso ? new Date(data.dueDateIso) : null,
  })
  revalidate()
  return { ok: true, id: project.id }
}

export async function deletePipelineProject(id: string) {
  await requirePlatformAdmin()
  await deleteProject(id)
  revalidate()
  return { ok: true }
}
