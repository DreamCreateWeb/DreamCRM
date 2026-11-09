import ModernServices from '@/components/clinic-site/templates/modern/services'
import ModernServicePage from '@/components/clinic-site/templates/modern/servicePage'
import ModernNewPatients from '@/components/clinic-site/templates/modern/newPatients'
import ModernInsurance from '@/components/clinic-site/templates/modern/insurance'
import ModernFinancing from '@/components/clinic-site/templates/modern/financing'
import ModernPlans from '@/components/clinic-site/templates/modern/plans'
import ModernAbout from '@/components/clinic-site/templates/modern/about'
import ModernTeam from '@/components/clinic-site/templates/modern/team'
import ModernCareers from '@/components/clinic-site/templates/modern/careers'
import ModernFaq from '@/components/clinic-site/templates/modern/faq'
import ModernBlogIndex from '@/components/clinic-site/templates/modern/blogIndex'
import ModernBlogPost from '@/components/clinic-site/templates/modern/blogPost'
import type { SubpageRenderers } from '../subpage-props'

/**
 * Modern's subpage bodies — the founding bodies, moved verbatim out of the
 * page shells (ML-52). A sibling template that has no opinion for a page
 * SHARES one of these by reference and says so in its `subpageSource`.
 */
export const MODERN_SUBPAGES: SubpageRenderers = {
  services: ModernServices,
  servicePage: ModernServicePage,
  newPatients: ModernNewPatients,
  insurance: ModernInsurance,
  financing: ModernFinancing,
  plans: ModernPlans,
  about: ModernAbout,
  team: ModernTeam,
  careers: ModernCareers,
  faq: ModernFaq,
  blogIndex: ModernBlogIndex,
  blogPost: ModernBlogPost,
}
