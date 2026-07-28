import AsyncStorage from '@react-native-async-storage/async-storage'

const FAVORITES_KEY_PREFIX = 'mangadb.favorites.v1'
const writeQueues = new Map<string, Promise<unknown>>()

export async function listFavoriteUuids(
  serverUrl: string,
  userUuid: string,
): Promise<string[]> {
  const identity = favoriteIdentity(serverUrl, userUuid)
  await writeQueues.get(identity)?.catch(() => {})
  return readFavoriteUuids(serverUrl, userUuid)
}

async function readFavoriteUuids(
  serverUrl: string,
  userUuid: string,
): Promise<string[]> {
  const stored = await AsyncStorage.getItem(favoritesKey(serverUrl, userUuid))
  if (!stored) return []
  try {
    const value: unknown = JSON.parse(stored)
    if (!Array.isArray(value)) return []
    return [...new Set(value.filter(item => typeof item === 'string' && item.length > 0))]
      .sort()
  } catch {
    return []
  }
}

export async function setMangaFavorite(
  serverUrl: string,
  userUuid: string,
  mangaUuid: string,
  favorite: boolean,
): Promise<string[]> {
  const identity = favoriteIdentity(serverUrl, userUuid)
  const queued = (writeQueues.get(identity) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const uuids = new Set(await readFavoriteUuids(serverUrl, userUuid))
      if (favorite) uuids.add(mangaUuid)
      else uuids.delete(mangaUuid)
      const result = [...uuids].sort()
      await AsyncStorage.setItem(
        favoritesKey(serverUrl, userUuid),
        JSON.stringify(result),
      )
      return result
    })
  writeQueues.set(identity, queued)
  void queued.finally(() => {
    if (writeQueues.get(identity) === queued) writeQueues.delete(identity)
  }).catch(() => {})
  return queued
}

function favoriteIdentity(serverUrl: string, userUuid: string) {
  return `${encodeURIComponent(serverUrl)}:${encodeURIComponent(userUuid)}`
}

function favoritesKey(serverUrl: string, userUuid: string) {
  return `${FAVORITES_KEY_PREFIX}:${favoriteIdentity(serverUrl, userUuid)}`
}
