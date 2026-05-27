import { redirect, notFound } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getPlan } from '@/lib/services/membership'
import PlanForm from '../plan-form'

export const metadata = { title: 'Edit membership plan - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  const { id } = await params
  const plan = await getPlan(ctx.organizationId, id)
  if (!plan) notFound()
  return <PlanForm plan={plan} />
}
