import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import JobForm from '../job-form'

export const metadata = { title: 'New role - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function NewJobPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  return <JobForm />
}
