'use client'

import { useState, useTransition, useEffect } from 'react'
import { createClinic } from './actions'
import type { ClinicRow } from './queries'

const planColors: Record<string, string> = {
  basic: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  pro: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400',
  premium: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
}

const statusColors: Record<string, string> = {
  active: 'text-green-600 bg-green-100 dark:bg-green-500/20 dark:text-green-400',
  trialing: 'text-sky-600 bg-sky-100 dark:bg-sky-500/20 dark:text-sky-400',
  past_due: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-500/20 dark:text-yellow-400',
  canceled: 'text-red-600 bg-red-100 dark:bg-red-500/20 dark:text-red-400',
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

interface Props {
  clinics: ClinicRow[]
}

export default function ClinicsList({ clinics: initialClinics }: Props) {
  const [clinics, setClinics] = useState(initialClinics)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ clinicName: string; adminEmail: string; inviteUrl: string; emailSent: boolean } | null>(null)
  const [slugDraft, setSlugDraft] = useState('')
  const [nameDraft, setNameDraft] = useState('')

  // Auto-derive slug from name
  useEffect(() => {
    setSlugDraft(slugify(nameDraft))
  }, [nameDraft])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const fd = new FormData(e.currentTarget)
    const clinicName = fd.get('name') as string
    const adminEmail = fd.get('adminEmail') as string
    startTransition(async () => {
      try {
        const result = await createClinic(fd)
        setSuccess({ clinicName, adminEmail, inviteUrl: result.inviteUrl, emailSent: result.emailSent })
        setShowForm(false)
        setNameDraft('')
        setSlugDraft('')
        // Optimistically add to list (real data will come on next navigation)
        setClinics(prev => [{
          id: result.orgId,
          name: clinicName,
          slug: result.slug,
          planTier: (fd.get('planTier') as string) || 'basic',
          subscriptionStatus: null,
          memberCount: 0,
          ownerEmail: adminEmail,
          ownerName: null,
          createdAt: new Date(),
        }, ...prev])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create clinic.')
      }
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      {/* Header */}
      <div className="sm:flex sm:justify-between sm:items-center mb-8">
        <div className="mb-4 sm:mb-0">
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Clinics</h1>
          <p className="text-sm text-gray-500 mt-1">{clinics.length} {clinics.length === 1 ? 'clinic' : 'clinics'} on the platform</p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setSuccess(null) }}
            className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            + Onboard Clinic
          </button>
        )}
      </div>

      {/* Success banner */}
      {success && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-sm">
          <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-medium text-emerald-800 dark:text-emerald-300">
              {success.clinicName} created successfully
            </p>
            <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">
              {success.emailSent
                ? <>Invitation email sent to <strong>{success.adminEmail}</strong>.</>
                : <><strong>Email failed to send</strong> — share the link below directly with {success.adminEmail}.</>
              }
            </p>
            <p className="text-emerald-600 dark:text-emerald-500 mt-1 text-xs font-mono break-all">
              Invite link: {success.inviteUrl}
            </p>
          </div>
          <button onClick={() => setSuccess(null)} className="ml-auto shrink-0 text-emerald-500 hover:text-emerald-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Inline onboarding form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Onboard a New Clinic</h2>
            <button type="button" onClick={() => { setShowForm(false); setError(null) }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="oc-name">
                Clinic Name <span className="text-red-500">*</span>
              </label>
              <input
                id="oc-name"
                name="name"
                type="text"
                required
                placeholder="Bright Smile Dental"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="oc-slug">
                Subdomain / Slug <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="oc-slug"
                  name="slug"
                  type="text"
                  required
                  placeholder="bright-smile-dental"
                  value={slugDraft}
                  onChange={e => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="form-input w-full font-mono text-sm"
                />
              </div>
              {slugDraft && (
                <p className="text-xs text-gray-400 mt-1">{slugDraft}.dreamcreatestudio.com</p>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="oc-email">
                Admin Email <span className="text-red-500">*</span>
              </label>
              <input
                id="oc-email"
                name="adminEmail"
                type="email"
                required
                placeholder="doctor@brightsmile.com"
                className="form-input w-full"
              />
              <p className="text-xs text-gray-400 mt-1">They'll receive an invite to set up their account.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5" htmlFor="oc-plan">
                Plan Tier
              </label>
              <select
                id="oc-plan"
                name="planTier"
                className="form-select w-full"
              >
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white disabled:opacity-60"
            >
              {isPending ? 'Creating…' : 'Create Clinic & Send Invite'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null) }}
              className="btn-sm bg-white border-gray-200 hover:border-gray-300 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600 dark:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Clinics table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        {clinics.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-gray-500 mb-3">No clinics yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Onboard your first clinic →
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead className="text-xs uppercase text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-b border-gray-200 dark:border-gray-700/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Clinic</th>
                  <th className="px-4 py-3 text-left font-semibold">Owner</th>
                  <th className="px-4 py-3 text-left font-semibold">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Members</th>
                  <th className="px-4 py-3 text-left font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {clinics.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-800 dark:text-gray-100">{c.name}</div>
                      <div className="text-xs text-gray-500">/{c.slug}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.ownerName ? (
                        <div>
                          <div className="text-gray-800 dark:text-gray-100">{c.ownerName}</div>
                          <div className="text-xs text-gray-500">{c.ownerEmail}</div>
                        </div>
                      ) : c.ownerEmail ? (
                        <div>
                          <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Invite pending</div>
                          <div className="text-xs text-gray-500">{c.ownerEmail}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${planColors[c.planTier ?? 'basic'] ?? planColors.basic}`}>
                        {c.planTier ?? 'basic'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.subscriptionStatus ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[c.subscriptionStatus] ?? statusColors.canceled}`}>
                          {c.subscriptionStatus.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">no subscription</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center text-gray-600 dark:text-gray-400">{c.memberCount}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {c.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
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
