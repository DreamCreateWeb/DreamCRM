import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const ctx = await getTenantContext()
  if (!ctx) redirect('/signin')
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  redirect('/dashboard')
}
