import AsyncStorage from '@react-native-async-storage/async-storage'
import { createProgressSyncStore, listRecentReading, loadReadingProgress, markMangaUnread, removeFromRecentReading, saveReadingProgress } from './progress'
import type { RemoteProgress } from '@/sync/protocol'

const manga = { uuid: 'manga', displayTitle: 'Manga', originalTitle: 'Manga', cover: 0, publishDate: null, createAt: '2026-01-01T00:00:00.000Z', updateAt: '2026-01-01T00:00:00.000Z' }
let values: Map<string, string>
beforeEach(() => {
  values = new Map()
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => values.get(key) ?? null)
  jest.mocked(AsyncStorage.getAllKeys).mockImplementation(async () => [...values.keys()])
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => { values.set(key, value) })
  jest.mocked(AsyncStorage.multiSet).mockImplementation(async pairs => { for (const [key, value] of pairs) values.set(key, value) })
})

it('persists deletion and hidden-recent operations alongside local progress', async () => {
  const store = createProgressSyncStore('server', 'user')
  await saveReadingProgress('server', 'user', 'manga', 10, 4, 'paged', manga)
  await removeFromRecentReading('server', 'user', 'manga')
  expect((await store.pending())[0]?.hiddenFromRecent).toBe(true)
  await markMangaUnread('server', 'user', 'manga')
  expect((await createProgressSyncStore('server', 'user').pending())[0]?.deleted).toBe(true)
  expect(await loadReadingProgress('server', 'user', 'manga', 10)).toBeNull()
  expect(await listRecentReading('server', 'user')).toEqual([])
})

it('does not clear an edit made while an older operation is uploading', async () => {
  const store = createProgressSyncStore('server', 'user')
  await store.calibrate(new Date().toISOString())
  await saveReadingProgress('server', 'user', 'manga', 10, 2, 'paged', manga)
  const sent = await store.pending()
  await saveReadingProgress('server', 'user', 'manga', 10, 6, 'scroll', manga)
  const response: RemoteProgress = { ...sent[0]!, manga, pageCount: 10 }
  await store.apply([response], sent)
  expect((await store.pending())[0]?.pageIndex).toBe(6)
  expect(await loadReadingProgress('server', 'user', 'manga', 10)).toMatchObject({ pageIndex: 6 })
})

it('imports old standalone keys once using their original operation timestamp', async () => {
  const updatedAt = '2026-01-01T00:00:00.000Z'
  values.set('mangadb.readingProgress.v1:server:user:manga', JSON.stringify({ pageIndex: 4, mode: 'paged', state: 'reading', updatedAt }))
  const store = createProgressSyncStore('server', 'user')
  await store.prepare()
  await store.calibrate(new Date().toISOString())
  const sent = await store.pending()
  expect(sent[0]?.updatedAt).toBe(updatedAt)
  await store.apply([{ ...sent[0]!, manga, pageCount: 10 }], sent)
  await store.prepare()
  expect(await store.pending()).toEqual([])
  expect(await listRecentReading('server', 'user')).toHaveLength(1)
  expect(await createProgressSyncStore('server', 'other').pending()).toEqual([])
})
