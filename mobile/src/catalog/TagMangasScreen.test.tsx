import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FlatList } from 'react-native'
import { router } from 'expo-router'
import { getMangasByTag, getTag } from '@/api/tags'
import type { MangaSummary } from '@/api/types'
import TagMangasScreen from '@/app/(app)/tag/[uuid]'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ uuid: 't1', name: '测试标签' }),
}))
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default)
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('@/api/tags', () => ({ getMangasByTag: jest.fn(), getTag: jest.fn() }))
jest.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: (value: string) => value }))
jest.mock('@/hooks/useRecentReading', () => ({ useRecentReading: () => ({ allEntries: [] }) }))
jest.mock('@/downloads/DownloadContext', () => ({ useDownloadManifest: () => null }))
jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({
    api: { url: (path: string) => path, authorizationHeaders: () => ({}) },
    auth: { user: { uuid: 'u1' } },
    serverUrl: 'https://example.com',
  }),
}))

const clients: QueryClient[] = []

beforeEach(() => {
  jest.mocked(getTag).mockResolvedValue({
    uuid: 't1', name: '测试标签', createAt: '', updateAt: '',
    tagType: { uuid: 'type1', name: '题材' },
  })
  jest.mocked(getMangasByTag).mockImplementation(async (_api, params) => ({
    items: [manga(`${params.sortBy}-${params.sortOrder}-${params.page}`)],
    total: 2, page: params.page, limit: 1,
  }))
})

afterEach(() => {
  clients.splice(0).forEach(client => client.clear())
})

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  clients.push(client)
  return render(<QueryClientProvider client={client}><TagMangasScreen /></QueryClientProvider>)
}

function manga(uuid: string): MangaSummary {
  return { uuid, displayTitle: uuid, originalTitle: uuid, cover: 0,
    publishDate: null, createAt: '', updateAt: '' }
}

it('offers the library sort choices and applies both directions while retaining title search', async () => {
  renderScreen()
  await screen.findByText('updateAt-desc-1')
  expect(screen.getByRole('button', { name: '最近更新' })).toBeSelected()
  expect(screen.getByRole('button', { name: '降序' })).toBeOnTheScreen()

  fireEvent.changeText(screen.getByLabelText('搜索标签下的漫画'), ' 科幻 ')
  await waitFor(() => expect(getMangasByTag).toHaveBeenLastCalledWith(
    expect.anything(), { tagUuid: 't1', page: 1, search: '科幻', sortBy: 'updateAt', sortOrder: 'desc' },
    expect.anything(),
  ))
  for (const [label, sortBy] of [['最近添加', 'createAt'], ['出版日期', 'publishDate'], ['最近更新', 'updateAt']]) {
    fireEvent.press(screen.getByRole('button', { name: label }))
    await screen.findByText(`${sortBy}-desc-1`)
    expect(screen.getByRole('button', { name: label })).toBeSelected()
    fireEvent.press(screen.getByRole('button', { name: '降序' }))
    await screen.findByText(`${sortBy}-asc-1`)
    expect(getMangasByTag).toHaveBeenLastCalledWith(expect.anything(), {
      tagUuid: 't1', page: 1, search: '科幻', sortBy, sortOrder: 'asc',
    }, expect.anything())
    fireEvent.press(screen.getByRole('button', { name: '升序' }))
    await screen.findByText(`${sortBy}-desc-1`)
  }
})

it('loads subsequent pages with the selected sort and starts a separate list when sorting changes', async () => {
  const view = renderScreen()
  await screen.findByText('updateAt-desc-1')
  fireEvent(view.UNSAFE_getByType(FlatList), 'endReached')
  await screen.findByText('updateAt-desc-2')
  expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(2)

  fireEvent.press(screen.getByRole('button', { name: '出版日期' }))
  await screen.findByText('publishDate-desc-1')
  expect(screen.queryByText('updateAt-desc-2')).toBeNull()
  expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(1)
  fireEvent(view.UNSAFE_getByType(FlatList), 'endReached')
  await screen.findByText('publishDate-desc-2')
  expect(getMangasByTag).toHaveBeenLastCalledWith(expect.anything(), {
    tagUuid: 't1', page: 2, search: '', sortBy: 'publishDate', sortOrder: 'desc',
  }, expect.anything())
})

it('keeps sorting when opening a manga and defaults again on a new tag screen visit', async () => {
  const view = renderScreen()
  await screen.findByText('updateAt-desc-1')
  fireEvent.press(screen.getByRole('button', { name: '出版日期' }))
  await screen.findByText('publishDate-desc-1')
  fireEvent.press(screen.getByRole('button', { name: '降序' }))
  await screen.findByText('publishDate-asc-1')
  fireEvent.press(screen.getByText('publishDate-asc-1'))
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/(app)/manga/[uuid]', params: { uuid: 'publishDate-asc-1' },
  })
  expect(screen.getByRole('button', { name: '出版日期' })).toBeSelected()
  expect(screen.getByRole('button', { name: '升序' })).toBeOnTheScreen()

  view.unmount()
  renderScreen()
  await screen.findByText('updateAt-desc-1')
  expect(screen.getByRole('button', { name: '最近更新' })).toBeSelected()
  expect(screen.getByRole('button', { name: '降序' })).toBeOnTheScreen()
})

it('retains the chosen sort when refreshing the tag list', async () => {
  const view = renderScreen()
  await screen.findByText('updateAt-desc-1')
  fireEvent.press(screen.getByRole('button', { name: '最近添加' }))
  await screen.findByText('createAt-desc-1')
  jest.mocked(getMangasByTag).mockClear()
  await act(async () => {
    view.UNSAFE_getByType(FlatList).props.refreshControl.props.onRefresh()
  })
  expect(getMangasByTag).toHaveBeenLastCalledWith(expect.anything(), {
    tagUuid: 't1', page: 1, search: '', sortBy: 'createAt', sortOrder: 'desc',
  }, expect.anything())
})
