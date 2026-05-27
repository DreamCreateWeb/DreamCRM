import { redirect, notFound } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getJob } from '@/lib/services/careers'
import JobForm from '../job-form'

export const metadata = { title: 'Edit role - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  const { id } = await params
  const job = await getJob(ctx.organizationId, id)
  if (!job) notFound()
  return <JobForm job={job} />
}
