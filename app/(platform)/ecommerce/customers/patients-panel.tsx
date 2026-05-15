'use client'

import { useState, useTransition } from 'react'
import { addPatient, deactivatePatient, reactivatePatient, invitePatientToPortal } from './actions'
import type { Patient } from '@/lib/db/schema/clinic'

interface Props {
  patients: Patient[]
  canEdit: boolean
}

function calcAge(dob: string | null): string {
  if (!dob) return '—'
  const birth = new Date(dob)
  const now = new Date()
  const age = now.getFullYear() - birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
  return String(age)
}

function activeBadge(isActive: number) {
  return isActive === 1
    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-400">Active</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Inactive</span>
}

export default function PatientsPanel({ patients: initialPatients, canEdit }: Props) {
  const [patients, setPatients] = useState(initialPatients)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [inviteStatus, setInviteStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})

  async function handleInvite(patientId: string) {
    setInviteStatus(s => ({ ...s, [patientId]: 'sending' }))
    try {
      await invitePatientToPortal(patientId)
      setInviteStatus(s => ({ ...s, [patientId]: 'sent' }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send invite')
      setInviteStatus(s => ({ ...s, [patientId]: 'error' }))
    }
  }

  const filtered = search.trim()
    ? patients.filter(p => {
        const q = search.toLowerCase()
        return (
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q) ||
          (p.email ?? '').toLowerCase().includes(q) ||
          (p.phone ?? '').includes(q)
        )
      })
    : patients

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    try {
      await addPatient(fd)
      setShowForm(false)
      e.currentTarget.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add patient')
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Patients</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{patients.length} total patient{patients.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search patients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-9 w-full text-sm"
          />
        </div>
        {canEdit && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white shrink-0">
            + Add Patient
          </button>
        )}
      </div>

      {/* Add patient form */}
      {showForm && (
        <form onSubmit={handleAdd} className="p-5 bg-gray-50 dark:bg-gray-900/30 rounded-lg space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">New Patient</h3>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="firstName">First Name <span className="text-red-500">*</span></label>
              <input id="firstName" name="firstName" type="text" required className="form-input w-full" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="lastName">Last Name <span className="text-red-500">*</span></label>
              <input id="lastName" name="lastName" type="text" required className="form-input w-full" />
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium mb-1" htmlFor="dateOfBirth">Date of Birth</label>
              <input id="dateOfBirth" name="dateOfBirth" type="date" className="form-input w-full" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" className="form-input w-full" />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium mb-1" htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" className="form-input w-full" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="addressLine1">Street Address</label>
              <input id="addressLine1" name="addressLine1" type="text" className="form-input w-full" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="city">City</label>
              <input id="city" name="city" type="text" className="form-input w-full" />
            </div>
            <div className="w-20">
              <label className="block text-sm font-medium mb-1" htmlFor="state">State</label>
              <input id="state" name="state" type="text" className="form-input w-full" />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium mb-1" htmlFor="postalCode">ZIP</label>
              <input id="postalCode" name="postalCode" type="text" className="form-input w-full" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="insuranceProvider">Insurance Provider</label>
              <input id="insuranceProvider" name="insuranceProvider" type="text" className="form-input w-full" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="insurancePolicyNumber">Policy #</label>
              <input id="insurancePolicyNumber" name="insurancePolicyNumber" type="text" className="form-input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={2} className="form-input w-full" />
          </div>
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <div className="flex items-center gap-2">
            <button type="submit" className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">
              Save Patient
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null) }}
              className="btn-sm bg-white border-gray-200 hover:border-gray-300 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600 dark:text-gray-300">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Patients table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-gray-400 dark:text-gray-500">
            {search.trim() ? 'No patients match your search.' : 'No patients yet — add your first patient above.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Name</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Age</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Contact</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Insurance</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Status</th>
                  {canEdit && <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Portal</th>}
                  {canEdit && <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Actions</th>}
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-800 dark:text-gray-100">{p.firstName} {p.lastName}</div>
                      {p.dateOfBirth && <div className="text-xs text-gray-400">DOB: {p.dateOfBirth}</div>}
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {calcAge(p.dateOfBirth)}
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      {p.email && <div className="text-gray-500 dark:text-gray-400">{p.email}</div>}
                      {p.phone && <div className="text-gray-500 dark:text-gray-400">{p.phone}</div>}
                      {!p.email && !p.phone && <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {p.insuranceProvider ?? '—'}
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      {activeBadge(p.isActive)}
                    </td>
                    {canEdit && (
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                        {p.userId ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-400">
                            Linked
                          </span>
                        ) : (
                          <button
                            onClick={() => handleInvite(p.id)}
                            disabled={inviteStatus[p.id] === 'sending' || inviteStatus[p.id] === 'sent' || !p.email}
                            title={!p.email ? 'Add an email address first' : undefined}
                            className="text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 disabled:opacity-40"
                          >
                            {inviteStatus[p.id] === 'sending' ? 'Sending…' : inviteStatus[p.id] === 'sent' ? 'Invited ✓' : 'Invite'}
                          </button>
                        )}
                      </td>
                    )}
                    {canEdit && (
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                        {p.isActive === 1 ? (
                          <button
                            onClick={() => startTransition(() => deactivatePatient(p.id))}
                            disabled={pending}
                            className="text-xs font-medium text-amber-500 hover:text-amber-600 disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => startTransition(() => reactivatePatient(p.id))}
                            disabled={pending}
                            className="text-xs font-medium text-emerald-500 hover:text-emerald-600 disabled:opacity-50"
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
