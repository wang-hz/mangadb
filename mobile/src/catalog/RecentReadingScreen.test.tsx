import { fireEvent, render, screen } from '@testing-library/react-native'
import { FlatList } from 'react-native'
import { router } from 'expo-router'
import RecentReadingScreen from '@/app/(app)/(tabs)/recent'
import { useRecentReading } from '@/hooks/useRecentReading'
import { useSession } from '@/session/SessionContext'
import type { RecentReadingEntry } from '@/storage/progress'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@/hooks/useRecentReading', () => ({ useRecentReading: jest.fn() }))
jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }))
jest.mock('expo-image', () => ({ Image: () => null }))

const entry: RecentReadingEntry = {
  manga: { uuid: 'm1', displayTitle: '继续测试', originalTitle: 'Test', publishDate: null,
    cover: 0, createAt: '', updateAt: '' },
  pageCount: 20, pageIndex: 4, mode: 'scroll', state: 'reading',
  hiddenFromRecent: false, updatedAt: '2026-09-01',
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useSession).mockReturnValue({
    api: { url: jest.fn(), authorizationHeaders: jest.fn() },
    serverUrl: 'https://example.com', auth: { user: { uuid: 'u1' } },
  } as unknown as ReturnType<typeof useSession>)
  jest.mocked(useRecentReading).mockReturnValue({
    entries: [entry], allEntries: [], status: 'ready', error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
  })
})

it('continues directly with the saved page and mode', () => {
  render(<RecentReadingScreen />)
  fireEvent.press(screen.getByLabelText('继续阅读 继续测试'))
  expect(router.push).toHaveBeenCalledWith({ pathname: '/(app)/reader/[uuid]',
    params: { uuid: 'm1', title: '继续测试', page: '4', mode: 'scroll' } })
  expect(useRecentReading).toHaveBeenCalledWith('https://example.com', 'u1')
})

it('keeps more than ten records and filters completed and hidden entries', () => {
  const result = jest.mocked(useRecentReading)(null, undefined)
  result.entries = Array.from({ length: 12 }, (_, i) => ({ ...entry, manga: { ...entry.manga, uuid: String(i) } }))
  result.entries.push({ ...entry, state: 'completed' }, { ...entry, hiddenFromRecent: true })
  const view = render(<RecentReadingScreen />)
  expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(12)
})

it('shows an empty state and retries failures', () => {
  const result = jest.mocked(useRecentReading)(null, undefined)
  result.entries = []
  const view = render(<RecentReadingScreen />)
  expect(screen.getByText('暂无继续阅读的漫画')).toBeOnTheScreen()
  result.status = 'error'
  result.error = '读取失败'
  view.rerender(<RecentReadingScreen />)
  fireEvent.press(screen.getByText('重试'))
  expect(result.refresh).toHaveBeenCalledTimes(1)
})
