import { describe, it, expect } from 'vitest'
import { staffEmailShell, buildDigestEmailBody } from '@/lib/email'

describe('staffEmailShell + digest body (ML-33)', () => {
  const html = staffEmailShell({
    clinicName: 'Bright <b>Smiles',
    title: '',
    body: buildDigestEmailBody({
      name: 'Mia Hayes',
      intro: 'Good morning',
      oneThing: '<script>x</script>',
      sections: [{ heading: '2 follow-ups', lines: ['Call <Mia>'] }],
    }),
    cta: { url: 'https://x.test/my-day', label: 'Open your day' },
  })
  it('names the clinic (escaped), never the platform', () => {
    expect(html).toContain('Bright &lt;b&gt;Smiles')
    expect(html).not.toContain('Dream Create')
  })
  it('renders real headings, lists and the button', () => {
    expect(html).toContain('<h2')
    expect(html).toContain('<li')
    expect(html).toContain('href="https://x.test/my-day"')
    expect(html).toContain('Hi Mia,')
  })
  it('escapes every user-supplied value', () => {
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('Call <Mia>')
  })
})
