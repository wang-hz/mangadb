import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, render, waitFor } from '@testing-library/react-native'
import type { MangaDetail } from '@/api/types'
import {
  DownloadProvider,
  type DownloadQueueController,
  useDownloads,
} from '@/downloads/DownloadContext'
import type { DownloadQueueSnapshot } from '@/downloads/queue'
import { createDownloadManifest } from '@/downloads/types'
import { useSession } from '@/session/SessionContext'

jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }))

describe('DownloadProvider', () => {
  let downloads: ReturnType<typeof useDownloads>

  function Probe() {
    downloads = useDownloads()
    return null
  }

  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('{"wifiOnly":true}')
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
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
  })

  it('initializes an identity queue and applies preference/network eligibility', async () => {
    const queue = new FakeDownloadQueue()
    const createQueue = jest.fn().mockReturnValue(queue)
    const view = render(
      <DownloadProvider createQueue={createQueue}>
        <Probe />
      </DownloadProvider>,
    )

    await waitFor(() => expect(downloads.status).toBe('ready'))
    expect(createQueue).toHaveBeenCalledWith(expect.objectContaining({
      serverUrl: 'https://example.com',
      userUuid: 'user-1',
    }))
    expect(queue.setEligible).toHaveBeenCalledWith(false)

    await act(async () => { await downloads.setWifiOnly(false) })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'mangadb.downloadPreferences.v1',
      '{"wifiOnly":false}',
    )
    await waitFor(() => expect(queue.setEligible).toHaveBeenLastCalledWith(true))

    const item = manga()
    await act(async () => { await downloads.enqueue(item) })
    expect(queue.enqueue).toHaveBeenCalledWith(item)

    view.unmount()
    expect(queue.stop).toHaveBeenCalledTimes(1)
  })

  it('does not create a queue without an authenticated identity', async () => {
    jest.mocked(useSession).mockReturnValue({
      status: 'needs-login',
      serverUrl: 'https://example.com',
      auth: null,
      api: {} as never,
      configureServer: jest.fn(),
      authenticate: jest.fn(),
      signOut: jest.fn(),
      clearServer: jest.fn(),
    })
    const createQueue = jest.fn()
    render(
      <DownloadProvider createQueue={createQueue}>
        <Probe />
      </DownloadProvider>,
    )

    await waitFor(() => expect(downloads.status).toBe('unavailable'))
    expect(createQueue).not.toHaveBeenCalled()
  })
})

class FakeDownloadQueue implements DownloadQueueController {
  private snapshot: DownloadQueueSnapshot = {
    initialized: false,
    eligible: false,
    manifests: [],
  }
  private listener: (() => void) | null = null

  getSnapshot = jest.fn(() => this.snapshot)
  subscribe = jest.fn((listener: () => void) => {
    this.listener = listener
    return () => { this.listener = null }
  })
  setEligible = jest.fn((eligible: boolean) => {
    this.snapshot = { ...this.snapshot, eligible }
    this.listener?.()
  })
  initialize = jest.fn(async () => {
    this.snapshot = { ...this.snapshot, initialized: true }
    this.listener?.()
  })
  enqueue = jest.fn(async (item: MangaDetail) => createDownloadManifest({
    serverUrl: 'https://example.com',
    userUuid: 'user-1',
  }, item))
  pause = jest.fn(async () => {})
  resume = jest.fn(async () => {})
  retry = jest.fn(async () => {})
  delete = jest.fn(async () => {})
  localPageUris = jest.fn(async () => null)
  clearCurrent = jest.fn(async () => {})
  clearAll = jest.fn(async () => {})
  stop = jest.fn(async () => {})
}

function manga(): MangaDetail {
  return {
    uuid: 'manga-1',
    displayTitle: 'Manga',
    originalTitle: 'Manga',
    fullname: 'manga',
    publishDate: null,
    cover: 0,
    createAt: '2026-07-01T00:00:00.000Z',
    updateAt: '2026-07-27T00:00:00.000Z',
    pages: ['0.jpg'],
    mangaTags: [],
  }
}
