import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * WelcomeInterview UI (v2). Covers the new service-checkbox step (Core/Special
 * groups, the 4 starter slugs pre-checked, min-1 guard), draft resume
 * hydration, and the reveal moment ("Your website is ready" + View-your-site /
 * Open-the-editor CTAs).
 */

const actions = vi.hoisted(() => ({
  runOnboardingDraft: vi.fn(),
  saveInterviewDraftAction: vi.fn(async () => ({ ok: true })),
  skipInterviewAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/app/(onboarding)/welcome/actions', () => actions)

import WelcomeInterview, { type ServicePick } from '@/app/(onboarding)/welcome/welcome-interview'
import { INTERVIEW_PRECHECKED_SERVICE_SLUGS } from '@/lib/types/onboarding-interview'

const SERVICES: ServicePick[] = [
  { slug: 'family-dental-care', name: 'Family Dental Care', category: 'core', shortDescription: '' },
  { slug: 'dental-exams', name: 'Dental Exams', category: 'core', shortDescription: '' },
  { slug: 'dental-hygiene', name: 'Dental Hygiene', category: 'core', shortDescription: '' },
  { slug: 'teeth-whitening', name: 'Teeth Whitening', category: 'special', shortDescription: '' },
  { slug: 'dental-implants', name: 'Dental Implants', category: 'special', shortDescription: '' },
]

const SITE_URL = 'https://acme-dental.dreamcreatestudio.com'

beforeEach(() => {
  actions.runOnboardingDraft.mockReset()
  actions.saveInterviewDraftAction.mockReset()
  actions.saveInterviewDraftAction.mockResolvedValue({ ok: true })
  actions.skipInterviewAction.mockReset()
  actions.skipInterviewAction.mockResolvedValue({ ok: true })
})

describe('WelcomeInterview — first question', () => {
  it('opens on question 1 of 7 with a free-text input', () => {
    render(<WelcomeInterview services={SERVICES} siteUrl={SITE_URL} resumeDraft={null} />)
    expect(screen.getByText(/question 1 of 7/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })
})

describe('WelcomeInterview — services checkbox step', () => {
  // Resume straight onto the services step (index 3) to render it directly.
  function renderOnServicesStep() {
    render(
      <WelcomeInterview
        services={SERVICES}
        siteUrl={SITE_URL}
        resumeDraft={{
          answers: { positioning: 'A family practice' },
          serviceSlugs: [...INTERVIEW_PRECHECKED_SERVICE_SLUGS],
          step: 3,
          updatedAt: new Date().toISOString(),
        }}
      />,
    )
  }

  it('renders Core and Special groups', () => {
    renderOnServicesStep()
    expect(screen.getByText('Core services')).toBeInTheDocument()
    expect(screen.getByText('Special services')).toBeInTheDocument()
  })

  it('pre-checks the 4 starter services', () => {
    renderOnServicesStep()
    for (const slug of INTERVIEW_PRECHECKED_SERVICE_SLUGS) {
      const name = SERVICES.find((s) => s.slug === slug)!.name
      const cb = screen.getByRole('checkbox', { name: new RegExp(name, 'i') })
      expect(cb).toBeChecked()
    }
    // A non-starter special service is unchecked.
    expect(screen.getByRole('checkbox', { name: /dental implants/i })).not.toBeChecked()
  })

  it('shows a live selected count', () => {
    renderOnServicesStep()
    expect(screen.getByText(/4 selected/i)).toBeInTheDocument()
  })

  it('disables Next when the clinic unchecks everything (min 1 guard)', async () => {
    const user = userEvent.setup()
    renderOnServicesStep()
    for (const slug of INTERVIEW_PRECHECKED_SERVICE_SLUGS) {
      const name = SERVICES.find((s) => s.slug === slug)!.name
      await user.click(screen.getByRole('checkbox', { name: new RegExp(name, 'i') }))
    }
    expect(screen.getByText(/pick at least one/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next|draft my website/i })).toBeDisabled()
  })
})

describe('WelcomeInterview — resume hydration', () => {
  it('resumes at the saved step with the prior answers rendered', () => {
    render(
      <WelcomeInterview
        services={SERVICES}
        siteUrl={SITE_URL}
        resumeDraft={{
          answers: { positioning: 'We are a calm family practice' },
          serviceSlugs: ['teeth-whitening'],
          step: 1,
          updatedAt: new Date().toISOString(),
        }}
      />,
    )
    expect(screen.getByText(/question 2 of 7/i)).toBeInTheDocument()
    // The earlier answer is echoed in the recap bubbles.
    expect(screen.getByText('We are a calm family practice')).toBeInTheDocument()
  })
})

describe('WelcomeInterview — reveal moment', () => {
  it('shows "Your website is ready" + both CTAs after a successful draft', async () => {
    actions.runOnboardingDraft.mockResolvedValue({ ok: true, draftedServices: 4, skippedFields: [] })
    render(
      <WelcomeInterview
        services={SERVICES}
        siteUrl={SITE_URL}
        resumeDraft={{
          answers: { positioning: 'x', audience: 'y', difference: 'z', feeling: 'a', trust: 'b' },
          serviceSlugs: ['family-dental-care'],
          step: 6, // last question (faq, index 6)
          updatedAt: new Date().toISOString(),
        }}
      />,
    )
    // Answer the last question → triggers the draft → reveal.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Do you take my insurance?' } })
    fireEvent.click(screen.getByRole('button', { name: /draft my website/i }))

    await waitFor(() => expect(screen.getByText(/your website is ready/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /view your site/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open the editor/i })).toBeInTheDocument()
    // The live URL is shown (sans scheme).
    expect(screen.getByText('acme-dental.dreamcreatestudio.com')).toBeInTheDocument()
  })

  it('shows the honest floor message + retry when the draft fails (never a dead end)', async () => {
    actions.runOnboardingDraft.mockResolvedValue({ ok: false, error: 'AI request failed — please try again' })
    render(
      <WelcomeInterview
        services={SERVICES}
        siteUrl={SITE_URL}
        resumeDraft={{
          answers: { positioning: 'x', audience: 'y', difference: 'z', feeling: 'a', trust: 'b' },
          serviceSlugs: ['family-dental-care'],
          step: 6,
          updatedAt: new Date().toISOString(),
        }}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'last answer' } })
    fireEvent.click(screen.getByRole('button', { name: /draft my website/i }))

    await waitFor(() =>
      expect(screen.getByText(/set up with our standard copy/i)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /try the draft again/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit it myself/i })).toBeInTheDocument()
  })
})

describe('WelcomeInterview — a failing draft never spins forever', () => {
  function renderOnLastStep() {
    render(
      <WelcomeInterview
        services={SERVICES}
        siteUrl={SITE_URL}
        resumeDraft={{
          answers: { positioning: 'x', audience: 'y', difference: 'z', feeling: 'a', trust: 'b' },
          serviceSlugs: ['family-dental-care'],
          step: 6,
          updatedAt: new Date().toISOString(),
        }}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'last answer' } })
    fireEvent.click(screen.getByRole('button', { name: /draft my website/i }))
  }

  it('a THROWN draft error drops to the floor screen, not the infinite "Building…" spinner', async () => {
    // The bug: the throw was unhandled, so the phase stayed on 'drafting' forever.
    actions.runOnboardingDraft.mockRejectedValue(new Error('network exploded'))
    renderOnLastStep()
    await waitFor(() => expect(screen.getByText(/set up with our standard copy/i)).toBeInTheDocument())
    expect(screen.queryByText(/building your website/i)).not.toBeInTheDocument()
  })

  it('reloads on a deployment-skew error (stale Server Action id across a deploy)', async () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign: vi.fn(), reload },
    })
    actions.runOnboardingDraft.mockRejectedValue(
      new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'),
    )
    try {
      renderOnLastStep()
      await waitFor(() => expect(reload).toHaveBeenCalled())
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})
