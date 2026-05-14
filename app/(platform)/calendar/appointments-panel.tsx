'use client'

import { useState, useTransition } from 'react'
import { addAppointment, updateAppointmentStatus, deleteAppointment } from './appointment-actions'
import type { AppointmentRow } from '@/features/appointments/queries'
import type { Patient } from '@/lib/db/schema/clinic'

interface Props {
  appointments: AppointmentRow[]
  patients: Patient[]
  statusCounts: Record<string, number>
  canEdit: boolean
}

const APPT_TYPES = [
  { value: 'checkup', label: 'Checkup' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'filling', label: 'Filling' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'root_canal', label: 'Root Canal' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'other', label: 'Other' },
]

const APPT_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No Show' },
]

function statusBadge(status: string) {
  const cfg: Record<string, string> = {
    scheduled: 'bg-sky-100 dark:bg-sky-400/20 text-sky-700 dark:text-sky-400',
    confirmed: 'bg-emerald-100 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-400',
    completed: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
    cancelled: 'bg-red-100 dark:bg-red-400/20 text-red-600 dark:text-red-400',
    no_show: 'bg-amber-100 dark:bg-amber-400/20 text-amber-700 dark:text-amber-400',
  }
  const label = status.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg[status] ?? cfg.scheduled}`}>
      {label}
    </span>
  )
}

function fmtDateTime(d: Date) {
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function AppointmentsPanel({ appointments, patients, statusCounts, canEdit }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState<string>('all')

  const filtered = filter === 'all'
    ? appointments
    : appointments.filter(a => a.status === filter)

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    try {
      await addAppointment(fd)
      setShowForm(false)
      e.currentTarget.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not book appointment')
    }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">

      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Appointments</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your clinic's schedule</p>
      </div>

      {/* KPI strip */}
      <div className="flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-6">
        <div className="px-5 py-3">
          <div className="flex flex-wrap max-sm:*:w-1/3">
            <div className="flex items-center py-3">
              <div className="mr-5">
                <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{statusCounts.today}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Today</div>
              </div>
              <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
            </div>
            <div className="flex items-center py-3">
              <div className="mr-5">
                <div className="flex items-center">
                  <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums mr-2">{statusCounts.week}</div>
                  <div className="text-sm font-medium text-sky-700 px-1.5 bg-sky-500/20 rounded-full">next 7d</div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Upcoming</div>
              </div>
              <div className="hidden md:block w-px h-8 bg-gray-200 dark:bg-gray-700 mr-5" aria-hidden="true" />
            </div>
            <div className="flex items-center py-3">
              <div className="mr-5">
                <div className="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{statusCounts.total}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Booked</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        {/* Status filter tabs */}
        <div className="flex flex-nowrap -space-x-px">
          {[{ value: 'all', label: 'All' }, ...APPT_STATUSES].map(s => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value)}
              className={`btn rounded-none first:rounded-l-lg last:rounded-r-lg text-sm ${
                filter === s.value
                  ? 'bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-800 border-transparent'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {canEdit && !showForm && (
          <button onClick={() => setShowForm(true)} className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white shrink-0">
            + Book Appointment
          </button>
        )}
      </div>

      {/* Booking form */}
      {showForm && (
        <form onSubmit={handleAdd} className="p-5 bg-gray-50 dark:bg-gray-900/30 rounded-lg space-y-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Book Appointment</h3>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="patientId">Patient <span className="text-red-500">*</span></label>
              <select id="patientId" name="patientId" required className="form-select w-full">
                <option value="">Select a patient…</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="title">Title <span className="text-red-500">*</span></label>
              <input id="title" name="title" type="text" required className="form-input w-full" placeholder="e.g. Annual Cleaning" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="type">Type</label>
              <select id="type" name="type" className="form-select w-full">
                {APPT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="startTime">Start Time <span className="text-red-500">*</span></label>
              <input id="startTime" name="startTime" type="datetime-local" required className="form-input w-full" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1" htmlFor="endTime">End Time</label>
              <input id="endTime" name="endTime" type="datetime-local" className="form-input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="apptNotes">Notes</label>
            <textarea id="apptNotes" name="notes" rows={2} className="form-input w-full" />
          </div>
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <div className="flex items-center gap-2">
            <button type="submit" className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white">
              Book Appointment
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null) }}
              className="btn-sm bg-white border-gray-200 hover:border-gray-300 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600 dark:text-gray-300">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Appointments table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        {filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-gray-400 dark:text-gray-500">
            {filter !== 'all' ? `No ${filter.replace('_', ' ')} appointments.` : 'No appointments yet — book one above.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full dark:text-gray-300">
              <thead className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20 border-t border-b border-gray-100 dark:border-gray-700/60">
                <tr>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Patient</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Date & Time</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Title / Type</th>
                  <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Status</th>
                  {canEdit && <th className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap text-left">Actions</th>}
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-700/60">
                {filtered.map(a => (
                  <tr key={a.id}>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      <div className="font-medium text-gray-800 dark:text-gray-100">
                        {a.patientFirstName} {a.patientLastName}
                      </div>
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      <div className="text-gray-800 dark:text-gray-100">{fmtDateTime(a.startTime)}</div>
                      {a.endTime && (
                        <div className="text-xs text-gray-400">ends {fmtTime(a.endTime)}</div>
                      )}
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      <div className="text-gray-800 dark:text-gray-100">{a.title}</div>
                      <div className="text-xs text-gray-400 capitalize">{a.type.replace('_', ' ')}</div>
                    </td>
                    <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                      {statusBadge(a.status)}
                    </td>
                    {canEdit && (
                      <td className="px-2 first:pl-5 last:pr-5 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {a.status === 'scheduled' && (
                            <button
                              onClick={() => startTransition(() => updateAppointmentStatus(a.id, 'confirmed'))}
                              disabled={pending}
                              className="text-xs font-medium text-emerald-500 hover:text-emerald-600 disabled:opacity-50"
                            >
                              Confirm
                            </button>
                          )}
                          {(a.status === 'scheduled' || a.status === 'confirmed') && (
                            <button
                              onClick={() => startTransition(() => updateAppointmentStatus(a.id, 'completed'))}
                              disabled={pending}
                              className="text-xs font-medium text-sky-500 hover:text-sky-600 disabled:opacity-50"
                            >
                              Complete
                            </button>
                          )}
                          {a.status !== 'cancelled' && a.status !== 'completed' && (
                            <button
                              onClick={() => startTransition(() => updateAppointmentStatus(a.id, 'cancelled'))}
                              disabled={pending}
                              className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={() => startTransition(() => deleteAppointment(a.id))}
                            disabled={pending}
                            className="text-xs font-medium text-gray-400 hover:text-gray-600 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
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
