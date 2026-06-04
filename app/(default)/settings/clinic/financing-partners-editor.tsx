'use client'

import { useState } from 'react'
import type { ClinicFinancingPartner } from '@/lib/types/clinic-content'
import { AddButton, EditorCard, EmptyHint, Field, inputCls, textareaCls } from '@/components/ui/editor-kit'

interface Props {
  name: string
  defaultValue?: ClinicFinancingPartner[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Repeater editor for `clinic_profile.financing_partners`. Each row is optional
 * — only `name` is required. The serialized JSON ships through a hidden input so
 * it flows through the existing `updateClinicProfile` form action. The public
 * Financing section hides entirely when the list is empty.
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
  function move(idx: number, dir: -1 | 1) {
    setItems((prev) => {
      const swap = idx + dir
      if (swap < 0 || swap >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="space-y-3">
        {items.length === 0 && (
          <EmptyHint>
            No partners yet. Add CareCredit, Sunbit, Cherry, or any third-party financing you
            accept so patients can apply directly. The section hides on your public site when
            empty.
          </EmptyHint>
        )}
        {items.map((p, i) => (
          <EditorCard
            key={p.id}
            label={`Partner ${i + 1}`}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            canMoveUp={i > 0}
            canMoveDown={i < items.length - 1}
            onRemove={() => remove(i)}
          >
            <Field label="Partner name">
              <input
                type="text"
                value={p.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="CareCredit"
                className={inputCls}
                maxLength={120}
              />
            </Field>
            <Field label="What they offer">
              <textarea
                value={p.description ?? ''}
                onChange={(e) => update(i, { description: e.target.value || null })}
                placeholder="Healthcare credit card with promotional 0% APR for qualifying purchases."
                className={textareaCls}
                rows={2}
                maxLength={280}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Apply / info URL">
                <input
                  type="url"
                  value={p.applyUrl ?? ''}
                  onChange={(e) => update(i, { applyUrl: e.target.value || null })}
                  placeholder="https://…"
                  className={inputCls}
                />
              </Field>
              <Field label="Logo URL" hint="Optional.">
                <input
                  type="url"
                  value={p.logoUrl ?? ''}
                  onChange={(e) => update(i, { logoUrl: e.target.value || null })}
                  placeholder="https://…/logo.png"
                  className={inputCls}
                />
              </Field>
            </div>
          </EditorCard>
        ))}
      </div>
      <AddButton onClick={add}>Add financing partner</AddButton>
    </div>
  )
}
