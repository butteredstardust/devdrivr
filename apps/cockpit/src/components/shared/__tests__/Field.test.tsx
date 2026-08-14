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
