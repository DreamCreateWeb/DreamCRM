import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  SocialArtifact,
  EmailArtifact,
  ReviewReplyArtifact,
  PlanArtifact,
  GbpFixArtifact,
} from '@/app/(default)/dashboard/proposal-artifacts'

/**
 * The Approval Inbox's artifact renderers (owner design directive
 * 2026-08-13: staff LOOK at the work, not read about it). Pinned: each
 * renderer shows the live draft text verbatim — "what the card shows is
 * what sends" survives the redesign — and the social preview rides the
 * SAME platform components the composer uses.
 */

describe('SocialArtifact', () => {
  it('renders a known platform in its own chrome (the composer’s preview components)', () => {
    render(
      <SocialArtifact
        body="Sparkling smiles start here ✨"
        clinicName="Acme Dental"
        channel={{ accountId: 'a1', platform: 'instagram', label: 'Instagram', handle: 'acmedental' }}
      />,
    )
    expect(screen.getByText('Sparkling smiles start here ✨')).toBeInTheDocument()
    expect(screen.getAllByText('acmedental').length).toBeGreaterThanOrEqual(1)
  })

  it('unknown/legacy platform degrades to the neutral feed card — text still shown', () => {
    render(<SocialArtifact body="Hello world" clinicName="Acme Dental" channel={null} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText('Acme Dental')).toBeInTheDocument()
  })
})

describe('EmailArtifact', () => {
  it('shows sender, recipient, subject, body — and RENDERS the booking button that sends', () => {
    render(
      <EmailArtifact
        clinicName="Acme Dental"
        toLine="~41 patients"
        subject="We miss you"
        body="Hi Maria, come see us."
        showBookingButton
        showSignoff={false}
      />,
    )
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /From Acme Dental/.test(el.textContent ?? ''))).toBeInTheDocument()
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /To ~41 patients/.test(el.textContent ?? ''))).toBeInTheDocument()
    expect(screen.getByText('We miss you')).toBeInTheDocument()
    expect(screen.getByText('Hi Maria, come see us.')).toBeInTheDocument()
    expect(screen.getByText('Book a time')).toBeInTheDocument()
  })

  it('renders the appended sign-off when the executor will add one', () => {
    render(
      <EmailArtifact
        clinicName="Acme Dental"
        toLine="Sam Ortiz"
        subject={null}
        body="We’d love to see you."
        showBookingButton={false}
        showSignoff
      />,
    )
    expect(screen.getByText('— Acme Dental')).toBeInTheDocument()
  })
})

describe('ReviewReplyArtifact', () => {
  it('shows the review (name, stars) with the reply NESTED beneath, as Google will', () => {
    render(
      <ReviewReplyArtifact
        author="Rob Castellano"
        starRating={2}
        reviewText="I waited 45 minutes."
        reply="Rob, the wait was on us."
        clinicName="Acme Dental"
      />,
    )
    expect(screen.getByText('Rob Castellano')).toBeInTheDocument()
    expect(screen.getByLabelText('2 of 5 stars')).toBeInTheDocument()
    expect(screen.getByText('I waited 45 minutes.')).toBeInTheDocument()
    expect(screen.getByText(/Reply from Acme Dental/)).toBeInTheDocument()
    expect(screen.getByText('Rob, the wait was on us.')).toBeInTheDocument()
  })
})

describe('PlanArtifact', () => {
  it('renders every piece — posts as mini feed cards, the article as a titled sheet', () => {
    render(
      <PlanArtifact
        clinicName="Acme Dental"
        channel={null}
        items={[
          { kind: 'social', title: null, body: 'Post one' },
          { kind: 'blog', title: 'Why flossing wins', body: 'Article intro…' },
          { kind: 'social', title: null, body: 'Post two' },
        ]}
      />,
    )
    expect(screen.getByText('Post one')).toBeInTheDocument()
    expect(screen.getByText('Why flossing wins')).toBeInTheDocument()
    expect(screen.getByText('Post two')).toBeInTheDocument()
    expect(screen.getByText(/piece 2 of 3/)).toBeInTheDocument()
  })
})

describe('GbpFixArtifact', () => {
  it('shows before → after, and an honest "no button today" when the listing has none', () => {
    render(<GbpFixArtifact targetUrl="https://acme.dental" previousUri={null} />)
    expect(screen.getByText('no website button today')).toBeInTheDocument()
    expect(screen.getByText('https://acme.dental')).toBeInTheDocument()
  })
})
