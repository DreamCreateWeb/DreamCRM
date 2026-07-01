import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'

/**
 * Message-templates settings editor. Pins the four upgrades:
 *  - live preview fills {{firstName}}/{{lastName}}/{{fullName}} from a sample,
 *  - the body char counter renders "N / 2,000" and an over-limit body BLOCKS
 *    save (no silent truncation),
 *  - delete routes through useConfirm() (cancel = no-op, confirm = action),
 *  - a member (canManage=false) gets no edit affordances.
 */

// Rendered outside the ConfirmProvider — drive the confirm result per test.
let confirmResult = true
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirm: () => async () => confirmResult,
}))

const createAction = vi.fn(async () => ({
  ok: true as const,
  template: { id: 'snip_new', name: 'X', body: 'Y', shortcut: null, sortOrder: 9 },
}))
const updateAction = vi.fn(async () => ({ ok: true as const }))
const deleteAction = vi.fn(async (_id: string) => ({ ok: true as const }))
const reorderAction = vi.fn(async () => ({ ok: true as const }))

vi.mock('@/app/(default)/settings/message-templates/actions', () => ({
  createMessageTemplateAction: (...a: unknown[]) => createAction(...(a as [])),
  updateMessageTemplateAction: (...a: unknown[]) => updateAction(...(a as [])),
  deleteMessageTemplateAction: (id: string) => deleteAction(id),
  reorderMessageTemplatesAction: (...a: unknown[]) => reorderAction(...(a as [])),
}))

import TemplatesEditor from '@/app/(default)/settings/message-templates/templates-editor'
import { MAX_TEMPLATE_BODY_LEN, type MessageTemplateRow } from '@/lib/types/message-templates'

const ROWS: MessageTemplateRow[] = [
  { id: 'snip_1', name: 'Confirming your visit', body: 'Hi {{firstName}}, see you soon.', shortcut: null, sortOrder: 0 },
  { id: 'snip_2', name: 'Follow up', body: 'Hi {{fullName}}, how are you?', shortcut: null, sortOrder: 1 },
]

beforeEach(() => {
  confirmResult = true
  vi.clearAllMocks()
})

describe('message templates editor', () => {
  it('shows a live preview that fills merge tokens from the sample name', () => {
    render(<TemplatesEditor initial={ROWS} canManage />)
    fireEvent.click(screen.getAllByText('Edit')[0])
    // Token in the editor; filled name in the preview.
    expect(screen.getByText(/Hi Jordan, see you soon\./)).toBeTruthy()
  })

  it('updates the preview live as the body changes', () => {
    render(<TemplatesEditor initial={[]} canManage />)
    fireEvent.click(screen.getByText('+ New template'))
    const body = screen.getByPlaceholderText('Hi {{firstName}}, …') as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'Welcome {{fullName}}!' } })
    expect(screen.getByText('Welcome Jordan Blake!')).toBeTruthy()
  })

  it('renders the character counter as N / 2,000', () => {
    render(<TemplatesEditor initial={[]} canManage />)
    fireEvent.click(screen.getByText('+ New template'))
    const body = screen.getByPlaceholderText('Hi {{firstName}}, …') as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'abcde' } })
    expect(screen.getByText(`5 / ${MAX_TEMPLATE_BODY_LEN.toLocaleString()}`)).toBeTruthy()
  })

  it('does NOT truncate an over-limit paste and blocks save', async () => {
    render(<TemplatesEditor initial={[]} canManage />)
    fireEvent.click(screen.getByText('+ New template'))
    fireEvent.change(screen.getByPlaceholderText('e.g. Confirming your visit'), { target: { value: 'Too long' } })
    const body = screen.getByPlaceholderText('Hi {{firstName}}, …') as HTMLTextAreaElement
    const huge = 'x'.repeat(MAX_TEMPLATE_BODY_LEN + 25)
    fireEvent.change(body, { target: { value: huge } })

    // No silent slice — the full pasted value survives.
    expect(body.value.length).toBe(MAX_TEMPLATE_BODY_LEN + 25)
    // Over-limit → Add button disabled, action never fires.
    const save = screen.getByText('Add template') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    await waitFor(() => expect(createAction).not.toHaveBeenCalled())
  })

  it('saves a valid new template through the create action', async () => {
    render(<TemplatesEditor initial={[]} canManage />)
    fireEvent.click(screen.getByText('+ New template'))
    fireEvent.change(screen.getByPlaceholderText('e.g. Confirming your visit'), { target: { value: 'Greeting' } })
    fireEvent.change(screen.getByPlaceholderText('Hi {{firstName}}, …'), { target: { value: 'Hi {{firstName}}!' } })
    fireEvent.click(screen.getByText('Add template'))
    await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1))
  })

  it('deletes via the confirm dialog — cancel is a no-op', async () => {
    confirmResult = false
    render(<TemplatesEditor initial={ROWS} canManage />)
    fireEvent.click(screen.getAllByText('Delete')[0])
    await waitFor(() => expect(deleteAction).not.toHaveBeenCalled())
  })

  it('deletes via the confirm dialog — confirm calls the action', async () => {
    confirmResult = true
    render(<TemplatesEditor initial={ROWS} canManage />)
    fireEvent.click(screen.getAllByText('Delete')[0])
    await waitFor(() => expect(deleteAction).toHaveBeenCalledWith('snip_1'))
  })

  it('hides all edit affordances for a read-only member', () => {
    render(<TemplatesEditor initial={ROWS} canManage={false} />)
    expect(screen.queryByText('Edit')).toBeNull()
    expect(screen.queryByText('Delete')).toBeNull()
    expect(screen.queryByText('+ New template')).toBeNull()
    // The templates themselves still render for reference.
    expect(screen.getByText('Confirming your visit')).toBeTruthy()
  })
})
