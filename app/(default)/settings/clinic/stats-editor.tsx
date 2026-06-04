'use client'

import { useState } from 'react'
import type { ClinicStat } from '@/lib/types/clinic-content'
import { AddButton, EditorCard, EmptyHint, Field, inputCls } from '@/components/ui/editor-kit'

interface Props {
  name: string
  defaultValue?: ClinicStat[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const PLACEHOLDERS: { value: string; label: string }[] = [
  { value: '8,000+', label: 'five-star reviews' },
  { value: 'Same-week', label: 'appointments available' },
  { value: 'Most', label: 'insurance accepted' },
]

export default function StatsEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicStat[]>(defaultValue ?? [])

  function update(idx: number, patch: Partial<ClinicStat>) {
    setItems((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
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
  function add() {
    setItems((prev) => [...prev, { id: uid(), value: '', label: '' }])
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="space-y-3">
        {items.length === 0 && (
          <EmptyHint>
            No stats yet. Add up to three short trust signals — they sit just below your hero.
          </EmptyHint>
        )}
        {items.map((s, i) => {
          const ph = PLACEHOLDERS[i] ?? PLACEHOLDERS[0]
          return (
            <EditorCard
              key={s.id}
              label={`Stat ${i + 1}`}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              canMoveUp={i > 0}
              canMoveDown={i < items.length - 1}
              onRemove={() => remove(i)}
            >
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
                <Field label="Number / word">
                  <input
                    type="text"
                    value={s.value}
                    onChange={(e) => update(i, { value: e.target.value })}
                    className={`${inputCls} font-semibold`}
                    placeholder={ph.value}
                    maxLength={32}
                  />
                </Field>
                <Field label="Caption">
                  <input
                    type="text"
                    value={s.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    className={inputCls}
                    placeholder={ph.label}
                    maxLength={64}
                  />
                </Field>
              </div>
            </EditorCard>
          )
        })}
      </div>
      {items.length < 4 && <AddButton onClick={add}>Add stat</AddButton>}
    </div>
  )
}
