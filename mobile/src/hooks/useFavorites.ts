import { useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { listFavoriteUuids, setMangaFavorite } from '@/storage/favorites'

export function useFavorites(
  serverUrl: string | null,
  userUuid: string | undefined,
) {
  const requestIdRef = useRef(0)
  const [uuids, setUuids] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    if (!serverUrl || !userUuid) {
      setUuids(new Set())
      return
    }
    const restored = await listFavoriteUuids(serverUrl, userUuid)
    if (requestIdRef.current === requestId) setUuids(new Set(restored))
  }, [serverUrl, userUuid])

  useFocusEffect(useCallback(() => {
    void refresh().catch(() => {})
  }, [refresh]))

  const setFavorite = useCallback(async (mangaUuid: string, favorite: boolean) => {
    if (!serverUrl || !userUuid) return
    setUuids(current => {
      const next = new Set(current)
      if (favorite) next.add(mangaUuid)
      else next.delete(mangaUuid)
      return next
    })
    try {
      const saved = await setMangaFavorite(serverUrl, userUuid, mangaUuid, favorite)
      setUuids(new Set(saved))
    } catch (error) {
      await refresh()
      throw error
    }
  }, [refresh, serverUrl, userUuid])

  return { uuids, refresh, setFavorite }
}
