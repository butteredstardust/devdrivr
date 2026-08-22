import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsPopover, SettingsRow, SettingsSection } from '@/components/shared/SettingsPopover'
import { Select } from '@/components/shared/Input'
import { Toggle } from '@/components/shared/Toggle'

afterEach(cleanup)

function SettingsHarness({ badge }: { badge?: number } = {}) {
  const [open, setOpen] = useState(false)
  const [indent, setIndent] = useState('2')
  const [tabs, setTabs] = useState(false)

  return (
    <SettingsPopover
      label="Style"
      open={open}
      onOpenChange={setOpen}
      {...(badge === undefined ? {} : { badge })}
      description="Applies to the current document."
      footer={<button type="button">Reset to defaults</button>}
    >
      <SettingsSection title="Formatting">
        <SettingsRow label="Indent">
          <Select value={indent} onChange={(e) => setIndent(e.target.value)}>
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
          </Select>
        </SettingsRow>
        <SettingsRow label="Use tabs">
          {({ labelId }) => <Toggle aria-labelledby={labelId} checked={tabs} onChange={setTabs} />}
        </SettingsRow>
      </SettingsSection>
    </SettingsPopover>
  )
}

describe('SettingsPopover', () => {
  it('names every control from its row label', () => {
    render(<SettingsHarness />)
    fireEvent.click(screen.getByRole('button', { name: /Style/ }))

    // The node form associates structurally; the render-prop form has to name a
    // `role="switch"` button, which no enclosing <label> can do.
    expect(screen.getByLabelText('Indent')).toHaveValue('2')
    expect(screen.getByRole('switch', { name: 'Use tabs' })).toBeInTheDocument()
  })

  it('keeps its controls live — a setting applies without closing the surface', () => {
    render(<SettingsHarness />)
    fireEvent.click(screen.getByRole('button', { name: /Style/ }))

    fireEvent.change(screen.getByLabelText('Indent'), { target: { value: '4' } })
    expect(screen.getByLabelText('Indent')).toHaveValue('4')

    const toggle = screen.getByRole('switch', { name: 'Use tabs' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    expect(screen.getByRole('dialog', { name: 'Style' })).toBeInTheDocument()
  })

  it('shows the description, section heading and footer', () => {
    render(<SettingsHarness />)
    fireEvent.click(screen.getByRole('button', { name: /Style/ }))

    expect(screen.getByText('Applies to the current document.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Formatting' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeInTheDocument()
  })

  it('badges the trigger when settings depart from their defaults', () => {
    // The cost of hiding settings is that the toolbar stops showing they were changed.
    // The badge is what buys that back, so it is a contract, not decoration.
    render(<SettingsHarness badge={3} />)
    expect(screen.getByRole('button', { name: /Style/ })).toHaveTextContent('3')

    cleanup()

    render(<SettingsHarness badge={0} />)
    expect(screen.getByRole('button', { name: /Style/ })).not.toHaveTextContent('0')
  })
})
