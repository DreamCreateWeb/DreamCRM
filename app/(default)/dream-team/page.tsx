export const metadata = {
  title: 'Dream Team — DreamCRM',
  description: 'Your AI staff — finished work waiting on your yes, and what they handled on their own.',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import DreamTeamView from './dream-team-view'

export default async function DreamTeamPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  // The Dream Team works for clinics; the platform org has its own machine
  // (prospecting) and no proposal generators aimed at it.
  if (ctx.tenantType === 'platform') redirect('/dashboard')
  return <DreamTeamView ctx={ctx} />
}
