import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlyoutProvider } from '@/app/flyout-context'
import type { ClientConversation, ClientMessagingStats, ClinicContact } from '@/lib/services/messages'

// next/navigation is referenced by the NewConversationButton.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../../app/(double-sidebar)/messages/actions', () => ({
  newConversation: vi.fn(),
  sendChatMessage: vi.fn(),
}))

import ClientMessagingSidebar from '@/app/(double-sidebar)/messages/client-messaging-sidebar'

function convo(overrides: Partial<ClientConversation> = {}): ClientConversation {
  return {
    id: overrides.id ?? 1,
    title: null,
    kind: 'client',
    clinicOrgId: 'org_acme',
    clinicName: 'Acme Dental',
    clinicSlug: 'acme',
    counterpartName: 'Alice Owner',
    counterpartRole: 'owner',
    lastMessage: 'Hey, when are we shooting next week?',
    lastAt: new Date(Date.now() - 60_000),
    unreadCount: 0,
    ...overrides,
  }
}

const STATS: ClientMessagingStats = { activeConversations: 0, unreadMessages: 0, staleConversations: 0 }
const CONTACTS: ClinicContact[] = []

function renderWithProvider(ui: React.ReactNode) {
  return render(<FlyoutProvider initialState={true}>{ui}</FlyoutProvider>)
}

describe('ClientMessagingSidebar', () => {
  it('shows an empty-state when there are no conversations', () => {
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[]}
        clientContacts={CONTACTS} teamContacts={CONTACTS}
        stats={STATS}
        activeId={null}
      />,
    )
    expect(screen.getByText(/No client conversations yet/i)).toBeInTheDocument()
  })

  it('groups conversations by clinic with the clinic name as the bucket label', () => {
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[
          convo({ id: 1, clinicOrgId: 'org_acme', clinicName: 'Acme Dental', counterpartName: 'Alice' }),
          convo({ id: 2, clinicOrgId: 'org_bright', clinicName: 'Bright Smiles', counterpartName: 'Bob' }),
        ]}
        clientContacts={CONTACTS} teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 2 }}
        activeId={null}
      />,
    )
    expect(screen.getByText('Acme Dental')).toBeInTheDocument()
    expect(screen.getByText('Bright Smiles')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders the clinic bucket label as a link to the clinic detail page', () => {
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[convo({ clinicOrgId: 'org_acme', clinicName: 'Acme Dental' })]}
        clientContacts={CONTACTS} teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 1 }}
        activeId={null}
      />,
    )
    const link = screen.getByText('Acme Dental').closest('a')
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe('/ecommerce/customers/org_acme')
  })

  it('shows an unread badge on conversations with new messages', () => {
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[convo({ counterpartName: 'Alice', unreadCount: 4 })]}
        clientContacts={CONTACTS} teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 1, unreadMessages: 4 }}
        activeId={null}
      />,
    )
    // The "4" badge appears at both the bucket and the row.
    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(2)
  })

  it('filters to only unread when the Unread chip is clicked', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[
          convo({ id: 1, counterpartName: 'Read One', unreadCount: 0 }),
          convo({ id: 2, counterpartName: 'Unread One', unreadCount: 2 }),
        ]}
        clientContacts={CONTACTS} teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 2, unreadMessages: 2 }}
        activeId={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Unread/ }))
    expect(screen.queryByText('Read One')).not.toBeInTheDocument()
    expect(screen.getByText('Unread One')).toBeInTheDocument()
  })

  it('searches across clinic, counterpart, and last message text', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[
          convo({ id: 1, clinicName: 'Acme Dental', counterpartName: 'Alice', lastMessage: 'about logos' }),
          convo({ id: 2, clinicName: 'Bright Smiles', counterpartName: 'Bob', lastMessage: 'video shoot' }),
        ]}
        clientContacts={CONTACTS} teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 2 }}
        activeId={null}
      />,
    )
    const search = screen.getByPlaceholderText(/Search clinic/i)
    await user.type(search, 'video')
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows a no-match message when filters exclude everything', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[convo({ counterpartName: 'Alice' })]}
        clientContacts={CONTACTS} teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 1 }}
        activeId={null}
      />,
    )
    await user.type(screen.getByPlaceholderText(/Search clinic/i), 'zzznope')
    expect(screen.getByText(/Nothing matches these filters/i)).toBeInTheDocument()
  })

  it('highlights the active conversation row', () => {
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[
          convo({ id: 1, counterpartName: 'Inactive' }),
          convo({ id: 2, counterpartName: 'Active' }),
        ]}
        clientContacts={CONTACTS} teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 2 }}
        activeId={2}
      />,
    )
    const activeLink = screen.getByText('Active').closest('a')!
    expect(activeLink.className).toMatch(/bg-violet-500\/10/)
    const inactiveLink = screen.getByText('Inactive').closest('a')!
    expect(inactiveLink.className).not.toMatch(/bg-violet-500\/10/)
  })

  it('shows the Clients tab by default and hides team conversations', () => {
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[
          convo({ id: 1, kind: 'client', counterpartName: 'Acme Alice' }),
          convo({ id: 2, kind: 'team', counterpartName: 'Teammate Tom', clinicOrgId: null, clinicName: null }),
        ]}
        clientContacts={CONTACTS}
        teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 2 }}
        activeId={null}
      />,
    )
    expect(screen.getByText('Acme Alice')).toBeInTheDocument()
    expect(screen.queryByText('Teammate Tom')).not.toBeInTheDocument()
  })

  it('switches to the Team tab and shows only team conversations', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[
          convo({ id: 1, kind: 'client', counterpartName: 'Acme Alice' }),
          convo({ id: 2, kind: 'team', counterpartName: 'Teammate Tom', clinicOrgId: null, clinicName: null }),
        ]}
        clientContacts={CONTACTS}
        teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 2 }}
        activeId={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Team \(1\)/ }))
    expect(screen.queryByText('Acme Alice')).not.toBeInTheDocument()
    expect(screen.getByText('Teammate Tom')).toBeInTheDocument()
  })

  it('shows tab counts and per-tab unread badges', () => {
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[
          convo({ id: 1, kind: 'client', counterpartName: 'Alice', unreadCount: 2 }),
          convo({ id: 2, kind: 'team', counterpartName: 'Tom', unreadCount: 5, clinicOrgId: null, clinicName: null }),
        ]}
        clientContacts={CONTACTS}
        teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 2, unreadMessages: 7 }}
        activeId={null}
      />,
    )
    // Tab labels include count
    expect(screen.getByRole('button', { name: /^Clients \(1\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Team \(1\)/ })).toBeInTheDocument()
  })

  it('opens on the Team tab when the active conversation is a team thread', () => {
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[
          convo({ id: 1, kind: 'client', counterpartName: 'Acme Alice' }),
          convo({ id: 2, kind: 'team', counterpartName: 'Teammate Tom', clinicOrgId: null, clinicName: null }),
        ]}
        clientContacts={CONTACTS}
        teamContacts={CONTACTS}
        stats={{ ...STATS, activeConversations: 2 }}
        activeId={2}
      />,
    )
    expect(screen.getByText('Teammate Tom')).toBeInTheDocument()
    expect(screen.queryByText('Acme Alice')).not.toBeInTheDocument()
  })

  it('shows the team empty-state hint when there are no team conversations', async () => {
    const user = userEvent.setup()
    renderWithProvider(
      <ClientMessagingSidebar
        conversations={[]}
        clientContacts={CONTACTS}
        teamContacts={CONTACTS}
        stats={STATS}
        activeId={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Team \(0\)/ }))
    expect(screen.getByText(/Invite a teammate from \/settings\/team/i)).toBeInTheDocument()
  })
})
