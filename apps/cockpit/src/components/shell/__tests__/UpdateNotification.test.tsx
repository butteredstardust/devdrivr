import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateNotification } from '@/components/shell/UpdateNotification'
import { useSettingsStore } from '@/stores/settings.store'
import { useUpdaterStore } from '@/stores/updater.store'
import { DEFAULT_SETTINGS } from '@/types/models'

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, notifyWhenUpdateAvailable: true })
  useUpdaterStore.setState({
    updateInfo: {
      version: '0.2.0',
      notes: 'Polish pass',
      pub_date: '2026-04-15',
    },
    dismissed: false,
    isDownloading: false,
    isReady: false,
    progress: null,
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    restartToUpdate: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn(),
  })
})

afterEach(cleanup)

describe('UpdateNotification', () => {
  it('announces update state and exposes labelled actions', () => {
    const downloadUpdate = useUpdaterStore.getState().downloadUpdate
    const dismiss = useUpdaterStore.getState().dismiss

    render(<UpdateNotification />)

    expect(screen.getByRole('status')).toHaveTextContent('devdrivr v0.2.0')

    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(downloadUpdate).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notification' }))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('offers a restart once the update is staged', () => {
    const restartToUpdate = vi.fn().mockResolvedValue(undefined)
    useUpdaterStore.setState({ isReady: true, progress: 1, restartToUpdate })

    render(<UpdateNotification />)

    expect(screen.getByRole('status')).toHaveTextContent('is ready to install')
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }))
    expect(restartToUpdate).toHaveBeenCalledTimes(1)
  })

  it('shows download progress as a percentage', () => {
    useUpdaterStore.setState({ isDownloading: true, progress: 0.42 })

    render(<UpdateNotification />)

    expect(screen.getByRole('status')).toHaveTextContent('Downloading… 42%')
  })
})
