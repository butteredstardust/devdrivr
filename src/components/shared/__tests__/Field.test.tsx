import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from '../Field'

describe('Field', () => {
  it('associates the label with its control via htmlFor', () => {
    render(
      <Field label="Request Name" htmlFor="request-name">
        <input id="request-name" />
      </Field>
    )
    expect(screen.getByLabelText('Request Name')).toBeInTheDocument()
  })

  it('wraps the control when no htmlFor is given, so the caller needs no id', () => {
    // The hand-rolled version this replaces was a bare <label> sibling with no `for` — it
    // rendered identically and labelled nothing, which is invisible until a screen reader
    // reads the input unnamed.
    render(
      <Field label="Alt Text">
        <input />
      </Field>
    )
    expect(screen.getByLabelText('Alt Text')).toBeInTheDocument()
  })

  it('shows a hint when there is no error', () => {
    render(
      <Field label="URL" hint="Must include protocol">
        <input />
      </Field>
    )
    expect(screen.getByText('Must include protocol')).toBeInTheDocument()
  })

  it('shows the error instead of the hint, with an alert role', () => {
    render(
      <Field label="URL" hint="Must include protocol" error="URL is required">
        <input />
      </Field>
    )
    expect(screen.getByRole('alert')).toHaveTextContent('URL is required')
    expect(screen.queryByText('Must include protocol')).not.toBeInTheDocument()
  })

  it('marks required fields', () => {
    render(
      <Field label="Name" required>
        <input />
      </Field>
    )
    expect(screen.getByText('*')).toBeInTheDocument()
  })
})
