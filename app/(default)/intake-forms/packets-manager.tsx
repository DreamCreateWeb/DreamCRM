'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { createPacketAction, deletePacketAction } from './actions'

export interface PacketView {
  id: string
  title: string
  slug: string
  formCount: number
  url: string | null
}

/**
 * Manage form packets — a named bundle of forms a patient fills in one sitting.
 * Lives at the bottom of the intake-forms list. Create from existing forms
 * (≥2), share the public link, delete.
 */
export default function PacketsManager({
  packets,
  forms,
}: {
  packets: PacketView[]
  forms: { id: string; title: string }[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('New Patient Packet')
  const [picked, setPicked] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  function create() {
    setError(null)
    if (picked.length < 2) {
      setError('Pick at least two forms.')
      return
    }
    setPending(true)
    void createPacketAction(title, picked)
      .then((r) => {
        if (r.ok) {
          setCreating(false)
          setPicked([])
          setTitle('New Patient Packet')
          router.refresh()
        } else {
          setError(r.error)
        }
      })
      .catch(() => setError('Could not create the packet.'))
      .finally(() => setPending(false))
  }

  async function remove(id: string) {
    if (!(await confirm({ title: 'Delete this packet?', message: 'The forms inside it are kept.', confirmLabel: 'Delete', danger: true }))) return
    await deletePacketAction(id)
    router.refresh()
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Form packets</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Bundle several forms into one link patients complete in a single sitting.
          </p>
        </div>
        {forms.length >= 2 && !creating && (
          <ActionButton variant="secondary" size="sm" onClick={() => setCreating(true)}>
            + New packet
          </ActionButton>
        )}
      </div>

      {creating && (
        <div className="v2-card p-4 mb-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Packet name"
            className="form-input w-full text-sm font-medium"
          />
          <div className="space-y-1.5">
            {forms.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={picked.includes(f.id)} onChange={() => toggle(f.id)} className="form-checkbox" />
                {f.title}
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <div className="flex items-center gap-2">
            <ActionButton variant="primary" size="sm" onClick={create} disabled={pending}>
              {pending ? 'Creating…' : 'Create packet'}
            </ActionButton>
            <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">
              Cancel
            </button>
          </div>
        </div>
      )}

      {packets.length === 0 ? (
        <p className="text-sm italic text-gray-400 dark:text-gray-500">
          {forms.length < 2 ? 'Create at least two forms to bundle into a packet.' : 'No packets yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {packets.map((p) => (
            <li key={p.id} className="v2-card flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-100">{p.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {p.formCount} forms
                  {p.url && (
                    <>
                      {' · '}
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-mono text-teal-700 dark:text-teal-300 hover:underline">
                        {p.url.replace(/^https?:\/\//, '')}
                      </a>
                    </>
                  )}
                </p>
              </div>
              <button type="button" onClick={() => remove(p.id)} className="shrink-0 text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
