import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from './auth/server'

export const getServerSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

export async function requireUser() {
  const session = await getServerSession()
  if (!session?.user) redirect('/signin')
  return session.user
}

// Tenant-aware helpers are re-exported from lib/auth/context.
// `requireRole` here checks the user's role within their active org.
export { getTenantContext, requireTenant, requireRole, type TenantContext } from './auth/context'
