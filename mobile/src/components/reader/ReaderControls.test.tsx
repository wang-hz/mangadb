import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Image } from 'expo-image'
import { AppState, FlatList, type AppStateStatus, type NativeEventSubscription } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { ReaderControls } from './ReaderControls'

jest.mock('expo-image', () => {
  const { View } = require('react-native')
  return { Image: (props: object) => <View {...props} /> }
})

const manga: MangaDetail = {
  uuid: 'manga-1', displayTitle: '测试漫画', originalTitle: '', fullname: '',
  publishDate: null, cover: 0, createAt: '', updateAt: 'revision-1',
  pages: ['0.jpg', '1.jpg', '2.jpg', '3.jpg'], mangaTags: [],
}
const api = {
  authorizationHeaders: () => ({ Authorization: 'Bearer token' }),
  url: (path: string) => `https://example.com${path}`,
} as unknown as ApiClient
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
}

function renderControls(patch: Partial<React.ComponentProps<typeof ReaderControls>> = {}) {
  const props = {
    api, manga, serverUrl: 'https://example.com', userUuid: 'user-1',
    title: manga.displayTitle, mode: 'paged' as const, direction: 'ltr' as const,
    pageIndex: 1, pageCount: manga.pages.length, settingsVisible: false,
    onBack: jest.fn(), onOpenSettings: jest.fn(), onModeChange: jest.fn(),
    onJump: jest.fn(), onInteractionChange: jest.fn(), ...patch,
  }
  const element = (next = props) => <SafeAreaProvider initialMetrics={metrics}><ReaderControls {...next} /></SafeAreaProvider>
  const view = render(element())
  return { ...view, props, update: (next: Partial<typeof props>) => view.rerender(element({ ...props, ...next })) }
}

describe('ReaderControls thumbnails', () => {
  beforeEach(() => {
    jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('loads authenticated thumbnails only when expanded and keeps them open after selection', () => {
    const { props } = renderControls()
    expect(screen.queryByLabelText('页面缩略图导航')).toBeNull()
    expect(screen.UNSAFE_queryAllByType(Image)).toHaveLength(0)
    fireEvent.press(screen.getByLabelText('展开页面缩略图'))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
    expect(FlatList.prototype.scrollToIndex).toHaveBeenLastCalledWith({ index: 1, animated: false, viewPosition: 0.5 })
    const image = screen.getByLabelText('第 2 页缩略图')
    expect(image.props.source).toMatchObject({ headers: { Authorization: 'Bearer token' } })
    expect(image.props.source.uri).toContain('/pages/1?')
    expect(image.props.source.uri).toContain('thumb=1')
    expect(image.props.source.uri).toContain('cacheUser=user-1')
    expect(image.props.source.uri).toContain('cacheRevision=revision-1')
    expect(screen.getByLabelText('跳转到第 2 页').props.accessibilityState.selected).toBe(true)
    fireEvent.press(screen.getByLabelText('跳转到第 4 页'))
    expect(props.onJump).toHaveBeenLastCalledWith(3)
    expect(screen.getByLabelText('收起页面缩略图')).toBeOnTheScreen()
    fireEvent.press(screen.getByLabelText('收起页面缩略图'))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
  })

  it('centers again after FlatList applies its initial layout offset', () => {
    let center: FrameRequestCallback = () => {}
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
      center = callback
      return 1
    })
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
    renderControls()
    fireEvent.press(screen.getByLabelText('展开页面缩略图'))
    const scroll = jest.mocked(FlatList.prototype.scrollToIndex)
    scroll.mockClear()
    const list = screen.UNSAFE_getByType(FlatList)
    act(() => list.props.onLayout())
    expect(scroll).not.toHaveBeenCalled()
    act(() => center(16))
    expect(scroll).toHaveBeenLastCalledWith({ index: 1, animated: false, viewPosition: 0.5 })
  })

  it('reverses thumbnail order for RTL and recenters when the page changes', () => {
    const { props, update } = renderControls({ direction: 'rtl' })
    fireEvent.press(screen.getByLabelText('展开页面缩略图'))
    const list = screen.UNSAFE_getByType(FlatList)
    expect(list.props.data).toEqual([3, 2, 1, 0])
    expect(list.props.initialScrollIndex).toBe(2)
    fireEvent.press(screen.getByLabelText('跳转到第 1 页'))
    expect(props.onJump).toHaveBeenCalledWith(0)
    update({ pageIndex: 0 })
    expect(FlatList.prototype.scrollToIndex).toHaveBeenLastCalledWith({ index: 3, animated: false, viewPosition: 0.5 })
  })

  it('keeps scrolling thumbnails in increasing page order regardless of the paged direction', () => {
    renderControls({ direction: 'rtl', mode: 'scroll' })
    fireEvent.press(screen.getByLabelText('展开页面缩略图'))
    expect(screen.UNSAFE_getByType(FlatList).props.data).toEqual([0, 1, 2, 3])
    expect(screen.queryByLabelText('上一页')).toBeNull()
  })

  it('uses local images and keeps failed thumbnails selectable without requesting the network', () => {
    const url = jest.spyOn(api, 'url')
    const { props } = renderControls({ pageIndex: 0, localPageUris: ['file:///0.jpg', 'file:///1.jpg'] })
    fireEvent.press(screen.getByLabelText('展开页面缩略图'))
    const image = screen.getByLabelText('第 1 页缩略图')
    expect(image.props.source).toEqual({ uri: 'file:///0.jpg', cacheKey: 'file:///0.jpg' })
    expect(image.props.cachePolicy).toBe('none')
    expect(url).not.toHaveBeenCalled()
    fireEvent(image, 'error')
    expect(screen.queryByLabelText('第 1 页缩略图')).toBeNull()
    fireEvent.press(screen.getByLabelText('跳转到第 1 页'))
    expect(props.onJump).toHaveBeenCalledWith(0)
    fireEvent.press(screen.getByLabelText('跳转到第 4 页'))
    expect(props.onJump).toHaveBeenCalledWith(3)
    expect(url).not.toHaveBeenCalled()
  })

  it('closes on background, settings, and unmount and releases the interaction lock', () => {
    let background = (_state: AppStateStatus) => {}
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      background = listener
      return { remove: jest.fn() } as NativeEventSubscription
    })
    const { props, update, unmount } = renderControls()
    fireEvent.press(screen.getByLabelText('展开页面缩略图'))
    act(() => background('background'))
    expect(screen.queryByLabelText('页面缩略图导航')).toBeNull()
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
    fireEvent.press(screen.getByLabelText('展开页面缩略图'))
    update({ settingsVisible: true })
    expect(screen.queryByLabelText('页面缩略图导航')).toBeNull()
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
    unmount()
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
  })

  it('supports a single-page manga and switching modes', () => {
    const { props } = renderControls({ manga: { ...manga, pages: ['0.jpg'] }, pageIndex: 0, pageCount: 1 })
    fireEvent.press(screen.getByLabelText('展开页面缩略图'))
    expect(screen.getByLabelText('上一页')).toBeDisabled()
    expect(screen.getByLabelText('下一页')).toBeDisabled()
    expect(screen.getByLabelText('跳转到第 1 页').props.accessibilityState.selected).toBe(true)
    fireEvent.press(screen.getByRole('tab', { name: /滚动/ }))
    expect(props.onModeChange).toHaveBeenCalledWith('scroll')
  })
})
