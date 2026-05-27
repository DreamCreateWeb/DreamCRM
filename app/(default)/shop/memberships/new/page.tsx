import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import PlanForm from '../plan-form'

export const metadata = { title: 'New membership plan - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function NewPlanPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  return <PlanForm />
}
