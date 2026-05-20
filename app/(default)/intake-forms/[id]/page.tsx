export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getFormTemplate } from '@/lib/services/forms'
import FormBuilder from './form-builder'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditFormPage({ params }: Props) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')
  const { id } = await params
  const template = await getFormTemplate(ctx.organizationId, id)
  if (!template) notFound()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-4xl mx-auto">
      <FormBuilder template={template} />
    </div>
  )
}
