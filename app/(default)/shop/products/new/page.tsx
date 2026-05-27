import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ProductForm from '../../product-form'

export const metadata = { title: 'New product - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function NewProductPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  return <ProductForm />
}
