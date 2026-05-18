import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ClientMessagingStatsCard from '@/app/(double-sidebar)/messages/client-messaging-stats'

describe('ClientMessagingStats card', () => {
  it('renders all three stat tiles with values', () => {
    render(
      <ClientMessagingStatsCard
        stats={{ activeConversations: 7, unreadMessages: 3, staleConversations: 1 }}
      />,
    )
    expect(screen.getByText('Active conversations')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('Unread')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/Awaiting reply/i)).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows zero values when nothing is happening', () => {
    render(
      <ClientMessagingStatsCard
        stats={{ activeConversations: 0, unreadMessages: 0, staleConversations: 0 }}
      />,
    )
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBe(3)
  })
})
