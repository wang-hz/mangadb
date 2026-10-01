import { calibrate, emptySyncState, mergeRemote, queueOperation, type ProgressOperation, type RemoteProgress, type SyncState, type SyncStore } from '../../../mobile/src/sync/protocol'

let database: Promise<IDBDatabase> | null = null
function openDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('mangadb-reading-progress', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('identities')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = null; reject(request.error) }
  })
  return database
}

// IndexedDB serializes read/write transactions across tabs; progress and queue
// live in one envelope so a persisted position always has its upload operation.
export class WebProgressStore implements SyncStore {
  constructor(readonly identity: string, private changed: () => void = () => {}) {}

  private async transaction<T>(action: (state: SyncState) => T, write = false): Promise<T> {
    const db = await openDatabase()
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('identities', write ? 'readwrite' : 'readonly')
      const store = transaction.objectStore('identities')
      const request = store.get(this.identity)
      let result: T
      request.onsuccess = () => {
        try {
          const state: SyncState = request.result ?? emptySyncState()
          result = action(state)
          if (write) store.put(state, this.identity)
        } catch (error) { transaction.abort(); reject(error) }
      }
      transaction.oncomplete = () => {
        if (write) this.changed()
        resolve(result)
      }
      transaction.onabort = () => reject(transaction.error ?? new Error('Progress storage aborted'))
      transaction.onerror = () => reject(transaction.error)
    })
  }

  read(): Promise<SyncState> { return this.transaction(state => state) }
  prepare(): Promise<void> { return this.transaction(state => { state.imported = true }, true) }
  calibrate(serverTime: string): Promise<void> { return this.transaction(state => calibrate(state, serverTime), true) }
  pending(): Promise<ProgressOperation[]> { return this.transaction(state => Object.values(state.pending)) }

  write(manga: RemoteProgress['manga'], pageCount: number, values: Partial<Pick<ProgressOperation,
    'pageIndex' | 'mode' | 'state' | 'hiddenFromRecent' | 'deleted'>>): Promise<void> {
    return this.transaction(state => {
      const previous = state.records[manga.uuid]
      const timestamp = Math.max(Date.now() + state.offset, previous ? Date.parse(previous.updatedAt) + 1 : 0)
      const pageIndex = Math.max(0, Math.min(values.pageIndex ?? previous?.pageIndex ?? 0, pageCount - 1))
      const record: RemoteProgress = {
        mangaUuid: manga.uuid, manga, pageCount, pageIndex,
        mode: values.mode ?? previous?.mode ?? 'paged',
        state: values.state ?? (previous?.state === 'completed' && previous.pageCount === pageCount && pageIndex === pageCount - 1 ? 'completed' : 'reading'),
        hiddenFromRecent: values.hiddenFromRecent ?? false, deleted: values.deleted ?? false,
        operationId: operationId(), updatedAt: new Date(timestamp).toISOString(),
      }
      if (record.deleted) { record.pageIndex = 0; record.state = 'reading'; record.hiddenFromRecent = true }
      state.records[manga.uuid] = record
      const { manga: _manga, pageCount: _pageCount, ...operation } = record
      queueOperation(state, operation)
    }, true)
  }

  apply(items: RemoteProgress[], sent: ProgressOperation[] = [], missing: string[] = []): Promise<void> {
    return this.transaction(state => {
      for (const item of items) {
        if (!mergeRemote(state, item)) continue
        delete state.pending[item.mangaUuid]
        delete state.uncalibrated[item.mangaUuid]
      }
      for (const operation of sent) {
        if (!missing.includes(operation.mangaUuid)) continue
        if (state.pending[operation.mangaUuid]?.operationId !== operation.operationId) continue
        delete state.pending[operation.mangaUuid]
        delete state.records[operation.mangaUuid]
        delete state.uncalibrated[operation.mangaUuid]
      }
    }, true)
  }
}

function operationId(): string {
  // getRandomValues also works on LAN HTTP, where randomUUID is unavailable.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
