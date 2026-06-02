'use client'

import { useState } from 'react'
import type { ClinicFinancingPartner } from '@/lib/types/clinic-content'

interface Props {
  name: string
  defaultValue?: ClinicFinancingPartner[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Repeater editor for `clinic_profile.financing_partners`. Renders a list of
 * partner rows ({name, description, applyUrl, logoUrl}) with add / remove
 * controls. The serialized JSON ships through a hidden input so it flows
 * through the existing `updateClinicProfile` form action.
 *
 * Each row is optional — only `name` is required. The public-site Financing
 * section hides entirely when the list is empty (we don't push financing if
 * the clinic has no partner relationship).
 */
export default function FinancingPartnersEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicFinancingPartner[]>(defaultValue ?? [])

  function update(idx: number, patch: Partial<ClinicFinancingPartner>) {
    setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  function add() {
    setItems((prev) => [
      ...prev,
      { id: uid(), name: '', description: null, applyUrl: null, logoUrl: null },
    ])
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      {items.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic mb-3">
          No partners yet. Add CareCredit, Sunbit, Cherry, or any third-party
          financing you accept so patients can apply directly. The section
          hides on your public site when empty.
        </p>
      ) : (
        <div className="space-y-3 mb-3">
          {items.map((p, i) => (
            <div
              key={p.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800"
            >
              <div className="flex items-start gap-3">
                <div className="grow space-y-2">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Partner name (e.g. CareCredit)"
                    className="form-input w-full text-sm"
                    maxLength={120}
                  />
                  <textarea
                    value={p.description ?? ''}
                    onChange={(e) =>
                      update(i, { description: e.target.value || null })
                    }
                    placeholder="What they offer (1 sentence)"
                    className="form-textarea w-full text-sm"
                    rows={2}
                    maxLength={280}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="url"
                      value={p.applyUrl ?? ''}
                      onChange={(e) =>
                        update(i, { applyUrl: e.target.value || null })
                      }
                      placeholder="Apply / info URL"
                      className="form-input w-full text-sm"
                    />
                    <input
                      type="url"
                      value={p.logoUrl ?? ''}
                      onChange={(e) =>
                        update(i, { logoUrl: e.target.value || null })
                      }
                      placeholder="Logo URL (optional)"
                      className="form-input w-full text-sm"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-gray-500 hover:text-red-600 text-sm font-semibold px-2 py-1 shrink-0"
                  aria-label="Remove financing partner"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
      >
        + Add financing partner
      </button>
    </div>
  )
}
