// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageFrame, frameEyebrow } from '@/components/ui/page-frame'

describe('PageFrame', () => {
  it('top-level pages carry the <Group> · <clinic name> eyebrow', () => {
    render(<PageFrame group="Daily" clinicName="Acme Dental" title="Patients" />)
    expect(screen.getByText('Daily · Acme Dental')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Patients' })).toBeTruthy()
  })

  it('sub-pages carry a way back to their hub instead', () => {
    render(<PageFrame hub={{ href: '/website', label: 'Website' }} title="Content" />)
    const back = screen.getByRole('link', { name: /Website/ })
    expect(back.getAttribute('href')).toBe('/website')
  })

  it('a detail page gets a back link above the header and keeps its eyebrow', () => {
    render(<PageFrame back={{ href: '/integrations', label: 'All integrations' }} group="Business" clinicName="Acme" title="PMS" />)
    expect(screen.getByRole('link', { name: 'All integrations' }).getAttribute('href')).toBe('/integrations')
    expect(screen.getByText('Business · Acme')).toBeTruthy()
  })

  it('group beats a literal eyebrow; a literal stands alone', () => {
    expect(frameEyebrow({ group: 'Daily', clinicName: 'A', eyebrow: 'x' })).toBe('Daily · A')
    expect(frameEyebrow({ eyebrow: 'Platform · Dream Create' })).toBe('Platform · Dream Create')
  })

  it('owns the gutters and width, and never renders a second <main>', () => {
    const { container } = render(<PageFrame width="4xl" title="T">body</PageFrame>)
    const frame = container.querySelector('[data-page-frame]')!
    expect(frame.className).toContain('px-4 sm:px-6 lg:px-8')
    expect(frame.className).toContain('max-w-4xl')
    expect(container.querySelectorAll('main').length).toBe(0)
    expect(container.querySelectorAll('h1').length).toBe(1)
  })

  it('renders the before and pulse slots around the header', () => {
    render(<PageFrame title="T" before={<i>hint</i>} pulse={<b>pulse</b>} />)
    expect(screen.getByText('hint')).toBeTruthy()
    expect(screen.getByText('pulse')).toBeTruthy()
  })
})
