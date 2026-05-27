import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { getOpenJobs } from '@/lib/services/careers'
import { formatComp, type EmploymentType } from '@/lib/types/careers'

export const dynamic = 'force-dynamic'

// Indeed direct-employer XML feed. A clinic can submit this URL to Indeed
// (or we submit it once we're an ATS partner) and Indeed ingests the open
// roles. Google for Jobs picks the same roles up via the JobPosting JSON-LD
// on each detail page.
const INDEED_JOBTYPE: Record<EmploymentType, string> = {
  full_time: 'fulltime',
  part_time: 'parttime',
  contract: 'contract',
  temporary: 'temporary',
  per_diem: 'perdiem',
}

function cdata(s: string | null | undefined): string {
  return `<![CDATA[${(s ?? '').replace(/]]>/g, ']] >')}]]>`
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return new Response('Not found', { status: 404 })

  const base = publicSiteUrl(data)
  const company = data.profile.displayName ?? data.orgName
  const loc = data.primaryLocation
  const jobs = await getOpenJobs(data.orgId)

  const jobXml = jobs
    .map((j) => {
      const description = [j.description, j.responsibilities, j.requirements, j.benefits].filter(Boolean).join('\n\n')
      const date = (j.postedAt ?? j.createdAt).toUTCString()
      const salary = formatComp(j) ?? ''
      return `  <job>
    <title>${cdata(j.title)}</title>
    <date>${cdata(date)}</date>
    <referencenumber>${cdata(j.id)}</referencenumber>
    <url>${cdata(`${base}/careers/${j.slug}`)}</url>
    <company>${cdata(company)}</company>
    <city>${cdata(loc?.city ?? '')}</city>
    <state>${cdata(loc?.state ?? '')}</state>
    <postalcode>${cdata(loc?.postalCode ?? '')}</postalcode>
    <country>${cdata('US')}</country>
    <description>${cdata(description)}</description>
    <jobtype>${cdata(INDEED_JOBTYPE[j.employmentType])}</jobtype>
    <salary>${cdata(salary)}</salary>
  </job>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>${cdata(company)}</publisher>
  <publisherurl>${cdata(base)}</publisherurl>
${jobXml}
</source>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
