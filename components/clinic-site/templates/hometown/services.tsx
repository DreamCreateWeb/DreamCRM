import SkinnedServices, { type ServicesSkin } from '../shared/services-layout'
import type { ServicesPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Hometown's own Services body: the shared skinned layout in this template's register. */
const SKIN: ServicesSkin = {
  hero: 'center',
  headingClass: 'text-[2.2rem] sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.05]',
  eyebrowClass: 'text-sm font-bold uppercase tracking-[0.18em]',
  cardClass: () => 'rounded-lg hover:shadow-md',
  iconWellClass: 'w-12 h-12 rounded-full',
  numbered: false,
  buttonClass: 'rounded-md font-bold',
  learnMore: 'Learn more',
  closing: 'teal',
  sectionHeadingClass: 'text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.1]',
  rule: 'thin',
}

export default function HometownServices(props: ServicesPageBodyProps) {
  return <SkinnedServices {...props} skin={SKIN} />
}
