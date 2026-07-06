import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const answerMock = vi.fn()
const commentMock = vi.fn()
vi.mock('@/app/(portal)/patient/actions', () => ({
  answerMySurveyAction: (t: string, s: number) => answerMock(t, s),
  commentMySurveyAction: (t: string, c: string) => commentMock(t, c),
}))

import SurveyCard from '@/components/patient-portal/survey-card'

beforeEach(() => {
  answerMock.mockReset()
  commentMock.mockReset()
})

describe('SurveyCard', () => {
  it('renders the 0–10 tap row and records the tapped score', async () => {
    answerMock.mockResolvedValueOnce({ ok: true })
    render(<SurveyCard token="nps_abc" brand="#2F6D62" />)
    expect(screen.getByText('How was your last visit?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rate 9 out of 10' }))
    await waitFor(() => expect(answerMock).toHaveBeenCalledWith('nps_abc', 9))
    // Promoter thank-you + optional comment phase.
    expect(await screen.findByText(/that made our day/i)).toBeInTheDocument()
  })

  it('a detractor score gets the honest thank-you, not the promoter one', async () => {
    answerMock.mockResolvedValueOnce({ ok: true })
    render(<SurveyCard token="nps_abc" brand="#2F6D62" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rate 3 out of 10' }))
    expect(await screen.findByText(/Thank you for the honesty/i)).toBeInTheDocument()
  })

  it('sends the optional note then lands on the done state', async () => {
    answerMock.mockResolvedValueOnce({ ok: true })
    commentMock.mockResolvedValueOnce({ ok: true })
    render(<SurveyCard token="nps_abc" brand="#2F6D62" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rate 7 out of 10' }))
    const box = await screen.findByPlaceholderText(/anything/i)
    fireEvent.change(box, { target: { value: 'Shorter wait please' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send it' }))
    await waitFor(() => expect(commentMock).toHaveBeenCalledWith('nps_abc', 'Shorter wait please'))
    expect(await screen.findByText(/thank you for helping us do better/i)).toBeInTheDocument()
  })

  it('skipping the note (Done with empty box) never calls the comment action', async () => {
    answerMock.mockResolvedValueOnce({ ok: true })
    render(<SurveyCard token="nps_abc" brand="#2F6D62" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rate 10 out of 10' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }))
    expect(commentMock).not.toHaveBeenCalled()
    expect(await screen.findByText(/thank you for helping us do better/i)).toBeInTheDocument()
  })

  it('a failed save surfaces the error and stays on the ask phase', async () => {
    answerMock.mockResolvedValueOnce({ ok: false, error: 'That didn’t save — try again.' })
    render(<SurveyCard token="nps_abc" brand="#2F6D62" />)
    fireEvent.click(screen.getByRole('button', { name: 'Rate 5 out of 10' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t save/i)
    expect(screen.getByText('How was your last visit?')).toBeInTheDocument()
  })
})
