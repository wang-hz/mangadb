import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { useKeepAwake } from 'expo-keep-awake'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { DEFAULT_READER_PREFERENCES } from '@/storage/readerPreferences'
import { ReaderExperience } from './ReaderExperience'

const mockSaveReadingProgress = jest.fn()
const mockMarkMangaCompleted = jest.fn()

jest.mock('@/storage/progress', () => ({
  markMangaCompleted: (...args: unknown[]) => mockMarkMangaCompleted(...args),
  saveReadingProgress: (...args: unknown[]) => mockSaveReadingProgress(...args),
}))

jest.mock('@/components/reader/ReaderSettingsModal', () => ({
  ReaderSettingsModal: () => null,
}))

jest.mock('@/components/reader/PagedReader', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    PagedReader: ({ pageIndex, onPageChange, onModeChange, onMarkCompleted }: {
      pageIndex: number
      onPageChange: (pageIndex: number) => void
      onModeChange: (mode: 'scroll') => void
      onMarkCompleted: () => Promise<void>
    }) => React.createElement(
      View,
      null,
      React.createElement(Text, null, `paged:${pageIndex}`),
      React.createElement(Pressable, {
        accessibilityLabel: '翻页模式更新页码',
        onPress: () => onPageChange(pageIndex + 2),
      }),
      React.createElement(Pressable, {
        accessibilityLabel: '切换到滚动模式',
        onPress: () => onModeChange('scroll'),
      }),
      React.createElement(Pressable, {
        accessibilityLabel: '保存完成状态',
        onPress: () => { void onMarkCompleted() },
      }),
    ),
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
  afterEach(() => jest.useRealTimers())
  beforeEach(() => {
    mockSaveReadingProgress.mockResolvedValue({
      pageIndex: 3,
      mode: 'paged',
      updatedAt: '2026-07-19T00:00:00.000Z',
    })
    mockMarkMangaCompleted.mockResolvedValue({})
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
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )
    expect(useKeepAwake).not.toHaveBeenCalled()
  })

  it('persists an explicit completion action with the current reader mode', async () => {
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
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )

    fireEvent.press(screen.getByLabelText('保存完成状态'))

    await waitFor(() => expect(mockMarkMangaCompleted).toHaveBeenCalledWith(
      'https://example.com',
      'user-1',
      manga,
      10,
      'paged',
    ))
  })
})
