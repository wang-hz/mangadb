import { Image } from 'expo-image'
import { AppState, Platform } from 'react-native'

export const IMAGE_MEMORY_CACHE_BYTES = 64 * 1024 * 1024
export const IMAGE_MEMORY_CACHE_COUNT = 24
export const IMAGE_DISK_CACHE_BYTES = 512 * 1024 * 1024

interface ManagedImageCache {
  configureCache: (config: {
    maxDiskSize: number
    maxMemoryCost: number
    maxMemoryCount: number
  }) => void
  clearMemoryCache: () => Promise<boolean>
}

let configured = false

export function configureImageCache(
  imageCache: ManagedImageCache = Image,
  platform = Platform.OS,
): void {
  if (configured || platform !== 'ios') return
  try {
    imageCache.configureCache({
      maxDiskSize: IMAGE_DISK_CACHE_BYTES,
      maxMemoryCost: IMAGE_MEMORY_CACHE_BYTES,
      maxMemoryCount: IMAGE_MEMORY_CACHE_COUNT,
    })
    configured = true
  } catch {}
}

export function installImageCacheLifecycle(
  imageCache: Pick<ManagedImageCache, 'clearMemoryCache'> = Image,
): () => void {
  const clearMemory = () => {
    void imageCache.clearMemoryCache().catch(() => false)
  }
  const appStateSubscription = AppState.addEventListener('change', state => {
    if (state !== 'active') clearMemory()
  })
  const memorySubscription = AppState.addEventListener('memoryWarning', clearMemory)
  return () => {
    appStateSubscription.remove()
    memorySubscription.remove()
  }
}

export function resetImageCacheConfigurationForTests(): void {
  configured = false
}
