export const metadata = {
  title: 'Service Library — DreamCRM',
  description: 'Review clinic-submitted services for the shared platform library.',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { requireTenant } from '@/lib/auth/context'
import { listAllLibraryEntriesForAdmin } from '@/lib/services/service-library'
import { PageHeader } from '@/components/ui/page-header'
import ReviewBoard from './review-board'

export default async function PlatformServiceLibraryPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || (ctx.role !== 'owner' && ctx.role !== 'admin')) {
    redirect('/')
  }

  const entries = await listAllLibraryEntriesForAdmin()

  // Resolve submitting-org names for the review surface so admins see
  // "Acme Dental" instead of an opaque id. Batched lookup keeps it to one
  // round-trip; falls back to the id when an org has been deleted.
  const orgIds = Array.from(
    new Set(entries.map((e) => e.submittedByOrgId).filter((id): id is string => !!id)),
  )
  let orgNames: Record<string, string> = {}
  if (orgIds.length > 0) {
    const rows = await db
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .where(inArray(organization.id, orgIds))
    orgNames = Object.fromEntries(rows.map((r) => [r.id, r.name]))
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow="Platform · Dream Create"
        title="Service Library"
        subtitle="Review clinic-submitted services. Approved entries become available to every clinic; rejected entries are hidden but kept for the audit trail."
      />
      <ReviewBoard entries={entries} orgNames={orgNames} />
    </div>
  )
}
