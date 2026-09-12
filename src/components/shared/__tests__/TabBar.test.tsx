import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TabBar } from '../TabBar'

const TABS = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
]

describe('TabBar', () => {
  it('renders each tab and reports clicks', () => {
    const onTabChange = vi.fn()
    render(<TabBar tabs={TABS} activeTab="a" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'B' }))
    expect(onTabChange).toHaveBeenCalledWith('b')
  })

  it('draws a focus-visible ring from the --focus-ring token on every tab button', () => {
    render(<TabBar tabs={TABS} activeTab="a" onTabChange={() => {}} />)
    for (const tab of TABS) {
      expect(screen.getByRole('tab', { name: tab.label }).className).toContain(
        'focus-visible:shadow-[var(--focus-ring)]'
      )
    }
  })

  it('names the panel from the selected tab only', () => {
    // Consumers render one `TabPanel` — the active one. An unselected tab that kept its
    // `aria-controls` would point at an id no element carries, which drops the relationship
    // rather than describing it.
    render(<TabBar tabs={TABS} activeTab="a" onTabChange={() => {}} baseId="demo" />)

    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-controls', 'demo-panel-a')
    expect(screen.getByRole('tab', { name: 'B' })).not.toHaveAttribute('aria-controls')
  })

  it('omits aria-controls entirely without a baseId', () => {
    render(<TabBar tabs={TABS} activeTab="a" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'A' })).not.toHaveAttribute('aria-controls')
  })

  it('exposes selection and supports arrow-key navigation', () => {
    const onTabChange = vi.fn()
    render(<TabBar tabs={TABS} activeTab="a" onTabChange={onTabChange} />)

    const activeTab = screen.getByRole('tab', { name: 'A' })
    expect(activeTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(activeTab, { key: 'ArrowRight' })
    expect(onTabChange).toHaveBeenCalledWith('b')
  })
})
