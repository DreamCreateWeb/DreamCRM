import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ClinicListRow } from '@/lib/services/clinics'
import ClinicsList from '@/app/(default)/ecommerce/customers/clinics-list'

/** Never on a trial (comped / legacy / paid). */
const NO_TRIAL = { onTrial: false, expired: false, trialEndsAt: null, daysLeft: null }
/** Inside the no-card trial with `days` left. */
const onTrial = (days: number) => ({
  onTrial: true,
  expired: false,
  trialEndsAt: new Date(Date.now() + days * 86_400_000),
  daysLeft: days,
})
/** The trial ran out with no plan chosen — behind the billing wall. */
const EXPIRED_TRIAL = { onTrial: false, expired: true, trialEndsAt: new Date('2026-01-08'), daysLeft: 0 }

function row(overrides: Partial<ClinicListRow> = {}): ClinicListRow {
  return {
    ownerInvitePending: false,
    trial: NO_TRIAL,
    orgId: 'org_x',
    name: 'X Clinic',
    slug: 'x',
    displayName: null,
    logoUrl: null,
    brandColor: null,
    email: null,
    phone: null,
    city: null,
    state: null,
    planTier: 'basic',
    subscriptionStatus: 'active',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    createdAt: new Date('2026-01-01'),
    isDemo: false,
    monthlyContributionCents: 9_900,
    memberCount: 1,
    patientCount: 0,
    activeProjectCount: 0,
    hasWebsiteContent: false,
    ...overrides,
  }
}

describe('ClinicsList', () => {
  it('shows the empty-state when no clinics exist at all', () => {
    render(<ClinicsList rows={[]} />)
    expect(screen.getByText(/No clinics signed up yet/i)).toBeInTheDocument()
  })

  it('renders each clinic with its plan + status badges', () => {
    render(
      <ClinicsList
        rows={[
          row({ orgId: 'a', name: 'Acme', slug: 'acme', planTier: 'pro', subscriptionStatus: 'active' }),
          row({ orgId: 'b', name: 'Bright', slug: 'bright', planTier: 'premium', subscriptionStatus: 'past_due' }),
        ]}
      />,
    )
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Bright')).toBeInTheDocument()
    // Plan badges appear in the row body (span elements, not the chip buttons)
    const proBadges = screen.getAllByText('Pro').filter((el) => el.tagName === 'SPAN')
    expect(proBadges.length).toBeGreaterThan(0)
    const premiumBadges = screen.getAllByText('Premium').filter((el) => el.tagName === 'SPAN')
    expect(premiumBadges.length).toBeGreaterThan(0)
    // Status badge for past_due
    expect(screen.getByText('past due')).toBeInTheDocument()
  })

  it('a managed clinic whose owner ACCEPTED shows its trial, not "setup pending", and offers no Resend', () => {
    // The reserved plan (pendingPlanId) stays set for the whole trial, so
    // keying the pill and the button on it read "waiting on them to accept"
    // for the week after they did — and Resend threw "No pending
    // invitation" on press.
    render(
      <ClinicsList
        rows={[
          row({
            orgId: 'm',
            name: 'Managed',
            billingMode: 'managed',
            pendingPlanId: 'premium',
            subscriptionStatus: 'trialing',
            ownerInvitePending: false,
            trial: onTrial(5),
          }),
        ]}
      />,
    )
    const pill = screen.getByText('trial · 5 days left')
    expect(pill).toHaveAttribute('data-tone', 'info')
    expect(pill.getAttribute('title')).toMatch(/plan reserved/i)
    expect(screen.queryByText('setup pending')).toBeNull()
    expect(screen.queryByRole('button', { name: /Resend invite/ })).toBeNull()
  })

  it('offers Resend — and says "invite pending" — only while the owner invite is actually pending', () => {
    render(
      <ClinicsList
        rows={[
          row({
            orgId: 'm',
            name: 'Managed',
            billingMode: 'managed',
            pendingPlanId: 'premium',
            subscriptionStatus: 'trialing',
            ownerInvitePending: true,
            trial: onTrial(7),
          }),
        ]}
      />,
    )
    expect(screen.getByText('invite pending')).toHaveAttribute('data-tone', 'info')
    expect(screen.getByRole('button', { name: /Resend invite/ })).toBeInTheDocument()
    expect(screen.queryByText(/trial · /)).toBeNull()
  })

  it('an EXPIRED trial reads "trial ended" (urgent) — never the column\'s "trialing"', () => {
    render(<ClinicsList rows={[row({ subscriptionStatus: 'trialing', trial: EXPIRED_TRIAL })]} />)
    const pill = screen.getByText('trial ended')
    expect(pill).toHaveAttribute('data-tone', 'urgent')
    expect(screen.queryByText('trialing')).toBeNull()
  })

  it('a trial inside two days warns', () => {
    render(
      <ClinicsList
        rows={[
          row({ orgId: 'a', name: 'Soon', subscriptionStatus: 'trialing', trial: onTrial(2) }),
          row({ orgId: 'b', name: 'Last', subscriptionStatus: 'trialing', trial: onTrial(1) }),
        ]}
      />,
    )
    expect(screen.getByText('trial · 2 days left')).toHaveAttribute('data-tone', 'warn')
    expect(screen.getByText('trial · 1 day left')).toHaveAttribute('data-tone', 'warn')
  })

  it('the Trial ended chip counts and filters the walled clinics', async () => {
    const user = userEvent.setup()
    render(
      <ClinicsList
        rows={[
          row({ orgId: 'a', name: 'Live trial', subscriptionStatus: 'trialing', trial: onTrial(4) }),
          row({ orgId: 'b', name: 'Walled', subscriptionStatus: 'trialing', trial: EXPIRED_TRIAL }),
          row({ orgId: 'c', name: 'Paying', subscriptionStatus: 'active', stripeSubscriptionId: 'sub_c' }),
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Trial ended 1$/ }))
    expect(screen.getByText('Walled')).toBeInTheDocument()
    expect(screen.queryByText('Live trial')).toBeNull()
    expect(screen.queryByText('Paying')).toBeNull()
  })

  it('formats MRR contribution as $/mo', () => {
    render(<ClinicsList rows={[row({ planTier: 'pro', monthlyContributionCents: 14_900 })]} />)
    expect(screen.getByText('$149/mo')).toBeInTheDocument()
  })

  it('shows dash for zero monthly contribution', () => {
    render(<ClinicsList rows={[row({ monthlyContributionCents: 0, subscriptionStatus: 'canceled' })]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('filters by plan when a chip is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ClinicsList
        rows={[
          row({ orgId: 'a', name: 'Pro Clinic', slug: 'pro', planTier: 'pro' }),
          row({ orgId: 'b', name: 'Basic Clinic', slug: 'basic', planTier: 'basic' }),
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Pro/ }))
    expect(screen.getByText('Pro Clinic')).toBeInTheDocument()
    expect(screen.queryByText('Basic Clinic')).not.toBeInTheDocument()
  })

  it('filters by past_due when that chip is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ClinicsList
        rows={[
          row({ orgId: 'a', name: 'Healthy', subscriptionStatus: 'active' }),
          row({ orgId: 'b', name: 'Behind', subscriptionStatus: 'past_due' }),
          row({ orgId: 'c', name: 'Lost', subscriptionStatus: 'incomplete_expired' }),
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Past due/ }))
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument()
    expect(screen.getByText('Behind')).toBeInTheDocument()
    expect(screen.getByText('Lost')).toBeInTheDocument()
  })

  it('filters by inactive subscriptions — an expired trial is inactive, a live one is not', async () => {
    const user = userEvent.setup()
    render(
      <ClinicsList
        rows={[
          row({ orgId: 'a', name: 'Active', subscriptionStatus: 'active' }),
          row({ orgId: 'b', name: 'Canceled', subscriptionStatus: 'canceled' }),
          row({ orgId: 'c', name: 'Live trial', subscriptionStatus: 'trialing', trial: onTrial(3) }),
          row({ orgId: 'd', name: 'Walled', subscriptionStatus: 'trialing', trial: EXPIRED_TRIAL }),
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /^Inactive 2$/ }))
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
    expect(screen.queryByText('Live trial')).not.toBeInTheDocument()
    expect(screen.getByText('Canceled')).toBeInTheDocument()
    expect(screen.getByText('Walled')).toBeInTheDocument()
  })

  it('searches by name, slug, or city', async () => {
    const user = userEvent.setup()
    render(
      <ClinicsList
        rows={[
          row({ orgId: 'a', name: 'Smile Spa', slug: 'smile-spa', city: 'Austin' }),
          row({ orgId: 'b', name: 'Bright Dental', slug: 'bright', city: 'Dallas' }),
        ]}
      />,
    )
    const search = screen.getByPlaceholderText(/Search by name/)
    await user.type(search, 'dallas')
    expect(screen.queryByText('Smile Spa')).not.toBeInTheDocument()
    expect(screen.getByText('Bright Dental')).toBeInTheDocument()
  })

  it('sorts by MRR contribution descending', async () => {
    const user = userEvent.setup()
    render(
      <ClinicsList
        rows={[
          row({ orgId: 'a', name: 'Cheap', planTier: 'basic', monthlyContributionCents: 9_900 }),
          row({ orgId: 'b', name: 'Premium Clinic', planTier: 'premium', monthlyContributionCents: 19_900 }),
          row({ orgId: 'c', name: 'Pro Clinic', planTier: 'pro', monthlyContributionCents: 14_900 }),
        ]}
      />,
    )
    await user.selectOptions(screen.getByLabelText('Sort by'), 'revenue')
    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0].textContent).toContain('Premium Clinic')
    expect(rows[1].textContent).toContain('Pro Clinic')
    expect(rows[2].textContent).toContain('Cheap')
  })

  it('shows initial letter when no logo is set', () => {
    render(<ClinicsList rows={[row({ name: 'Acme', displayName: 'Acme Dental', logoUrl: null })]} />)
    // letter mark uses the first character of the display name
    const mark = screen.getAllByText('A').find((el) => el.tagName === 'SPAN')
    expect(mark).toBeDefined()
  })

  it('renders the View site external link with the right subdomain', () => {
    render(<ClinicsList rows={[row({ slug: 'smile-spa' })]} />)
    const link = screen.getByText(/Site ↗/) as HTMLAnchorElement
    expect(link.getAttribute('href')).toContain('smile-spa.')
  })

  it('shows chip counts that match the data', () => {
    render(
      <ClinicsList
        rows={[
          row({ orgId: 'a', planTier: 'pro' }),
          row({ orgId: 'b', planTier: 'pro' }),
          row({ orgId: 'c', planTier: 'premium' }),
          row({ orgId: 'd', planTier: 'basic', subscriptionStatus: 'canceled' }),
        ]}
      />,
    )
    // FilterChip renders the count as a span next to the label, so the
    // accessible name is "<label> <count>" (no parens).
    expect(screen.getByRole('button', { name: /^All 4$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pro 2$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Premium 1$/ })).toBeInTheDocument()
  })
})
