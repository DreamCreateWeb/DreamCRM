import { PageSkeleton } from '@/components/ui/skeleton'

/** Default dashboard loading state — instant layout-shaped placeholder while a
 *  page's data loads (overridden by tailored loading.tsx in some segments). */
export default function Loading() {
  return <PageSkeleton />
}
