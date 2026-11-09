import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanArtifact, type PlanPhotoControl } from '@/app/(default)/dashboard/proposal-artifacts'
import { validatePlanItems, validatePlanPhoto } from '@/lib/content-calendar'

/**
 * THE CONTENT PLAN'S PHOTO SLOTS (ML-36, G3-22). Each social piece owns an
 * optional photo the approver attaches before approving; the executor passes
 * it through; no stock images — only the clinic's own http(s) upload survives.
 */

const items = [
  { kind: 'social' as const, title: null, body: 'Smile Saturday is back.' },
  { kind: 'blog' as const, title: 'Why floss', body: 'Because gums.' },
  { kind: 'social' as const, title: null, body: 'Meet Dr. Lee.', photo: { url: 'https://cdn.example/lee.jpg', alt: 'Dr. Lee' } },
]

function control(over: Partial<PlanPhotoControl> = {}): PlanPhotoControl {
  return { photos: {}, uploadingIndex: null, pct: 0, disabled: false, onPick: vi.fn(), onClear: vi.fn(), ...over }
}

describe('PlanArtifact photo slots', () => {
  it('shows a slot on each SOCIAL piece and none on the blog piece', () => {
    render(<PlanArtifact items={items} clinicName="Acme Dental" channel={null} photoControl={control()} />)
    expect(screen.getByTestId('plan-photo-slot-0')).toBeInTheDocument()
    expect(screen.queryByTestId('plan-photo-slot-1')).toBeNull()
    expect(screen.getByTestId('plan-photo-slot-2')).toBeInTheDocument()
    expect(screen.getByText(/Posts without one — exactly as shown/)).toBeInTheDocument()
  })

  it('shows the filed photo, and the card’s own edit state wins over it', () => {
    const { container, rerender } = render(
      <PlanArtifact items={items} clinicName="Acme Dental" channel={null} photoControl={control()} />,
    )
    expect(container.querySelector('img[src="https://cdn.example/lee.jpg"]')).not.toBeNull()
    rerender(
      <PlanArtifact
        items={items}
        clinicName="Acme Dental"
        channel={null}
        photoControl={control({ photos: { 0: 'https://cdn.example/new.jpg', 2: null } })}
      />,
    )
    expect(container.querySelector('img[src="https://cdn.example/new.jpg"]')).not.toBeNull()
    expect(container.querySelector('img[src="https://cdn.example/lee.jpg"]')).toBeNull()
  })

  it('hands the picked file and the clear to the card', () => {
    const c = control({ photos: { 0: 'https://cdn.example/new.jpg' } })
    render(<PlanArtifact items={items} clinicName="Acme Dental" channel={null} photoControl={c} />)
    fireEvent.click(screen.getAllByText('Remove photo')[0])
    expect(c.onClear).toHaveBeenCalledWith(0)
    const input = screen.getByTestId('plan-photo-slot-0').querySelector('input[type=file]') as HTMLInputElement
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(c.onPick).toHaveBeenCalledWith(0, file)
  })

  it('renders no slots at all without a photoControl (read-only)', () => {
    render(<PlanArtifact items={items} clinicName="Acme Dental" channel={null} />)
    expect(screen.queryByTestId('plan-photo-slot-0')).toBeNull()
  })
})

describe('the plan item shape', () => {
  it('validatePlanItems keeps a clinic-uploaded photo on social pieces only', () => {
    const out = validatePlanItems([
      { kind: 'social', body: 'a', photo: { url: 'https://cdn.example/a.jpg', alt: ' Front desk ' } },
      { kind: 'blog', title: 'T', body: 'b', photo: { url: 'https://cdn.example/b.jpg' } },
    ])
    expect(out[0].photo).toEqual({ url: 'https://cdn.example/a.jpg', alt: 'Front desk' })
    expect(out[1].photo).toBeUndefined()
  })

  it('refuses anything that is not an http(s) URL — no data:, no javascript:', () => {
    expect(validatePlanPhoto({ url: 'javascript:alert(1)' })).toBeNull()
    expect(validatePlanPhoto({ url: 'data:image/png;base64,AAAA' })).toBeNull()
    expect(validatePlanPhoto({ url: `https://x.example/${'a'.repeat(2100)}` })).toBeNull()
    expect(validatePlanPhoto(null)).toBeNull()
    expect(validatePlanPhoto({ url: 'https://x.example/a.jpg' })).toEqual({ url: 'https://x.example/a.jpg', alt: null })
  })
})
