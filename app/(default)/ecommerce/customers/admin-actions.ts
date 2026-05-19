'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireTenant } from '@/lib/auth/context'
import { createDemoClinic } from '@/lib/services/demo-clinic'
import type { Role } from '@/lib/modules/types'

const DEMO_COOKIE = 'demo_context'
const DEMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (!ctx.platformAdmin) {
    throw new Error('Forbidden: platform admin only')
  }
  return ctx
}

const EnterDemoInput = z.object({
  orgId: z.string().min(1),
  role: z.enum(['owner', 'admin', 'member', 'patient']),
  patientId: z.string().optional(),
})

/**
 * Drop a demo_context cookie that getTenantContext picks up to render
 * the rest of the app as if the platform admin were a clinic / patient.
 * Real session is untouched — switching back is a cookie clear.
 */
export async function enterDemoMode(input: unknown) {
  await requirePlatformAdmin()
  const data = EnterDemoInput.parse(input)
  const cookieStore = await cookies()
  cookieStore.set(DEMO_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DEMO_COOKIE_MAX_AGE,
  })
  redirect('/')
}

export async function exitDemoMode() {
  // Don't require platformAdmin here — the cookie is itself the gate,
  // and clearing should always succeed (even if the session has changed
  // mid-demo for some reason).
  const cookieStore = await cookies()
  cookieStore.delete(DEMO_COOKIE)
  redirect('/')
}

/**
 * Seeds Acme Dental Demo clinic with sample patients + appointments + tasks
 * so the demo experience actually shows real data. Idempotent — calling
 * twice returns the existing clinic the second time.
 */
export async function seedDemoClinic() {
  await requirePlatformAdmin()
  const result = await createDemoClinic()
  revalidatePath('/ecommerce/customers')
  return result
}

/**
 * One-click "create demo clinic and immediately switch into it".
 * The usual path the platform admin takes the first time they want to
 * see the clinic dashboard.
 */
export async function seedAndEnterDemoClinic(role: Role = 'owner') {
  await requirePlatformAdmin()
  const result = await createDemoClinic()
  const cookieStore = await cookies()
  cookieStore.set(
    DEMO_COOKIE,
    JSON.stringify({ orgId: result.organizationId, role }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: DEMO_COOKIE_MAX_AGE,
    },
  )
  redirect('/')
}
