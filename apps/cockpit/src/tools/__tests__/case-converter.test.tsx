import { beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { useToolStateCache } from '@/stores/tool-state.store'
import CaseConverter from '../case-converter/CaseConverter'

describe('CaseConverter', () => {
  beforeEach(() => {
    cleanup()
    useToolStateCache.setState({ cache: new Map() })
  })

  it('renders input and output areas', () => {
    render(<CaseConverter />)
    expect(screen.getByPlaceholderText(/type or paste/i)).toBeInTheDocument()
    expect(screen.getByText('Input')).toBeInTheDocument()
  })

  it('converts input to all cases', () => {
    render(<CaseConverter />)
    const input = screen.getByPlaceholderText(/type or paste/i)

    fireEvent.change(input, { target: { value: 'hello world' } })

    expect(screen.getByText('HELLO WORLD')).toBeInTheDocument()
    expect(screen.getByText('helloWorld')).toBeInTheDocument()
    expect(screen.getByText('HelloWorld')).toBeInTheDocument()
    expect(screen.getByText('hello_world')).toBeInTheDocument()
    expect(screen.getByText('hello-world')).toBeInTheDocument()
    // SCREAMING_SNAKE_CASE and CONSTANT_CASE both produce HELLO_WORLD
    expect(screen.getAllByText('HELLO_WORLD')).toHaveLength(2)
    expect(screen.getByText('hello.world')).toBeInTheDocument()
    expect(screen.getByText('hello/world')).toBeInTheDocument()
  })

  it('handles camelCase input by splitting words', () => {
    render(<CaseConverter />)
    const input = screen.getByPlaceholderText(/type or paste/i)

    fireEvent.change(input, { target: { value: 'myVariableName' } })

    expect(screen.getByText('my_variable_name')).toBeInTheDocument()
    expect(screen.getByText('my-variable-name')).toBeInTheDocument()
    expect(screen.getByText('MyVariableName')).toBeInTheDocument()
  })

  it('shows placeholder when input is empty', () => {
    render(<CaseConverter />)
    expect(screen.getByText(/enter text above to see conversions/i)).toBeInTheDocument()
  })
})
