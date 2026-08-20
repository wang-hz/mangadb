import { act, render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import type { MangaDetail } from '@/api/types'
import {
  useDownloadActions,
  useDownloadManifest,
} from '@/downloads/DownloadContext'
import { createDownloadManifest } from '@/downloads/types'
import { useLocalDownload } from '@/downloads/useLocalDownload'

let mockAppActive = true
const mockAppStateListeners = new Set<() => void>()

jest.mock('@/downloads/DownloadContext', () => ({
  useDownloadActions: jest.fn(),
  useDownloadManifest: jest.fn(),
}))

jest.mock('@/query/nativeState', () => ({
  getNativeAppActive: () => mockAppActive,
  subscribeNativeAppState: (listener: () => void) => {
    mockAppStateListeners.add(listener)
    return () => mockAppStateListeners.delete(listener)
  },
}))

const manga: MangaDetail = {
  uuid: 'manga-1',
  displayTitle: '离线漫画',
  originalTitle: 'Offline Manga',
  fullname: 'offline-manga',
  publishDate: null,
  cover: 0,
  createAt: '2026-07-01T00:00:00.000Z',
  updateAt: '2026-07-27T00:00:00.000Z',
  pages: ['0.jpg', '1.jpg'],
  mangaTags: [],
}

describe('useLocalDownload', () => {
  beforeEach(() => {
    mockAppActive = true
    mockAppStateListeners.clear()
  })

  it('exposes downloaded metadata only after every local page is verified', async () => {
    const manifest = completedManifest()
    const localPagesFor = jest.fn().mockResolvedValue([
      'file:///downloads/000000.page',
      'file:///downloads/000001.page',
    ])
    mockDownloads({ manifest, localPagesFor })

    render(<Probe />)

    expect(screen.getByText('loading:离线漫画')).toBeOnTheScreen()
    await waitFor(() => expect(screen.getByText(
      'available:离线漫画:file:///downloads/000000.page',
    )).toBeOnTheScreen())
    expect(localPagesFor).toHaveBeenCalledWith('manga-1')
  })

  it('rejects corrupt local files while retaining metadata for an error message', async () => {
    const manifest = completedManifest()
    mockDownloads({
      manifest,
      localPagesFor: jest.fn().mockRejectedValue(new Error('第 2 页损坏或缺失')),
    })

    render(<Probe />)

    await waitFor(() => expect(screen.getByText(
      'error:离线漫画:第 2 页损坏或缺失',
    )).toBeOnTheScreen())
  })

  it('does not expose an incomplete manifest', () => {
    const manifest = completedManifest()
    manifest.state = 'paused'
    mockDownloads({ manifest, localPagesFor: jest.fn() })

    render(<Probe />)

    expect(screen.getByText('unavailable')).toBeOnTheScreen()
  })

  it('revalidates completed page files whenever the app returns to the foreground', async () => {
    const manifest = completedManifest()
    const secondVerification = deferred<string[]>()
    const verifiedPages = [
      'file:///downloads/000000.page',
      'file:///downloads/000001.page',
    ]
    const localPagesFor = jest.fn()
      .mockResolvedValueOnce(verifiedPages)
      .mockImplementationOnce(() => secondVerification.promise)
    mockDownloads({ manifest, localPagesFor })
    render(<Probe />)

    await waitFor(() => expect(screen.getByText(
      'available:离线漫画:file:///downloads/000000.page',
    )).toBeOnTheScreen())
    setAppActive(false)
    expect(screen.getByText('loading:离线漫画')).toBeOnTheScreen()
    setAppActive(true)
    expect(screen.getByText('loading:离线漫画')).toBeOnTheScreen()
    await waitFor(() => expect(localPagesFor).toHaveBeenCalledTimes(2))
    secondVerification.resolve(verifiedPages)
    await waitFor(() => expect(screen.getByText(
      'available:离线漫画:file:///downloads/000000.page',
    )).toBeOnTheScreen())
  })
})

function setAppActive(active: boolean) {
  act(() => {
    mockAppActive = active
    mockAppStateListeners.forEach(listener => listener())
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve })
  return { promise, resolve }
}

function Probe() {
  const local = useLocalDownload('manga-1')
  const fields = [
    local.status,
    local.manga?.displayTitle,
    local.pageUris?.[0] ?? local.error,
  ].filter(Boolean)
  return <Text>{fields.join(':')}</Text>
}

function completedManifest() {
  const manifest = createDownloadManifest(
    { serverUrl: 'https://example.com', userUuid: 'user-1' },
    manga,
    new Date('2026-07-27T12:00:00.000Z'),
  )
  manifest.state = 'completed'
  manifest.pages = manifest.pages.map(page => ({
    ...page,
    state: 'completed',
    bytesWritten: 10,
    expectedBytes: 10,
  }))
  return manifest
}

function mockDownloads({
  manifest,
  localPagesFor,
}: {
  manifest: ReturnType<typeof completedManifest>
  localPagesFor: jest.Mock
}) {
  jest.mocked(useDownloadManifest).mockReturnValue(manifest)
  jest.mocked(useDownloadActions).mockReturnValue({
    status: 'ready',
    error: null,
    preferences: { wifiOnly: true },
    enqueue: jest.fn(),
    update: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    retry: jest.fn(),
    deleteDownload: jest.fn(),
    clearCurrentDownloads: jest.fn(),
    clearAllDownloads: jest.fn(),
    setWifiOnly: jest.fn(),
    localPagesFor,
  })
}
