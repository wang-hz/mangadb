import { fireEvent, render, screen } from '@testing-library/react-native'
import { ApiError } from '@/api/client'
import MangasScreen from '@/app/(app)/(tabs)/mangas'
import TagsScreen from '@/app/(app)/(tabs)/tags'

const mockUseInfiniteQuery = jest.fn()
const mockUseQuery = jest.fn()
const mockMangaRefetch = jest.fn()
const mockTagRefetch = jest.fn()
const mockTagTypesRefetch = jest.fn()

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (...args: unknown[]) => mockUseInfiniteQuery(...args),
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}))

jest.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: unknown) => value,
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
