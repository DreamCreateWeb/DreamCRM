export const metadata = {
  title: 'Intake forms - DreamCRM',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getDefaultFormTemplate } from '@/lib/services/forms'
import { getMyClinicHeader } from '@/lib/services/patient-portal'
import type { FormTemplateSchema } from '@/lib/types/forms'
import IntakeFormRunner from '@/app/site/[slug]/intake/[formSlug]/intake-form-runner'
import { submitPatientIntakeAction } from './actions'

export default async function PatientIntake() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')
  if (!ctx.patientId) redirect('/')

  const [template, clinic] = await Promise.all([
    getDefaultFormTemplate(ctx.organizationId),
    getMyClinicHeader(ctx.organizationId),
  ])

  if (!template) {
    // Clinic hasn't set up a default form — surface a calm explanation
    // rather than a 404. Most patients reach this page via the sidebar.
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Intake forms</h1>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
            No intake form available
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {ctx.organizationName} hasn&apos;t published a public intake form yet. You&apos;ll be asked to fill one out at your next visit.
          </p>
          <Link
            href="/patient/dashboard"
            className="inline-block mt-4 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const schema = template.schema as FormTemplateSchema
  const clinicName = clinic?.displayName ?? ctx.organizationName
  const brand = clinic?.brandColor ?? '#0F766E'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
          {template.title}
        </h1>
        {template.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
            {template.description}
          </p>
        )}
      </div>
      <IntakeFormRunner
        orgId={ctx.organizationId}
        templateId={template.id}
        schema={schema}
        brand={brand}
        clinicName={clinicName}
        action={submitPatientIntakeAction}
      />
    </div>
  )
}
