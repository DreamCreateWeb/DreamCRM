export const metadata = {
  title: 'My Profile - DreamCRM',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getMyPatientRecord } from '@/lib/services/patient-portal'
import { updateMyProfile } from './actions'

export default async function PatientProfile() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')
  if (!ctx.patientId) redirect('/')

  const me = await getMyPatientRecord(ctx.patientId, ctx.organizationId)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">My Profile</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Keep your contact info up to date so your clinic can reach you.
        </p>
      </div>
      <form
        action={updateMyProfile}
        className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="firstName">First Name</label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              required
              defaultValue={me?.firstName ?? ''}
              className="form-input w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="lastName">Last Name</label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              required
              defaultValue={me?.lastName ?? ''}
              className="form-input w-full"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={me?.email ?? ''}
            className="form-input w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="phone">Phone</label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={me?.phone ?? ''}
            className="form-input w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="dateOfBirth">Date of Birth</label>
          <input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={me?.dateOfBirth ?? ''}
            className="form-input w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="addressLine1">Address</label>
            <input
              id="addressLine1"
              name="addressLine1"
              type="text"
              defaultValue={me?.addressLine1 ?? ''}
              className="form-input w-full"
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <input
              name="city"
              type="text"
              placeholder="City"
              defaultValue={me?.city ?? ''}
              className="form-input col-span-2"
              aria-label="City"
            />
            <input
              name="state"
              type="text"
              placeholder="ST"
              defaultValue={me?.state ?? ''}
              className="form-input"
              aria-label="State"
            />
            <input
              name="postalCode"
              type="text"
              placeholder="ZIP"
              defaultValue={me?.postalCode ?? ''}
              className="form-input"
              aria-label="ZIP / postal code"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="insuranceProvider">
            Insurance <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <div className="space-y-2">
            <input
              id="insuranceProvider"
              name="insuranceProvider"
              type="text"
              placeholder="Insurance provider (e.g. Delta Dental)"
              defaultValue={me?.insuranceProvider ?? ''}
              className="form-input w-full"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                name="insurancePolicyNumber"
                type="text"
                placeholder="Member / policy #"
                defaultValue={me?.insurancePolicyNumber ?? ''}
                className="form-input"
                aria-label="Insurance member or policy number"
              />
              <input
                name="insuranceGroupNumber"
                type="text"
                placeholder="Group #"
                defaultValue={me?.insuranceGroupNumber ?? ''}
                className="form-input"
                aria-label="Insurance group number"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
