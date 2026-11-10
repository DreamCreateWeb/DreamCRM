import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/** ML-43b — the bulk "Mark posted" confirm names the count AND the dollar sum. */
const confirm = vi.hoisted(() => vi.fn(async () => false))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => confirm }))
vi.mock('@/app/(default)/payments/online/actions', () => ({
  markPaymentsPostedAction: vi.fn(),
  unmarkPaymentPostedAction: vi.fn(),
}))
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

import PostingTable, { type PostingRow } from '@/app/(default)/payments/online/posting-table'

const row = (id: string, name: string, amountCents: number): PostingRow => ({
  id, patientId: `p_${id}`, patientName: name, amountCents, paidLabel: 'Nov 3',
  balanceAtPaymentCents: null, status: null, postedLabel: null, postedByName: null,
})

describe('PostingTable bulk confirm', () => {
  it('shows the count and the summed dollars of the selected rows', async () => {
    render(<PostingTable rows={[row('a', 'Ann', 100000), row('b', 'Bo', 24000), row('c', 'Cy', 5000)]} />)
    fireEvent.click(screen.getByLabelText(/Select Ann/))
    fireEvent.click(screen.getByLabelText(/Select Bo/))
    expect(screen.getByText(/to mark posted · \$1,240\.00/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Mark 2 posted/ }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect((confirm.mock.calls[0] as unknown[])[0]).toMatchObject({
      title: 'Mark 2 payments posted · $1,240.00?',
    })
  })
})
