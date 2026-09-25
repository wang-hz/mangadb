import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import DownloadsScreen from '@/app/(app)/(tabs)/settings/downloads'
import { useDownloads } from '@/downloads/DownloadContext'
import { createDownloadManifest } from '@/downloads/types'

jest.mock('@/downloads/DownloadContext', () => ({ useDownloads: jest.fn() }))

describe('DownloadsScreen', () => {
  it('shows active progress, network policy and delegates pause', async () => {
    const manifest = createDownloadManifest({
      serverUrl: 'https://example.com',
      userUuid: 'user-1',
    }, manga())
    manifest.state = 'downloading'
    const firstPage = manifest.pages[0]
    if (!firstPage) throw new Error('missing test page')
    firstPage.state = 'completed'
    const pause = jest.fn().mockResolvedValue(undefined)
    jest.mocked(useDownloads).mockReturnValue(downloadContext([manifest], {
      eligible: false,
      pause,
    }))

    render(<DownloadsScreen />)

    expect(screen.getByText('正在下载 · 1/2 页')).toBeOnTheScreen()
    expect(screen.getByText('等待符合下载设置的网络连接')).toBeOnTheScreen()
    fireEvent.press(screen.getByText('暂停'), { stopPropagation: jest.fn() })
    await waitFor(() => expect(pause).toHaveBeenCalledWith('manga-1'))
  })

  it('filters completed downloads without losing the full count', () => {
    const active = createDownloadManifest({
      serverUrl: 'https://example.com',
      userUuid: 'user-1',
    }, manga())
    const complete = createDownloadManifest({
      serverUrl: 'https://example.com',
      userUuid: 'user-1',
    }, { ...manga(), uuid: 'manga-2', displayTitle: '完成漫画' })
    complete.state = 'completed'
    complete.pages.forEach(page => { page.state = 'completed' })
    jest.mocked(useDownloads).mockReturnValue(downloadContext([active, complete]))

    render(<DownloadsScreen />)
    expect(screen.getByText('2 本')).toBeOnTheScreen()

    fireEvent.press(screen.getByText('已完成'))
    expect(screen.getByText('完成漫画')).toBeOnTheScreen()
    expect(screen.queryByText('测试漫画')).not.toBeOnTheScreen()
    expect(screen.getByText('2 本')).toBeOnTheScreen()
  })

  it('shows an actionable empty state', () => {
    jest.mocked(useDownloads).mockReturnValue(downloadContext([]))
    render(<DownloadsScreen />)
    expect(screen.getByText('还没有离线漫画')).toBeOnTheScreen()
    expect(screen.getByText('在漫画详情中选择“下载到本机”。')).toBeOnTheScreen()
  })

  it('shows a recoverable row error when an async action rejects', async () => {
    const manifest = createDownloadManifest({
      serverUrl: 'https://example.com',
      userUuid: 'user-1',
    }, manga())
    manifest.state = 'downloading'
    const pause = jest.fn().mockRejectedValue(new Error('filesystem unavailable'))
    jest.mocked(useDownloads).mockReturnValue(downloadContext([manifest], { pause }))

    render(<DownloadsScreen />)
    fireEvent.press(screen.getByText('暂停'), { stopPropagation: jest.fn() })

    expect(await screen.findByText('下载操作失败，请检查本机存储后重试。')).toBeOnTheScreen()
    expect(pause).toHaveBeenCalledTimes(1)
    expect(screen.getByText('暂停')).not.toBeDisabled()
  })
})

function downloadContext(
  manifests: ReturnType<typeof createDownloadManifest>[],
  patch: { eligible?: boolean; pause?: jest.Mock } = {},
) {
  return {
    status: 'ready' as const,
    error: null,
    preferences: { wifiOnly: true },
    snapshot: {
      initialized: true,
      eligible: patch.eligible ?? true,
      manifests,
    },
    enqueue: jest.fn(),
    update: jest.fn(),
    pause: patch.pause ?? jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
    deleteDownload: jest.fn().mockResolvedValue(undefined),
    clearCurrentDownloads: jest.fn().mockResolvedValue(undefined),
    clearAllDownloads: jest.fn().mockResolvedValue(undefined),
    setWifiOnly: jest.fn().mockResolvedValue(undefined),
    storageUsageBytes: manifests.reduce(
      (total, manifest) => total + manifest.pages.reduce(
        (pageTotal, page) => pageTotal + page.bytesWritten,
        0,
      ),
      0,
    ),
    localPagesFor: jest.fn().mockResolvedValue(null),
    manifestFor: jest.fn(),
  }
}

function manga() {
  return {
    uuid: 'manga-1',
    displayTitle: '测试漫画',
    originalTitle: 'Manga',
    fullname: 'manga',
    publishDate: null,
    cover: 0,
    createAt: '2026-07-01T00:00:00.000Z',
    updateAt: '2026-07-27T00:00:00.000Z',
    pages: ['0.jpg', '1.jpg'],
    mangaTags: [],
  }
}
