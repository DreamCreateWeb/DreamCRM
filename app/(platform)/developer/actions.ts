'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTenantContext } from '@/lib/auth/context'

export async function setDemoContext(orgId: string, role: string, patientId?: string) {
  const ctx = await getTenantContext()
  if (!ctx?.platformAdmin) throw new Error('Not authorized')

  const cookieStore = await cookies()
  cookieStore.set('demo_context', JSON.stringify({ orgId, role, patientId }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  })

  // Redirect to appropriate starting page
  if (role === 'patient') {
    redirect('/dashboard')
  } else {
    redirect('/dashboard')
  }
}

export async function clearDemoContext() {
  const cookieStore = await cookies()
  cookieStore.delete('demo_context')
  redirect('/dashboard')
}
