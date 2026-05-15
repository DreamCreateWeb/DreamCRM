import { notFound } from 'next/navigation'
import { getClinicSiteBySlug } from '@/features/clinic-site/queries'
import ModernTemplate from '@/features/clinic-site/modern-template'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  return {
    title: name,
    description: data.profile.tagline ?? `Welcome to ${name}`,
  }
}

export default async function ClinicSitePage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  // basePath accounts for both subdomain (/) and direct access (/site/slug) in dev
  const basePath = `/site/${slug}`

  return <ModernTemplate data={data} basePath={basePath} />
}
