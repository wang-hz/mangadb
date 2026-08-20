import {
  DownloadTransferCancelledError,
  DownloadTransferTimeoutError,
  ExpoDownloadTransfer,
} from './transfer'

const mockCreateDownloadResumable = jest.fn()

jest.mock('expo-file-system/legacy', () => ({
  createDownloadResumable: (...args: unknown[]) => mockCreateDownloadResumable(...args),
  FileSystemSessionType: { FOREGROUND: 0 },
}))

describe('ExpoDownloadTransfer', () => {
  beforeEach(() => mockCreateDownloadResumable.mockReset())
  afterEach(() => jest.useRealTimers())

  it('cancels the native task when the abort signal fires', async () => {
    let finish: ((result: undefined) => void) | undefined
    const cancelAsync = jest.fn(async () => { finish?.(undefined) })
    mockCreateDownloadResumable.mockReturnValue({
      cancelAsync,
      downloadAsync: jest.fn(() => new Promise<undefined>(resolve => { finish = resolve })),
    })
    const controller = new AbortController()
    const operation = new ExpoDownloadTransfer().start({
      url: 'https://example.com/page',
      headers: { Authorization: 'Bearer token' },
      destinationUri: 'file:///page.part',
      signal: controller.signal,
    })

    controller.abort()
    await expect(operation).rejects.toBeInstanceOf(DownloadTransferCancelledError)
    expect(cancelAsync).toHaveBeenCalledTimes(1)
  })

  it('waits for both native cancellation and download settlement and ignores late progress', async () => {
    const cancel = deferred<void>()
    const download = deferred<undefined>()
    let nativeProgress: ((progress: {
      totalBytesWritten: number
      totalBytesExpectedToWrite: number
    }) => void) | undefined
    const cancelAsync = jest.fn(() => cancel.promise)
    mockCreateDownloadResumable.mockImplementation((
      _url: string,
      _destination: string,
      _options: unknown,
      onProgress: typeof nativeProgress,
    ) => {
      nativeProgress = onProgress
      return {
        cancelAsync,
        downloadAsync: jest.fn(() => download.promise),
      }
    })
    const controller = new AbortController()
    const onProgress = jest.fn()
    const operation = new ExpoDownloadTransfer().start({
      url: 'https://example.com/page',
      headers: {},
      destinationUri: 'file:///page.part',
      signal: controller.signal,
      onProgress,
    })
    let outcome = 'pending'
    void operation.then(
      () => { outcome = 'resolved' },
      () => { outcome = 'rejected' },
    )

    controller.abort()
    await Promise.resolve()
    nativeProgress?.({ totalBytesWritten: 10, totalBytesExpectedToWrite: 10 })
    download.resolve(undefined)
    await Promise.resolve()

    expect(cancelAsync).toHaveBeenCalledTimes(1)
    expect(onProgress).not.toHaveBeenCalled()
    expect(outcome).toBe('pending')

    cancel.resolve()
    await expect(operation).rejects.toBeInstanceOf(DownloadTransferCancelledError)
    expect(outcome).toBe('rejected')
  })

  it('cancels a transfer after the idle timeout', async () => {
    jest.useFakeTimers()
    let finish: ((result: undefined) => void) | undefined
    const cancelAsync = jest.fn(async () => { finish?.(undefined) })
    mockCreateDownloadResumable.mockReturnValue({
      cancelAsync,
      downloadAsync: jest.fn(() => new Promise<undefined>(resolve => { finish = resolve })),
    })
    const operation = new ExpoDownloadTransfer().start({
      url: 'https://example.com/page',
      headers: {},
      destinationUri: 'file:///page.part',
      idleTimeoutMs: 100,
    })

    jest.advanceTimersByTime(100)
    await expect(operation).rejects.toBeInstanceOf(DownloadTransferTimeoutError)
    expect(cancelAsync).toHaveBeenCalledTimes(1)
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve })
  return { promise, resolve }
}
