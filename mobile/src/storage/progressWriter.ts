import type { MangaSummary } from '@/api/types'
import {
  saveReadingProgress,
  type ReadingProgress,
} from '@/storage/progress'
import type { ReaderMode } from '@/utils/reader'

export const READING_PROGRESS_DEBOUNCE_MS = 400

export interface ReadingProgressWrite {
  serverUrl: string
  userUuid: string
  mangaUuid: string
  pageCount: number
  pageIndex: number
  mode: ReaderMode
  manga?: MangaSummary
}

type SaveProgress = (
  serverUrl: string,
  userUuid: string,
  mangaUuid: string,
  pageCount: number,
  pageIndex: number,
  mode: ReaderMode,
  manga?: MangaSummary,
) => Promise<ReadingProgress>

export class ReadingProgressWriter {
  private pending: ReadingProgressWrite | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private writeQueue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly save: SaveProgress = saveReadingProgress,
    private readonly delayMs = READING_PROGRESS_DEBOUNCE_MS,
  ) {}

  schedule(write: ReadingProgressWrite): void {
    this.pending = write
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush().catch(() => {})
    }, this.delayMs)
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const write = this.pending
    this.pending = null
    if (!write) return this.writeQueue.then(() => {})
    const operation = this.writeQueue
      .catch(() => {})
      .then(() => this.save(
        write.serverUrl,
        write.userUuid,
        write.mangaUuid,
        write.pageCount,
        write.pageIndex,
        write.mode,
        write.manga,
      ))
    this.writeQueue = operation
    return operation.then(() => {})
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
  }
}
