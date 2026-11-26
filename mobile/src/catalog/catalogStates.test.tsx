import { fireEvent, render, screen } from '@testing-library/react-native'
import { FlatList } from 'react-native'
import { ApiError } from '@/api/client'
import { getMangas } from '@/api/mangas'
import MangasScreen from '@/app/(app)/(tabs)/mangas'
import TagsScreen from '@/app/(app)/(tabs)/tags'
import type { CatalogFilters } from '@/storage/catalogFilters'

const mockUseInfiniteQuery = jest.fn()
const mockUseQuery = jest.fn()
const mockMangaRefetch = jest.fn()
const mockTagRefetch = jest.fn()
const mockTagTypesRefetch = jest.fn()
let mockSavedFilters: Partial<CatalogFilters> = {}

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (...args: unknown[]) => mockUseInfiniteQuery(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

jest.mock('@/api/mangas', () => ({
  ...jest.requireActual('@/api/mangas'),
  getMangas: jest.fn(),
}))

jest.mock('expo-image', () => ({ Image: () => null }))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => callback(),
}))

jest.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: unknown) => value,
}))

jest.mock('@/hooks/useRecentReading', () => ({
  useRecentReading: () => ({
    entries: [],
    allEntries: [],
    status: 'ready',
    error: null,
    refresh: jest.fn(),
  }),
}))

jest.mock('@/hooks/useFavorites', () => ({
  useFavorites: () => ({
    uuids: new Set(),
    refresh: jest.fn(),
    setFavorite: jest.fn(),
  }),
}))

jest.mock('@/hooks/useCatalogFilters', () => ({
  useCatalogFilters: () => {
    const React = require('react')
    const [filters, updateFilters] = React.useState({
      search: '',
      sortBy: 'updateAt',
      sortOrder: 'desc',
      tagUuids: [],
      publishYearFrom: null,
      publishYearTo: null,
      readingState: 'all',
      favoriteOnly: false,
      downloadedOnly: false,
      ...mockSavedFilters,
    })
    return { filters, loaded: true, updateFilters }
  },
}))

jest.mock('@/downloads/DownloadContext', () => ({
  useDownloadManifest: () => null,
}))

jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({
    api: { url: (path: string) => path, authorizationHeaders: () => ({}) },
    auth: { user: { uuid: 'user-1' } },
    serverUrl: 'https://example.com',
  }),
}))

describe('catalog empty and failure states', () => {
  beforeEach(() => {
    mockSavedFilters = {}
    mockUseInfiniteQuery.mockReturnValue(emptyInfiniteQuery(mockMangaRefetch))
    mockUseQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      isRefetching: false,
      refetch: mockTagTypesRefetch,
    })
  })

  it('distinguishes an empty manga library from empty search results', () => {
    render(<MangasScreen />)
    expect(screen.getByText('漫画库还是空的')).toBeTruthy()

    fireEvent.changeText(screen.getByLabelText('搜索漫画'), '不存在的标题')
    expect(screen.getByText('没有匹配的漫画')).toBeTruthy()
  })

  it('retries an initial manga library failure', () => {
    mockUseInfiniteQuery.mockReturnValue({
      ...emptyInfiniteQuery(mockMangaRefetch),
      error: new ApiError('请求超时，请检查服务器连接', 0),
    })
    render(<MangasScreen />)

    expect(screen.getByText('漫画加载失败')).toBeTruthy()
    fireEvent.press(screen.getByText('重试'))
    expect(mockMangaRefetch).toHaveBeenCalledTimes(1)
  })

  it('distinguishes an empty tag library from empty filtered results', () => {
    mockUseInfiniteQuery.mockReturnValue(emptyInfiniteQuery(mockTagRefetch))
    render(<TagsScreen />)
    expect(screen.getByText('服务器中还没有标签')).toBeTruthy()

    fireEvent.changeText(screen.getByLabelText('搜索标签'), '不存在的标签')
    expect(screen.getByText('没有匹配的标签')).toBeTruthy()
  })

  it('retries an initial tag list failure', () => {
    mockUseInfiniteQuery.mockReturnValue({
      ...emptyInfiniteQuery(mockTagRefetch),
      error: new ApiError('无法连接服务器，请检查地址和网络', 0),
    })
    render(<TagsScreen />)

    expect(screen.getByText('标签加载失败')).toBeTruthy()
    fireEvent.press(screen.getByText('重试'))
    expect(mockTagRefetch).toHaveBeenCalledTimes(1)
  })

  it('ignores saved server and local filters while keeping all returned mangas visible', async () => {
    mockSavedFilters = {
      tagUuids: ['old-tag'],
      publishYearFrom: 2000,
      publishYearTo: 2010,
      readingState: 'completed',
      favoriteOnly: true,
      downloadedOnly: true,
    }
    const manga = { uuid: 'm1', displayTitle: '保留的漫画', originalTitle: 'Test',
      cover: 0, publishDate: null, createAt: '', updateAt: '' }
    mockUseInfiniteQuery.mockReturnValue({
      ...emptyInfiniteQuery(mockMangaRefetch),
      data: { pages: [{ items: [manga], total: 1, page: 1, limit: 24 }] },
    })
    const view = render(<MangasScreen />)

    expect(screen.queryByRole('button', { name: /筛选/ })).toBeNull()
    expect(screen.getByText('保留的漫画')).toBeOnTheScreen()
    expect(view.UNSAFE_getByType(FlatList).props.data).toEqual([manga])
    const options = mockUseInfiniteQuery.mock.calls.at(-1)![0]
    expect(options.queryKey.at(-1)).toEqual({ search: '', sortBy: 'updateAt', sortOrder: 'desc' })
    const signal = new AbortController().signal
    await options.queryFn({ pageParam: 1, signal })
    expect(getMangas).toHaveBeenLastCalledWith(expect.anything(), {
      page: 1, search: '', sortBy: 'updateAt', sortOrder: 'desc',
    }, signal)
  })

  it('retains saved search and sort and keeps sort controls working', () => {
    mockSavedFilters = { search: '科幻', sortBy: 'publishDate', sortOrder: 'asc' }
    render(<MangasScreen />)

    expect(screen.getByLabelText('搜索漫画').props.value).toBe('科幻')
    expect(screen.getByRole('button', { name: '出版日期' })).toBeSelected()
    expect(screen.getByText('升序')).toBeOnTheScreen()
    fireEvent.press(screen.getByText('最近添加'))
    fireEvent.press(screen.getByText('升序'))
    expect(mockUseInfiniteQuery.mock.calls.at(-1)![0].queryKey.at(-1))
      .toEqual({ search: '科幻', sortBy: 'createAt', sortOrder: 'desc' })
  })
})

function emptyInfiniteQuery(refetch: jest.Mock) {
  return {
    data: { pages: [{ items: [], total: 0, page: 1, limit: 20 }] },
    error: null,
    isPending: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isRefetching: false,
    hasNextPage: false,
    refetch,
    fetchNextPage: jest.fn(),
  }
}
