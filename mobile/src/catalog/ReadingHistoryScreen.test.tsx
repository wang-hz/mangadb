import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { FlatList } from 'react-native'
import { router } from 'expo-router'
import ReadingHistoryScreen from '@/app/(app)/(tabs)/settings/history'
import { useRecentReading } from '@/hooks/useRecentReading'
import { useSession } from '@/session/SessionContext'
import type { RecentReadingEntry } from '@/storage/progress'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@/hooks/useRecentReading', () => ({ useRecentReading: jest.fn() }))
jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }))
jest.mock('expo-image', () => ({ Image: () => null }))

const entry: RecentReadingEntry = {
  manga: { uuid: 'm1', displayTitle: '历史测试', originalTitle: 'Test', publishDate: null,
    cover: 0, createAt: '', updateAt: '' },
  pageCount: 20, pageIndex: 4, mode: 'scroll', state: 'reading',
  hiddenFromRecent: false, updatedAt: '2026-09-01T00:00:00.000Z',
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

it.each(['reading', 'completed'] as const)('opens a %s record without overriding the restored reading position', state => {
  jest.mocked(useRecentReading)(null, undefined).entries = [{ ...entry, state }]
  render(<ReadingHistoryScreen />)
  fireEvent.press(screen.getByLabelText('继续阅读 历史测试'))
  expect(router.push).toHaveBeenCalledWith({ pathname: '/(app)/reader/[uuid]',
    params: { uuid: 'm1', title: '历史测试' } })
  expect(useRecentReading).toHaveBeenCalledWith('https://example.com', 'u1')
})

it('shows reading and completed records newest first while excluding hidden records', () => {
  const result = jest.mocked(useRecentReading)(null, undefined)
  result.entries = [
    entry,
    { ...entry, manga: { ...entry.manga, uuid: 'hidden' }, hiddenFromRecent: true,
      updatedAt: '2026-09-03T00:00:00.000Z' },
    { ...entry, manga: { ...entry.manga, uuid: 'completed' }, state: 'completed',
      updatedAt: '2026-09-02T00:00:00.000Z' },
  ]
  const view = render(<ReadingHistoryScreen />)
  expect(view.UNSAFE_getByType(FlatList).props.data.map((record: RecentReadingEntry) => record.manga.uuid))
    .toEqual(['completed', 'm1'])
  expect(screen.getByText('已完成')).toBeOnTheScreen()
})

it('keeps the latest one hundred records', () => {
  const result = jest.mocked(useRecentReading)(null, undefined)
  result.entries = Array.from({ length: 105 }, (_, index) => ({
    ...entry,
    manga: { ...entry.manga, uuid: String(index) },
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }))
  const view = render(<ReadingHistoryScreen />)
  const records: RecentReadingEntry[] = view.UNSAFE_getByType(FlatList).props.data
  expect(records).toHaveLength(100)
  expect(records[0]?.manga.uuid).toBe('104')
  expect(records[99]?.manga.uuid).toBe('5')
})

it('shows loading and empty states and retries a local read failure', () => {
  const result = jest.mocked(useRecentReading)(null, undefined)
  result.status = 'loading'
  const view = render(<ReadingHistoryScreen />)
  expect(screen.getByText('正在读取阅读记录')).toBeOnTheScreen()
  result.status = 'ready'
  result.entries = []
  view.rerender(<ReadingHistoryScreen />)
  expect(screen.getByText('暂无阅读历史')).toBeOnTheScreen()
  result.status = 'error'
  result.error = '读取失败'
  view.rerender(<ReadingHistoryScreen />)
  expect(screen.getByRole('alert')).toHaveTextContent('读取失败')
  fireEvent.press(screen.getByText('重试'))
  expect(result.refresh).toHaveBeenCalledTimes(1)
})

it('refreshes records when pulled down', async () => {
  const result = jest.mocked(useRecentReading)(null, undefined)
  let finishRefresh!: () => void
  jest.mocked(result.refresh).mockReturnValue(new Promise(resolve => { finishRefresh = resolve }))
  const view = render(<ReadingHistoryScreen />)
  fireEvent(view.UNSAFE_getByType(FlatList), 'refresh')
  expect(result.refresh).toHaveBeenCalledTimes(1)
  expect(view.UNSAFE_getByType(FlatList).props.refreshing).toBe(true)
  await act(async () => { finishRefresh() })
  expect(view.UNSAFE_getByType(FlatList).props.refreshing).toBe(false)
})
