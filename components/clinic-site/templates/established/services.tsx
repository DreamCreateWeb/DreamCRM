import SkinnedServices, { type ServicesSkin } from '../shared/services-layout'
import type { ServicesPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Established's own Services body: the shared skinned layout in this template's register. */
const SKIN: ServicesSkin = {
  hero: 'left',
  headingClass: 'text-[2.4rem] sm:text-6xl lg:text-[4rem] font-semibold leading-[1.02] tracking-[-0.01em]',
  eyebrowClass: 'text-xs font-semibold uppercase tracking-[0.22em]',
  cardClass: () => 'rounded-2xl hover:shadow-md',
  iconWellClass: 'w-11 h-11 rounded-xl',
  numbered: true,
  buttonClass: 'rounded-full font-bold',
  learnMore: 'Learn more',
  closing: 'teal',
  sectionHeadingClass: 'text-3xl sm:text-4xl lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.01em]',
  rule: 'gold',
}

export default function EstablishedServices(props: ServicesPageBodyProps) {
  return <SkinnedServices {...props} skin={SKIN} />
}
