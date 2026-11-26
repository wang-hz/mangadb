import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Image } from 'expo-image'
import { AppState, FlatList, Modal, type NativeEventSubscription } from 'react-native'
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
        accessibilityLabel={source.uri?.includes('thumb=1') ? '缩略图' : `页面图片-${contentFit}`}
        onError={onError}
        onLoad={onLoad}
        testID={source.uri?.includes('thumb=1') ? `thumbnail-${pageIndex}` : source.uri?.startsWith('file:')
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
  { pageIndex = 1, modalVisible = false } = {},
) {
  const element = (viewport = stableViewport) => (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <PagedReader
        api={{
          authorizationHeaders: () => ({ Authorization: 'Bearer token' }),
          url: (path: string) => `https://example.com${path}`,
        } as unknown as ApiClient}
        manga={manga}
        localPageUris={localPageUris}
        mode="paged"
        onBack={jest.fn()}
        onOpenSettings={jest.fn()}
        onOpenInfo={jest.fn()}
        onPageChange={onPageChange}
        onRefreshMetadata={onRefreshMetadata}
        pageIndex={pageIndex}
        preferences={{ ...DEFAULT_READER_PREFERENCES, ...preferencePatch }}
        modalVisible={modalVisible}
        serverUrl="https://example.com"
        userUuid="user-1"
        viewport={viewport}
      />
    </SafeAreaProvider>
  )
  const view = render(element())
  return {
    onPageChange,
    rerenderViewport: (viewport: typeof stableViewport) => view.rerender(element(viewport)),
    view,
  }
}

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

const stableViewport = {
  width: 390,
  height: 844,
  scale: 3,
  fontScale: 1,
  epoch: 0,
  isTransitioning: false,
}

describe('PagedReader preferences', () => {
  it('shows previews and information at the last page without a completion panel', () => {
    renderReader({}, undefined, undefined, undefined, { pageIndex: 3 })
    expect(screen.getByLabelText('页面缩略图导航')).toBeOnTheScreen()
    expect(screen.getByLabelText('漫画信息')).toBeOnTheScreen()
    for (const text of ['已读到最后一页', '从头重读', '返回漫画', '返回列表']) {
      expect(screen.queryByText(text)).toBeNull()
    }
  })

  it('reverses display order while preserving logical page indices in RTL mode', () => {
    const { onPageChange, view } = renderReader({ pagedDirection: 'rtl' })
    const list = view.UNSAFE_getAllByType(FlatList)[0]!
    expect(list.props.data).toEqual([3, 2, 1, 0])
    expect(list.props.initialScrollIndex).toBe(2)

    const width = list.props.getItemLayout(null, 0).length
    act(() => {
      list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: width } } })
    })
    expect(onPageChange).toHaveBeenCalledWith(2)
    expect(screen.getAllByLabelText('页面图片-contain').length).toBeGreaterThan(0)
  })

  it.each(['ltr', 'rtl'] as const)('jumps immediately in %s mode and ignores stale momentum', direction => {
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
    const { onPageChange, view } = renderReader({ pagedDirection: direction })
    const list = view.UNSAFE_getAllByType(FlatList)[0]!
    fireEvent.press(screen.getByLabelText('跳转页码'))
    fireEvent.changeText(screen.getByLabelText('目标页码'), '4')
    fireEvent.press(screen.getByText('跳转'))
    expect(scroll).toHaveBeenLastCalledWith({ index: direction === 'rtl' ? 0 : 3, animated: false })
    expect(onPageChange).toHaveBeenCalledWith(3)
    act(() => list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 0 } } }))
    expect(onPageChange).toHaveBeenCalledTimes(1)
    // Navigation buttons must resume ordinary page tracking after a jump.
    fireEvent.press(screen.getByLabelText('下一页'))
    const width = list.props.getItemLayout(null, 0).length
    act(() => list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: width * (direction === 'rtl' ? 1 : 2) } } }))
    expect(onPageChange).toHaveBeenLastCalledWith(2)
    scroll.mockRestore()
  })

  it('jumps to a logical RTL page and resets zoom', () => {
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
    const { onPageChange, view } = renderReader({ pagedDirection: 'rtl' })
    fireEvent(screen.getByLabelText('第 2 页图片'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    fireEvent.press(screen.getByLabelText('跳转页码'))
    fireEvent.changeText(screen.getByLabelText('目标页码'), '1')
    fireEvent.press(screen.getByText('跳转'))
    expect(onPageChange).toHaveBeenLastCalledWith(0)
    expect(view.UNSAFE_getAllByType(FlatList)[0].props.scrollEnabled).toBe(true)
    expect(scroll).toHaveBeenCalledWith({ index: 3, animated: false })
    scroll.mockRestore()
  })

  it('does not start full-resolution image prefetches', async () => {
    const { view } = renderReader({ pagedDirection: 'rtl' })

    await act(async () => {})
    expect(Image.prefetch).not.toHaveBeenCalled()
    const list = view.UNSAFE_getAllByType(FlatList)[0]!
    expect(list.props.initialNumToRender).toBe(1)
    expect(list.props.maxToRenderPerBatch).toBe(1)
    expect(list.props.windowSize).toBe(3)
  })

  it('passes cover fitting to page images', () => {
    renderReader({ pagedFit: 'cover' })
    expect(screen.getAllByLabelText('页面图片-cover').length).toBeGreaterThan(0)
  })

  it('keeps the reading surface free of a dimming overlay', () => {
    renderReader()
    expect(screen.queryByTestId('reader-dimmer', { includeHiddenElements: true })).toBeNull()
  })

  it('locks paging while the visible page is zoomed and exposes reset', () => {
    const { view } = renderReader()
    fireEvent(
      screen.getByLabelText('第 2 页图片'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    )

    expect(view.UNSAFE_getAllByType(FlatList)[0]!.props.scrollEnabled).toBe(false)
    expect(screen.getByLabelText('重置缩放')).toBeOnTheScreen()

    fireEvent.press(screen.getByLabelText('重置缩放'))
    expect(view.UNSAFE_getAllByType(FlatList)[0]!.props.scrollEnabled).toBe(true)
  })

  it('uses verified local files and skips network prefetch', async () => {
    jest.mocked(Image.prefetch).mockClear()
    const localPageUris = manga.pages.map((_, index) =>
      `file:///downloads/${String(index).padStart(6, '0')}.page`)

    renderReader({}, jest.fn(), jest.fn().mockResolvedValue(undefined), localPageUris)
    await act(async () => {})

    expect(screen.getAllByTestId('local-page-file:///downloads/000001.page')[0]).toBeOnTheScreen()
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

  it('shows metadata refresh failures without an unhandled rejection', async () => {
    const onRefreshMetadata = jest.fn().mockRejectedValue(new Error('offline'))
    renderReader({}, jest.fn(), onRefreshMetadata)
    fireEvent(screen.getAllByLabelText('页面图片-contain')[0], 'error')

    fireEvent.press(screen.getByText('刷新页面信息'), { stopPropagation: jest.fn() })

    await waitFor(() => expect(
      screen.getByText('刷新失败，请检查网络后重试'),
    ).toBeOnTheScreen())
  })

  it('remounts the list for a new viewport epoch, resets zoom, and ignores stale callbacks', () => {
    const onPageChange = jest.fn()
    const { rerenderViewport, view } = renderReader({}, onPageChange)
    const staleMomentumEnd = view.UNSAFE_getAllByType(FlatList)[0]!.props.onMomentumScrollEnd
    fireEvent(
      screen.getByLabelText('第 2 页图片'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    )
    expect(view.UNSAFE_getAllByType(FlatList)[0]!.props.scrollEnabled).toBe(false)

    rerenderViewport({
      ...stableViewport,
      width: 844,
      height: 390,
      epoch: 1,
    })

    expect(screen.getByTestId('paged-reader-list-1')).toBeOnTheScreen()
    expect(view.UNSAFE_getAllByType(FlatList)[0]!.props.initialScrollIndex).toBe(1)
    expect(view.UNSAFE_getAllByType(FlatList)[0]!.props.scrollEnabled).toBe(true)
    expect(view.UNSAFE_getAllByType(FlatList)[0]!.props.onScrollToIndexFailed).toBeUndefined()

    act(() => {
      staleMomentumEnd({ nativeEvent: { contentOffset: { x: 0 } } })
    })
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('allows all app orientations in the page jump modal and closes it in background', () => {
    const appStateListeners: Array<(state: 'background') => void> = []
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, listener) => {
      appStateListeners.push(listener as (state: 'background') => void)
      return { remove: jest.fn() } as NativeEventSubscription
    }) as typeof AppState.addEventListener)
    const { view } = renderReader()

    fireEvent.press(screen.getByText('2 / 4'))
    const modal = view.UNSAFE_getByType(Modal)
    expect(modal.props.visible).toBe(true)
    expect(modal.props.supportedOrientations).toEqual([
      'portrait',
      'portrait-upside-down',
      'landscape-left',
      'landscape-right',
    ])

    act(() => appStateListeners.forEach(listener => listener('background')))
    expect(view.UNSAFE_getByType(Modal).props.visible).toBe(false)
    jest.restoreAllMocks()
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

  it('pauses auto-hide while dragging and restarts the timer on cancellation', () => {
    jest.useFakeTimers()
    const { view } = renderReader({ controlsAutoHideMs: 3000 })
    const slider = screen.getByLabelText('阅读进度')
    act(() => slider.props.onLayout({ nativeEvent: { layout: { width: 200 } } }))
    fireEvent(slider, 'responderGrant', { nativeEvent: { locationX: 10, pageX: 10 } })
    act(() => { jest.advanceTimersByTime(6000) })
    expect(screen.getByLabelText('退出阅读器')).toBeOnTheScreen()
    fireEvent(slider, 'responderTerminate')
    act(() => { jest.advanceTimersByTime(3000) })
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

  it('keeps controls and previews visible while an information or settings modal is open', () => {
    jest.useFakeTimers()
    try {
      const { view } = renderReader({}, undefined, undefined, undefined, { modalVisible: true })
      act(() => jest.advanceTimersByTime(10000))
      expect(screen.getByLabelText('页面缩略图导航')).toBeOnTheScreen()
      expect(screen.getByLabelText('漫画信息')).toBeOnTheScreen()
      view.unmount()
    } finally {
      jest.useRealTimers()
    }
  })

  it('pauses automatic hiding while browsing previews and resumes after release', () => {
    jest.useFakeTimers()
    try {
      const { view } = renderReader()
      fireEvent(screen.getByLabelText('页面缩略图导航'), 'touchStart')
      act(() => jest.advanceTimersByTime(10000))
      expect(screen.getByLabelText('漫画信息')).toBeOnTheScreen()
      fireEvent(screen.getByLabelText('页面缩略图导航'), 'touchEnd')
      act(() => jest.advanceTimersByTime(20))
      act(() => jest.advanceTimersByTime(3000))
      expect(screen.queryByLabelText('页面缩略图导航')).toBeNull()
      view.unmount()
    } finally {
      jest.useRealTimers()
    }
  })

  it('pauses auto-hide while the page jump is open and resumes after closing', () => {
    jest.useFakeTimers()
    try {
      const { view } = renderReader()
      fireEvent.press(screen.getByLabelText('跳转页码'))
      act(() => jest.advanceTimersByTime(10000))
      expect(screen.getByLabelText('目标页码')).toBeOnTheScreen()
      fireEvent.press(screen.getByText('取消'))
      act(() => jest.advanceTimersByTime(2999))
      expect(screen.getByLabelText('跳转页码')).toBeOnTheScreen()
      act(() => jest.advanceTimersByTime(1))
      expect(screen.queryByLabelText('跳转页码')).toBeNull()
      view.unmount()
    } finally {
      jest.useRealTimers()
    }
  })
})
