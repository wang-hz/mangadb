import { act, fireEvent, render as renderNative, screen, waitFor } from '@testing-library/react-native'
import { useKeepAwake } from 'expo-keep-awake'
import type { ReactNode } from 'react'
import { AppState, type NativeEventSubscription } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { DEFAULT_READER_PREFERENCES } from '@/storage/readerPreferences'
import { ReaderExperience } from './ReaderExperience'

const mockSaveReadingProgress = jest.fn()
const mockMarkMangaCompleted = jest.fn()
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
  saveReadingProgress: (...args: unknown[]) => mockSaveReadingProgress(...args),
}))

jest.mock('@/components/reader/ReaderSettingsModal', () => ({
  ReaderSettingsModal: ({ visible, onDefaultModeChange, onClose }: {
    visible: boolean
    onDefaultModeChange: (mode: 'paged' | 'scroll') => void
    onClose: () => void
  }) => {
    const React = require('react')
    const { Pressable, Text, View } = require('react-native')
    return visible ? React.createElement(
      View,
      null,
      React.createElement(Text, null, 'settings-open'),
      React.createElement(Pressable, {
        accessibilityLabel: '切换到滚动模式',
        onPress: () => onDefaultModeChange('scroll'),
      }),
      React.createElement(Pressable, {
        accessibilityLabel: '切换到翻页模式',
        onPress: () => onDefaultModeChange('paged'),
      }),
      React.createElement(Pressable, {
        accessibilityLabel: '关闭阅读设置',
        onPress: onClose,
      }),
    ) : null
  },
}))

jest.mock('@/components/reader/PagedReader', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    PagedReader: ({ pageIndex, onPageChange, onOpenInfo, onOpenSettings, modalVisible, viewport }: {
      pageIndex: number
      onPageChange: (pageIndex: number) => void
      onOpenInfo: () => void
      onOpenSettings: () => void
      modalVisible: boolean
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
        React.createElement(Text, null, `paged-modal:${modalVisible}`),
        React.createElement(Text, { accessibilityLabel: `paged-mount-${mount}-epoch-${viewport.epoch}` }),
        React.createElement(Pressable, {
          accessibilityLabel: '翻页模式更新页码',
          onPress: () => onPageChange(pageIndex + 2),
        }),
        React.createElement(Pressable, {
          accessibilityLabel: '翻页模式上一页',
          onPress: () => onPageChange(pageIndex - 1),
        }),
        React.createElement(Pressable, {
          accessibilityLabel: '打开漫画信息',
          onPress: onOpenInfo,
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
    ScrollingReader: ({ pageIndex, onPageChange, onOpenInfo, onOpenSettings, modalVisible }: {
      pageIndex: number
      onPageChange: (pageIndex: number) => void
      onOpenInfo: () => void
      onOpenSettings: () => void
      modalVisible: boolean
    }) => React.createElement(
      View,
      null,
      React.createElement(Text, null, `scroll:${pageIndex}`),
      React.createElement(Text, null, `scroll-modal:${modalVisible}`),
      React.createElement(Pressable, {
        accessibilityLabel: '滚动模式上一页',
        onPress: () => onPageChange(pageIndex - 1),
      }),
      React.createElement(Pressable, {
        accessibilityLabel: '打开漫画信息',
        onPress: onOpenInfo,
      }),
      React.createElement(Pressable, {
        accessibilityLabel: '滚动模式更新页码',
        onPress: () => onPageChange(pageIndex + 1),
      }),
      React.createElement(Pressable, {
        accessibilityLabel: '打开阅读设置',
        onPress: onOpenSettings,
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

function SafeAreaWrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 44, left: 0, right: 0, bottom: 34 },
    }}>
      {children}
    </SafeAreaProvider>
  )
}

function render(component: React.ReactElement) {
  return renderNative(component, { wrapper: SafeAreaWrapper })
}

function experienceProps(patch: Partial<React.ComponentProps<typeof ReaderExperience>> = {}) {
  return {
    api: {} as ApiClient,
    initialMode: 'paged' as const,
    initialPageIndex: 3,
    manga,
    onBack: jest.fn(),
    onRefreshMetadata: jest.fn().mockResolvedValue(undefined),
    onReaderReady: jest.fn(),
    onReturnToDetail: jest.fn(),
    onReturnToList: jest.fn(),
    preferences: DEFAULT_READER_PREFERENCES,
    serverUrl: 'https://example.com',
    userUuid: 'user-1',
    ...patch,
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(finish => { resolve = finish })
  return { promise, resolve }
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
    mockSaveReadingProgress.mockReset().mockResolvedValue({
      pageIndex: 3,
      mode: 'paged',
      updatedAt: '2026-07-19T00:00:00.000Z',
    })
    mockMarkMangaCompleted.mockReset().mockResolvedValue({})
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

    fireEvent.press(screen.getByLabelText('打开阅读设置'))
    fireEvent.press(screen.getByLabelText('切换到滚动模式'))
    fireEvent.press(screen.getByLabelText('关闭阅读设置'))
    expect(screen.getByText('scroll:5')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('滚动模式更新页码'))
    expect(screen.getByText('scroll:6')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('打开阅读设置'))
    fireEvent.press(screen.getByLabelText('切换到翻页模式'))
    fireEvent.press(screen.getByLabelText('关闭阅读设置'))
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

  it.each(['paged', 'scroll'] as const)('opens and closes manga information in %s mode', mode => {
    render(<ReaderExperience {...experienceProps({ initialMode: mode })} />)

    expect(screen.queryByText('漫画信息')).toBeNull()
    expect(screen.getByText(`${mode}-modal:false`)).toBeOnTheScreen()
    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    expect(screen.getByText('漫画信息')).toBeOnTheScreen()
    expect(screen.getByText('测试漫画')).toBeOnTheScreen()
    expect(screen.getByText(`${mode}-modal:true`)).toBeOnTheScreen()
    expect(screen.queryByText('settings-open')).toBeNull()
    expect(screen.queryByText('从头重读')).toBeNull()

    fireEvent.press(screen.getByLabelText('关闭漫画信息'))
    expect(screen.queryByText('漫画信息')).toBeNull()
    expect(screen.getByText(`${mode}-modal:false`)).toBeOnTheScreen()
  })

  it.each([
    { mode: 'paged' as const, label: '返回漫画', destination: 'detail' },
    { mode: 'paged' as const, label: '返回列表', destination: 'list' },
    { mode: 'scroll' as const, label: '返回漫画', destination: 'detail' },
    { mode: 'scroll' as const, label: '返回列表', destination: 'list' },
  ])('saves the current page before $label in $mode mode', async ({ mode, label, destination }) => {
    const props = experienceProps({ initialMode: mode })
    render(<ReaderExperience {...props} />)
    await act(async () => {})
    const saved = deferred()
    mockSaveReadingProgress.mockImplementationOnce(() => saved.promise)

    fireEvent.press(screen.getByLabelText(mode === 'paged' ? '翻页模式更新页码' : '滚动模式更新页码'))
    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    fireEvent.press(screen.getByRole('button', { name: label }))

    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com', 'user-1', 'manga-1', 10,
      mode === 'paged' ? 5 : 4, mode, manga,
    )
    expect(props.onReturnToDetail).not.toHaveBeenCalled()
    expect(props.onReturnToList).not.toHaveBeenCalled()
    expect(mockMarkMangaCompleted).not.toHaveBeenCalled()

    await act(async () => { saved.resolve() })
    expect(props.onReturnToDetail).toHaveBeenCalledTimes(destination === 'detail' ? 1 : 0)
    expect(props.onReturnToList).toHaveBeenCalledTimes(destination === 'list' ? 1 : 0)
    expect(screen.queryByText('漫画信息')).toBeNull()
    expect(mockMarkMangaCompleted).not.toHaveBeenCalled()
  })

  it('schedules a fresh position save after a failed return attempt', async () => {
    const props = experienceProps()
    render(<ReaderExperience {...props} />)
    await act(async () => {})
    mockSaveReadingProgress.mockClear()
    mockSaveReadingProgress.mockRejectedValueOnce(new Error('无法保存本机进度'))

    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无法保存本机进度')
    expect(props.onReturnToDetail).not.toHaveBeenCalled()
    expect(mockSaveReadingProgress).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    await waitFor(() => expect(props.onReturnToDetail).toHaveBeenCalledTimes(1))
    expect(mockSaveReadingProgress).toHaveBeenCalledTimes(2)
    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com', 'user-1', 'manga-1', 10, 3, 'paged', manga,
    )
    expect(mockMarkMangaCompleted).not.toHaveBeenCalled()
  })

  it('waits for the automatic final-page completion before navigating once', async () => {
    const completed = deferred()
    mockMarkMangaCompleted.mockImplementationOnce(() => completed.promise)
    const props = experienceProps({ initialPageIndex: 9 })
    render(<ReaderExperience {...props} />)
    await waitFor(() => expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(1))

    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    fireEvent.press(screen.getByRole('button', { name: '返回列表' }))
    await act(async () => {})
    expect(props.onReturnToList).not.toHaveBeenCalled()
    expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(1)

    await act(async () => { completed.resolve() })
    expect(props.onReturnToList).toHaveBeenCalledTimes(1)
    expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(1)
  })

  it('retries failed final-page completion through the information return button', async () => {
    mockMarkMangaCompleted
      .mockRejectedValueOnce(new Error('自动保存完成状态失败'))
      .mockRejectedValueOnce(new Error('完成状态仍无法保存'))
    const props = experienceProps({ initialPageIndex: 9 })
    render(<ReaderExperience {...props} />)
    await waitFor(() => expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(1))
    await act(async () => {})

    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('完成状态仍无法保存')
    expect(props.onReturnToDetail).not.toHaveBeenCalled()
    expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(2)

    fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    await waitFor(() => expect(props.onReturnToDetail).toHaveBeenCalledTimes(1))
    expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(3)
  })

  it('returns from an initially completed manga without completing it again', async () => {
    const props = experienceProps({ initialPageIndex: 9, initialCompleted: true })
    render(<ReaderExperience {...props} />)
    await act(async () => {})

    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    fireEvent.press(screen.getByRole('button', { name: '返回列表' }))
    await waitFor(() => expect(props.onReturnToList).toHaveBeenCalledTimes(1))
    expect(mockMarkMangaCompleted).not.toHaveBeenCalled()
  })

  it('returns from an earlier page without repeating a previous final-page completion', async () => {
    const props = experienceProps({ initialPageIndex: 9 })
    render(<ReaderExperience {...props} />)
    await waitFor(() => expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(1))

    fireEvent.press(screen.getByLabelText('翻页模式上一页'))
    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    fireEvent.press(screen.getByRole('button', { name: '返回列表' }))
    await waitFor(() => expect(props.onReturnToList).toHaveBeenCalledTimes(1))
    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com', 'user-1', 'manga-1', 10, 8, 'paged', manga,
    )
    expect(mockMarkMangaCompleted).toHaveBeenCalledTimes(1)
  })

  it('closes information and cancels pending navigation when backgrounded', async () => {
    let appStateListener: ((state: 'background') => void) | undefined
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event, listener) => {
      appStateListener = listener as (state: 'background') => void
      return { remove: jest.fn() } as NativeEventSubscription
    }) as typeof AppState.addEventListener)
    const props = experienceProps()
    render(<ReaderExperience {...props} />)
    await act(async () => {})
    const saved = deferred()
    mockSaveReadingProgress.mockImplementationOnce(() => saved.promise)

    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    act(() => appStateListener?.('background'))
    expect(screen.queryByText('漫画信息')).toBeNull()
    expect(screen.getByText('paged-modal:false')).toBeOnTheScreen()

    await act(async () => { saved.resolve() })
    expect(props.onReturnToDetail).not.toHaveBeenCalled()
    expect(props.onReturnToList).not.toHaveBeenCalled()
  })

  it('closes information and cancels pending navigation during a viewport transition', async () => {
    const props = experienceProps()
    const view = render(<ReaderExperience {...props} />)
    await act(async () => {})
    const saved = deferred()
    mockSaveReadingProgress.mockImplementationOnce(() => saved.promise)

    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    fireEvent.press(screen.getByRole('button', { name: '返回列表' }))
    mockViewport = { ...mockViewport, isTransitioning: true }
    view.rerender(<ReaderExperience {...props} />)
    expect(screen.queryByText('漫画信息')).toBeNull()
    expect(screen.getByTestId('reader-viewport-transition')).toBeOnTheScreen()

    await act(async () => { saved.resolve() })
    expect(props.onReturnToDetail).not.toHaveBeenCalled()
    expect(props.onReturnToList).not.toHaveBeenCalled()
    mockViewport = { ...mockViewport, isTransitioning: false, epoch: 1 }
    view.rerender(<ReaderExperience {...props} />)
    expect(screen.getByText('paged-modal:false')).toBeOnTheScreen()
    expect(screen.queryByText('漫画信息')).toBeNull()
  })

  it('prevents repeated navigation when both return buttons are pressed', async () => {
    const props = experienceProps()
    render(<ReaderExperience {...props} />)
    await act(async () => {})
    const saved = deferred()
    mockSaveReadingProgress.mockImplementationOnce(() => saved.promise)
    mockSaveReadingProgress.mockClear()

    fireEvent.press(screen.getByLabelText('打开漫画信息'))
    act(() => {
      fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
      fireEvent.press(screen.getByRole('button', { name: '返回列表' }))
      fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    })
    expect(mockSaveReadingProgress).toHaveBeenCalledTimes(1)

    await act(async () => { saved.resolve() })
    expect(props.onReturnToDetail).toHaveBeenCalledTimes(1)
    expect(props.onReturnToList).not.toHaveBeenCalled()
  })
})
