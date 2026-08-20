import type { ApiClient } from '@/api/client'
import type { DownloadPageFileStore } from '@/downloads/files'
import {
  DownloadPageCancelledError,
  DownloadPageDownloader,
  DownloadPageError,
} from '@/downloads/pageDownloader'
import {
  DownloadLowStorageError,
  type DownloadStorageMonitor,
} from '@/downloads/storage'
import {
  type DownloadTransfer,
  DownloadTransferCancelledError,
} from '@/downloads/transfer'

const paths = {
  partialUri: 'file:///downloads/partial/000001.part',
  completedUri: 'file:///downloads/pages/000001.page',
}

describe('DownloadPageDownloader', () => {
  it('downloads, validates and commits an authenticated page', async () => {
    const files = new MemoryPageFileStore()
    const transfer = successfulTransfer(files, 3, {
      'content-length': '3',
      'content-type': 'image/jpeg',
      etag: '"page-v1"',
      'last-modified': 'Mon, 27 Jul 2026 00:00:00 GMT',
    })
    const api = apiClient()

    await expect(downloaderWith(files, transfer).download({
      api,
      mangaUuid: 'manga/1',
      pageIndex: 1,
      paths,
    })).resolves.toEqual({
      bytesWritten: 3,
      expectedBytes: 3,
      etag: '"page-v1"',
      lastModified: 'Mon, 27 Jul 2026 00:00:00 GMT',
      contentType: 'image/jpeg',
    })
    expect(transfer.start).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/api/file/mangas/manga%2F1/pages/1',
      headers: { Authorization: 'Bearer token', Accept: 'image/*' },
      destinationUri: paths.partialUri,
    }))
    expect(files.promotes).toEqual([paths])
    expect(api.handleExternalResponse).toHaveBeenCalledWith(200)
  })

  it('does not wait for external response handling before classifying the result', async () => {
    const files = new MemoryPageFileStore()
    const transfer = successfulTransfer(files, 1, { 'content-type': 'image/jpeg' }, 401)
    const api = apiClient()
    api.handleExternalResponse = jest.fn(() => new Promise<void>(() => {}))

    await expect(downloaderWith(files, transfer).download({
      api,
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })).rejects.toMatchObject({ code: 'unauthorized', retryable: false })

    expect(api.handleExternalResponse).toHaveBeenCalledWith(401)
    expect(files.deletes).toContain(paths.partialUri)
  })

  it.each([
    [0, null, 'image/jpeg', '服务器返回了空页面'],
    [2, '3', 'image/jpeg', '页面长度不匹配'],
    [2, '2', 'text/html', '内容不是图片'],
  ])('rejects invalid downloaded content %#', async (
    size,
    contentLength,
    contentType,
    message,
  ) => {
    const files = new MemoryPageFileStore()
    const headers: Record<string, string> = { 'content-type': contentType }
    if (contentLength !== null) headers['content-length'] = contentLength

    await expect(downloaderWith(
      files,
      successfulTransfer(files, size, headers),
    ).download({
      api: apiClient(),
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })).rejects.toMatchObject({
      name: 'DownloadPageError',
      code: 'invalid-content',
      message: expect.stringContaining(message),
    })
    expect(files.promotes).toHaveLength(0)
    expect(files.deletes).toContain(paths.partialUri)
  })

  it.each([
    [401, 'unauthorized', false],
    [403, 'forbidden', false],
    [404, 'not-found', false],
    [500, 'unknown', true],
  ])('classifies native HTTP status %#', async (status, code, retryable) => {
    const files = new MemoryPageFileStore()
    const transfer = successfulTransfer(files, 1, { 'content-type': 'image/jpeg' }, status)
    await expect(downloaderWith(files, transfer).download({
      api: apiClient(),
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })).rejects.toMatchObject({ code, retryable })
  })

  it('does not start an already-cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const transfer: DownloadTransfer = { start: jest.fn() }

    await expect(downloaderWith(new MemoryPageFileStore(), transfer).download({
      api: apiClient(),
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
      signal: controller.signal,
    })).rejects.toBeInstanceOf(DownloadPageCancelledError)
    expect(transfer.start).not.toHaveBeenCalled()
  })

  it('cleans partial files when a running transfer is cancelled', async () => {
    const files = new MemoryPageFileStore()
    const transfer: DownloadTransfer = {
      start: jest.fn().mockRejectedValue(new DownloadTransferCancelledError()),
    }
    await expect(downloaderWith(files, transfer).download({
      api: apiClient(),
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })).rejects.toBeInstanceOf(DownloadPageCancelledError)
    expect(files.deletes).toContain(paths.partialUri)
  })

  it('wraps filesystem failures without leaking file paths', async () => {
    const files = new MemoryPageFileStore()
    files.promotePagePartial = jest.fn().mockRejectedValue(new Error('file:///private/path'))

    const operation = downloaderWith(
      files,
      successfulTransfer(files, 1, { 'content-type': 'image/jpeg' }),
    ).download({
      api: apiClient(),
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })

    await expect(operation).rejects.toMatchObject({
      name: 'DownloadPageError',
      code: 'filesystem',
      message: '无法保存下载页面',
    })
  })

  it('checks required space from native progress before writing the page', async () => {
    const storage: DownloadStorageMonitor = {
      snapshot: unlimitedStorageSnapshot,
      assertCanWrite: jest.fn()
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          throw new DownloadLowStorageError(3, 10, 8)
        }),
    }
    const files = new MemoryPageFileStore()
    const transfer = successfulTransfer(files, 3, {
      'content-length': '3',
      'content-type': 'image/jpeg',
    })

    await expect(new DownloadPageDownloader(files, storage, transfer).download({
      api: apiClient(),
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })).rejects.toMatchObject({ code: 'low-storage', retryable: false })
    expect(storage.assertCanWrite).toHaveBeenNthCalledWith(1, 0)
    expect(storage.assertCanWrite).toHaveBeenNthCalledWith(2, 3)
    expect(files.promotes).toHaveLength(0)
  })
})

function apiClient() {
  return {
    url: jest.fn((path: string) => `https://example.com${path}`),
    authorizationHeaders: jest.fn(() => ({ Authorization: 'Bearer token' })),
    handleExternalResponse: jest.fn().mockResolvedValue(undefined),
    handleExternalNetworkFailure: jest.fn(),
  } as unknown as ApiClient
}

function successfulTransfer(
  files: MemoryPageFileStore,
  size: number,
  headers: Record<string, string>,
  status = 200,
): DownloadTransfer {
  return {
    start: jest.fn(async request => {
      request.onProgress?.({ bytesWritten: 0, expectedBytes: size })
      files.size = size
      request.onProgress?.({ bytesWritten: size, expectedBytes: size })
      return {
        uri: paths.partialUri,
        status,
        headers,
        mimeType: headers['content-type'] ?? null,
      }
    }),
  }
}

function downloaderWith(files: DownloadPageFileStore, transfer: DownloadTransfer) {
  const storage: DownloadStorageMonitor = {
    snapshot: unlimitedStorageSnapshot,
    assertCanWrite: jest.fn(),
  }
  return new DownloadPageDownloader(files, storage, transfer)
}

function unlimitedStorageSnapshot() {
  return {
    availableBytes: Number.MAX_SAFE_INTEGER,
    totalBytes: Number.MAX_SAFE_INTEGER,
    reserveBytes: 0,
  }
}

class MemoryPageFileStore implements DownloadPageFileStore {
  size: number | null = null
  readonly promotes: Array<typeof paths> = []
  readonly deletes: string[] = []

  async preparePagePartial() {
    this.size = null
  }

  async pageFileSize() {
    return this.size
  }

  async promotePagePartial(partialUri: string, completedUri: string) {
    this.promotes.push({ partialUri, completedUri })
    this.size = null
  }

  async deletePagePartial(partialUri: string) {
    this.deletes.push(partialUri)
    this.size = null
  }
}
