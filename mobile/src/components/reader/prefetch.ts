import { useEffect, useSyncExternalStore } from 'react'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { mangaPageImageSource } from '@/media/images'
import { startImagePrefetchQueue } from '@/media/prefetch'
import {
  getNativeNetworkSnapshot,
  subscribeNativeNetwork,
} from '@/query/nativeState'
import type { ReaderMode, ReaderPageDirection } from '@/utils/reader'

interface ReaderPrefetchOptions {
  manga: MangaDetail
  api: ApiClient
  serverUrl: string
  userUuid: string
  pageIndex: number
  mode: ReaderMode
  direction?: ReaderPageDirection
}

export function useReaderPagePrefetch({
  manga,
  api,
  serverUrl,
  userUuid,
  pageIndex,
  mode,
  direction,
}: ReaderPrefetchOptions): void {
  const network = useSyncExternalStore(
    subscribeNativeNetwork,
    getNativeNetworkSnapshot,
    getNativeNetworkSnapshot,
  )

  useEffect(() => {
    const indexes = readerPrefetchIndexes(
      pageIndex,
      manga.pages.length,
      mode,
      network.isConnected,
      network.isConstrained,
    )
    const sources = indexes.map(index => mangaPageImageSource(
      api,
      serverUrl,
      userUuid,
      manga.uuid,
      index,
      manga.updateAt,
    ))
    return startImagePrefetchQueue(sources)
  }, [
    api,
    direction,
    manga.pages.length,
    manga.updateAt,
    manga.uuid,
    mode,
    network.isConnected,
    network.isConstrained,
    pageIndex,
    serverUrl,
    userUuid,
  ])
}

export function readerPrefetchIndexes(
  pageIndex: number,
  pageCount: number,
  mode: ReaderMode,
  isConnected: boolean,
  isConstrained: boolean,
): number[] {
  if (!isConnected || pageCount <= 1) return []
  const forwardCount = isConstrained ? 1 : 3
  const indexes: number[] = []
  for (let offset = 1; offset <= forwardCount; offset += 1) {
    const index = pageIndex + offset
    if (index < pageCount) indexes.push(index)
  }
  if (mode === 'paged' && !isConstrained && pageIndex > 0) indexes.push(pageIndex - 1)
  return indexes
}
