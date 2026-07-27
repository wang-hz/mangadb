import { waitFor } from '@testing-library/react-native'
import { readerPrefetchIndexes } from '@/components/reader/prefetch'
import { startImagePrefetchQueue, stopImagePrefetches } from '@/media/prefetch'

describe('reader page prefetch', () => {
  it('prioritizes three forward pages and one previous paged-reader page', () => {
    expect(readerPrefetchIndexes(4, 10, 'paged', true, false)).toEqual([5, 6, 7, 3])
    expect(readerPrefetchIndexes(8, 10, 'paged', true, false)).toEqual([9, 7])
  })

  it('prefetches only the next scrolling batch', () => {
    expect(readerPrefetchIndexes(4, 10, 'scroll', true, false)).toEqual([5, 6, 7])
  })

  it('reduces work on constrained connections and pauses offline', () => {
    expect(readerPrefetchIndexes(4, 10, 'paged', true, true)).toEqual([5])
    expect(readerPrefetchIndexes(4, 10, 'paged', false, false)).toEqual([])
  })

  it('prefetches sequentially with authenticated cache options', async () => {
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    const prefetch = jest.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    startImagePrefetchQueue([
      { uri: 'https://example.com/1', cacheKey: 'page-1', headers: { Authorization: 'Bearer t' } },
      { uri: 'https://example.com/2', cacheKey: 'page-2', headers: { Authorization: 'Bearer t' } },
    ], prefetch)

    await waitFor(() => expect(prefetch).toHaveBeenCalledTimes(1))
    expect(prefetch).toHaveBeenNthCalledWith(1, 'https://example.com/1', {
      cachePolicy: 'memory-disk',
      headers: { Authorization: 'Bearer t' },
    })
    first.resolve(true)
    await waitFor(() => expect(prefetch).toHaveBeenCalledTimes(2))
    second.resolve(true)
  })

  it('stops queued work after cancellation', async () => {
    const first = deferred<boolean>()
    const prefetch = jest.fn().mockReturnValue(first.promise)
    const cancel = startImagePrefetchQueue([
      { uri: 'https://example.com/cancel-1' },
      { uri: 'https://example.com/cancel-2' },
    ], prefetch)

    await waitFor(() => expect(prefetch).toHaveBeenCalledTimes(1))
    cancel()
    first.resolve(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(prefetch).toHaveBeenCalledTimes(1)
  })

  it('deduplicates the same cache key across overlapping queues', async () => {
    const pending = deferred<boolean>()
    const prefetch = jest.fn().mockReturnValue(pending.promise)
    const source = { uri: 'https://example.com/shared', cacheKey: 'shared-page' }

    startImagePrefetchQueue([source], prefetch)
    startImagePrefetchQueue([source], prefetch)

    await waitFor(() => expect(prefetch).toHaveBeenCalledTimes(1))
    pending.resolve(true)
  })

  it('stops every queue and waits for current requests before session cleanup', async () => {
    const pending = deferred<boolean>()
    const prefetch = jest.fn().mockReturnValue(pending.promise)
    startImagePrefetchQueue([
      { uri: 'https://example.com/session-1' },
      { uri: 'https://example.com/session-2' },
    ], prefetch)
    await waitFor(() => expect(prefetch).toHaveBeenCalledTimes(1))

    let stopped = false
    const stopping = stopImagePrefetches().then(() => { stopped = true })
    await Promise.resolve()
    expect(stopped).toBe(false)

    pending.resolve(true)
    await stopping
    expect(prefetch).toHaveBeenCalledTimes(1)
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve })
  return { promise, resolve }
}
