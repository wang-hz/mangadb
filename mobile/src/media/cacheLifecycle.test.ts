import type { AppStateStatus, NativeEventSubscription } from 'react-native'
import { AppState } from 'react-native'
import {
  configureImageCache,
  IMAGE_DISK_CACHE_BYTES,
  IMAGE_MEMORY_CACHE_BYTES,
  IMAGE_MEMORY_CACHE_COUNT,
  installImageCacheLifecycle,
  resetImageCacheConfigurationForTests,
} from './cacheLifecycle'

describe('image cache lifecycle', () => {
  beforeEach(() => resetImageCacheConfigurationForTests())

  it('sets bounded cache limits only on iOS', () => {
    const imageCache = {
      configureCache: jest.fn(),
      clearMemoryCache: jest.fn().mockResolvedValue(true),
    }
    configureImageCache(imageCache, 'ios')
    configureImageCache(imageCache, 'ios')

    expect(imageCache.configureCache).toHaveBeenCalledTimes(1)
    expect(imageCache.configureCache).toHaveBeenCalledWith({
      maxDiskSize: IMAGE_DISK_CACHE_BYTES,
      maxMemoryCost: IMAGE_MEMORY_CACHE_BYTES,
      maxMemoryCount: IMAGE_MEMORY_CACHE_COUNT,
    })
  })

  it('clears memory when inactive, backgrounded or warned', async () => {
    const listeners = new Map<string, (state?: AppStateStatus) => void>()
    const removers: jest.Mock[] = []
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      listeners.set(type, listener as (state?: AppStateStatus) => void)
      const remove = jest.fn()
      removers.push(remove)
      return { remove } as NativeEventSubscription
    })
    const imageCache = { clearMemoryCache: jest.fn().mockResolvedValue(true) }
    const uninstall = installImageCacheLifecycle(imageCache)

    listeners.get('change')?.('active')
    listeners.get('change')?.('inactive')
    listeners.get('change')?.('background')
    listeners.get('memoryWarning')?.()
    await Promise.resolve()
    expect(imageCache.clearMemoryCache).toHaveBeenCalledTimes(3)

    uninstall()
    removers.forEach(remove => expect(remove).toHaveBeenCalledTimes(1))
  })
})
