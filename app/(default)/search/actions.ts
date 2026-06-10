'use server'

import { getTenantContext } from '@/lib/auth/context'
import { globalSearch } from '@/lib/services/global-search'
import type { SearchGroup } from '@/lib/types/global-search'

/**
 * Backend for the global ⌘K palette in the header. Auth + tenant scoping
 * happen here; the client only ever sees its own org's results.
 */
export async function globalSearchAction(query: string): Promise<SearchGroup[]> {
  const ctx = await getTenantContext()
  if (!ctx) return []
  if (typeof query !== 'string' || query.length > 200) return []
  return globalSearch(ctx, query)
}
