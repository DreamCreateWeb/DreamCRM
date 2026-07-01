export const metadata = {
  title: 'Message Templates - DreamCRM',
  description: 'Editable canned replies for the Messages composer',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listMessageTemplates } from '@/lib/services/message-templates'
import { SettingsPage } from '../settings-kit'
import TemplatesEditor from './templates-editor'

export default async function MessageTemplatesPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const templates = await listMessageTemplates(ctx.organizationId)
  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  return (
    <>
      <SettingsPage
        title="Message templates"
        subtitle="Saved replies your team can drop into a patient conversation in one click. Use {{firstName}} and it fills in the patient's name when sent."
        padded
      >
        <div className="max-w-2xl">
          <TemplatesEditor initial={templates} canManage={canManage} />
        </div>
      </SettingsPage>
    </>
  )
}
