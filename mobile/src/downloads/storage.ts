import { Paths } from 'expo-file-system'

export const MINIMUM_FREE_SPACE_RESERVE = 256 * 1024 * 1024

export interface DownloadStorageSnapshot {
  availableBytes: number
  totalBytes: number
  reserveBytes: number
}

export interface DownloadStorageMonitor {
  snapshot: () => DownloadStorageSnapshot
  assertCanWrite: (requiredBytes?: number) => void
}

export class DownloadLowStorageError extends Error {
  constructor(
    public readonly requiredBytes: number,
    public readonly availableBytes: number,
    public readonly reserveBytes: number,
  ) {
    super('设备可用空间不足，下载已暂停')
    this.name = 'DownloadLowStorageError'
  }
}

export class ExpoDownloadStorageMonitor implements DownloadStorageMonitor {
  snapshot(): DownloadStorageSnapshot {
    const totalBytes = normalizeDiskBytes(Paths.totalDiskSpace)
    const availableBytes = normalizeDiskBytes(Paths.availableDiskSpace)
    return {
      totalBytes,
      availableBytes,
      reserveBytes: calculateStorageReserve(totalBytes),
    }
  }

  assertCanWrite(requiredBytes = 0): void {
    const snapshot = this.snapshot()
    const required = Math.max(0, Math.trunc(requiredBytes))
    if (snapshot.availableBytes - required < snapshot.reserveBytes) {
      throw new DownloadLowStorageError(
        required,
        snapshot.availableBytes,
        snapshot.reserveBytes,
      )
    }
  }
}

export function calculateStorageReserve(totalBytes: number): number {
  return Math.max(
    MINIMUM_FREE_SPACE_RESERVE,
    Math.ceil(normalizeDiskBytes(totalBytes) * 0.05),
  )
}

function normalizeDiskBytes(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}
