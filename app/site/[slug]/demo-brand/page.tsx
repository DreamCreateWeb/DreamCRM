import { notFound } from 'next/navigation'
import { DEMO_CLINIC_SLUG } from '@/lib/services/demo-constants'
import { clinicPaletteCss } from '@/lib/clinic-site-theme'
import ClinicSitePage from '../page'

export const dynamic = 'force-dynamic'

// Never index — this is a demo-only re-theming of already-public content.
export const metadata = { robots: { index: false, follow: false } }

/**
 * The compare view's RIGHT pane: the demo clinic's public site re-themed in
 * a prospect's brand color — "your practice on ours, in your own colors."
 *
 * Only ever renders for the demo slug (notFound for real clinics). The
 * brand arrives as hex WITHOUT '#' (?brand=1d4ed8 — avoids %23 traps) and
 * is strictly validated; the palette goes through buildClinicPalette's
 * WCAG contrast raising, so even a rough captured color renders readable.
 * The page-level <style> lands after the layout's :root injection in the
 * DOM, so its --c-* values win the cascade.
 */
export default async function DemoBrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ brand?: string }>
}) {
  const { slug } = await params
  if (slug !== DEMO_CLINIC_SLUG) notFound()

  const { brand } = await searchParams
  const validBrand = brand && /^[0-9a-fA-F]{6}$/.test(brand) ? `#${brand}` : null

  return (
    <>
      {validBrand && <style>{clinicPaletteCss(validBrand)}</style>}
      {/* Server components are plain async functions — render the existing
          demo home with synthetic params rather than duplicating it. */}
      <ClinicSitePage params={Promise.resolve({ slug })} />
    </>
  )
}
