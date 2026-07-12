import { permanentRedirect } from 'next/navigation'

/** Search appearance folded into the SEO page of the Website workspace —
 *  the #meta fragment lands old deep links on the meta editor section. */
export default function SettingsSeoRedirect() {
  permanentRedirect('/website/seo#meta')
}
