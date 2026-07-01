import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'

/**
 * Settings → Search appearance form. Pins the v2 upgrade:
 *  - the 11 pages are an accordion (collapsed by default, one open at a time)
 *  - each row carries a Customized (special) vs Using-default (neutral) pill
 *  - only applicable pages render (careers/blog/etc. gate on the prop)
 *  - the "Use default" affordance clears an override
 *  - the character counter reflects tone (ok/warn/urgent)
 *  - a Save hands the full draft to the action
 */

const saveSeoMetaAction = vi.fn(async (_draft: unknown) => ({ ok: true as const }))
vi.mock('@/app/(default)/settings/seo/actions', () => ({
  saveSeoMetaAction: (d: unknown) => saveSeoMetaAction(d),
}))

// The form is wrapped in SettingsTabs, which reaches for useSearchParams.
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

import SeoMetaForm from '@/app/(default)/settings/seo/seo-meta-form'
import { SEO_PAGE_KEYS, type PageSeoMeta, type SeoPageKey } from '@/lib/types/seo-meta'

function emptyMeta(): PageSeoMeta {
  return SEO_PAGE_KEYS.reduce((acc, k) => {
    acc[k] = {}
    return acc
  }, {} as PageSeoMeta)
}

const baseProps = {
  clinicName: 'Acme Dental',
  tagline: 'Gentle care',
  about: 'We are a warm neighborhood practice.',
  domain: 'acme.dreamcreatestudio.com',
}

beforeEach(() => saveSeoMetaAction.mockClear())

describe('SeoMetaForm — accordion', () => {
  it('renders a summary row per applicable page, collapsed (no inputs) by default', () => {
    const { container, getByText } = render(
      <SeoMetaForm initial={emptyMeta()} {...baseProps} applicablePages={['home', 'about']} />,
    )
    getByText('Home')
    getByText('About')
    // Collapsed → no editable inputs yet.
    expect(container.querySelectorAll('input[type="text"]').length).toBe(0)
    expect(container.querySelectorAll('textarea').length).toBe(0)
  })

  it('expands a row on click, revealing title + description + preview', () => {
    const { container, getByRole } = render(
      <SeoMetaForm initial={emptyMeta()} {...baseProps} applicablePages={['home']} />,
    )
    const row = getByRole('button', { name: /Home/ })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('input[type="text"]').length).toBe(1)
    expect(container.querySelectorAll('textarea').length).toBe(1)
  })

  it('opens the first customized page automatically', () => {
    const initial = emptyMeta()
    initial.about = { title: 'Custom about' }
    const { getByDisplayValue } = render(
      <SeoMetaForm initial={initial} {...baseProps} applicablePages={['home', 'about', 'faq']} />,
    )
    // The About row starts open, so its custom title input is present.
    getByDisplayValue('Custom about')
  })
})

describe('SeoMetaForm — Customized vs default pills + gating', () => {
  it('shows a "Customized" pill for pages with an override and "Using default" otherwise', () => {
    const initial = emptyMeta()
    initial.home = { title: 'My home title' }
    const { getByText } = render(
      <SeoMetaForm initial={initial} {...baseProps} applicablePages={['home', 'about']} />,
    )
    const customized = getByText('Customized')
    expect(customized.getAttribute('data-tone')).toBe('special')
    const usingDefault = getByText('Using default')
    expect(usingDefault.getAttribute('data-tone')).toBe('neutral')
  })

  it('hides pages the clinic does not have (careers absent from applicablePages)', () => {
    const { queryByText, getByText } = render(
      <SeoMetaForm
        initial={emptyMeta()}
        {...baseProps}
        applicablePages={['home', 'about', 'faq']}
      />,
    )
    getByText('Home')
    expect(queryByText('Careers')).toBeNull()
    expect(queryByText('Blog')).toBeNull()
  })

  it('falls back to every page when applicablePages is omitted', () => {
    const { getByText } = render(<SeoMetaForm initial={emptyMeta()} {...baseProps} />)
    getByText('Careers')
    getByText('Blog')
    getByText('Dental Plans')
  })
})

describe('SeoMetaForm — use default + counter', () => {
  it('"Use default" clears the field (falls back to derived) and is gone once empty', () => {
    const initial = emptyMeta()
    initial.home = { title: 'My home title' }
    const { getByRole, getByDisplayValue, queryByText } = render(
      <SeoMetaForm initial={initial} {...baseProps} applicablePages={['home']} />,
    )
    // Home starts open (it's the customized page).
    getByDisplayValue('My home title')
    const useDefault = getByRole('button', { name: 'Use default' })
    fireEvent.click(useDefault)
    // Field cleared → the title input is empty, its placeholder shows the derived
    // default, and the "Use default" affordance is gone.
    const titleInput = document.querySelector('input[type="text"]') as HTMLInputElement
    expect(titleInput.value).toBe('')
    expect(titleInput.placeholder).toBe('Acme Dental — Gentle care')
    expect(queryByText('Use default')).toBeNull()
  })

  it('character counter reflects tone (ok when short, urgent when over cap)', () => {
    const initial = emptyMeta()
    initial.home = { title: 'Short' }
    const { getByRole, container } = render(
      <SeoMetaForm initial={initial} {...baseProps} applicablePages={['home']} />,
    )
    // "Short" (5 chars) is comfortably under 60 → ok/emerald.
    expect(container.querySelector('.text-emerald-700')).not.toBeNull()
    // Type a >60-char title → urgent/rose counter appears.
    const titleInput = container.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'x'.repeat(80) } })
    expect(container.querySelector('.text-rose-700')).not.toBeNull()
  })
})

describe('SeoMetaForm — save', () => {
  it('hands the full draft to saveSeoMetaAction and shows a toast', async () => {
    const initial = emptyMeta()
    initial.home = { title: 'Kept title' }
    const { getByRole, getByText } = render(
      <SeoMetaForm initial={initial} {...baseProps} applicablePages={['home', 'about']} />,
    )
    fireEvent.click(getByRole('button', { name: /Save search appearance/ }))
    await waitFor(() => expect(saveSeoMetaAction).toHaveBeenCalledTimes(1))
    const sent = saveSeoMetaAction.mock.calls[0][0] as PageSeoMeta
    expect(sent.home.title).toBe('Kept title')
    await waitFor(() => getByText('Saved.'))
  })
})
