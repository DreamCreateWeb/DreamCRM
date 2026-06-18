export const metadata = {
  title: 'Patients - DreamCRM',
  description: 'The people your clinic has a relationship with',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  listPatients,
  getPatientListMeta,
  type PatientListFilters,
  type PatientListSort,
} from '@/lib/services/patients'
import { listPatientViews } from '@/lib/services/patient-views'
import { planAllows } from '@/lib/modules'
import PatientsList from './patients-list'
import ModuleHint from '@/components/onboarding/module-hint'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function parseSort(raw: string | string[] | undefined): PatientListSort {
  const value = typeof raw === 'string' ? raw : ''
  const [field = 'name', direction = 'asc'] = value.split(':')
  const validFields: PatientListSort['field'][] = ['name', 'lastVisit', 'nextVisit', 'balance', 'created', 'lastActivity']
  return {
    field: (validFields as string[]).includes(field) ? (field as PatientListSort['field']) : 'name',
    direction: direction === 'desc' ? 'desc' : 'asc',
  }
}

function parseStatus(raw: string | string[] | undefined): PatientListFilters['status'] {
  const value = typeof raw === 'string' ? raw : 'all'
  const valid = ['all', 'new', 'recall_due', 'inactive', 'archived'] as const
  return (valid as readonly string[]).includes(value) ? (value as PatientListFilters['status']) : 'all'
}

export default async function PatientsPage({ searchParams }: PageProps) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/ecommerce/customers')

  const params = await searchParams
  const filters: PatientListFilters = {
    status: parseStatus(params.status),
    hasBalance: params.balance === '1',
    missingIntake: params.intake === '1',
    birthdayThisMonth: params.birthday === '1',
    sources: typeof params.source === 'string' ? params.source.split(',').filter(Boolean) : undefined,
    search: typeof params.q === 'string' ? params.q : undefined,
    tagIds: typeof params.tags === 'string' ? params.tags.split(',').filter(Boolean) : undefined,
  }
  const sort = parseSort(params.sort)

  const [rows, meta, views] = await Promise.all([
    listPatients(ctx.organizationId, filters, sort),
    getPatientListMeta(ctx.organizationId),
    listPatientViews(ctx.organizationId),
  ])

    return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 w-full max-w-[96rem] mx-auto -mb-2">
        <ModuleHint id="patients" />
      </div>
    <PatientsList
      rows={rows}
      meta={meta}
      filters={filters}
      sort={sort}
      orgName={ctx.organizationName}
      canManage={ctx.role === 'owner' || ctx.role === 'admin'}
      views={views}
      canMarket={planAllows(ctx.planTier, 'premium')}
    />
    </>
  )
}
