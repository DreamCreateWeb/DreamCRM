import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'

/**
 * The service builder used to expose only the description paragraph. It now
 * opens a full-page editor — Highlights · Description · What to expect · Common
 * questions — with a "✨ Generate" button that fills every section with AI. These
 * tests pin: all four sections render + seed correctly, Save hands the WHOLE
 * content blob (not just body) to the action, Generate re-seeds from the AI
 * draft, and a not-yet-customized service seeds from the library default.
 */

const updateServiceContent =
  vi.fn<(id: string, content: unknown) => Promise<{ ok: true } | { ok: false; error: string }>>(
    async () => ({ ok: true }),
  )
const regenerateCustomization = vi.fn<(id: string) => Promise<unknown>>(async () => ({
  ok: true,
  data: {
    generatedAt: new Date().toISOString(),
    customization: {
      heroBullets: ['AI highlight'],
      body: 'An AI-written description.',
      processSteps: [{ title: 'AI step', body: 'AI step body' }],
      faq: [{ question: 'AI question?', answer: 'AI answer.' }],
      generatedAt: new Date().toISOString(),
      modelId: 'claude-sonnet-4-6',
    },
  },
}))

vi.mock('@/app/(default)/settings/clinic/services-actions', () => ({
  addServiceFromLibrary: vi.fn(async () => ({ ok: true })),
  regenerateCustomization: (id: string) => regenerateCustomization(id),
  removeService: vi.fn(async () => ({ ok: true })),
  reorderService: vi.fn(async () => ({ ok: true })),
  submitNewService: vi.fn(async () => ({ ok: true, kind: 'added' })),
  updateServiceContent: (id: string, content: unknown) => updateServiceContent(id, content),
  updateServiceOverrides: vi.fn(async () => ({ ok: true })),
}))

import ServicesLibraryPicker from '@/app/(default)/settings/clinic/services-library-picker'
import type { ClinicService } from '@/lib/types/clinic-content'
import type { ServiceLibraryEntryWithStatus } from '@/lib/services/service-library'

const LIBRARY: ServiceLibraryEntryWithStatus[] = [
  {
    slug: 'teeth-whitening',
    name: 'Teeth Whitening',
    category: 'core',
    icon: '✨',
    shortDescription: 'Brighten your smile.',
    heroBullets: ['Library highlight for {clinic}'],
    body: 'Library body about {clinic} in {city}.',
    processSteps: [{ title: 'Library step', body: 'Library step body.' }],
    faq: [{ question: 'Library question?', answer: 'Library answer.' }],
    relatedSlugs: [],
    origin: 'platform',
    status: 'active',
    submittedByOrgId: null,
    reviewNotes: null,
    editedByAdmin: false,
    createdAt: null,
    updatedAt: null,
  },
]

const CUSTOMIZED_SERVICE: ClinicService = {
  id: 'svc_1',
  librarySlug: 'teeth-whitening',
  name: 'Teeth Whitening',
  category: 'core',
  icon: '✨',
  customized: {
    heroBullets: ['Bright in one visit', 'Gentle on enamel'],
    body: 'We brighten your smile in a single, comfortable visit.',
    processSteps: [{ title: 'Quick exam', body: 'We check your smile first.' }],
    faq: [{ question: 'Does it hurt?', answer: 'Most people feel nothing.' }],
    generatedAt: new Date().toISOString(),
    modelId: 'claude-sonnet-4-6',
  },
}

function renderPicker(services: ClinicService[]) {
  return render(
    <ServicesLibraryPicker
      name="services"
      initialServices={services}
      library={LIBRARY}
      orgId="org_1"
      clinicName="Acme Dental"
      city="Austin"
    />,
  )
}

beforeEach(() => {
  updateServiceContent.mockClear()
  regenerateCustomization.mockClear()
  // happy-dom has no window.confirm — assign a mock directly (spyOn needs an
  // existing function). The editor confirms before an AI Generate.
  window.confirm = vi.fn(() => true)
})

describe('ServicesLibraryPicker — full content editor', () => {
  it('opens an editor exposing all four sections, seeded from the customization', () => {
    renderPicker([CUSTOMIZED_SERVICE])
    fireEvent.click(screen.getByText('✨ Edit content'))

    expect(screen.getByText('Edit content · Teeth Whitening')).toBeInTheDocument()
    for (const heading of ['Highlights', 'Description', 'What to expect', 'Common questions']) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
    // Seeded from the saved customization (not just the body).
    expect(screen.getByDisplayValue('Bright in one visit')).toBeInTheDocument()
    expect(screen.getByDisplayValue('We brighten your smile in a single, comfortable visit.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Quick exam')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Does it hurt?')).toBeInTheDocument()
    // The AI fill button is present for a library-linked service.
    expect(screen.getByText('✨ Generate')).toBeInTheDocument()
  })

  it('Save hands the WHOLE content blob (all four sections) to updateServiceContent', async () => {
    renderPicker([CUSTOMIZED_SERVICE])
    fireEvent.click(screen.getByText('✨ Edit content'))

    fireEvent.change(screen.getByDisplayValue('Bright in one visit'), {
      target: { value: 'Bright in a single visit' },
    })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(updateServiceContent).toHaveBeenCalledTimes(1))
    const [id, content] = updateServiceContent.mock.calls[0] as [string, {
      heroBullets: string[]
      body: string
      processSteps: { title: string; body: string }[]
      faq: { question: string; answer: string }[]
    }]
    expect(id).toBe('svc_1')
    expect(content.heroBullets).toContain('Bright in a single visit')
    expect(content.body).toContain('brighten') // body carried through untouched
    expect(content.processSteps[0].title).toBe('Quick exam')
    expect(content.faq[0].question).toBe('Does it hurt?')
  })

  it('✨ Generate fills every section from the AI draft', async () => {
    renderPicker([CUSTOMIZED_SERVICE])
    fireEvent.click(screen.getByText('✨ Edit content'))
    fireEvent.click(screen.getByText('✨ Generate'))

    await waitFor(() => expect(regenerateCustomization).toHaveBeenCalledWith('svc_1'))
    // Fields re-seed from the returned customization.
    await waitFor(() => expect(screen.getByDisplayValue('AI highlight')).toBeInTheDocument())
    expect(screen.getByDisplayValue('An AI-written description.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('AI step')).toBeInTheDocument()
    expect(screen.getByDisplayValue('AI question?')).toBeInTheDocument()
  })

  it('seeds from the library default (token-filled) when the service has no AI rewrite yet', () => {
    const fresh: ClinicService = {
      id: 'svc_2',
      librarySlug: 'teeth-whitening',
      name: 'Teeth Whitening',
      category: 'core',
    }
    renderPicker([fresh])
    fireEvent.click(screen.getByText('✨ Edit content'))
    // {clinic} / {city} tokens are filled with the clinic name + city for the seed.
    expect(screen.getByDisplayValue('Library highlight for Acme Dental')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Library body about Acme Dental in Austin.')).toBeInTheDocument()
  })

  it('Photo & offer offers a real image upload (not just a URL field)', () => {
    renderPicker([CUSTOMIZED_SERVICE])
    fireEvent.click(screen.getByText('Photo / offer'))
    // The uploader is present (Upload button + Hero photo label), and the old
    // free-text "Hero photo URL" input is gone.
    expect(screen.getByText('Upload')).toBeInTheDocument()
    expect(screen.getByText('Hero photo')).toBeInTheDocument()
    expect(screen.queryByText('Hero photo URL')).toBeNull()
    // The promo-ribbon field still lives here.
    expect(screen.getByPlaceholderText('New patient special')).toBeInTheDocument()
  })
})
