import SkinnedAbout, { MODERN_ABOUT_SKIN } from '../shared/about-layout'
import type { AboutPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Modern's About body: the shared layout wearing Modern's own skin (ML-52b). */
export default function ModernAbout(props: AboutPageBodyProps) {
  return <SkinnedAbout {...props} skin={MODERN_ABOUT_SKIN} />
}
