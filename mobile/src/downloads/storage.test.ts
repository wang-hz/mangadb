import {
  calculateStorageReserve,
  DownloadLowStorageError,
  ExpoDownloadStorageMonitor,
  MINIMUM_FREE_SPACE_RESERVE,
} from '@/downloads/storage'

jest.mock('expo-file-system', () => ({
  Paths: {
    totalDiskSpace: 10 * 1024 * 1024 * 1024,
    availableDiskSpace: 600 * 1024 * 1024,
  },
}))

describe('download storage monitor', () => {
  it('reserves the greater of 256 MiB and five percent', () => {
    expect(calculateStorageReserve(1024 * 1024 * 1024)).toBe(MINIMUM_FREE_SPACE_RESERVE)
    expect(calculateStorageReserve(10 * 1024 * 1024 * 1024)).toBe(512 * 1024 * 1024)
  })

  it('allows a write that preserves the reserve', () => {
    expect(() => new ExpoDownloadStorageMonitor().assertCanWrite(80 * 1024 * 1024))
      .not.toThrow()
  })

  it('rejects a write that would cross the reserve', () => {
    expect(() => new ExpoDownloadStorageMonitor().assertCanWrite(100 * 1024 * 1024))
      .toThrow(DownloadLowStorageError)
  })
})
