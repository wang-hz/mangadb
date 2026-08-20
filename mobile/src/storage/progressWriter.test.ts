import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadReadingProgress } from './progress'
import { ReadingProgressWriter } from './progressWriter'

describe('ReadingProgressWriter', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.mocked(AsyncStorage.getItem).mockReset().mockResolvedValue(null)
    jest.mocked(AsyncStorage.setItem).mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => jest.useRealTimers())

  it('coalesces rapid changes and writes only the latest position', async () => {
    const save = jest.fn().mockResolvedValue({})
    const writer = new ReadingProgressWriter(save)
    for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
      writer.schedule({
        serverUrl: 'server',
        userUuid: 'user',
        mangaUuid: 'manga',
        pageCount: 100,
        pageIndex,
        mode: 'paged',
      })
    }

    jest.advanceTimersByTime(400)
    await writer.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenLastCalledWith(
      'server', 'user', 'manga', 100, 99, 'paged', undefined,
    )
  })

  it('flushes immediately and can cancel a pending write', async () => {
    const save = jest.fn().mockResolvedValue({})
    const writer = new ReadingProgressWriter(save)
    writer.schedule({
      serverUrl: 'server',
      userUuid: 'user',
      mangaUuid: 'manga',
      pageCount: 10,
      pageIndex: 4,
      mode: 'scroll',
    })
    await writer.flush()
    expect(save).toHaveBeenCalledTimes(1)

    writer.schedule({
      serverUrl: 'server',
      userUuid: 'user',
      mangaUuid: 'manga',
      pageCount: 10,
      pageIndex: 5,
      mode: 'scroll',
    })
    writer.cancel()
    jest.runAllTimers()
    await writer.flush()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('registers a flushed write before a remount can read the same identity', async () => {
    const values = new Map<string, string>()
    let releaseWrite: (() => void) | undefined
    jest.mocked(AsyncStorage.getItem).mockImplementation(async key => values.get(key) ?? null)
    jest.mocked(AsyncStorage.setItem).mockImplementation((key, value) =>
      new Promise<void>(resolve => {
        releaseWrite = () => {
          values.set(key, value)
          resolve()
        }
      }))
    const writer = new ReadingProgressWriter()
    writer.schedule({
      serverUrl: 'server',
      userUuid: 'user',
      mangaUuid: 'manga',
      pageCount: 10,
      pageIndex: 7,
      mode: 'paged',
    })

    const flush = writer.flush()
    const restored = loadReadingProgress('server', 'user', 'manga', 10)
    await flushMicrotasks()

    expect(AsyncStorage.getItem).not.toHaveBeenCalled()
    if (!releaseWrite) throw new Error('progress write did not start')
    releaseWrite()
    await flush
    await expect(restored).resolves.toMatchObject({ pageIndex: 7, mode: 'paged' })
  })
})

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
