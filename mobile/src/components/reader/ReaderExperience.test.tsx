import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { useKeepAwake } from 'expo-keep-awake'
import { AppState, type NativeEventSubscription } from 'react-native'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { DEFAULT_READER_PREFERENCES } from '@/storage/readerPreferences'
import { ReaderExperience } from './ReaderExperience'

const mockSaveReadingProgress = jest.fn()
const mockMarkMangaCompleted = jest.fn()
const mockRestartMangaReading = jest.fn()
let mockPagedMounts = 0
let mockViewport = {
  width: 390,
  height: 844,
  scale: 3,
  fontScale: 1,
  epoch: 0,
  isTransitioning: false,
}

jest.mock('@/hooks/useStableViewport', () => ({
  useStableViewport: () => mockViewport,
}))

jest.mock('@/storage/progress', () => ({
  markMangaCompleted: (...args: unknown[]) => mockMarkMangaCompleted(...args),
  restartMangaReading: (...args: unknown[]) => mockRestartMangaReading(...args),
  saveReadingProgress: (...args: unknown[]) => mockSaveReadingProgress(...args),
}))

jest.mock('@/components/reader/ReaderSettingsModal', () => ({
  ReaderSettingsModal: ({ visible }: { visible: boolean }) => {
    const React = require('react')
    const { Text } = require('react-native')
    return visible ? React.createElement(Text, null, 'settings-open') : null
  },
}))

jest.mock('@/components/reader/PagedReader', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    PagedReader: ({ pageIndex, onPageChange, onModeChange, onReread, onOpenSettings, viewport }: {
      pageIndex: number
      onPageChange: (pageIndex: number) => void
      onModeChange: (mode: 'scroll') => void
      onReread: () => Promise<void>
      onOpenSettings: () => void
      viewport: { epoch: number }
    }) => {
      const mount = React.useState(() => {
        mockPagedMounts += 1
        return mockPagedMounts
      })[0]
      return React.createElement(
        View,
        null,
        React.createElement(Text, null, `paged:${pageIndex}`),
        React.createElement(Text, { accessibilityLabel: `paged-mount-${mount}-epoch-${viewport.epoch}` }),
        React.createElement(Pressable, {
          accessibilityLabel: '翻页模式更新页码',
          onPress: () => onPageChange(pageIndex + 2),
        }),
        React.createElement(Pressable, {
          accessibilityLabel: '切换到滚动模式',
          onPress: () => onModeChange('scroll'),
        }),
        React.createElement(Pressable, {
          accessibilityLabel: '从头重读',
          onPress: () => { void onReread() },
        }),
        React.createElement(Pressable, {
          accessibilityLabel: '打开阅读设置',
          onPress: onOpenSettings,
        }),
      )
    },
  }
})

jest.mock('@/components/reader/ScrollingReader', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    ScrollingReader: ({ pageIndex, onPageChange, onModeChange }: {
      pageIndex: number
      onPageChange: (pageIndex: number) => void
      onModeChange: (mode: 'paged') => void
    }) => React.createElement(
      View,
      null,
      React.createElement(Text, null, `scroll:${pageIndex}`),
      React.createElement(Pressable, {
        accessibilityLabel: '滚动模式更新页码',
        onPress: () => onPageChange(pageIndex + 1),
      }),
      React.createElement(Pressable, {
        accessibilityLabel: '切换到翻页模式',
        onPress: () => onModeChange('paged'),
      }),
    ),
  }
})

const manga: MangaDetail = {
  uuid: 'manga-1',
  displayTitle: '测试漫画',
  originalTitle: '测试漫画',
  fullname: 'test-manga',
  publishDate: null,
  cover: 0,
  createAt: '2026-07-19T00:00:00.000Z',
  updateAt: '2026-07-19T00:00:00.000Z',
  pages: Array.from({ length: 10 }, (_, index) => `${index}.jpg`),
  mangaTags: [],
}

describe('ReaderExperience', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })
  beforeEach(() => {
    mockPagedMounts = 0
    mockViewport = {
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
      epoch: 0,
      isTransitioning: false,
    }
    mockSaveReadingProgress.mockResolvedValue({
      pageIndex: 3,
      mode: 'paged',
      updatedAt: '2026-07-19T00:00:00.000Z',
    })
    mockMarkMangaCompleted.mockResolvedValue({})
    mockRestartMangaReading.mockResolvedValue({})
  })

  it('keeps the same position while switching between reader modes', async () => {
    jest.useFakeTimers()
    const onReaderReady = jest.fn()
    render(
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={3}
        manga={manga}
        onBack={jest.fn()}
        onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
        onReaderReady={onReaderReady}
        onReturnToDetail={jest.fn()}
        onReturnToList={jest.fn()}
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )

    await waitFor(() => expect(onReaderReady).toHaveBeenCalledTimes(1))
    expect(screen.getByText('paged:3')).toBeTruthy()
    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com',
      'user-1',
      'manga-1',
      10,
      3,
      'paged',
      manga,
    )

    fireEvent.press(screen.getByLabelText('翻页模式更新页码'))
    expect(screen.getByText('paged:5')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('切换到滚动模式'))
    expect(screen.getByText('scroll:5')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('滚动模式更新页码'))
    expect(screen.getByText('scroll:6')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('切换到翻页模式'))
    expect(screen.getByText('paged:6')).toBeTruthy()
    expect(mockSaveReadingProgress).toHaveBeenCalledTimes(1)

    await act(async () => { jest.advanceTimersByTime(400) })
    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com',
      'user-1',
      'manga-1',
      10,
      6,
      'paged',
      manga,
    )
    expect(mockSaveReadingProgress).toHaveBeenCalledTimes(2)
  })

  it('keeps the screen awake only when the preference is enabled', async () => {
    const { rerender } = render(
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={0}
        manga={manga}
        onBack={jest.fn()}
        onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
        onReaderReady={jest.fn()}
        onReturnToDetail={jest.fn()}
        onReturnToList={jest.fn()}
        preferences={{ ...DEFAULT_READER_PREFERENCES, keepAwake: true }}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )
    await waitFor(() => expect(useKeepAwake).toHaveBeenCalledWith('mangadb-reader'))

    jest.mocked(useKeepAwake).mockClear()
    rerender(
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={0}
        manga={manga}
        onBack={jest.fn()}
        onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
        onReaderReady={jest.fn()}
        onReturnToDetail={jest.fn()}
        onReturnToList={jest.fn()}
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )
    expect(useKeepAwake).not.toHaveBeenCalled()
  })

  it('automatically completes at the last page with the current reader mode', async () => {
    render(
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={9}
        manga={manga}
        onBack={jest.fn()}
        onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
        onReaderReady={jest.fn()}
        onReturnToDetail={jest.fn()}
        onReturnToList={jest.fn()}
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )


    await waitFor(() => expect(mockMarkMangaCompleted).toHaveBeenCalledWith(
      'https://example.com',
      'user-1',
      manga,
      10,
      'paged',
    ))
  })

  it('remounts the reader at page zero after saving a reread', async () => {
    render(
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={9}
        manga={manga}
        onBack={jest.fn()}
        onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
        onReaderReady={jest.fn()}
        onReturnToDetail={jest.fn()}
        onReturnToList={jest.fn()}
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )
    await waitFor(() => expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getByLabelText('从头重读'))
    await waitFor(() => expect(screen.getByText('paged:0')).toBeOnTheScreen())
    expect(mockRestartMangaReading).toHaveBeenCalledWith('https://example.com', 'user-1', manga, 10, 'paged')
    expect(screen.getByLabelText('paged-mount-2-epoch-0')).toBeOnTheScreen()
    expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(1)
  })

  it('shows black during a viewport transition and remounts at the current page', () => {
    const element = () => (
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={3}
        manga={manga}
        onBack={jest.fn()}
        onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
        onReaderReady={jest.fn()}
        onReturnToDetail={jest.fn()}
        onReturnToList={jest.fn()}
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />
    )
    const view = render(element())
    fireEvent.press(screen.getByLabelText('翻页模式更新页码'))
    expect(screen.getByText('paged:5')).toBeOnTheScreen()
    expect(screen.getByLabelText('paged-mount-1-epoch-0')).toBeOnTheScreen()

    mockViewport = { ...mockViewport, isTransitioning: true }
    view.rerender(element())
    expect(screen.queryByText('paged:5')).toBeNull()
    expect(screen.getByTestId('reader-viewport-transition')).toBeOnTheScreen()

    mockViewport = {
      ...mockViewport,
      width: 844,
      height: 390,
      epoch: 1,
      isTransitioning: false,
    }
    view.rerender(element())
    expect(screen.getByText('paged:5')).toBeOnTheScreen()
    expect(screen.getByLabelText('paged-mount-2-epoch-1')).toBeOnTheScreen()
  })

  it('initializes once when refreshed metadata replaces the manga object', async () => {
    jest.useFakeTimers()
    const onReaderReady = jest.fn()
    const element = (value: MangaDetail) => (
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={1}
        manga={value}
        onBack={jest.fn()}
        onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
        onReaderReady={onReaderReady}
        onReturnToDetail={jest.fn()}
        onReturnToList={jest.fn()}
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />
    )
    const view = render(element(manga))
    await waitFor(() => expect(onReaderReady).toHaveBeenCalledTimes(1))
    mockSaveReadingProgress.mockClear()

    fireEvent.press(screen.getByLabelText('翻页模式更新页码'))
    view.rerender(element({ ...manga, pages: [...manga.pages] }))
    expect(screen.getByText('paged:3')).toBeOnTheScreen()
    const shortenedManga = { ...manga, pages: manga.pages.slice(0, 3) }
    view.rerender(element(shortenedManga))
    expect(screen.getByText('paged:2')).toBeOnTheScreen()
    await act(async () => { jest.advanceTimersByTime(400) })

    expect(onReaderReady).toHaveBeenCalledTimes(1)
    expect(mockSaveReadingProgress).toHaveBeenCalledTimes(1)
    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com',
      'user-1',
      'manga-1',
      3,
      2,
      'paged',
      shortenedManga,
    )
  })

  it('closes reader settings whenever the app leaves the active state', () => {
    let appStateListener: ((state: 'background') => void) | undefined
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, listener) => {
      appStateListener = listener as (state: 'background') => void
      return { remove: jest.fn() } as NativeEventSubscription
    }) as typeof AppState.addEventListener)
    render(
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={0}
        manga={manga}
        onBack={jest.fn()}
        onRefreshMetadata={jest.fn().mockResolvedValue(undefined)}
        onReaderReady={jest.fn()}
        onReturnToDetail={jest.fn()}
        onReturnToList={jest.fn()}
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )

    fireEvent.press(screen.getByLabelText('打开阅读设置'))
    expect(screen.getByText('settings-open')).toBeOnTheScreen()
    act(() => appStateListener?.('background'))
    expect(screen.queryByText('settings-open')).toBeNull()
  })
})
