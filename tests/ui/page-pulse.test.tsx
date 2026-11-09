import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PagePulse } from '@/components/ui/page-pulse'

describe('PagePulse', () => {
  it('renders nothing when there are no facts', () => {
    const { container } = render(<PagePulse facts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders each fact, its tone ink, and linked facts as 40px links', () => {
    render(
      <PagePulse
        facts={[
          { label: 'patients', value: 32 },
          { label: 'lapsed', value: 2, tone: 'warn', href: '/patients?status=lapsed' },
        ]}
      />,
    )
    const pulse = screen.getByTestId('page-pulse')
    expect(pulse.textContent).toContain('32 patients')
    expect(pulse.className).toContain('hidden')
    const link = screen.getByRole('link', { name: /2 lapsed/ })
    expect(link.getAttribute('href')).toBe('/patients?status=lapsed')
    expect(link.className).toContain('min-h-[40px]')
    expect(screen.getByText('2').className).toContain('text-amber-800')
  })
})
