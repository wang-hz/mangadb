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
  const query = new URLSearchParams({
    cacheRevision: revision,
    cacheUser: userUuid,
  })
  if (thumbnail) query.set('thumb', '1')
  const uri = client.url(
    `/api/file/mangas/${encodeURIComponent(mangaUuid)}/pages/${pageIndex}?${query.toString()}`,
  )
  return {
    uri,
    headers: client.authorizationHeaders(),
    cacheKey: uri,
  }
}
