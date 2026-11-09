import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { TableFit, FoldedFacts } from '@/components/ui/data-table'

describe('TableFit', () => {
  it('is a focusable, labelled scroll region around the table', () => {
    render(
      <TableFit label="Things">
        <table><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
      </TableFit>,
    )
    const region = screen.getByRole('region', { name: 'Things' })
    expect(region.tabIndex).toBe(0)
    expect(region.className).toContain('overflow-x-auto')
    expect(region.querySelector('table')).not.toBeNull()
  })

  it('FoldedFacts shows only below sm', () => {
    render(<FoldedFacts>Sent today</FoldedFacts>)
    expect(screen.getByText('Sent today').className).toContain('sm:hidden')
  })
})

describe('the clipped tables adopt the recipe', () => {
  const files = [
    'app/(default)/payments/online/page.tsx',
    'app/(default)/payments/online/posting-table.tsx',
    'app/(default)/payments/collections/page.tsx',
    'app/(default)/payments/collections/plans-card.tsx',
    'app/(default)/growth/reviews/page.tsx',
    'app/(default)/growth/campaigns/page.tsx',
    'app/(default)/growth/campaigns/[id]/recipients-table.tsx',
    'app/(default)/integrations/_pms-dashboard.tsx',
  ]
  it.each(files)('%s wraps every <table> in <TableFit>', (f) => {
    const src = readFileSync(f, 'utf8')
    const tables = (src.match(/<table\b/g) ?? []).length
    const fits = (src.match(/<TableFit\b/g) ?? []).length
    expect(tables).toBeGreaterThan(0)
    expect(fits).toBe(tables)
  })
})
