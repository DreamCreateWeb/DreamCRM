import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from './auth'

export const getServerSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

export async function requireUser() {
  const session = await getServerSession()
  if (!session?.user) redirect('/signin')
  return session.user
}

export async function requireRole(role: string | string[]) {
  const user = await requireUser()
  const roles = Array.isArray(role) ? role : [role]
  if (!roles.includes(user.role ?? 'member')) redirect('/')
  return user
}
