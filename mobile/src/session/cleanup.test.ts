import { clearSessionCaches } from './cleanup'

describe('session cache cleanup', () => {
  it('clears query, memory image and disk image caches', async () => {
    const queryClient = { clear: jest.fn() }
    const stopPrefetch = jest.fn().mockResolvedValue(undefined)
    const imageCache = {
      clearMemoryCache: jest.fn().mockResolvedValue(true),
      clearDiskCache: jest.fn().mockResolvedValue(true),
    }

    await expect(clearSessionCaches(queryClient, imageCache, stopPrefetch)).resolves.toBe(true)
    expect(stopPrefetch).toHaveBeenCalledTimes(1)
    expect(queryClient.clear).toHaveBeenCalledTimes(1)
    expect(imageCache.clearMemoryCache).toHaveBeenCalledTimes(1)
    expect(imageCache.clearDiskCache).toHaveBeenCalledTimes(1)
  })

  it('attempts every cache even when one cleanup fails', async () => {
    const queryClient = { clear: jest.fn() }
    const stopPrefetch = jest.fn().mockRejectedValue(new Error('prefetch busy'))
    const imageCache = {
      clearMemoryCache: jest.fn().mockRejectedValue(new Error('memory cache busy')),
      clearDiskCache: jest.fn().mockResolvedValue(false),
    }

    await expect(clearSessionCaches(queryClient, imageCache, stopPrefetch)).resolves.toBe(false)
    expect(queryClient.clear).toHaveBeenCalledTimes(1)
    expect(imageCache.clearMemoryCache).toHaveBeenCalledTimes(1)
    expect(imageCache.clearDiskCache).toHaveBeenCalledTimes(1)
  })

  it('waits for prefetches before clearing image caches', async () => {
    const order: string[] = []
    let finishPrefetch: (() => void) | undefined
    const stopPrefetch = jest.fn(() => new Promise<void>(resolve => {
      finishPrefetch = () => {
        order.push('prefetch')
        resolve()
      }
    }))
    const imageCache = {
      clearMemoryCache: jest.fn(async () => {
        order.push('memory')
        return true
      }),
      clearDiskCache: jest.fn(async () => {
        order.push('disk')
        return true
      }),
    }

    const cleanup = clearSessionCaches({ clear: jest.fn() }, imageCache, stopPrefetch)
    await Promise.resolve()
    expect(imageCache.clearDiskCache).not.toHaveBeenCalled()
    finishPrefetch?.()
    await cleanup

    expect(order[0]).toBe('prefetch')
    expect(order.slice(1).sort()).toEqual(['disk', 'memory'])
  })
})
