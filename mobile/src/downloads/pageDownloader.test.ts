import { ApiError, type ApiClient } from '@/api/client'
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

const paths = {
  partialUri: 'file:///downloads/partial/000001.part',
  completedUri: 'file:///downloads/pages/000001.page',
}

describe('DownloadPageDownloader', () => {
  it('downloads, validates and commits an authenticated page', async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-length': '3',
        'content-type': 'image/jpeg',
        etag: '"page-v1"',
        'last-modified': 'Mon, 27 Jul 2026 00:00:00 GMT',
      },
    })
    const api = apiWithResponse(response)
    const files = new MemoryPageFileStore()
    const downloader = downloaderWith(files)

    await expect(downloader.download({
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
    expect(api.requestResponse).toHaveBeenCalledWith(
      '/api/file/mangas/manga%2F1/pages/1',
      expect.objectContaining({ headers: { Accept: 'image/*' } }),
    )
    expect(files.commits).toEqual([{
      ...paths,
      bytes: new Uint8Array([1, 2, 3]),
    }])
  })

  it.each([
    [new Uint8Array(), null, '服务器返回了空页面'],
    [new Uint8Array([1, 2]), '3', '页面长度不匹配'],
  ])('rejects invalid response bytes %#', async (bytes, contentLength, message) => {
    const files = new MemoryPageFileStore()
    const downloader = downloaderWith(files)
    const headers = contentLength === null ? undefined : { 'content-length': contentLength }

    await expect(downloader.download({
      api: apiWithResponse(new Response(bytes, { status: 200, headers })),
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })).rejects.toMatchObject({
      name: 'DownloadPageError',
      code: 'invalid-content',
      message: expect.stringContaining(message),
    })
    expect(files.commits).toHaveLength(0)
  })

  it.each([
    [new ApiError('Unauthorized', 401), 'unauthorized', false],
    [new ApiError('Forbidden', 403), 'forbidden', false],
    [new ApiError('Missing', 404), 'not-found', false],
    [new ApiError('Offline', 0), 'network', true],
    [new ApiError('Server error', 500), 'unknown', true],
  ])('classifies API failure %#', async (apiError, code, retryable) => {
    const api = {
      requestResponse: jest.fn().mockRejectedValue(apiError),
    } as unknown as ApiClient

    await expect(downloaderWith(new MemoryPageFileStore()).download({
      api,
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })).rejects.toMatchObject({ code, retryable })
  })

  it('does not start an already-cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    const api = apiWithResponse(new Response(new Uint8Array([1])))

    await expect(downloaderWith(new MemoryPageFileStore()).download({
      api,
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
      signal: controller.signal,
    })).rejects.toBeInstanceOf(DownloadPageCancelledError)
    expect(api.requestResponse).not.toHaveBeenCalled()
  })

  it('wraps filesystem failures without leaking file paths', async () => {
    const files: DownloadPageFileStore = {
      writePageAtomic: jest.fn().mockRejectedValue(new Error('file:///private/path')),
    }

    const operation = downloaderWith(files).download({
      api: apiWithResponse(new Response(new Uint8Array([1]))),
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })

    await expect(operation).rejects.toBeInstanceOf(DownloadPageError)
    await expect(operation).rejects.toMatchObject({
      code: 'filesystem',
      message: '无法保存下载页面',
    })
  })

  it('checks free space before requesting and again before writing bytes', async () => {
    const storage: DownloadStorageMonitor = {
      snapshot: unlimitedStorageSnapshot,
      assertCanWrite: jest.fn()
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          throw new DownloadLowStorageError(3, 10, 8)
        }),
    }
    const files = new MemoryPageFileStore()

    await expect(new DownloadPageDownloader(files, storage).download({
      api: apiWithResponse(new Response(new Uint8Array([1, 2, 3]))),
      mangaUuid: 'manga-1',
      pageIndex: 0,
      paths,
    })).rejects.toMatchObject({ code: 'low-storage', retryable: false })
    expect(storage.assertCanWrite).toHaveBeenNthCalledWith(1, 0)
    expect(storage.assertCanWrite).toHaveBeenNthCalledWith(2, 3)
    expect(files.commits).toHaveLength(0)
  })
})

function apiWithResponse(response: Response) {
  return {
    requestResponse: jest.fn().mockResolvedValue(response),
  } as unknown as ApiClient
}

function downloaderWith(files: DownloadPageFileStore) {
  const storage: DownloadStorageMonitor = {
    snapshot: unlimitedStorageSnapshot,
    assertCanWrite: jest.fn(),
  }
  return new DownloadPageDownloader(files, storage)
}

function unlimitedStorageSnapshot() {
  return {
    availableBytes: Number.MAX_SAFE_INTEGER,
    totalBytes: Number.MAX_SAFE_INTEGER,
    reserveBytes: 0,
  }
}

class MemoryPageFileStore implements DownloadPageFileStore {
  readonly commits: Array<{
    partialUri: string
    completedUri: string
    bytes: Uint8Array
  }> = []

  async writePageAtomic(partialUri: string, completedUri: string, bytes: Uint8Array) {
    this.commits.push({
      partialUri,
      completedUri,
      bytes: new Uint8Array(bytes),
    })
  }
}
