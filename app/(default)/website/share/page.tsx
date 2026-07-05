import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import QRCode from 'qrcode'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { publicSiteUrl, clinicPortalSignInUrl } from '@/lib/services/clinic-site'
import { getReviewConfig, reviewPlatformUrl } from '@/lib/services/reviews'
import { buildShareCards } from '@/lib/share-cards'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import PrintCardsButton from './print-button'

export const metadata = {
  title: 'Share your website - DreamCRM',
  description: 'Printable QR cards that put your website in patients’ hands.',
}

export const dynamic = 'force-dynamic'

/**
 * /website/share — printable QR share cards. The website only works when
 * patients actually reach it; these cards bridge the physical office (front
 * desk, checkout counter, waiting room) to the site's money pages: booking,
 * the site itself, the Google review link, and the patient portal. QRs are
 * generated server-side as inline SVG (crisp at any print size, no client
 * JS), and the card list gates on what actually exists — same discipline as
 * the public nav.
 */
export default async function ShareCardsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  if (!profile) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <EmptyState
          icon="🖨"
          title="Your clinic profile isn’t set up yet"
          body="Finish setting up your clinic to publish your public site — then print QR cards that put it in patients’ hands."
          action={
            <ActionButton variant="primary" size="sm" href="/settings/clinic">
              Set up your clinic
            </ActionButton>
          }
        />
      </div>
    )
  }

  const slug = ctx.organizationSlug
  const siteUrl = publicSiteUrl({ slug, profile })
  const clinicName = profile.displayName ?? ctx.organizationName
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  // Best-effort — a review-config read hiccup just drops the review card.
  const reviewConfig = await getReviewConfig(ctx.organizationId).catch(() => null)
  const googleReviewUrl = reviewConfig ? reviewPlatformUrl('google', reviewConfig) : null

  const cards = buildShareCards({
    clinicName,
    siteUrl,
    isPro,
    googleReviewUrl,
    portalUrl: clinicPortalSignInUrl(slug),
  })

  // One QR per card, rendered server-side as SVG. `margin: 0` — the card's own
  // padding is the quiet zone, and print stays crisp at any size.
  const withQr = await Promise.all(
    cards.map(async (card) => ({
      ...card,
      qrSvg: await QRCode.toString(card.url, {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
        color: { dark: '#1C1917', light: '#FFFFFF' },
      }),
    })),
  )

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
      {/* Print: keep ONLY the cards — the shell chrome, header, and helper
          copy all step aside. Same selector approach as the demo-prep page. */}
      <style>{`
        @media print {
          aside, header, nav, .no-print { display: none !important }
          .dc-share-grid { display: grid !important; grid-template-columns: 1fr 1fr; gap: 16px }
          .dc-share-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #d6d3d1 !important; box-shadow: none !important }
        }
      `}</style>
      <div className="no-print">
        <PageHeader
          eyebrow="Website · Share"
          title="Put your website in patients’ hands"
          subtitle="Print these QR cards for the front desk, checkout counter, and waiting room — each one links a physical moment to the right page."
          actions={
            <div className="flex items-center gap-2">
              <ActionButton variant="secondary" size="sm" href="/website">
                ← Back to the Studio
              </ActionButton>
              <PrintCardsButton />
            </div>
          }
        />
      </div>

      <div className="dc-share-grid grid sm:grid-cols-2 gap-5">
        {withQr.map((card) => (
          <div
            key={card.key}
            className="dc-share-card rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 shadow-sm p-6 sm:p-8 flex flex-col items-center text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500 mb-4">
              {clinicName}
            </p>
            {/* Inline SVG QR — white tile behind it in both themes so scanners
                always see dark-on-light. */}
            <div
              aria-label={`QR code linking to ${card.url}`}
              role="img"
              className="w-44 h-44 sm:w-48 sm:h-48 mb-5 p-3 rounded-lg bg-white [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: card.qrSvg }}
            />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-snug mb-1.5">
              {card.title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
              {card.subtitle}
            </p>
            <p className="text-[11px] font-mono text-gray-400 dark:text-gray-500 break-all">
              {card.url}
            </p>
            <p className="no-print mt-4 text-[11px] font-medium text-teal-700 dark:text-teal-400">
              Best spot: {card.placement}
            </p>
          </div>
        ))}
      </div>

      <p className="no-print mt-6 text-xs text-gray-500 dark:text-gray-400">
        Tip: print on cardstock and trim — each card is designed to stand on a counter or tape to
        a mirror. The links never expire; reprint any time your site changes.
      </p>
    </div>
  )
}
