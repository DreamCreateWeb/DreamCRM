'use client'

import { useState } from 'react'
import type { ClinicFinancingPartner } from '@/lib/types/clinic-content'
import { FINANCING_COPY, FINANCING_PROVIDERS, financingProvider, parseConnectValue, type FinancingProviderId } from '@/lib/financing-providers'
import { AddButton, EditorCard, EmptyHint, Field, inputCls, textareaCls } from '@/components/ui/editor-kit'

interface Props {
  name: string
  defaultValue?: ClinicFinancingPartner[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * FINANCING WIDGETS (2026-10-09). The clinic picks the provider from the
 * catalog, pastes the ONE thing that provider hands out (Cherry's link,
 * CareCredit's custom link, Sunbit's pre-qualification link…), and chooses
 * whether the provider's widget shows on the financing page — for Cherry,
 * also the floating button on every page. Order is the page order: the
 * first partner is the primary and leads the page (Cherry asked for exactly
 * that for the first client). "Another provider" keeps the old free-form row.
 *
 * The serialized JSON ships through a hidden input so it flows through the
 * existing save action; the server re-validates every link and slug
 * (lib/clinic-content-parse.ts). No raw HTML is ever accepted.
 */
export default function FinancingPartnersEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicFinancingPartner[]>(defaultValue ?? [])
  const [picking, setPicking] = useState(false)
  // What the desk typed in the connect box, per row — parsed on every change
  // into the stored slug / link so the hidden input always carries the clean value.
  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries((defaultValue ?? []).map((p) => [p.id, p.slug ?? p.applyUrl ?? ''])),
  )

  function update(idx: number, patch: Partial<ClinicFinancingPartner>) {
    setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  function add(provider: FinancingProviderId) {
    const def = financingProvider(provider)!
    const id = uid()
    setItems((prev) => [
      ...prev,
      {
        id,
        name: provider === 'other' ? '' : def.name,
        description: null,
        applyUrl: null,
        logoUrl: null,
        provider,
        slug: null,
        showWidget: def.widget != null,
        floatingButton: false,
      },
    ])
    setTyped((t) => ({ ...t, [id]: '' }))
    setPicking(false)
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
  function connect(idx: number, p: ClinicFinancingPartner, raw: string) {
    setTyped((t) => ({ ...t, [p.id]: raw }))
    const provider = (p.provider ?? 'other') as FinancingProviderId
    const parsed = parseConnectValue(provider, raw)
    if (!parsed.ok) {
      update(idx, { slug: null, applyUrl: provider === 'other' ? raw.trim() || null : null })
      return
    }
    if ('slug' in parsed) update(idx, { slug: parsed.slug, applyUrl: null })
    else update(idx, { applyUrl: parsed.url, slug: null })
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="space-y-3">
        {items.length === 0 && (
          <EmptyHint>
            No partners yet. Add the financing you actually offer — Cherry, CareCredit, Sunbit and
            friends — so patients can apply from your site. The section hides on your public site
            when empty.
          </EmptyHint>
        )}
        {items.length > 1 && <p className="text-xs text-gray-500 dark:text-gray-400">{FINANCING_COPY.orderHint}</p>}
        {items.map((p, i) => {
          const provider = (p.provider ?? null) as FinancingProviderId | null
          const def = financingProvider(provider)
          const raw = typed[p.id] ?? ''
          const parsed = provider ? parseConnectValue(provider, raw) : null
          const error = raw.trim() && parsed && !parsed.ok ? parsed.error : null
          const connected = !!(p.slug || p.applyUrl)
          return (
            <EditorCard
              key={p.id}
              label={i === 0 && items.length > 1 ? 'Primary' : `Partner ${i + 1}`}
              headerExtra={
                def && def.id !== 'other' ? (
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{def.name}</span>
                ) : null
              }
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              canMoveUp={i > 0}
              canMoveDown={i < items.length - 1}
              onRemove={() => remove(i)}
            >
              {i === 0 && items.length > 1 && <p className="text-xs text-gray-500 dark:text-gray-400">{FINANCING_COPY.primaryNote}</p>}
              {(!def || def.id === 'other') && (
                <Field label="Partner name">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="The provider’s name"
                    className={inputCls}
                    maxLength={120}
                  />
                </Field>
              )}
              {def ? (
                <Field label={def.connect.label} hint={def.connect.hint}>
                  <input
                    type="text"
                    value={raw}
                    onChange={(e) => connect(i, p, e.target.value)}
                    placeholder={def.connect.placeholder}
                    className={inputCls}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!!error}
                    data-testid={`financing-connect-${def.id}`}
                  />
                </Field>
              ) : (
                <Field label="Apply / info URL">
                  <input
                    type="url"
                    value={p.applyUrl ?? ''}
                    onChange={(e) => update(i, { applyUrl: e.target.value || null })}
                    placeholder="https://…"
                    className={inputCls}
                  />
                </Field>
              )}
              {def && (
                <p className={`text-xs ${error ? 'text-amber-800 dark:text-amber-300' : 'text-gray-500 dark:text-gray-400'}`} data-testid="financing-connect-note">
                  {error ?? (connected ? `Connected — ${p.slug ? `your ${def.name} link ends in “${p.slug}”` : 'patients will apply at your link'}.` : `Where to find it: ${def.connect.where}`)}
                </p>
              )}
              {def?.widget === 'cherry' && (
                <div className="space-y-1.5">
                  <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" className="form-checkbox mt-0.5" checked={p.showWidget === true} onChange={(e) => update(i, { showWidget: e.target.checked })} disabled={!p.slug} />
                    <span>{FINANCING_COPY.widgetToggle(def.name)}</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" className="form-checkbox mt-0.5" checked={p.floatingButton === true} onChange={(e) => update(i, { floatingButton: e.target.checked })} disabled={!p.slug} data-testid="financing-floating" />
                    <span>
                      {FINANCING_COPY.floatingToggle}
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{FINANCING_COPY.floatingHint}</span>
                    </span>
                  </label>
                </div>
              )}
              {def?.widget === 'sunbit' && (
                <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input type="checkbox" className="form-checkbox mt-0.5" checked={p.showWidget === true} onChange={(e) => update(i, { showWidget: e.target.checked })} disabled={!p.slug} />
                  <span>{FINANCING_COPY.sunbitToggle}</span>
                </label>
              )}
              <Field label="What they offer" hint={def && def.id !== 'other' ? 'Optional — leave blank for the standard line.' : undefined}>
                <textarea
                  value={p.description ?? ''}
                  onChange={(e) => update(i, { description: e.target.value || null })}
                  placeholder={def && def.id !== 'other' ? def.tagline : 'Healthcare credit card with promotional 0% APR for qualifying purchases.'}
                  className={textareaCls}
                  rows={2}
                  maxLength={280}
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
            </EditorCard>
          )
        })}
      </div>
      {picking ? (
        <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700/70 p-3" data-testid="financing-catalog">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Which provider?</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FINANCING_PROVIDERS.map((def) => (
              <button
                key={def.id}
                type="button"
                onClick={() => add(def.id)}
                className="rounded-lg border border-gray-200 dark:border-gray-700/70 px-3 py-2 text-left text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-teal-500/5 transition-colors"
              >
                {def.name}
                {def.widget && <span className="block text-xs font-normal text-gray-500 dark:text-gray-400">Has a website widget</span>}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPicking(false)} className="mt-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            Cancel
          </button>
        </div>
      ) : (
        <AddButton onClick={() => setPicking(true)}>Add financing partner</AddButton>
      )}
    </div>
  )
}
