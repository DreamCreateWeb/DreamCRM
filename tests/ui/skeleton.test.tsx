/**
 * Loading skeletons. The container announces the wait once (role="status" +
 * sr-only "Loading…"); the visual shimmer blocks are decorative (aria-hidden)
 * and carry the `.skeleton` class that drives the reduced-motion-safe shimmer.
 * A tailored route loader composes the same primitives.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton, PageSkeleton, SkeletonRows } from '@/components/ui/skeleton'
import AppointmentsLoading from '@/app/(default)/appointments/loading'

describe('Skeleton primitives', () => {
  it('Skeleton renders the shimmer class and is aria-hidden', () => {
    const { container } = render(<Skeleton className="h-4 w-10" />)
    const el = container.querySelector('.skeleton')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('aria-hidden')).toBe('true')
    expect(el?.className).toContain('h-4')
  })

  it('PageSkeleton announces loading once for assistive tech', () => {
    render(<PageSkeleton />)
    const status = screen.getByRole('status')
    expect(status).toBeTruthy()
    // Exactly one sr-only announcement, not one per shimmer block.
    expect(screen.getAllByText('Loading…')).toHaveLength(1)
  })

  it('SkeletonRows renders the requested number of rows', () => {
    const { container } = render(<SkeletonRows rows={5} />)
    // Each row has exactly one avatar circle (h-9) — count those.
    const avatars = container.querySelectorAll('.skeleton.h-9')
    expect(avatars.length).toBe(5)
  })
})

describe('tailored route loader', () => {
  it('the appointments loader is a status region built from skeletons', () => {
    const { container } = render(<AppointmentsLoading />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(5)
  })
})
