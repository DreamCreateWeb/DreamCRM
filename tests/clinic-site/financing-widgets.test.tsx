import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { CherryWidget, SunbitPrequalify } from '@/components/clinic-site/financing-widgets'
import { CHERRY_WIDGET_SRC } from '@/lib/financing-providers'

/**
 * The embeds. Cherry: the loader queues `_hw("init", …)` and appends ONE
 * `widget.js` script per document, whatever the number of mounts; the page
 * mode renders Cherry's four section containers, the floating mode its one.
 * Sunbit: an iframe on apply.sunbit.com, nothing else loaded.
 */

type Hw = ((...a: unknown[]) => void) & { q?: unknown[][] }

beforeEach(() => {
  delete (window as unknown as { _hw?: Hw })._hw
  document.getElementById('_hw')?.remove()
})
afterEach(cleanup)

describe('CherryWidget', () => {
  it('page mode: loads widget.js once, queues the init with the slug, brand and the four sections, renders the containers', () => {
    render(<CherryWidget slug="ted-pinney-dds-pa" name="Ted Pinney DDS" brand="#1F6F8B" mode="page" />)
    const script = document.getElementById('_hw') as HTMLScriptElement
    expect(script.src).toBe(CHERRY_WIDGET_SRC)
    expect(script.async).toBe(true)
    const hw = (window as unknown as { _hw: Hw })._hw
    expect(hw.q).toHaveLength(1)
    const [verb, config, sections] = hw.q![0] as [string, { variables: { slug: string }; styles: { primaryColor: string; floatingEstimator?: unknown } }, string[]]
    expect(verb).toBe('init')
    expect(config.variables.slug).toBe('ted-pinney-dds-pa')
    expect(config.styles.primaryColor).toBe('#1F6F8B')
    expect(config.styles.floatingEstimator).toBeUndefined()
    expect(sections).toEqual(['hero', 'calculator', 'howitworks', 'faq'])
    for (const id of sections) expect(document.getElementById(id)).toBeTruthy()
    expect(screen.getByTestId('cherry-widget').getAttribute('data-slug')).toBe('ted-pinney-dds-pa')
  })

  it('floating mode: one container, the floating estimator in the init; a second mount reuses the one script', () => {
    render(<CherryWidget slug="ted-pinney-dds-pa" name="Ted Pinney DDS" brand="#1F6F8B" mode="floating" />)
    render(<CherryWidget slug="ted-pinney-dds-pa" name="Ted Pinney DDS" brand="#1F6F8B" mode="page" />)
    expect(document.querySelectorAll('script#_hw')).toHaveLength(1)
    const hw = (window as unknown as { _hw: Hw })._hw
    expect(hw.q).toHaveLength(2)
    const [, config, sections] = hw.q![0] as [string, { styles: { floatingEstimator?: { position: string } } }, string[]]
    expect(sections).toEqual(['floatingEstimator'])
    expect(config.styles.floatingEstimator?.position).toBe('bottom-right')
    expect(screen.getByTestId('cherry-floating').id).toBe('floatingEstimator')
  })
})

describe('SunbitPrequalify', () => {
  it('frames the practice’s pre-qualification page with a title, lazily', () => {
    render(<SunbitPrequalify slug="bright-smiles-dental" name="Bright Smiles" />)
    const frame = screen.getByTestId('sunbit-widget') as HTMLIFrameElement
    expect(frame.src).toBe('https://apply.sunbit.com/bright-smiles-dental')
    expect(frame.title).toContain('Bright Smiles')
    expect(frame.getAttribute('loading')).toBe('lazy')
    expect(document.querySelector('script#_hw')).toBeNull()
  })
})
