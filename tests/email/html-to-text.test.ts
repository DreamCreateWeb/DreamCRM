import { describe, it, expect } from 'vitest'
import { htmlToText, patientEmailShell } from '@/lib/email'

/**
 * `htmlToText` is the ONE derivation of the plain-text twin every send carries
 * (and the hub's "Text version"): links stay as "label (url)", entities decode,
 * no tag survives.
 */

describe('htmlToText', () => {
  it('keeps a link as "label (url)"', () => {
    expect(htmlToText('<p>See <a href="https://x.test/a?b=1&amp;c=2">our page</a> today</p>')).toBe(
      'See our page (https://x.test/a?b=1&c=2) today',
    )
  })

  it('a link whose label is the url collapses to the url once', () => {
    expect(htmlToText('<a href="https://x.test/c/1">https://x.test/c/1</a>')).toBe('https://x.test/c/1')
  })

  it('decodes entities, amp last', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;x&#39; &#x2014; a&nbsp;b &amp;lt;</p>')).toBe(
      'Tom & Jerry <3 "hi" \'x\' — a b &lt;',
    )
  })

  it('leaves no tag, style, comment or hidden preheader behind', () => {
    const out = htmlToText(
      '<head><style>p{color:red}</style></head><!--[if mso]><v:roundrect href="https://no.test"></v:roundrect><![endif]--><div style="display:none;max-height:0">PRE</div><h1>Title</h1><p>One<br>Two</p>',
    )
    expect(out).toBe('Title\nOne\nTwo')
    expect(out).not.toMatch(/[<>]/)
  })

  it('a real patient email reads in text: header, body, the button link once, footer', () => {
    const html = patientEmailShell({
      sender: { from: 'x', replyTo: null, name: 'Bright Smiles', timeZone: 'America/New_York', address: '1 Main St', phone: '555' },
      title: 'Your visit is coming up',
      body: 'Hi Jordan,<br><br>See you Monday.',
      cta: { url: 'https://www.dreamcreatestudio.com/c/abc', label: 'Confirm my visit' },
    })
    const text = htmlToText(html)
    expect(text).toContain('Bright Smiles')
    expect(text).toContain('Your visit is coming up')
    expect(text).toContain('Hi Jordan,')
    expect(text).toContain('Confirm my visit (https://www.dreamcreatestudio.com/c/abc)')
    expect(text).toContain('Bright Smiles · 1 Main St · 555')
    expect(text).not.toMatch(/<|&nbsp;|\[if/)
  })
})
