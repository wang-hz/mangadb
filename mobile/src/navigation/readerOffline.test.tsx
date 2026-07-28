import { render, screen, waitFor } from '@testing-library/react-native'
import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { MangaDetail } from '@/api/types'
import ReaderScreen from '@/app/(app)/reader/[uuid]'
import { useLocalDownload } from '@/downloads/useLocalDownload'
import { useReaderPreferences } from '@/providers/ReaderPreferencesContext'
import { useSession } from '@/session/SessionContext'

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }))
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    replace: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
}))
jest.mock('@/downloads/useLocalDownload', () => ({ useLocalDownload: jest.fn() }))
jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }))
jest.mock('@/providers/ReaderPreferencesContext', () => ({
  useReaderPreferences: jest.fn(),
}))
jest.mock('@/storage/progress', () => ({
  loadReadingProgress: jest.fn().mockResolvedValue(null),
}))
jest.mock('@/components/reader/ReaderExperience', () => {
  const { Text } = require('react-native')
  return {
    ReaderExperience: ({
      manga,
      localPageUris,
    }: {
      manga: MangaDetail
      localPageUris?: readonly string[]
    }) => (
      <Text>
        reader:{manga.displayTitle}:{localPageUris?.[0] ?? 'network'}
      </Text>
    ),
  }
})

const manga: MangaDetail = {
  uuid: 'manga-1',
  displayTitle: '离线漫画',
  originalTitle: 'Offline Manga',
  fullname: 'offline-manga',
  publishDate: null,
  cover: 0,
  createAt: '2026-07-01T00:00:00.000Z',
  updateAt: '2026-07-27T00:00:00.000Z',
  pages: ['0.jpg'],
  mangaTags: [],
}

describe('ReaderScreen offline launch', () => {
  beforeEach(() => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ uuid: 'manga-1' })
    jest.mocked(useSession).mockReturnValue({
      status: 'authenticated',
      serverUrl: 'https://example.com',
      auth: {
        token: 'token',
        user: {
          uuid: 'user-1',
          username: 'reader',
          role: 'user',
          expiresAt: Date.now() + 60_000,
        },
      },
      api: {} as never,
      configureServer: jest.fn(),
      authenticate: jest.fn(),
      signOut: jest.fn(),
      clearServer: jest.fn(),
    })
    jest.mocked(useReaderPreferences).mockReturnValue({
      status: 'ready',
      preferences: {
        defaultMode: 'paged',
        pagedDirection: 'ltr',
        pagedFit: 'contain',
        scrollGap: 0,
        keepAwake: false,
        controlsAutoHideMs: 3000,
        readerDimLevel: 0,
        doubleTapZoomScale: 2,
      },
      updatePreferences: jest.fn(),
    })
    jest.mocked(useQuery).mockReturnValue({
      data: undefined,
      error: null,
      fetchStatus: 'paused',
      isError: false,
      isPending: true,
      refetch: jest.fn(),
    } as never)
  })

  it('opens a verified complete download while the network query is paused', async () => {
    jest.mocked(useLocalDownload).mockReturnValue({
      status: 'available',
      manga,
      pageUris: ['file:///downloads/000000.page'],
      error: null,
    })

    renderReader()

    await waitFor(() => expect(screen.getByText(
      'reader:离线漫画:file:///downloads/000000.page',
    )).toBeOnTheScreen())
  })

  it('shows an actionable offline error when no complete download exists', () => {
    jest.mocked(useLocalDownload).mockReturnValue({
      status: 'unavailable',
      manga: null,
      pageUris: null,
      error: null,
    })

    renderReader()

    expect(screen.getByText('当前处于离线状态，且本机没有可用的完整下载。'))
      .toBeOnTheScreen()
    expect(screen.queryByText('正在准备漫画页面')).not.toBeOnTheScreen()
  })
})

function renderReader() {
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}>
      <ReaderScreen />
    </SafeAreaProvider>,
  )
}
