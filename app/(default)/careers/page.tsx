import { permanentRedirect } from 'next/navigation'

/** The careers manager moved into the Website workspace (/website/careers). */
export default function CareersRedirect() {
  permanentRedirect('/website/careers')
}
