import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import type { ClinicStaff } from '@/lib/types/clinic-content'

// Mock the upload helper so we can drive success/failure deterministically.
// The factory is hoisted, so the cancel-error class is defined INSIDE it and
// re-imported below for use in the tests.
const uploadFileWithProgress = vi.fn()
vi.mock('@/lib/upload-with-progress', () => {
  class UploadCancelledError extends Error {}
  return {
    uploadFileWithProgress: (...args: unknown[]) => uploadFileWithProgress(...args),
    UploadCancelledError,
  }
})

import StaffEditor from '@/app/(default)/settings/clinic/staff-editor'
import { UploadCancelledError as FakeCancel } from '@/lib/upload-with-progress'

function staff(overrides: Partial<ClinicStaff> = {}): ClinicStaff {
  return { id: 's1', name: 'Dr. Jane', title: 'Dentist', bio: '', photoUrl: null, ...overrides } as ClinicStaff
}

function fileOf(type: string, size: number, name = 'x'): File {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

beforeEach(() => {
  uploadFileWithProgress.mockReset()
})

describe('StaffEditor — upload error surfacing (was silently swallowed)', () => {
  it('rejects a non-image file with a visible message (never calls upload)', async () => {
    render(<StaffEditor name="staff" defaultValue={[staff()]} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [fileOf('application/pdf', 1000)] } })
    await waitFor(() => expect(screen.getByText(/pick an image file/i)).toBeInTheDocument())
    expect(uploadFileWithProgress).not.toHaveBeenCalled()
  })

  it('rejects an oversized image with a visible message (8MB cap, not 5MB)', async () => {
    render(<StaffEditor name="staff" defaultValue={[staff()]} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    // 6MB image: would have been silently dropped by the old 5MB cap; now under
    // the 8MB server cap so it must NOT be rejected.
    fireEvent.change(input, { target: { files: [fileOf('image/png', 6 * 1024 * 1024)] } })
    expect(screen.queryByText(/over 8MB/i)).not.toBeInTheDocument()
    // 9MB image: over the cap → visible error.
    fireEvent.change(input, { target: { files: [fileOf('image/png', 9 * 1024 * 1024)] } })
    await waitFor(() => expect(screen.getByText(/over 8MB/i)).toBeInTheDocument())
  })

  it('surfaces a server failure from the upload helper', async () => {
    uploadFileWithProgress.mockReturnValue({
      promise: Promise.reject(new Error('Upload failed (413)')),
      cancel: () => {},
    })
    render(<StaffEditor name="staff" defaultValue={[staff()]} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [fileOf('image/png', 1000)] } })
    await waitFor(() => expect(screen.getByText(/Upload failed \(413\)/)).toBeInTheDocument())
  })

  it('does NOT surface a user cancel as an error', async () => {
    uploadFileWithProgress.mockReturnValue({
      promise: Promise.reject(new FakeCancel()),
      cancel: () => {},
    })
    render(<StaffEditor name="staff" defaultValue={[staff()]} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [fileOf('image/png', 1000)] } })
    // Give the rejected promise a tick to settle.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/cancelled/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
