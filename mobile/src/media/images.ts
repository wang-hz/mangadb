import type { ImageSource } from 'expo-image'
import type { ApiClient } from '@/api/client'

export function mangaPageImageSource(
  client: ApiClient,
  serverUrl: string,
  userUuid: string,
  mangaUuid: string,
  pageIndex: number,
  revision: string,
  thumbnail = false,
): ImageSource {
  const suffix = thumbnail ? '?thumb=1' : ''
  return {
    uri: client.url(`/api/file/mangas/${encodeURIComponent(mangaUuid)}/pages/${pageIndex}${suffix}`),
    headers: client.authorizationHeaders(),
    cacheKey: [
      'mangadb',
      encodeURIComponent(serverUrl),
      encodeURIComponent(userUuid),
      encodeURIComponent(mangaUuid),
      pageIndex,
      thumbnail ? 'thumbnail' : 'page',
      encodeURIComponent(revision),
    ].join(':'),
  }
}
