import { redirect } from 'next/navigation'

// Old campaigns route — kept as a permanent redirect so any external links
// or bookmarks (incl. the original sidebar entries from before the Marketing
// module landed) keep working. The real campaigns UI now lives at
// /growth/campaigns.
export default function CampaignsRedirect() {
  redirect('/growth/campaigns')
}
