import type { QueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'

interface ImageCache {
  clearMemoryCache: () => Promise<boolean>
  clearDiskCache: () => Promise<boolean>
}

export async function clearSessionCaches(
  queryClient: Pick<QueryClient, 'clear'>,
  imageCache: ImageCache = Image,
): Promise<boolean> {
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
  return queryCacheCleared && results.every(result =>
    result.status === 'fulfilled' && result.value)
}
