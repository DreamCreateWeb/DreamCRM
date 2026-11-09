import SkinnedServices, { type ServicesSkin } from '../shared/services-layout'
import type { ServicesPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Cosmetic's own Services body: the shared skinned layout in this template's register. */
const SKIN: ServicesSkin = {
  hero: 'center',
  headingClass: 'text-[36px] sm:text-[56px] lg:text-[72px] font-normal leading-[1.04] tracking-tight',
  eyebrowClass: 'text-sm font-semibold uppercase tracking-[0.24em]',
  cardClass: () => 'rounded-[2px] hover:shadow-md',
  iconWellClass: 'w-12 h-12 rounded-full',
  numbered: true,
  buttonClass: 'rounded-full',
  learnMore: 'Explore',
  closing: 'brand',
  sectionHeadingClass: 'text-3xl sm:text-4xl lg:text-[48px] font-normal leading-[1.08] tracking-tight',
  rule: 'thin',
}

export default function CosmeticServices(props: ServicesPageBodyProps) {
  return <SkinnedServices {...props} skin={SKIN} />
}
