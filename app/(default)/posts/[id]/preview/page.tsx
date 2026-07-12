import { permanentRedirect } from 'next/navigation'

/** Post preview moved with the editor. */
export default async function PostPreviewRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  permanentRedirect(`/website/blog/${encodeURIComponent(id)}/preview`)
}
