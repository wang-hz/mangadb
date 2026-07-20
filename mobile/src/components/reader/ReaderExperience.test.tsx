import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { useKeepAwake } from 'expo-keep-awake'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { DEFAULT_READER_PREFERENCES } from '@/storage/readerPreferences'
import { ReaderExperience } from './ReaderExperience'

const mockSaveReadingProgress = jest.fn()

jest.mock('@/storage/progress', () => ({
  saveReadingProgress: (...args: unknown[]) => mockSaveReadingProgress(...args),
}))

jest.mock('@/components/reader/ReaderSettingsModal', () => ({
  ReaderSettingsModal: () => null,
}))

jest.mock('@/components/reader/PagedReader', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    PagedReader: ({ pageIndex, onPageChange, onModeChange }: {
      pageIndex: number
      onPageChange: (pageIndex: number) => void
      onModeChange: (mode: 'scroll') => void
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
  beforeEach(() => {
    mockSaveReadingProgress.mockResolvedValue({
      pageIndex: 3,
      mode: 'paged',
      updatedAt: '2026-07-19T00:00:00.000Z',
    })
  })

  it('keeps the same position while switching between reader modes', async () => {
    const onReaderReady = jest.fn()
    render(
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={3}
        manga={manga}
        onBack={jest.fn()}
        onImageError={jest.fn()}
        onReaderReady={onReaderReady}
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
    )

    fireEvent.press(screen.getByLabelText('翻页模式更新页码'))
    expect(screen.getByText('paged:5')).toBeTruthy()
    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com',
      'user-1',
      'manga-1',
      10,
      5,
      'paged',
    )

    fireEvent.press(screen.getByLabelText('切换到滚动模式'))
    expect(screen.getByText('scroll:5')).toBeTruthy()
    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com',
      'user-1',
      'manga-1',
      10,
      5,
      'scroll',
    )

    fireEvent.press(screen.getByLabelText('滚动模式更新页码'))
    expect(screen.getByText('scroll:6')).toBeTruthy()
    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com',
      'user-1',
      'manga-1',
      10,
      6,
      'scroll',
    )
    fireEvent.press(screen.getByLabelText('切换到翻页模式'))
    expect(screen.getByText('paged:6')).toBeTruthy()
    expect(mockSaveReadingProgress).toHaveBeenLastCalledWith(
      'https://example.com',
      'user-1',
      'manga-1',
      10,
      6,
      'paged',
    )
    expect(mockSaveReadingProgress).toHaveBeenCalledTimes(5)
  })

  it('keeps the screen awake only when the preference is enabled', async () => {
    const { rerender } = render(
      <ReaderExperience
        api={{} as ApiClient}
        initialMode="paged"
        initialPageIndex={0}
        manga={manga}
        onBack={jest.fn()}
        onImageError={jest.fn()}
        onReaderReady={jest.fn()}
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
        onImageError={jest.fn()}
        onReaderReady={jest.fn()}
        preferences={DEFAULT_READER_PREFERENCES}
        serverUrl="https://example.com"
        userUuid="user-1"
      />,
    )
    expect(useKeepAwake).not.toHaveBeenCalled()
  })
})
