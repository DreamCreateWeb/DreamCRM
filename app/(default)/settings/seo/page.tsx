import { permanentRedirect } from 'next/navigation'

/** Search appearance lives in the Pages manager of the Website workspace. */
export default function SettingsSeoRedirect() {
  permanentRedirect('/website/pages')
}
