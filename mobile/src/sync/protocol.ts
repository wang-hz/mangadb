// Shared wire contract; web imports this dependency-free module too.
export interface ProgressOperation {
  mangaUuid: string
  pageIndex: number
  mode: 'paged' | 'scroll'
  state: 'reading' | 'completed'
  hiddenFromRecent: boolean
  deleted: boolean
  updatedAt: string
  operationId: string
}

export interface ProgressManga {
  uuid: string
  displayTitle: string
  originalTitle: string
  publishDate: string | null
  cover: number | null
  createAt: string
  updateAt: string
}

export interface RemoteProgress extends ProgressOperation {
  pageCount: number
  manga: ProgressManga
}

export interface SyncState {
  imported: boolean
  offset: number
  calibrated: boolean
  pending: Record<string, ProgressOperation>
  records: Record<string, RemoteProgress>
  uncalibrated: Record<string, boolean>
}

export function emptySyncState(): SyncState {
  return { imported: false, offset: 0, calibrated: false, pending: {}, records: {}, uncalibrated: {} }
}

export function newer(a: ProgressOperation, b: ProgressOperation): boolean {
  return a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.operationId > b.operationId)
}

export function queueOperation(state: SyncState, operation: ProgressOperation, legacy = false): void {
  state.pending[operation.mangaUuid] = operation
  state.uncalibrated[operation.mangaUuid] = !legacy && !state.calibrated
}

export function calibrate(state: SyncState, serverTime: string): void {
  const serverTimestamp = Date.parse(serverTime)
  const offset = serverTimestamp - Date.now()
  if (!Number.isFinite(offset)) throw new Error('Invalid server time')
  for (const [uuid, operation] of Object.entries(state.pending)) {
    if (state.uncalibrated[uuid] || Date.parse(operation.updatedAt) > serverTimestamp + 60000) {
      // A clock changed while offline must not poison all later uploads. Normal
      // historical migration timestamps stay untouched; impossible future ones
      // are corrected with the current clock offset and bounded by server time.
      operation.updatedAt = new Date(Math.min(serverTimestamp,
        Date.parse(operation.updatedAt) + offset - state.offset)).toISOString()
      const record = state.records[uuid]
      if (record?.operationId === operation.operationId) record.updatedAt = operation.updatedAt
      state.uncalibrated[uuid] = false
    }
  }
  state.offset = offset
  state.calibrated = true
}

export function mergeRemote(state: SyncState, remote: RemoteProgress): boolean {
  const pending = state.pending[remote.mangaUuid]
  if (pending && newer(pending, remote)) return false
  const existing = state.records[remote.mangaUuid]
  if (existing && newer(existing, remote)) return false
  state.records[remote.mangaUuid] = remote
  return true
}

export interface SyncStore {
  prepare: () => Promise<void>
  calibrate: (serverTime: string) => Promise<void>
  pending: () => Promise<ProgressOperation[]>
  apply: (items: RemoteProgress[], sent?: ProgressOperation[], missing?: string[]) => Promise<void>
}

export type SyncRequest = <T>(path: string, options?: RequestInit) => Promise<T>
const BASE = '/api/mangadb/reading-progress'

export class ProgressSynchronizer {
  private flight: Promise<void> | null = null
  private controller = new AbortController()
  private failedUntil = 0
  private failures = 0

  constructor(private store: SyncStore, private request: SyncRequest) {}

  stop(): void { this.controller.abort() }

  sync(force = false): Promise<void> {
    if (this.controller.signal.aborted) return Promise.resolve()
    if (this.flight) return this.flight
    if (!force && Date.now() < this.failedUntil) return Promise.resolve()
    this.flight = this.run().then(() => {
      this.failures = 0
      this.failedUntil = 0
    }).catch(error => {
      this.failures += 1
      this.failedUntil = Date.now() + Math.min(60000, 1000 * 2 ** Math.min(this.failures, 6))
      throw error
    }).finally(() => { this.flight = null })
    return this.flight
  }

  private async run(): Promise<void> {
    await this.store.prepare()
    const signal = this.controller.signal
    let after: string | null = null
    do {
      const result: { items: RemoteProgress[]; next: string | null; serverTime: string } = await this.request(
        `${BASE}${after ? `?after=${encodeURIComponent(after)}` : ''}`, { signal },
      )
      if (signal.aborted) return
      await this.store.calibrate(result.serverTime)
      await this.store.apply(result.items)
      after = result.next
    } while (after)
    // Snapshot once: later edits remain pending for the next synchronization.
    const pending = await this.store.pending()
    for (let start = 0; start < pending.length; start += 100) {
      if (signal.aborted) return
      const sent = pending.slice(start, start + 100)
      const result = await this.request<{ items: RemoteProgress[]; missing: string[]; serverTime: string }>(BASE, {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: sent }),
      })
      if (signal.aborted) return
      await this.store.apply(result.items, sent, result.missing)
    }
  }
}
