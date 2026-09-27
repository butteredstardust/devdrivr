import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSetting, setSetting } from '@/lib/db'
import {
  MAX_RECENT_FILES,
  RECENT_FILES_SETTING,
  resetRecentFilesStore,
  useRecentFilesStore,
  withRecentFile,
} from '@/stores/recent-files.store'

vi.mock('@/lib/db', () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  vi.clearAllMocks()
  resetRecentFilesStore()
})

describe('withRecentFile', () => {
  it('moves a path to the front without a duplicate', () => {
    expect(withRecentFile(['/a', '/b', '/c'], '/c')).toEqual(['/c', '/a', '/b'])
  })

  it('keeps only the newest entries', () => {
    const paths = Array.from({ length: MAX_RECENT_FILES }, (_, index) => `/f${index}`)
    const next = withRecentFile(paths, '/new')
    expect(next).toHaveLength(MAX_RECENT_FILES)
    expect(next[0]).toBe('/new')
    expect(next).not.toContain(`/f${MAX_RECENT_FILES - 1}`)
  })
})

describe('useRecentFilesStore', () => {
  it('adds to the stored list instead of writing over it', async () => {
    vi.mocked(getSetting).mockResolvedValue(['/old.txt'])

    await useRecentFilesStore.getState().record('/new.txt')

    expect(useRecentFilesStore.getState().paths).toEqual(['/new.txt', '/old.txt'])
    expect(setSetting).toHaveBeenCalledWith(RECENT_FILES_SETTING, ['/new.txt', '/old.txt'])
  })

  it('ignores a stored value that is not a path list', async () => {
    vi.mocked(getSetting).mockResolvedValue({ bad: true })

    await useRecentFilesStore.getState().load()

    expect(useRecentFilesStore.getState().paths).toEqual([])
  })

  it('removes a path and clears the list', async () => {
    vi.mocked(getSetting).mockResolvedValue(['/a', '/b'])

    await useRecentFilesStore.getState().remove('/a')
    expect(useRecentFilesStore.getState().paths).toEqual(['/b'])

    await useRecentFilesStore.getState().clear()
    expect(setSetting).toHaveBeenLastCalledWith(RECENT_FILES_SETTING, [])
  })
})
