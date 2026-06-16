import { redirect } from 'next/navigation'

/**
 * The Channels surface (social + Google Business connect) was consolidated into
 * the Integrations app-library — /integrations is now the single place a clinic
 * connects everything (its PMS, Google Business, and social channels). This
 * permanent redirect keeps any old bookmark / link working.
 */
export const dynamic = 'force-dynamic'

export default async function ChannelsRedirect() {
  redirect('/integrations')
}
