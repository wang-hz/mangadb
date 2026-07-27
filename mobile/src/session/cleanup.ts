import type { QueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { stopImagePrefetches } from '@/media/prefetch'

interface ImageCache {
  clearMemoryCache: () => Promise<boolean>
  clearDiskCache: () => Promise<boolean>
}

export async function clearSessionCaches(
  queryClient: Pick<QueryClient, 'clear'>,
  imageCache: ImageCache = Image,
  stopPrefetch: () => Promise<void> = stopImagePrefetches,
): Promise<boolean> {
  let prefetchStopped = true
  try {
    await stopPrefetch()
  } catch {
    prefetchStopped = false
  }

  let queryCacheCleared = true
  try {
    queryClient.clear()
  } catch {
    queryCacheCleared = false
  }

  const results = await Promise.allSettled([
    Promise.resolve().then(() => imageCache.clearMemoryCache()),
    Promise.resolve().then(() => imageCache.clearDiskCache()),
  ])
  return prefetchStopped && queryCacheCleared && results.every(result =>
    result.status === 'fulfilled' && result.value)
}
