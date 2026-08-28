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

  it('hides a merely-available update when notifications are off', () => {
    useSettingsStore.setState({ notifyWhenUpdateAvailable: false })

    render(<UpdateNotification />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  // Auto-download is on by default, so with notifications off a staged update would otherwise have
  // no install affordance anywhere in the shell.
  it('still offers the restart when notifications are off but an update is staged', () => {
    useSettingsStore.setState({ notifyWhenUpdateAvailable: false })
    useUpdaterStore.setState({ isReady: true, progress: 1 })

    render(<UpdateNotification />)

    expect(screen.getByRole('button', { name: 'Restart to update' })).toBeInTheDocument()
  })

  it('stays hidden once dismissed, even when staged', () => {
    useUpdaterStore.setState({ isReady: true, dismissed: true })

    render(<UpdateNotification />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
