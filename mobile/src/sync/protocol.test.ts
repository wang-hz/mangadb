import { calibrate, emptySyncState, mergeRemote, ProgressSynchronizer, queueOperation, type ProgressOperation, type RemoteProgress, type SyncStore } from './protocol'

const operation: ProgressOperation = {
  mangaUuid: 'manga', operationId: 'one', pageIndex: 4, mode: 'paged', state: 'reading',
  hiddenFromRecent: false, deleted: false, updatedAt: '2026-01-02T00:00:00.000Z',
}
const remote: RemoteProgress = {
  ...operation, pageCount: 10, manga: {
    uuid: 'manga', displayTitle: 'Manga', originalTitle: 'Manga', cover: 0, publishDate: null,
    createAt: operation.updatedAt, updateAt: operation.updatedAt,
  },
}

it('merges by operation time, retains a newer local edit and accepts newer deletions', () => {
  const state = emptySyncState()
  queueOperation(state, operation)
  expect(mergeRemote(state, { ...remote, updatedAt: '2026-01-01T00:00:00.000Z' })).toBe(false)
  expect(mergeRemote(state, { ...remote, deleted: true, updatedAt: '2026-01-03T00:00:00.000Z' })).toBe(true)
  expect(state.records.manga?.deleted).toBe(true)
})

it('calibrates new offline operations once while preserving original migration time', () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-02T01:00:00.000Z'))
  try {
    const state = emptySyncState()
    queueOperation(state, { ...operation, updatedAt: '2026-01-02T01:00:00.000Z' })
    queueOperation(state, { ...operation, mangaUuid: 'legacy' }, true)
    calibrate(state, '2026-01-02T00:00:00.000Z')
    expect(state.pending.manga?.updatedAt).toBe(operation.updatedAt)
    expect(state.pending.legacy?.updatedAt).toBe(operation.updatedAt)
    calibrate(state, '2026-01-02T00:00:05.000Z')
    expect(state.pending.manga?.updatedAt).toBe(operation.updatedAt)
  } finally { jest.useRealTimers() }
})

function store(): SyncStore {
  return {
    prepare: jest.fn(async () => {}), calibrate: jest.fn(async () => {}),
    pending: jest.fn(async () => [operation]), apply: jest.fn(async () => {}),
  }
}
it('paginates downloads and submits a stable snapshot with acknowledgement IDs', async () => {
  const storage = store()
  const request = jest.fn()
    .mockResolvedValueOnce({ items: [remote], next: 'next', serverTime: operation.updatedAt })
    .mockResolvedValueOnce({ items: [], next: null, serverTime: operation.updatedAt })
    .mockResolvedValueOnce({ items: [remote], missing: [], serverTime: operation.updatedAt })
  const sync = new ProgressSynchronizer(storage, request)
  const first = sync.sync()
  expect(sync.sync()).toBe(first)
  await first
  expect(request.mock.calls[1]?.[0]).toContain('?after=next')
  expect(storage.apply).toHaveBeenLastCalledWith([remote], [operation], [])
})

it('does not apply a late response after the identity synchronizer is stopped', async () => {
  const storage = store()
  let resolve: (value: unknown) => void = () => {}
  const request = jest.fn(() => new Promise(done => { resolve = done }))
  const sync = new ProgressSynchronizer(storage, request as never)
  const flight = sync.sync()
  await Promise.resolve()
  await Promise.resolve()
  sync.stop()
  resolve({ items: [remote], next: null, serverTime: operation.updatedAt })
  await flight
  expect(storage.apply).not.toHaveBeenCalled()
})

it('keeps operations on failed upload and retries the same payload', async () => {
  const storage = store()
  const request = jest.fn()
    .mockResolvedValueOnce({ items: [], next: null, serverTime: operation.updatedAt })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ items: [], next: null, serverTime: operation.updatedAt })
    .mockResolvedValueOnce({ items: [remote], missing: [], serverTime: operation.updatedAt })
  const sync = new ProgressSynchronizer(storage, request)
  await expect(sync.sync()).rejects.toThrow('offline')
  expect(storage.apply).not.toHaveBeenCalledWith(expect.anything(), [operation], expect.anything())
  await sync.sync(true)
  expect(request.mock.calls[1]?.[1].body).toBe(request.mock.calls[3]?.[1].body)
})

it('corrects future pending timestamps after a device clock jumps', () => {
  jest.useFakeTimers().setSystemTime(new Date('2030-01-02T00:00:00.000Z'))
  try {
    const state = emptySyncState()
    state.calibrated = true
    queueOperation(state, { ...operation, updatedAt: '2030-01-02T00:00:00.000Z' })
    calibrate(state, '2026-01-02T00:00:00.000Z')
    expect(state.pending.manga?.updatedAt).toBe('2026-01-02T00:00:00.000Z')
  } finally { jest.useRealTimers() }
})
