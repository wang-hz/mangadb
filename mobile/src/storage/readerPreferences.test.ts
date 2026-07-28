import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  DEFAULT_READER_PREFERENCES,
  loadReaderPreferences,
  saveReaderPreferences,
} from './readerPreferences'

describe('reader preferences storage', () => {
  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
  })

  it('returns compatible defaults when no preference has been saved', async () => {
    await expect(loadReaderPreferences()).resolves.toEqual(DEFAULT_READER_PREFERENCES)
  })

  it('restores valid preferences', async () => {
    const preferences = {
      defaultMode: 'scroll' as const,
      pagedDirection: 'rtl' as const,
      pagedFit: 'cover' as const,
      scrollGap: 16 as const,
      controlsAutoHideMs: null,
      keepAwake: true,
      readerDimLevel: 0.4 as const,
    }
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify(preferences))

    await expect(loadReaderPreferences()).resolves.toEqual(preferences)
  })

  it('keeps valid fields and defaults missing or invalid fields', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify({
      defaultMode: 'scroll',
      pagedDirection: 'up',
      pagedFit: 'cover',
      scrollGap: 12,
      keepAwake: true,
    }))

    await expect(loadReaderPreferences()).resolves.toEqual({
      ...DEFAULT_READER_PREFERENCES,
      defaultMode: 'scroll',
      pagedFit: 'cover',
      keepAwake: true,
    })
  })

  it('falls back to defaults for malformed storage', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('{broken')
    await expect(loadReaderPreferences()).resolves.toEqual(DEFAULT_READER_PREFERENCES)
  })

  it('serializes writes and saves the last requested value', async () => {
    let releaseFirstWrite: (() => void) | undefined
    jest.mocked(AsyncStorage.setItem)
      .mockImplementationOnce(() => new Promise<void>(resolve => { releaseFirstWrite = resolve }))
      .mockResolvedValueOnce(undefined)

    const first = saveReaderPreferences(DEFAULT_READER_PREFERENCES)
    const second = saveReaderPreferences({ ...DEFAULT_READER_PREFERENCES, defaultMode: 'scroll' })
    await flushMicrotasks()
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1)

    releaseFirstWrite?.()
    await Promise.all([first, second])
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2)
    expect(JSON.parse(jest.mocked(AsyncStorage.setItem).mock.calls[1][1])).toMatchObject({
      defaultMode: 'scroll',
    })
  })

  it('continues the queue after a failed write', async () => {
    jest.mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('disk unavailable'))
      .mockResolvedValueOnce(undefined)

    await expect(saveReaderPreferences(DEFAULT_READER_PREFERENCES)).rejects.toThrow('disk unavailable')
    await expect(saveReaderPreferences({
      ...DEFAULT_READER_PREFERENCES,
      keepAwake: true,
    })).resolves.toMatchObject({ keepAwake: true })
  })
})

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
