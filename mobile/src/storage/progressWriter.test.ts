import { ReadingProgressWriter } from './progressWriter'

describe('ReadingProgressWriter', () => {
  beforeEach(() => jest.useFakeTimers())
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
})
