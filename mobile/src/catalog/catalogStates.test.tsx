import { fireEvent, render, screen } from '@testing-library/react-native'
import { ApiError } from '@/api/client'
import MangasScreen, { mergeSelectedTags } from '@/app/(app)/(tabs)/mangas'
import TagsScreen from '@/app/(app)/(tabs)/tags'

const mockUseInfiniteQuery = jest.fn()
const mockUseQuery = jest.fn()
const mockUseQueries = jest.fn()
const mockMangaRefetch = jest.fn()
const mockTagRefetch = jest.fn()
const mockTagTypesRefetch = jest.fn()
let mockCatalogTagUuids: string[] = []

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (...args: unknown[]) => mockUseInfiniteQuery(...args),
  useQueries: (...args: unknown[]) => mockUseQueries(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

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
      tagUuids: mockCatalogTagUuids,
      publishYearFrom: null,
      publishYearTo: null,
      readingState: 'all',
      favoriteOnly: false,
      downloadedOnly: false,
    })
    return { filters, loaded: true, updateFilters }
  },
}))

jest.mock('@/downloads/DownloadContext', () => ({
  useDownloadedMangaUuids: () => new Set(),
  useDownloads: () => ({
    snapshot: { manifests: [] },
  }),
}))

jest.mock('@/components/catalog/CatalogFilterSheet', () => ({
  CatalogFilterSheet: ({ visible, tags, filters, onApply }: {
    visible: boolean
    tags: Array<{ uuid: string; name: string }>
    filters: { tagUuids: string[] }
    onApply: (filters: { tagUuids: string[] }) => void
  }) => {
    if (!visible) return null
    const React = require('react')
    const { Pressable, Text, View } = require('react-native')
    return React.createElement(
      View,
      null,
      ...tags.map(tag => React.createElement(
        Pressable,
        {
          accessibilityLabel: `筛选标签 ${tag.uuid}`,
          key: tag.uuid,
          onPress: () => onApply({
            ...filters,
            tagUuids: filters.tagUuids.filter(uuid => uuid !== tag.uuid),
          }),
        },
        React.createElement(Text, null, tag.name),
      )),
    )
  },
}))

jest.mock('@/session/SessionContext', () => ({
  useSession: () => ({
    api: {},
    auth: { user: { uuid: 'user-1' } },
    serverUrl: 'https://example.com',
  }),
}))

describe('catalog empty and failure states', () => {
  beforeEach(() => {
    mockCatalogTagUuids = []
    mockUseQueries.mockReturnValue([])
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

  it('keeps fetched selected tags ahead of and deduplicated from search pages', () => {
    const selected = {
      uuid: 'selected',
      name: '已选标签',
      createAt: '2026-08-20T00:00:00.000Z',
      updateAt: '2026-08-20T00:00:00.000Z',
      tagType: { uuid: 'type', name: '题材' },
    }
    const searched = {
      ...selected,
      uuid: 'searched',
      name: '搜索结果',
    }

    expect(mergeSelectedTags(
      ['selected'],
      [selected],
      [searched, { ...selected, name: '分页中的旧值' }],
    )).toEqual([selected, searched])
  })

  it('fetches a selected tag missing from search pages and lets the sheet remove it', () => {
    const selected = {
      uuid: 'selected',
      name: '已选标签',
      createAt: '2026-08-20T00:00:00.000Z',
      updateAt: '2026-08-20T00:00:00.000Z',
      tagType: { uuid: 'type', name: '题材' },
    }
    mockCatalogTagUuids = [selected.uuid]
    mockUseQueries.mockReturnValue([{
      data: selected,
      error: null,
      refetch: jest.fn(),
    }])

    render(<MangasScreen />)
    fireEvent.press(screen.getByLabelText('筛选，已启用 1 项'))

    expect(screen.getByLabelText('筛选标签 selected')).toBeOnTheScreen()
    expect(mockUseQueries.mock.calls.some(([options]) =>
      options.queries[0]?.queryKey.at(-1) === 'selected' &&
      options.queries[0]?.enabled === true)).toBe(true)
    fireEvent.press(screen.getByLabelText('筛选标签 selected'))
    expect(screen.queryByLabelText('筛选标签 selected')).toBeNull()
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
