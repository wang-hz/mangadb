import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { FlatList } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { ReaderControls } from './ReaderControls'

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
}

const manga: MangaDetail = {
  uuid: 'manga-1', displayTitle: '测试漫画', originalTitle: '测试漫画',
  fullname: 'test-manga', publishDate: null, cover: 0,
  createAt: '2026-07-19T00:00:00.000Z', updateAt: '2026-07-19T00:00:00.000Z',
  pages: ['0.jpg', '1.jpg', '2.jpg', '3.jpg'], mangaTags: [],
}

function renderControls(patch: Partial<React.ComponentProps<typeof ReaderControls>> = {}) {
  const props = {
    manga, api: new ApiClient('https://example.com', { token: 'token' }),
    serverUrl: 'https://example.com', userUuid: 'user-1',
    mode: 'paged' as const, direction: 'ltr' as const, pageIndex: 1,
    onBack: jest.fn(), onOpenInfo: jest.fn(), onOpenSettings: jest.fn(),
    onJump: jest.fn(), onInteractionChange: jest.fn(), ...patch,
  }
  const view = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ReaderControls {...props} />
    </SafeAreaProvider>,
  )
  return { ...view, props }
}

describe('ReaderControls', () => {
  it('keeps navigation, information, settings, and page previews visible together', () => {
    const { props } = renderControls()

    expect(screen.getByText('测试漫画')).toBeOnTheScreen()
    expect(screen.getByLabelText('页面缩略图导航')).toBeOnTheScreen()
    expect(screen.getByLabelText('跳转到第 2 页')).toBeSelected()
    expect(screen.getByLabelText('阅读进度')).toBeOnTheScreen()
    expect(screen.queryByLabelText('展开页面缩略图')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    for (const label of ['页面', '翻页', '滚动']) {
      expect(screen.queryByText(label)).toBeNull()
    }

    fireEvent.press(screen.getByLabelText('退出阅读器'))
    fireEvent.press(screen.getByLabelText('漫画信息'))
    fireEvent.press(screen.getByLabelText('打开阅读设置'))
    expect(props.onBack).toHaveBeenCalledTimes(1)
    expect(props.onOpenInfo).toHaveBeenCalledTimes(1)
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it.each(['ltr', 'rtl'] as const)('navigates logical pages in %s mode', direction => {
    const { props } = renderControls({ direction })

    fireEvent.press(screen.getByLabelText('上一页'))
    fireEvent.press(screen.getByLabelText('下一页'))
    expect(props.onJump).toHaveBeenNthCalledWith(1, 0)
    expect(props.onJump).toHaveBeenNthCalledWith(2, 2)
  })

  it('keeps page jumps available and releases the interaction lock on close and unmount', () => {
    const { props, unmount } = renderControls()

    fireEvent.press(screen.getByLabelText('跳转页码'))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
    fireEvent.changeText(screen.getByLabelText('目标页码'), '4')
    fireEvent.press(screen.getByText('跳转'))
    expect(props.onJump).toHaveBeenCalledWith(3)
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)

    fireEvent.press(screen.getByLabelText('跳转页码'))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
    unmount()
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
  })

  it('disables page arrows for a single page and omits them in scrolling mode', () => {
    const single = renderControls({ pageIndex: 0, manga: { ...manga, pages: ['0.jpg'] } })
    expect(screen.getByLabelText('上一页')).toBeDisabled()
    expect(screen.getByLabelText('下一页')).toBeDisabled()
    single.unmount()

    renderControls({ mode: 'scroll' })
    expect(screen.queryByLabelText('上一页')).toBeNull()
    expect(screen.queryByLabelText('下一页')).toBeNull()
    expect(screen.getByLabelText('跳转页码')).toBeOnTheScreen()
  })

  it('uses RTL previews only for paged reading', () => {
    const paged = renderControls({ direction: 'rtl' })
    expect(screen.UNSAFE_getByType(FlatList).props.data).toEqual([3, 2, 1, 0])
    paged.unmount()

    renderControls({ mode: 'scroll', direction: 'rtl' })
    expect(screen.UNSAFE_getByType(FlatList).props.data).toEqual([0, 1, 2, 3])
  })

  it('keeps the interaction lock until both thumbnails and page controls finish', () => {
    jest.useFakeTimers()
    const { props, unmount } = renderControls()
    const thumbnails = screen.UNSAFE_getByType(FlatList)

    fireEvent(thumbnails, 'touchStart')
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
    fireEvent.press(screen.getByLabelText('跳转页码'))
    fireEvent(thumbnails, 'touchEnd')
    act(() => jest.advanceTimersByTime(20))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
    fireEvent.press(screen.getByText('取消'))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)

    fireEvent(thumbnails, 'touchStart')
    fireEvent.press(screen.getByLabelText('跳转页码'))
    fireEvent.press(screen.getByText('取消'))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
    fireEvent(thumbnails, 'touchCancel')
    act(() => jest.advanceTimersByTime(20))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
    unmount()
    jest.useRealTimers()
  })
})
