import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import React from 'react'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...rest }, children),
}))

import ProductPage from '@/app/(marketing)/product/page'
import PricingPage from '@/app/(marketing)/pricing/page'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { SITE_TEMPLATE_CATALOG } from '@/lib/site-templates/catalog'
import { INCLUDED_MONTHLY_INSURANCE_CHECKS } from '@/lib/insurance-eligibility'
import { INCLUDED_MONTHLY_INSURANCE_DISCOVERIES } from '@/lib/insurance-discovery'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

describe('ML-45: the marketing site sells insurance checks', () => {
  it('the product tour has an insurance chapter that quotes the code allowances', () => {
    const { container } = render(<ProductPage />)
    expect(container.querySelector('#insurance')).not.toBeNull()
    expect(screen.getByText('Know the benefits before the patient sits down')).toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text).toContain(`${INCLUDED_MONTHLY_INSURANCE_CHECKS} checks a month`)
    expect(text).toContain(`${INCLUDED_MONTHLY_INSURANCE_DISCOVERIES} a month`)
    expect(text).toContain('Stedi')
  })

  it('the pricing page lists the checks as included and answers the cost question', () => {
    const { container } = render(<PricingPage />)
    const text = container.textContent ?? ''
    expect(text).toContain(
      `Insurance eligibility checks through Stedi (${INCLUDED_MONTHLY_INSURANCE_CHECKS} a month included)`,
    )
    expect(screen.getByText('Do insurance checks cost extra?')).toBeInTheDocument()
  })

  it('every comparison carries our insurance row as a yes', () => {
    for (const c of COMPARISONS) {
      const row = c.matrix.find((r) => r.feature === 'Insurance eligibility checks')
      expect(row, c.slug).toBeDefined()
      expect(row!.dreamcrm).toBe('yes')
    }
  })

  it('makes no HIPAA claim anywhere on these selling surfaces (docs/COMPLIANCE.md)', () => {
    for (const f of [
      'app/(marketing)/product/page.tsx',
      'app/(marketing)/pricing/page.tsx',
      'lib/marketing/comparisons.ts',
      'components/marketing/design-gallery.tsx',
    ]) {
      expect(read(f), f).not.toMatch(/hipaa/i)
    }
    const { container } = render(<ProductPage />)
    expect(container.textContent ?? '').not.toMatch(/hipaa/i)
  })
})

describe('ML-45: every design, live', () => {
  it('renders one lazy, inert frame per registered template from the demo clinic', () => {
    const { container } = render(<ProductPage />)
    const frames = Array.from(container.querySelectorAll('iframe[src*="/tf/"]'))
    expect(frames).toHaveLength(SITE_TEMPLATE_CATALOG.length)
    for (const entry of SITE_TEMPLATE_CATALOG) {
      const f = frames.find((x) => x.getAttribute('src') === `/site/acme-dental-demo/tf/${entry.id}`)
      expect(f, entry.id).toBeDefined()
      expect(f!.getAttribute('loading')).toBe('lazy')
      expect(f!.getAttribute('aria-hidden')).toBe('true')
      expect(f!.getAttribute('tabindex')).toBe('-1')
      expect(screen.getAllByText(entry.label).length).toBeGreaterThan(0)
    }
  })
})
