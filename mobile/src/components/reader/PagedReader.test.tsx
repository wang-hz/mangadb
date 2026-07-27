import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { FlatList } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { DEFAULT_READER_PREFERENCES } from '@/storage/readerPreferences'
import { PagedReader } from './PagedReader'

jest.mock('expo-image', () => ({
  Image: ({ contentFit, onError }: { contentFit: string; onError: () => void }) => {
    const { View } = require('react-native')
    return <View accessibilityLabel={`页面图片-${contentFit}`} onError={onError} />
  },
}))

jest.mock('@/components/reader/ReaderSettingsModal', () => ({
  ReaderSettingsModal: () => null,
}))

const manga: MangaDetail = {
  uuid: 'manga-1',
  displayTitle: '测试漫画',
  originalTitle: '测试漫画',
  fullname: 'test-manga',
  publishDate: null,
  cover: 0,
  createAt: '2026-07-19T00:00:00.000Z',
  updateAt: '2026-07-19T00:00:00.000Z',
  pages: ['0.jpg', '1.jpg', '2.jpg', '3.jpg'],
  mangaTags: [],
}

function renderReader(
  preferencePatch: Partial<typeof DEFAULT_READER_PREFERENCES> = {},
  onPageChange = jest.fn(),
) {
  return {
    onPageChange,
    view: render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <PagedReader
          api={{
            authorizationHeaders: () => ({ Authorization: 'Bearer token' }),
            url: (path: string) => `https://example.com${path}`,
          } as unknown as ApiClient}
          manga={manga}
          mode="paged"
          onBack={jest.fn()}
          onModeChange={jest.fn()}
          onOpenSettings={jest.fn()}
          onPageChange={onPageChange}
          pageIndex={1}
          preferences={{ ...DEFAULT_READER_PREFERENCES, ...preferencePatch }}
          settingsVisible={false}
          serverUrl="https://example.com"
          userUuid="user-1"
        />
      </SafeAreaProvider>,
    ),
  }
}

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

describe('PagedReader preferences', () => {
  it('reverses display order while preserving logical page indices in RTL mode', () => {
    const { onPageChange, view } = renderReader({ pagedDirection: 'rtl' })
    const list = view.UNSAFE_getByType(FlatList)
    expect(list.props.data).toEqual([3, 2, 1, 0])
    expect(list.props.initialScrollIndex).toBe(2)

    const width = list.props.getItemLayout(null, 0).length
    act(() => {
      list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: width } } })
    })
    expect(onPageChange).toHaveBeenCalledWith(2)
    expect(screen.getAllByLabelText('页面图片-contain').length).toBeGreaterThan(0)
  })

  it('passes cover fitting to page images', () => {
    renderReader({ pagedFit: 'cover' })
    expect(screen.getAllByLabelText('页面图片-cover').length).toBeGreaterThan(0)
  })

  it('retries a failed page locally', () => {
    renderReader()
    fireEvent(screen.getAllByLabelText('页面图片-contain')[0], 'error')

    const retry = screen.getByText('点击重试')
    expect(retry).toBeOnTheScreen()
    fireEvent.press(retry, { stopPropagation: jest.fn() })
    expect(screen.getAllByLabelText('页面图片-contain').length).toBeGreaterThan(0)
  })

  it.each([3000, 5000] as const)('hides controls after %i ms', timeout => {
    jest.useFakeTimers()
    const { view } = renderReader({ controlsAutoHideMs: timeout })
    expect(screen.getByLabelText('退出阅读器')).toBeOnTheScreen()

    act(() => { jest.advanceTimersByTime(timeout - 1) })
    expect(screen.getByLabelText('退出阅读器')).toBeOnTheScreen()
    act(() => { jest.advanceTimersByTime(1) })
    expect(screen.queryByLabelText('退出阅读器')).toBeNull()
    view.unmount()
    jest.useRealTimers()
  })

  it('keeps controls visible when automatic hiding is disabled', () => {
    jest.useFakeTimers()
    const { view } = renderReader({ controlsAutoHideMs: null })
    act(() => { jest.advanceTimersByTime(30_000) })
    expect(screen.getByLabelText('退出阅读器')).toBeOnTheScreen()
    view.unmount()
    jest.useRealTimers()
  })
})
