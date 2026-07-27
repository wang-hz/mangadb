import { ApiClient, ApiError } from '@/api/client'
import {
  type DownloadPageFileStore,
  ExpoDownloadFileStore,
} from '@/downloads/files'
import type { DownloadPagePaths } from '@/downloads/repository'
import {
  type DownloadStorageMonitor,
  DownloadLowStorageError,
  ExpoDownloadStorageMonitor,
} from '@/downloads/storage'
import type { DownloadFailureCode } from '@/downloads/types'

export interface DownloadPageRequest {
  api: ApiClient
  mangaUuid: string
  pageIndex: number
  paths: DownloadPagePaths
  signal?: AbortSignal
}

export interface DownloadedPage {
  bytesWritten: number
  expectedBytes: number | null
  etag: string | null
  lastModified: string | null
  contentType: string | null
}

export class DownloadPageError extends Error {
  constructor(
    message: string,
    public readonly code: DownloadFailureCode,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DownloadPageError'
  }
}

export class DownloadPageCancelledError extends Error {
  constructor() {
    super('页面下载已取消')
    this.name = 'DownloadPageCancelledError'
  }
}

export class DownloadPageDownloader {
  constructor(
    private readonly files: DownloadPageFileStore = new ExpoDownloadFileStore(),
    private readonly storage: DownloadStorageMonitor = new ExpoDownloadStorageMonitor(),
  ) {}

  async download(request: DownloadPageRequest): Promise<DownloadedPage> {
    const { api, mangaUuid, pageIndex, paths, signal } = request
    if (!mangaUuid.trim() || !Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new DownloadPageError('页面下载参数无效', 'unknown', false)
    }
    if (signal?.aborted) throw new DownloadPageCancelledError()
    this.assertStorage(0)

    let response: Response
    try {
      response = await api.requestResponse(
        `/api/file/mangas/${encodeURIComponent(mangaUuid)}/pages/${pageIndex}`,
        { headers: { Accept: 'image/*' }, signal },
      )
    } catch (error) {
      if (signal?.aborted) throw new DownloadPageCancelledError()
      throw classifyRequestError(error)
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      if (signal?.aborted) throw new DownloadPageCancelledError()
      throw new DownloadPageError('无法读取页面响应', 'network', true, error)
    }
    if (signal?.aborted) throw new DownloadPageCancelledError()

    const expectedBytes = parseContentLength(response.headers.get('content-length'))
    if (bytes.byteLength === 0) {
      throw new DownloadPageError('服务器返回了空页面', 'invalid-content', false)
    }
    if (expectedBytes !== null && bytes.byteLength !== expectedBytes) {
      throw new DownloadPageError(
        `页面长度不匹配（预期 ${expectedBytes}，实际 ${bytes.byteLength}）`,
        'invalid-content',
        true,
      )
    }
    this.assertStorage(bytes.byteLength)

    try {
      await this.files.writePageAtomic(paths.partialUri, paths.completedUri, bytes)
    } catch (error) {
      throw new DownloadPageError('无法保存下载页面', 'filesystem', true, error)
    }

    return {
      bytesWritten: bytes.byteLength,
      expectedBytes,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      contentType: response.headers.get('content-type'),
    }
  }

  private assertStorage(requiredBytes: number): void {
    try {
      this.storage.assertCanWrite(requiredBytes)
    } catch (error) {
      if (error instanceof DownloadLowStorageError) {
        throw new DownloadPageError(error.message, 'low-storage', false, error)
      }
      throw error
    }
  }
}

function classifyRequestError(error: unknown): DownloadPageError {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return new DownloadPageError(error.message, 'network', true, error)
    }
    if (error.status === 401) {
      return new DownloadPageError('登录已过期，下载已暂停', 'unauthorized', false, error)
    }
    if (error.status === 403) {
      return new DownloadPageError('当前账号没有下载权限', 'forbidden', false, error)
    }
    if (error.status === 404) {
      return new DownloadPageError('漫画或页面不存在', 'not-found', false, error)
    }
    return new DownloadPageError(error.message, 'unknown', error.status >= 500, error)
  }
  return new DownloadPageError('页面下载失败', 'network', true, error)
}

function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const length = Number(value)
  return Number.isSafeInteger(length) ? length : null
}
