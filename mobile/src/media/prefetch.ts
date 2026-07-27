import { Image } from 'expo-image'

export interface PrefetchSource {
  uri?: string
  headers?: Record<string, string>
  cacheKey?: string
}

export type PrefetchImage = (
  uri: string,
  options: { cachePolicy: 'memory-disk'; headers?: Record<string, string> },
) => Promise<boolean>

const inFlightPrefetches = new Map<string, Promise<boolean>>()
let prefetchGeneration = 0

export function startImagePrefetchQueue(
  sources: PrefetchSource[],
  prefetchImage: PrefetchImage = (uri, options) => Image.prefetch(uri, options),
): () => void {
  let cancelled = false
  const generation = prefetchGeneration
  void (async () => {
    for (const source of sources) {
      if (cancelled || generation !== prefetchGeneration || !source.uri) break
      const key = source.cacheKey ?? source.uri
      let operation = inFlightPrefetches.get(key)
      if (!operation) {
        operation = prefetchImage(source.uri, {
          cachePolicy: 'memory-disk',
          headers: source.headers,
        }).catch(() => false)
        inFlightPrefetches.set(key, operation)
        void operation.finally(() => {
          if (inFlightPrefetches.get(key) === operation) inFlightPrefetches.delete(key)
        }).catch(() => {})
      }
      await operation
    }
  })()
  return () => { cancelled = true }
}

export async function stopImagePrefetches(): Promise<void> {
  prefetchGeneration += 1
  await Promise.allSettled([...inFlightPrefetches.values()])
}
