import { clearSessionCaches } from './cleanup'

describe('session cache cleanup', () => {
  it('clears query, memory image and disk image caches', async () => {
    const queryClient = { clear: jest.fn() }
    const imageCache = {
      clearMemoryCache: jest.fn().mockResolvedValue(true),
      clearDiskCache: jest.fn().mockResolvedValue(true),
    }

    await expect(clearSessionCaches(queryClient, imageCache)).resolves.toBe(true)
    expect(queryClient.clear).toHaveBeenCalledTimes(1)
    expect(imageCache.clearMemoryCache).toHaveBeenCalledTimes(1)
    expect(imageCache.clearDiskCache).toHaveBeenCalledTimes(1)
  })

  it('attempts every cache even when one cleanup fails', async () => {
    const queryClient = { clear: jest.fn() }
    const imageCache = {
      clearMemoryCache: jest.fn().mockRejectedValue(new Error('memory cache busy')),
      clearDiskCache: jest.fn().mockResolvedValue(false),
    }

    await expect(clearSessionCaches(queryClient, imageCache)).resolves.toBe(false)
    expect(queryClient.clear).toHaveBeenCalledTimes(1)
    expect(imageCache.clearMemoryCache).toHaveBeenCalledTimes(1)
    expect(imageCache.clearDiskCache).toHaveBeenCalledTimes(1)
  })

  it('clears both image caches', async () => {
    const order: string[] = []
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

    await clearSessionCaches({ clear: jest.fn() }, imageCache)

    expect(order.sort()).toEqual(['disk', 'memory'])
  })
})
