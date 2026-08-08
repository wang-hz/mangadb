import {
  createDownloadResumable,
  FileSystemSessionType,
} from 'expo-file-system/legacy'

export interface DownloadTransferProgress {
  bytesWritten: number
  expectedBytes: number | null
}

export interface DownloadTransferRequest {
  url: string
  headers: Record<string, string>
  destinationUri: string
  signal?: AbortSignal
  idleTimeoutMs?: number
  onProgress?: (progress: DownloadTransferProgress) => void
}

export interface DownloadTransferResult {
  uri: string
  status: number
  headers: Record<string, string>
  mimeType: string | null
}

export interface DownloadTransfer {
  start: (request: DownloadTransferRequest) => Promise<DownloadTransferResult>
}

export class DownloadTransferCancelledError extends Error {
  constructor() {
    super('页面传输已取消')
    this.name = 'DownloadTransferCancelledError'
  }
}

export class DownloadTransferTimeoutError extends Error {
  constructor() {
    super('页面传输长时间没有进度')
    this.name = 'DownloadTransferTimeoutError'
  }
}

export class ExpoDownloadTransfer implements DownloadTransfer {
  async start(request: DownloadTransferRequest): Promise<DownloadTransferResult> {
    if (request.signal?.aborted) throw new DownloadTransferCancelledError()
    const idleTimeoutMs = request.idleTimeoutMs ?? 30_000
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let settled = false
    let cancelStarted = false
    let rejectCancellation!: (error: unknown) => void
    const cancellation = new Promise<never>((_, reject) => {
      rejectCancellation = reject
    })

    const task = createDownloadResumable(
      request.url,
      request.destinationUri,
      {
        headers: request.headers,
        sessionType: FileSystemSessionType.FOREGROUND,
      },
      progress => {
        resetIdleTimer()
        try {
          request.onProgress?.({
            bytesWritten: progress.totalBytesWritten,
            expectedBytes: progress.totalBytesExpectedToWrite >= 0
              ? progress.totalBytesExpectedToWrite
              : null,
          })
        } catch (error) {
          cancel(error)
        }
      },
    )

    const cancel = (error: unknown) => {
      if (cancelStarted || settled) return
      cancelStarted = true
      rejectCancellation(error)
      void task.cancelAsync().catch(() => {})
    }
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        cancel(new DownloadTransferTimeoutError())
      }, idleTimeoutMs)
    }
    const abort = () => { cancel(new DownloadTransferCancelledError()) }
    request.signal?.addEventListener('abort', abort, { once: true })
    resetIdleTimer()

    try {
      const result = await Promise.race([task.downloadAsync(), cancellation])
      settled = true
      if (request.signal?.aborted || !result) throw new DownloadTransferCancelledError()
      return result
    } catch (error) {
      settled = true
      if (request.signal?.aborted || error instanceof DownloadTransferCancelledError) {
        throw new DownloadTransferCancelledError()
      }
      throw error
    } finally {
      if (idleTimer) clearTimeout(idleTimer)
      request.signal?.removeEventListener('abort', abort)
    }
  }
}
