import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '@/stores/ui.store'

describe('ui store toasts', () => {
  beforeEach(() => {
    useUiStore.setState({ toasts: [] })
  })

  it('shows a repeated message only once while it is visible', () => {
    const { addToast } = useUiStore.getState()

    addToast('Failed to save history: disk I/O error', 'error')
    addToast('Failed to save history: disk I/O error', 'error')

    expect(useUiStore.getState().toasts).toHaveLength(1)
  })

  it('shows the message again after the user dismisses it', () => {
    const { addToast, removeToast } = useUiStore.getState()
    addToast('Failed to save history', 'error')
    removeToast(useUiStore.getState().toasts[0]!.id)

    addToast('Failed to save history', 'error')

    expect(useUiStore.getState().toasts).toHaveLength(1)
  })

  it('keeps the same text with a different type as a separate toast', () => {
    const { addToast } = useUiStore.getState()

    addToast('Saved', 'success')
    addToast('Saved', 'error')

    expect(useUiStore.getState().toasts).toHaveLength(2)
  })
})
