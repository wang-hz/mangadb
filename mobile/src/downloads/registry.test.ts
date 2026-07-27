import {
  registerActiveDownloadQueue,
  stopActiveDownloadQueue,
} from '@/downloads/registry'

describe('active download queue registry', () => {
  afterEach(() => stopActiveDownloadQueue())

  it('stops the current queue once during session cleanup', async () => {
    const first = { stop: jest.fn().mockResolvedValue(undefined) }
    const second = { stop: jest.fn().mockResolvedValue(undefined) }
    const unregisterFirst = registerActiveDownloadQueue(first)
    registerActiveDownloadQueue(second)

    unregisterFirst()
    await stopActiveDownloadQueue()
    await stopActiveDownloadQueue()

    expect(first.stop).not.toHaveBeenCalled()
    expect(second.stop).toHaveBeenCalledTimes(1)
  })
})
