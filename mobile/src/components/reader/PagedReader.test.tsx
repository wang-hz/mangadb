import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Image } from 'expo-image'
import { FlatList } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { setReaderTelemetryReporter } from '@/components/reader/telemetry'
import { DEFAULT_READER_PREFERENCES } from '@/storage/readerPreferences'
import { PagedReader } from './PagedReader'

jest.mock('expo-image', () => ({
  Image: Object.assign(({
    contentFit,
    onError,
    onLoad,
    source,
  }: {
    contentFit: string
    onError: () => void
    onLoad: () => void
    source: { uri?: string }
  }) => {
    const { View } = require('react-native')
    const pageIndex = source.uri?.match(/\/pages\/(\d+)/)?.[1]
    return (
      <View
        accessibilityLabel={`页面图片-${contentFit}`}
        onError={onError}
        onLoad={onLoad}
        testID={source.uri?.startsWith('file:')
          ? `local-page-${source.uri}`
          : `page-image-${pageIndex}`}
      />
    )
  }, { prefetch: jest.fn().mockResolvedValue(true) }),
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
  onRefreshMetadata = jest.fn().mockResolvedValue(undefined),
  localPageUris?: readonly string[],
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
          completed={false}
          manga={manga}
          localPageUris={localPageUris}
          mode="paged"
          onBack={jest.fn()}
          onModeChange={jest.fn()}
          onMarkCompleted={jest.fn().mockResolvedValue(undefined)}
          onOpenSettings={jest.fn()}
          onPageChange={onPageChange}
          onRefreshMetadata={onRefreshMetadata}
          onReturnToDetail={jest.fn()}
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

  it('prefetches logical next pages first in RTL mode', async () => {
    renderReader({ pagedDirection: 'rtl' })

    await act(async () => {})
    const urls = jest.mocked(Image.prefetch).mock.calls.map(call => String(call[0]))
    expect(urls[0]).toContain('/pages/2?')
    expect(urls[1]).toContain('/pages/3?')
    expect(urls[2]).toContain('/pages/0?')
  })

  it('passes cover fitting to page images', () => {
    renderReader({ pagedFit: 'cover' })
    expect(screen.getAllByLabelText('页面图片-cover').length).toBeGreaterThan(0)
  })

  it('uses verified local files and skips network prefetch', async () => {
    jest.mocked(Image.prefetch).mockClear()
    const localPageUris = manga.pages.map((_, index) =>
      `file:///downloads/${String(index).padStart(6, '0')}.page`)

    renderReader({}, jest.fn(), jest.fn().mockResolvedValue(undefined), localPageUris)
    await act(async () => {})

    expect(screen.getByTestId('local-page-file:///downloads/000001.page')).toBeOnTheScreen()
    expect(Image.prefetch).not.toHaveBeenCalled()
  })

  it('reports the first visible page display without request details', () => {
    const reporter = jest.fn()
    const resetReporter = setReaderTelemetryReporter(reporter)
    renderReader()

    fireEvent(screen.getByTestId('page-image-1'), 'load')

    expect(reporter).toHaveBeenCalledWith(expect.objectContaining({
      type: 'first-page-display',
      mode: 'paged',
      pageIndex: 1,
    }))
    resetReporter()
  })

  it('retries a failed page locally', () => {
    renderReader()
    fireEvent(screen.getAllByLabelText('页面图片-contain')[0], 'error')

    const retry = screen.getByText('点击重试')
    expect(retry).toBeOnTheScreen()
    fireEvent.press(retry, { stopPropagation: jest.fn() })
    expect(screen.getAllByLabelText('页面图片-contain').length).toBeGreaterThan(0)
  })

  it('offers an explicit metadata refresh after a page failure', async () => {
    let finishRefresh: (() => void) | undefined
    const onRefreshMetadata = jest.fn(() => new Promise<void>(resolve => {
      finishRefresh = resolve
    }))
    renderReader({}, jest.fn(), onRefreshMetadata)
    fireEvent(screen.getAllByLabelText('页面图片-contain')[0], 'error')

    fireEvent.press(screen.getByText('刷新页面信息'), { stopPropagation: jest.fn() })
    expect(onRefreshMetadata).toHaveBeenCalledTimes(1)
    await act(async () => { finishRefresh?.() })
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
