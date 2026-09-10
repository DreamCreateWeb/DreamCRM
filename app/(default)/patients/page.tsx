export const metadata = {
  title: 'Patients - DreamCRM',
  description: 'The people your clinic has a relationship with',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  listPatientsPage,
  getPatientListMeta,
  getNewPatientsPerWeek12,
  DEFAULT_PATIENT_LIMIT,
  MAX_PATIENT_LIMIT,
  type PatientListFilters,
  type PatientListSort,
} from '@/lib/services/patients'
import { listPatientViews } from '@/lib/services/patient-views'
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

/** `?show=N` — how many rows this render asks for. The roster is bounded by
 *  default and grows in DEFAULT_PATIENT_LIMIT steps up to MAX_PATIENT_LIMIT;
 *  past that the answer is a filter, not a longer page. */
function parseLimit(raw: string | string[] | undefined): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return DEFAULT_PATIENT_LIMIT
  return Math.max(DEFAULT_PATIENT_LIMIT, Math.min(n, MAX_PATIENT_LIMIT))
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
  const limit = parseLimit(params.show)

  const [page, meta, views, perWeek12] = await Promise.all([
    listPatientsPage(ctx.organizationId, filters, sort, { limit }),
    getPatientListMeta(ctx.organizationId),
    listPatientViews(ctx.organizationId),
    getNewPatientsPerWeek12(ctx.organizationId),
  ])

    return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 w-full max-w-[96rem] mx-auto -mb-2">
        <ModuleHint id="patients" />
      </div>
    <PatientsList
      rows={page.rows}
      total={page.total}
      hasMore={page.hasMore}
      limit={limit}
      meta={meta}
      perWeek12={perWeek12}
      filters={filters}
      sort={sort}
      orgName={ctx.organizationName}
      canManage={ctx.role === 'owner' || ctx.role === 'admin'}
      views={views}
      canMarket
    />
    </>
  )
}
