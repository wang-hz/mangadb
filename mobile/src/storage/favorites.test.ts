import AsyncStorage from '@react-native-async-storage/async-storage'
import { listFavoriteUuids, setMangaFavorite } from './favorites'

describe('favorites storage', () => {
  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
  })

  it('keeps favorites isolated by server and user identity', async () => {
    await setMangaFavorite('https://one.example', 'user-1', 'manga-1', true)

    const [key, value] = jest.mocked(AsyncStorage.setItem).mock.calls[0]
    expect(key).toContain(encodeURIComponent('https://one.example'))
    expect(key).toContain('user-1')
    expect(JSON.parse(value)).toEqual(['manga-1'])
  })

  it('deduplicates valid restored identifiers and ignores malformed storage', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify(['manga-2', '', 'manga-1', 'manga-2', 4]),
    )
    await expect(listFavoriteUuids('https://example.com', 'user-1'))
      .resolves.toEqual(['manga-1', 'manga-2'])

    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{broken')
    await expect(listFavoriteUuids('https://example.com', 'user-1'))
      .resolves.toEqual([])
  })

  it('serializes toggle writes for one identity', async () => {
    jest.mocked(AsyncStorage.getItem)
      .mockResolvedValueOnce(JSON.stringify([]))
      .mockResolvedValueOnce(JSON.stringify(['manga-1']))

    const add = setMangaFavorite('https://example.com', 'user-1', 'manga-1', true)
    const remove = setMangaFavorite('https://example.com', 'user-1', 'manga-1', false)

    await expect(add).resolves.toEqual(['manga-1'])
    await expect(remove).resolves.toEqual([])
  })
})
