import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MatchText } from '../MatchText'

describe('MatchText', () => {
  it('emphasises only the matched characters', () => {
    render(<MatchText text="JSON Tools" ranges={[[0, 3]]} />)
    const marks = screen.getAllByText('JSON')
    expect(marks[0]!.tagName).toBe('MARK')
  })

  it('renders the text unchanged when nothing matched', () => {
    const { container } = render(<MatchText text="JSON Tools" ranges={[]} />)
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('JSON Tools')
  })

  it('preserves the full string across the split, which is what the row still reads as', () => {
    // Split text nodes are why this asserts on the container rather than with
    // getByText: the label is one word to a reader but three nodes to the DOM.
    const { container } = render(<MatchText text="Cron Parser" ranges={[[5, 10]]} />)
    expect(container.textContent).toBe('Cron Parser')
  })

  it('merges overlapping and adjacent ranges into one mark', () => {
    const { container } = render(
      <MatchText
        text="Base64 Encoder"
        ranges={[
          [0, 1],
          [2, 3],
          [1, 2],
        ]}
      />
    )
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0]!.textContent).toBe('Base')
  })

  it('sorts ranges Fuse reported out of order', () => {
    const { container } = render(
      <MatchText
        text="Diff Viewer"
        ranges={[
          [5, 5],
          [0, 0],
        ]}
      />
    )
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['D', 'V'])
    expect(container.textContent).toBe('Diff Viewer')
  })

  it('clamps a range that runs past the end rather than dropping characters', () => {
    // Ranges and text arrive from different places (a search index and the tool
    // registry); a stale pairing should degrade, not throw or truncate.
    const { container } = render(<MatchText text="URL" ranges={[[1, 99]]} />)
    expect(container.textContent).toBe('URL')
    expect(container.querySelector('mark')!.textContent).toBe('RL')
  })

  it('ignores an inverted range', () => {
    const { container } = render(<MatchText text="YAML" ranges={[[3, 1]]} />)
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('YAML')
  })
})
