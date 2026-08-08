import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MangaSummary } from '@/api/types'
import {
  listRecentReading,
  listReadingProgress,
  loadReadingProgress,
  markMangaCompleted,
  markMangaUnread,
  removeFromRecentReading,
  saveReadingProgress,
} from './progress'

const manga: MangaSummary = {
  uuid: 'manga-1',
  displayTitle: '测试漫画',
  originalTitle: 'Manga',
  publishDate: null,
  cover: 0,
  createAt: '2026-07-01T00:00:00.000Z',
  updateAt: '2026-07-27T00:00:00.000Z',
}

describe('reading progress storage', () => {
  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockReset().mockResolvedValue(null)
    jest.mocked(AsyncStorage.setItem).mockReset().mockResolvedValue(undefined)
    jest.mocked(AsyncStorage.multiSet).mockReset().mockResolvedValue(undefined)
    jest.mocked(AsyncStorage.removeItem).mockReset().mockResolvedValue(undefined)
  })

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
      state: 'reading',
      updatedAt: '2026-07-19T12:00:00.000Z',
    })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({
        pageIndex: 4,
        mode: 'scroll',
        state: 'reading',
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

  it('maintains a sorted identity-scoped recent-reading index', async () => {
    const values = installStorageMap()
    jest.useFakeTimers()
    try {
      jest.setSystemTime(new Date('2026-07-27T10:00:00.000Z'))
      await saveReadingProgress(
        'https://example.com',
        'user-1',
        manga.uuid,
        10,
        2,
        'paged',
        manga,
      )
      jest.setSystemTime(new Date('2026-07-27T11:00:00.000Z'))
      await saveReadingProgress(
        'https://example.com',
        'user-1',
        'manga-2',
        20,
        5,
        'scroll',
        { ...manga, uuid: 'manga-2', displayTitle: '第二本' },
      )

      await expect(listRecentReading('https://example.com', 'user-1'))
        .resolves.toMatchObject([
          { manga: { uuid: 'manga-2' }, pageIndex: 5 },
          { manga: { uuid: 'manga-1' }, pageIndex: 2 },
        ])
      await expect(listRecentReading('https://example.com', 'user-2'))
        .resolves.toEqual([])
      expect([...values.keys()].some(key => key.includes('readingProgressIndex'))).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('keeps explicit completion until rereading or page-count growth', async () => {
    installStorageMap()
    await saveReadingProgress(
      'server',
      'user',
      manga.uuid,
      5,
      2,
      'paged',
      manga,
    )
    await markMangaCompleted('server', 'user', manga, 5, 'paged')

    await expect(saveReadingProgress(
      'server',
      'user',
      manga.uuid,
      5,
      4,
      'paged',
      manga,
    )).resolves.toMatchObject({ state: 'completed' })
    await expect(saveReadingProgress(
      'server',
      'user',
      manga.uuid,
      6,
      4,
      'paged',
      manga,
    )).resolves.toMatchObject({ state: 'reading' })
  })

  it('removes an item from recent history without deleting its position', async () => {
    installStorageMap()
    await saveReadingProgress('server', 'user', manga.uuid, 10, 3, 'scroll', manga)

    await removeFromRecentReading('server', 'user', manga.uuid)

    await expect(listRecentReading('server', 'user')).resolves.toEqual([])
    await expect(listReadingProgress('server', 'user')).resolves.toMatchObject([
      { manga: { uuid: manga.uuid }, pageIndex: 3, hiddenFromRecent: true },
    ])
    await expect(loadReadingProgress('server', 'user', manga.uuid, 10))
      .resolves.toMatchObject({ pageIndex: 3, mode: 'scroll' })
  })

  it('marks a manga unread by deleting both its position and recent entry', async () => {
    installStorageMap()
    await saveReadingProgress('server', 'user', manga.uuid, 10, 3, 'scroll', manga)

    await markMangaUnread('server', 'user', manga.uuid)

    await expect(listRecentReading('server', 'user')).resolves.toEqual([])
    await expect(loadReadingProgress('server', 'user', manga.uuid, 10)).resolves.toBeNull()
  })
})

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function installStorageMap() {
  const values = new Map<string, string>()
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => values.get(key) ?? null)
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    values.set(key, value)
  })
  jest.mocked(AsyncStorage.multiSet).mockImplementation(async entries => {
    entries.forEach(([key, value]) => values.set(key, value))
  })
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async key => {
    values.delete(key)
  })
  return values
}
