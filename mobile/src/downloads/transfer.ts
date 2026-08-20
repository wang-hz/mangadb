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
    let callbackGeneration = 0
    const generation = callbackGeneration
    let cancellationReason: unknown
    let cancellationFlight: Promise<void> | null = null
    let notifyCancellation!: () => void
    const cancellationStarted = new Promise<void>(resolve => {
      notifyCancellation = resolve
    })

    const task = createDownloadResumable(
      request.url,
      request.destinationUri,
      {
        headers: request.headers,
        sessionType: FileSystemSessionType.FOREGROUND,
      },
      progress => {
        if (
          callbackGeneration !== generation ||
          cancelStarted ||
          settled
        ) return
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
      cancellationReason = error
      callbackGeneration += 1
      if (idleTimer) clearTimeout(idleTimer)
      cancellationFlight = Promise.resolve()
        .then(() => task.cancelAsync())
        .then(() => undefined)
      notifyCancellation()
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
    if (request.signal?.aborted) abort()

    let downloadFlight: ReturnType<typeof task.downloadAsync>
    try {
      downloadFlight = task.downloadAsync()
    } catch (error) {
      downloadFlight = Promise.reject(error)
    }
    const downloadOutcome = downloadFlight.then(
      result => ({ type: 'result' as const, result }),
      error => ({ type: 'error' as const, error }),
    )

    try {
      const outcome = await Promise.race([
        downloadOutcome,
        cancellationStarted.then(() => ({ type: 'cancelled' as const })),
      ])
      if (outcome.type === 'cancelled' || cancelStarted) {
        await Promise.allSettled([
          downloadFlight,
          cancellationFlight ?? Promise.resolve(),
        ])
        settled = true
        if (
          request.signal?.aborted ||
          cancellationReason instanceof DownloadTransferCancelledError
        ) throw new DownloadTransferCancelledError()
        throw cancellationReason
      }
      settled = true
      if (outcome.type === 'error') throw outcome.error
      if (request.signal?.aborted || !outcome.result) {
        throw new DownloadTransferCancelledError()
      }
      return outcome.result
    } catch (error) {
      settled = true
      if (request.signal?.aborted || error instanceof DownloadTransferCancelledError) {
        throw new DownloadTransferCancelledError()
      }
      throw error
    } finally {
      callbackGeneration += 1
      if (idleTimer) clearTimeout(idleTimer)
      request.signal?.removeEventListener('abort', abort)
    }
  }
}
