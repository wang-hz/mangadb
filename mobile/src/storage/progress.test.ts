import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadReadingProgress, saveReadingProgress } from './progress'

describe('reading progress storage', () => {
  it('isolates positions by server, account and manga', async () => {
    await saveReadingProgress('https://one.example.com', 'user-1', 'manga-1', 20, 4, 'paged')
    await saveReadingProgress('https://one.example.com', 'user-2', 'manga-1', 20, 8, 'scroll')
    await saveReadingProgress('https://two.example.com', 'user-1', 'manga-1', 20, 12, 'paged')

    const keys = jest.mocked(AsyncStorage.setItem).mock.calls.map(([key]) => key)
    expect(new Set(keys).size).toBe(3)
    expect(keys.every(key => !key.includes('undefined'))).toBe(true)
  })

  it('clamps restored and newly saved positions to the current page count', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify({
      pageIndex: 18,
      mode: 'scroll',
      updatedAt: '2026-07-19T12:00:00.000Z',
    }))

    await expect(loadReadingProgress('https://example.com', 'user-1', 'manga-1', 5)).resolves.toEqual({
      pageIndex: 4,
      mode: 'scroll',
      updatedAt: '2026-07-19T12:00:00.000Z',
    })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({
        pageIndex: 4,
        mode: 'scroll',
        updatedAt: '2026-07-19T12:00:00.000Z',
      }),
    )

    await expect(saveReadingProgress(
      'https://example.com',
      'user-1',
      'manga-1',
      5,
      99,
      'paged',
    )).resolves.toMatchObject({ pageIndex: 4, mode: 'paged' })
  })

  it('ignores malformed or incompatible stored values', async () => {
    jest.mocked(AsyncStorage.getItem)
      .mockResolvedValueOnce('{broken')
      .mockResolvedValueOnce(JSON.stringify({ pageIndex: -1, mode: 'paged', updatedAt: 'today' }))
      .mockResolvedValueOnce(JSON.stringify({ pageIndex: 1, mode: 'unknown', updatedAt: '2026-01-01' }))

    await expect(loadReadingProgress('server', 'user', 'one', 10)).resolves.toBeNull()
    await expect(loadReadingProgress('server', 'user', 'two', 10)).resolves.toBeNull()
    await expect(loadReadingProgress('server', 'user', 'three', 10)).resolves.toBeNull()
  })

  it('serializes writes per identity and preserves the last requested position', async () => {
    let releaseFirstWrite: (() => void) | undefined
    jest.mocked(AsyncStorage.setItem)
      .mockImplementationOnce(() => new Promise<void>(resolve => { releaseFirstWrite = resolve }))
      .mockResolvedValueOnce(undefined)

    const first = saveReadingProgress('server', 'user', 'manga', 20, 3, 'paged')
    const second = saveReadingProgress('server', 'user', 'manga', 20, 9, 'scroll')
    await flushMicrotasks()
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1)

    releaseFirstWrite?.()
    await Promise.all([first, second])
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2)
    expect(JSON.parse(jest.mocked(AsyncStorage.setItem).mock.calls[1][1])).toMatchObject({
      pageIndex: 9,
      mode: 'scroll',
    })
  })

  it('continues a key queue after an earlier write fails', async () => {
    let rejectFirstWrite: ((error: Error) => void) | undefined
    jest.mocked(AsyncStorage.setItem)
      .mockImplementationOnce(() => new Promise<void>((_, reject) => {
        rejectFirstWrite = reject
      }))
      .mockResolvedValueOnce(undefined)

    const first = saveReadingProgress('server', 'user', 'failure', 10, 1, 'paged')
    const firstResult = expect(first).rejects.toThrow('disk unavailable')
    const second = saveReadingProgress('server', 'user', 'failure', 10, 2, 'scroll')
    await flushMicrotasks()
    rejectFirstWrite?.(new Error('disk unavailable'))

    await firstResult
    await expect(second).resolves.toMatchObject({ pageIndex: 2, mode: 'scroll' })
  })
})

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
