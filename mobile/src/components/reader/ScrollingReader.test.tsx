import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { FlatList } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { DEFAULT_READER_PREFERENCES } from '@/storage/readerPreferences'
import { ScrollingReader } from './ScrollingReader'

jest.mock('expo-image', () => ({
  Image: Object.assign(() => null, { prefetch: jest.fn().mockResolvedValue(true) }),
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
  pages: ['0.jpg', '1.jpg', '2.jpg'],
  mangaTags: [],
}

describe('ScrollingReader preferences', () => {
  it('includes the selected gap in list layouts and rendered pages', () => {
    const { view } = renderReader({
      preferences: { ...DEFAULT_READER_PREFERENCES, scrollGap: 16 },
    })
    const list = view.UNSAFE_getByType(FlatList)
    const first = list.props.getItemLayout(null, 0)
    const second = list.props.getItemLayout(null, 1)
    const last = list.props.getItemLayout(null, 2)
    expect(second.offset).toBe(first.length)
    expect(first.length - last.length).toBe(16)
    expect(list.props.renderItem({ item: '0.jpg', index: 0 }).props.pageGap).toBe(16)
    expect(list.props.renderItem({ item: '2.jpg', index: 2 }).props.pageGap).toBe(0)
  })

  it('jumps to the page offset and ignores an earlier scroll completion', () => {
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {})
    const onPageChange = jest.fn()
    const { view } = renderReader({ onPageChange })
    const list = view.UNSAFE_getByType(FlatList)
    // A prior manual scroll must not overwrite the explicit target.
    act(() => list.props.onScrollBeginDrag())
    // Reveal the controls again with the page tap handler.
    act(() => list.props.renderItem({ item: '0.jpg', index: 0 }).props.onTap())
    fireEvent.press(screen.getByLabelText('跳转页码'))
    fireEvent.changeText(screen.getByLabelText('目标页码'), '3')
    fireEvent.press(screen.getByText('跳转'))
    expect(scroll).toHaveBeenLastCalledWith({ offset: list.props.getItemLayout(null, 2).offset, animated: false })
    expect(onPageChange).toHaveBeenCalledWith(2)
    act(() => {
      list.props.onScroll({ nativeEvent: { contentOffset: { y: 0 } } })
      list.props.onMomentumScrollEnd()
    })
    expect(onPageChange).toHaveBeenCalledTimes(1)
    view.unmount()
    scroll.mockRestore()
  })

  it('keeps a jump anchored as image sizes resolve, then releases it on manual scrolling', async () => {
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {})
    const { view } = renderReader()
    const list = view.UNSAFE_getByType(FlatList)
    fireEvent.press(screen.getByLabelText('跳转页码'))
    fireEvent.changeText(screen.getByLabelText('目标页码'), '3')
    fireEvent.press(screen.getByText('跳转'))
    await act(async () => {
      list.props.renderItem({ item: '0.jpg', index: 0 }).props.onAspectRatio(0, 1)
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    })
    const updatedList = view.UNSAFE_getByType(FlatList)
    expect(scroll).toHaveBeenLastCalledWith({ offset: updatedList.props.getItemLayout(null, 2).offset, animated: false })
    scroll.mockClear()
    act(() => updatedList.props.onContentSizeChange())
    expect(scroll).toHaveBeenCalledTimes(1)
    act(() => updatedList.props.onScrollBeginDrag())
    scroll.mockClear()
    act(() => updatedList.props.onContentSizeChange())
    expect(scroll).not.toHaveBeenCalled()
    view.unmount()
    scroll.mockRestore()
  })

  it('locks vertical scrolling while an image is zoomed', () => {
    const { view } = renderReader()
    fireEvent(
      screen.getByLabelText('第 1 页图片'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    )

    expect(view.UNSAFE_getByType(FlatList).props.scrollEnabled).toBe(false)
    fireEvent.press(screen.getByLabelText('重置缩放'))
    expect(view.UNSAFE_getByType(FlatList).props.scrollEnabled).toBe(true)
  })

  it('remounts at the current page for a new epoch and drops stale list callbacks', () => {
    const onPageChange = jest.fn()
    const { rerenderViewport, view } = renderReader({ pageIndex: 1, onPageChange })
    const oldList = view.UNSAFE_getByType(FlatList)
    const staleBeginDrag = oldList.props.onScrollBeginDrag
    const staleScroll = oldList.props.onScroll
    const staleMomentumEnd = oldList.props.onMomentumScrollEnd

    fireEvent(
      screen.getByLabelText('第 2 页图片'),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    )
    expect(oldList.props.scrollEnabled).toBe(false)

    rerenderViewport({
      ...stableViewport,
      width: 844,
      height: 390,
      epoch: 1,
    })

    const nextList = view.UNSAFE_getByType(FlatList)
    expect(screen.getByTestId('scrolling-reader-list-1')).toBeOnTheScreen()
    expect(nextList.props.initialScrollIndex).toBe(1)
    expect(nextList.props.scrollEnabled).toBe(true)
    expect(nextList.props.maintainVisibleContentPosition).toBeUndefined()
    expect(nextList.props.onScrollToIndexFailed).toBeUndefined()

    act(() => {
      staleBeginDrag()
      staleScroll({ nativeEvent: { contentOffset: { y: 0 } } })
      staleMomentumEnd()
    })
    expect(onPageChange).not.toHaveBeenCalled()
  })
})

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

function renderReader({
  pageIndex = 0,
  onPageChange = jest.fn(),
  preferences = DEFAULT_READER_PREFERENCES,
}: {
  pageIndex?: number
  onPageChange?: jest.Mock
  preferences?: typeof DEFAULT_READER_PREFERENCES
} = {}) {
  const element = (viewport = stableViewport) => (
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <ScrollingReader
        api={{
          authorizationHeaders: () => ({ Authorization: 'Bearer token' }),
          url: (path: string) => `https://example.com${path}`,
        } as unknown as ApiClient}
        completed={false}
        completionPending={false}
        completionError={null}
        onReread={jest.fn().mockResolvedValue(undefined)}
        manga={manga}
        mode="scroll"
        onBack={jest.fn()}
        onModeChange={jest.fn()}
        onMarkCompleted={jest.fn().mockResolvedValue(undefined)}
        onOpenSettings={jest.fn()}
        onPageChange={onPageChange}
        onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
        onReturnToDetail={jest.fn()}
        onReturnToList={jest.fn()}
        pageIndex={pageIndex}
        preferences={preferences}
        settingsVisible={false}
        serverUrl="https://example.com"
        userUuid="user-1"
        viewport={viewport}
      />
    </SafeAreaProvider>
  )
  const view = render(element())
  return {
    rerenderViewport: (viewport: typeof stableViewport) => view.rerender(element(viewport)),
    view,
  }
}
