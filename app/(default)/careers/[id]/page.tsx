import { permanentRedirect } from 'next/navigation'

/** Per-role editor moved → /website/careers/[id]. */
export default async function CareerRoleRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  permanentRedirect(`/website/careers/${encodeURIComponent(id)}`)
}
