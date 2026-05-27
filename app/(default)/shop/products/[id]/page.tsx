import { redirect, notFound } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getProduct } from '@/lib/services/shop'
import ProductForm from '../../product-form'

export const metadata = { title: 'Edit product - DreamCRM' }
export const dynamic = 'force-dynamic'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  const { id } = await params
  const product = await getProduct(ctx.organizationId, id)
  if (!product) notFound()
  return <ProductForm product={product} />
}
