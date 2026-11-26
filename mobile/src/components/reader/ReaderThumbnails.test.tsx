import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AppState, FlatList, type NativeEventSubscription } from 'react-native'
import { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { ReaderThumbnails } from './ReaderThumbnails'

jest.mock('expo-image', () => ({
  Image: (props: Record<string, unknown>) => {
    const React = require('react')
    const { View } = require('react-native')
    return React.createElement(View, props)
  },
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

function renderThumbnails(patch: Partial<React.ComponentProps<typeof ReaderThumbnails>> = {}) {
  const api = new ApiClient('https://example.com', { token: 'token' })
  const props = {
    api,
    manga,
    serverUrl: 'https://example.com',
    userUuid: 'user-1',
    pageIndex: 1,
    direction: 'ltr' as const,
    onJump: jest.fn(),
    onInteractionChange: jest.fn(),
    ...patch,
  }
  const view = render(<ReaderThumbnails {...props} />)
  const list = view.UNSAFE_getByType(FlatList)
  return { ...view, list, props }
}

describe('ReaderThumbnails', () => {
  it.each([
    ['ltr', [0, 1, 2, 3], 1, 3],
    ['rtl', [3, 2, 1, 0], 2, 0],
  ] as const)('orders %s previews and jumps to their logical pages', (direction, order, displayIndex, targetPage) => {
    const { list, props } = renderThumbnails({ direction })

    expect(list.props.data).toEqual(order)
    expect(list.props.initialScrollIndex).toBe(displayIndex)
    expect(screen.getByLabelText('跳转到第 2 页').props.accessibilityState.selected).toBe(true)
    const target = screen.getByLabelText(`跳转到第 ${targetPage + 1} 页`)
    expect(target.props.accessibilityState.selected).toBe(false)
    fireEvent.press(target)
    expect(props.onJump).toHaveBeenCalledWith(targetPage)
  })

  it('loads authenticated network thumbnails with isolated disk cache keys', () => {
    renderThumbnails()
    const image = screen.getByLabelText('第 2 页缩略图')
    const source = image.props.source

    expect(source.headers).toEqual({ Authorization: 'Bearer token' })
    expect(source.uri).toContain('/api/file/mangas/manga-1/pages/1?')
    expect(source.uri).toContain('thumb=1')
    expect(source.uri).toContain('cacheUser=user-1')
    expect(source.uri).toContain('cacheRevision=2026-07-19T00%3A00%3A00.000Z')
    expect(source.cacheKey).toBe(source.uri)
    expect(image.props.cachePolicy).toBe('disk')
  })

  it('uses local pages without making network sources for missing files', () => {
    const api = new ApiClient('https://example.com', { token: 'token' })
    const url = jest.spyOn(api, 'url')
    const headers = jest.spyOn(api, 'authorizationHeaders')
    renderThumbnails({ api, pageIndex: 0, localPageUris: ['file:///downloads/0.jpg'] })

    const image = screen.getByLabelText('第 1 页缩略图')
    expect(image.props.source).toEqual({
      uri: 'file:///downloads/0.jpg', cacheKey: 'file:///downloads/0.jpg',
    })
    expect(image.props.cachePolicy).toBe('none')
    expect(screen.queryByLabelText('第 2 页缩略图')).not.toBeOnTheScreen()
    expect(screen.getByLabelText('跳转到第 2 页')).toBeOnTheScreen()
    expect(url).not.toHaveBeenCalled()
    expect(headers).not.toHaveBeenCalled()
  })

  it('keeps page navigation available after a thumbnail fails', () => {
    const { props } = renderThumbnails()
    fireEvent(screen.getByLabelText('第 2 页缩略图'), 'error')

    expect(screen.queryByLabelText('第 2 页缩略图')).not.toBeOnTheScreen()
    fireEvent.press(screen.getByLabelText('跳转到第 2 页'))
    expect(props.onJump).toHaveBeenCalledWith(1)
  })

  describe('interaction lock', () => {
    let changeAppState: (state: 'background') => void

    beforeEach(() => {
      jest.useFakeTimers()
      changeAppState = () => {}
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
        changeAppState = listener
        return { remove: jest.fn() } as NativeEventSubscription
      })
    })

    afterEach(() => {
      jest.restoreAllMocks()
      jest.useRealTimers()
    })

    it('keeps the toolbar locked through touch, dragging and momentum', () => {
      const { list, props, unmount } = renderThumbnails()
      act(() => list.props.onTouchStart())
      expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
      act(() => list.props.onScrollBeginDrag())
      act(() => list.props.onTouchEnd())
      act(() => jest.advanceTimersByTime(20))
      expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)

      act(() => list.props.onScrollEndDrag())
      act(() => list.props.onMomentumScrollBegin())
      act(() => jest.advanceTimersByTime(20))
      expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)

      act(() => list.props.onMomentumScrollEnd())
      act(() => jest.advanceTimersByTime(20))
      expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
      unmount()
    })

    it('releases a touch that is cancelled without scrolling', () => {
      const { list, props, unmount } = renderThumbnails()
      act(() => list.props.onTouchStart())
      act(() => list.props.onTouchCancel())
      act(() => jest.advanceTimersByTime(20))
      expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
      unmount()
    })

    it('releases unfinished interactions when backgrounded or unmounted', () => {
      const { list, props, unmount } = renderThumbnails()
      act(() => list.props.onScrollBeginDrag())
      expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
      act(() => changeAppState('background'))
      expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
      act(() => list.props.onMomentumScrollBegin())
      expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
      unmount()
      expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
    })
  })
})
