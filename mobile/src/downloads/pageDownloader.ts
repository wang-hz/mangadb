import { ApiClient } from '@/api/client'
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
import { reportDownloadTelemetry } from '@/downloads/telemetry'
import {
  type DownloadTransfer,
  DownloadTransferCancelledError,
  DownloadTransferTimeoutError,
  ExpoDownloadTransfer,
} from '@/downloads/transfer'
import type { DownloadFailureCode } from '@/downloads/types'

const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000
const STORAGE_RECHECK_BYTES = 8 * 1024 * 1024

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
    private readonly transfer: DownloadTransfer = new ExpoDownloadTransfer(),
  ) {}

  async download(request: DownloadPageRequest): Promise<DownloadedPage> {
    const { api, mangaUuid, pageIndex, paths, signal } = request
    const startedAt = Date.now()
    let observedBytes = 0
    let observedExpectedBytes: number | null = null
    if (!mangaUuid.trim() || !Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new DownloadPageError('页面下载参数无效', 'unknown', false)
    }
    if (signal?.aborted) throw new DownloadPageCancelledError()

    let committed = false
    let lastStorageCheckAt = -STORAGE_RECHECK_BYTES
    let progressExpectedBytes: number | null = null
    try {
      this.assertStorage(0)
      try {
        await this.files.preparePagePartial(paths.partialUri)
      } catch (error) {
        throw new DownloadPageError('无法准备页面文件', 'filesystem', true, error)
      }
      const result = await this.transfer.start({
        url: api.url(
          `/api/file/mangas/${encodeURIComponent(mangaUuid)}/pages/${pageIndex}`,
        ),
        headers: { ...api.authorizationHeaders(), Accept: 'image/*' },
        destinationUri: paths.partialUri,
        signal,
        idleTimeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS,
        onProgress: progress => {
          observedBytes = progress.bytesWritten
          observedExpectedBytes = progress.expectedBytes
          progressExpectedBytes = progress.expectedBytes
          if (
            progress.bytesWritten - lastStorageCheckAt < STORAGE_RECHECK_BYTES &&
            progress.bytesWritten > 0
          ) return
          lastStorageCheckAt = progress.bytesWritten
          const remaining = progress.expectedBytes === null
            ? 0
            : Math.max(0, progress.expectedBytes - progress.bytesWritten)
          this.assertStorage(remaining)
        },
      })
      void api.handleExternalResponse(result.status)
      if (result.status < 200 || result.status >= 300) throw classifyStatus(result.status)
      if (signal?.aborted) throw new DownloadPageCancelledError()

      let bytesWritten: number | null
      try {
        bytesWritten = await this.files.pageFileSize(paths.partialUri)
      } catch (error) {
        throw new DownloadPageError('无法校验下载页面', 'filesystem', true, error)
      }
      const expectedBytes = parseContentLength(headerValue(result.headers, 'content-length'))
        ?? progressExpectedBytes
      const contentType = headerValue(result.headers, 'content-type') ?? result.mimeType
      if (bytesWritten === null || bytesWritten <= 0) {
        throw new DownloadPageError('服务器返回了空页面', 'invalid-content', false)
      }
      if (expectedBytes !== null && bytesWritten !== expectedBytes) {
        throw new DownloadPageError(
          `页面长度不匹配（预期 ${expectedBytes}，实际 ${bytesWritten}）`,
          'invalid-content',
          true,
        )
      }
      if (contentType !== null && !contentType.toLowerCase().startsWith('image/')) {
        throw new DownloadPageError('服务器返回的内容不是图片', 'invalid-content', false)
      }
      this.assertStorage(0)
      try {
        await this.files.promotePagePartial(paths.partialUri, paths.completedUri)
      } catch (error) {
        throw new DownloadPageError('无法保存下载页面', 'filesystem', true, error)
      }
      committed = true

      reportDownloadTelemetry({
        type: 'page-transfer',
        outcome: 'completed',
        pageIndex,
        bytesWritten,
        expectedBytes,
        durationMs: Math.max(0, Date.now() - startedAt),
      })

      return {
        bytesWritten,
        expectedBytes,
        etag: headerValue(result.headers, 'etag'),
        lastModified: headerValue(result.headers, 'last-modified'),
        contentType,
      }
    } catch (error) {
      let normalized: DownloadPageError | DownloadPageCancelledError
      if (
        signal?.aborted ||
        error instanceof DownloadTransferCancelledError ||
        error instanceof DownloadPageCancelledError
      ) {
        normalized = new DownloadPageCancelledError()
      } else if (error instanceof DownloadPageError) {
        normalized = error
      } else if (error instanceof DownloadLowStorageError) {
        normalized = new DownloadPageError(error.message, 'low-storage', false, error)
      } else {
        api.handleExternalNetworkFailure()
        normalized = error instanceof DownloadTransferTimeoutError
          ? new DownloadPageError('页面下载超时', 'network', true, error)
          : new DownloadPageError('页面下载失败', 'network', true, error)
      }
      reportDownloadTelemetry({
        type: 'page-transfer',
        outcome: normalized instanceof DownloadPageCancelledError ? 'cancelled' : 'failed',
        pageIndex,
        bytesWritten: observedBytes,
        expectedBytes: observedExpectedBytes,
        durationMs: Math.max(0, Date.now() - startedAt),
        ...(normalized instanceof DownloadPageError
          ? { failureCode: normalized.code }
          : {}),
      })
      throw normalized
    } finally {
      if (!committed) {
        await this.files.deletePagePartial(paths.partialUri).catch(() => {})
      }
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

function classifyStatus(status: number): DownloadPageError {
  if (status === 401) {
    return new DownloadPageError('登录已过期，下载已暂停', 'unauthorized', false)
  }
  if (status === 403) {
    return new DownloadPageError('当前账号没有下载权限', 'forbidden', false)
  }
  if (status === 404) {
    return new DownloadPageError('漫画或页面不存在', 'not-found', false)
  }
  return new DownloadPageError(`服务器返回错误（${status}）`, 'unknown', status >= 500)
}

function headerValue(headers: Record<string, string>, name: string): string | null {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
  return match?.[1] ?? null
}

function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const length = Number(value)
  return Number.isSafeInteger(length) ? length : null
}
