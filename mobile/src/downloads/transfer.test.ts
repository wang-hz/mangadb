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
