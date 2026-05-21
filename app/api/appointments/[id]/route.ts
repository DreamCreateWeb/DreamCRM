import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/auth/context'
import { getAppointmentDetail } from '@/lib/services/appointments'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') {
    return NextResponse.json({ error: 'Only clinic tenants can view appointments' }, { status: 403 })
  }
  const { id } = await params
  const detail = await getAppointmentDetail(ctx.organizationId, id)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(detail)
}
