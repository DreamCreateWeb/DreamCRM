import { permanentRedirect } from 'next/navigation'

/** Per-post editor moved → /website/blog/[id]; forwards `?ai=1` (the
 *  AI-draft entry the quick-create + calendar links use). */
export default async function PostRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ai?: string }>
}) {
  const { id } = await params
  const { ai } = await searchParams
  permanentRedirect(`/website/blog/${encodeURIComponent(id)}${ai ? `?ai=${encodeURIComponent(ai)}` : ''}`)
}
