import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { MangaDetail } from '@/api/types'
import { DownloadControls } from '@/components/downloads/DownloadControls'
import { useDownloads } from '@/downloads/DownloadContext'
import { createDownloadManifest } from '@/downloads/types'

jest.mock('@/downloads/DownloadContext', () => ({ useDownloads: jest.fn() }))

const manga: MangaDetail = {
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

describe('DownloadControls', () => {
  it('starts a new download from manga detail', async () => {
    const downloads = downloadContext(null)
    jest.mocked(useDownloads).mockReturnValue(downloads)
    render(<DownloadControls manga={manga} />)

    fireEvent.press(screen.getByText('下载到本机'))

    await waitFor(() => expect(downloads.enqueue).toHaveBeenCalledWith(manga))
    expect(screen.getByText('保存整本漫画，断网后仍可阅读。')).toBeOnTheScreen()
  })

  it('shows durable progress and pauses an active download', async () => {
    const manifest = createDownloadManifest({
      serverUrl: 'https://example.com',
      userUuid: 'user-1',
    }, manga)
    manifest.state = 'downloading'
    manifest.pages[0].state = 'completed'
    const downloads = downloadContext(manifest)
    jest.mocked(useDownloads).mockReturnValue(downloads)
    render(<DownloadControls manga={manga} />)

    expect(screen.getByText('正在下载 · 1/2 页')).toBeOnTheScreen()
    expect(screen.getByLabelText('下载进度 1/2')).toBeOnTheScreen()
    fireEvent.press(screen.getByText('暂停下载'))
    await waitFor(() => expect(downloads.pause).toHaveBeenCalledWith('manga-1'))
  })

  it('does not overwrite a stale completed download', () => {
    const manifest = createDownloadManifest({
      serverUrl: 'https://example.com',
      userUuid: 'user-1',
    }, { ...manga, updateAt: '2026-07-01T00:00:00.000Z' })
    manifest.state = 'completed'
    manifest.pages.forEach(page => { page.state = 'completed' })
    jest.mocked(useDownloads).mockReturnValue(downloadContext(manifest))

    render(<DownloadControls manga={manga} />)

    expect(screen.getByText('已下载版本需要更新')).toBeOnTheScreen()
    expect(screen.getByText(/旧版本会继续保留/)).toBeOnTheScreen()
    expect(screen.queryByText('下载到本机')).not.toBeOnTheScreen()
  })
})

function downloadContext(manifest: ReturnType<typeof createDownloadManifest> | null) {
  return {
    status: 'ready' as const,
    error: null,
    preferences: { wifiOnly: true },
    snapshot: {
      initialized: true,
      eligible: true,
      manifests: manifest ? [manifest] : [],
    },
    enqueue: jest.fn().mockResolvedValue(manifest),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
    deleteDownload: jest.fn().mockResolvedValue(undefined),
    setWifiOnly: jest.fn().mockResolvedValue(undefined),
    manifestFor: jest.fn().mockReturnValue(manifest),
  }
}
