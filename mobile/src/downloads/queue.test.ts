import { waitFor } from '@testing-library/react-native'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import {
  DownloadPageCancelledError,
  DownloadPageError,
  type DownloadedPage,
} from '@/downloads/pageDownloader'
import { DownloadQueue } from '@/downloads/queue'
import type { DownloadPagePaths } from '@/downloads/repository'
import {
  createDownloadManifest,
  type DownloadManifestV1,
} from '@/downloads/types'

const identity = {
  serverUrl: 'https://example.com',
  userUuid: 'user-1',
}
const downloadedPage: DownloadedPage = {
  bytesWritten: 3,
  expectedBytes: 3,
  etag: '"v1"',
  lastModified: null,
  contentType: 'image/jpeg',
}

describe('DownloadQueue', () => {
  it('downloads a manga sequentially and completes its durable manifest', async () => {
    const repository = new MemoryQueueRepository()
    const downloader = { download: jest.fn().mockResolvedValue(downloadedPage) }
    const queue = makeQueue(repository, downloader)
    await queue.initialize()

    await queue.enqueue(manga('manga-1', 2))
    await waitFor(() => expect(queue.getSnapshot().manifests[0]?.state).toBe('completed'))

    expect(downloader.download).toHaveBeenCalledTimes(2)
    expect(downloader.download.mock.calls.map(call => call[0].pageIndex)).toEqual([0, 1])
    expect(queue.getSnapshot().manifests[0].pages).toEqual([
      expect.objectContaining({ index: 0, state: 'completed', attempts: 1, bytesWritten: 3 }),
      expect.objectContaining({ index: 1, state: 'completed', attempts: 1, bytesWritten: 3 }),
    ])
    expect(repository.stored.get('manga-1')?.state).toBe('completed')
  })

  it('coalesces duplicate enqueue requests', async () => {
    const repository = new MemoryQueueRepository()
    const pending = abortableDownload()
    const queue = makeQueue(repository, { download: pending.download })
    await queue.initialize()

    const one = queue.enqueue(manga('manga-1', 1))
    const two = queue.enqueue(manga('manga-1', 1))
    await Promise.all([one, two])

    expect(repository.createCount).toBe(1)
    await queue.pause('manga-1')
  })

  it('pauses and explicitly resumes without counting the cancelled attempt', async () => {
    const repository = new MemoryQueueRepository()
    const first = abortableDownload()
    const downloader = {
      download: jest.fn()
        .mockImplementationOnce(first.operation)
        .mockResolvedValueOnce(downloadedPage),
    }
    const queue = makeQueue(repository, downloader)
    await queue.initialize()
    await queue.enqueue(manga('manga-1', 1))
    await waitFor(() => expect(downloader.download).toHaveBeenCalledTimes(1))

    await queue.pause('manga-1')

    expect(queue.getSnapshot().manifests[0]).toMatchObject({ state: 'paused' })
    expect(queue.getSnapshot().manifests[0].pages[0]).toMatchObject({
      state: 'pending',
      attempts: 0,
    })
    await queue.resume('manga-1')
    await waitFor(() => expect(queue.getSnapshot().manifests[0]?.state).toBe('completed'))
    expect(downloader.download).toHaveBeenCalledTimes(2)
  })

  it('automatically resumes a network-paused job when eligibility returns', async () => {
    const repository = new MemoryQueueRepository()
    const first = abortableDownload()
    const downloader = {
      download: jest.fn()
        .mockImplementationOnce(first.operation)
        .mockResolvedValueOnce(downloadedPage),
    }
    const queue = makeQueue(repository, downloader)
    await queue.initialize()
    await queue.enqueue(manga('manga-1', 1))
    await waitFor(() => expect(downloader.download).toHaveBeenCalledTimes(1))

    queue.setEligible(false)
    await waitFor(() => expect(queue.getSnapshot().manifests[0]?.state).toBe('queued'))
    expect(queue.getSnapshot().manifests[0].pages[0].attempts).toBe(0)

    queue.setEligible(true)
    await waitFor(() => expect(queue.getSnapshot().manifests[0]?.state).toBe('completed'))
    expect(downloader.download).toHaveBeenCalledTimes(2)
  })

  it('retries recoverable failures with bounded exponential delays', async () => {
    const repository = new MemoryQueueRepository()
    const downloader = {
      download: jest.fn()
        .mockRejectedValueOnce(new DownloadPageError('offline', 'network', true))
        .mockRejectedValueOnce(new DownloadPageError('offline', 'network', true))
        .mockResolvedValueOnce(downloadedPage),
    }
    const waitForRetry = jest.fn().mockResolvedValue(undefined)
    const queue = makeQueue(repository, downloader, { waitForRetry })
    await queue.initialize()

    await queue.enqueue(manga('manga-1', 1))
    await waitFor(() => expect(queue.getSnapshot().manifests[0]?.state).toBe('completed'))

    expect(downloader.download).toHaveBeenCalledTimes(3)
    expect(waitForRetry.mock.calls.map(call => call[0])).toEqual([500, 1000])
    expect(queue.getSnapshot().manifests[0].pages[0].attempts).toBe(3)
  })

  it('pauses rather than retrying an expired session', async () => {
    const repository = new MemoryQueueRepository()
    const downloader = {
      download: jest.fn().mockRejectedValue(
        new DownloadPageError('expired', 'unauthorized', false),
      ),
    }
    const queue = makeQueue(repository, downloader)
    await queue.initialize()

    await queue.enqueue(manga('manga-1', 1))
    await waitFor(() => expect(queue.getSnapshot().manifests[0]?.state).toBe('paused'))

    expect(queue.getSnapshot().manifests[0].failure).toMatchObject({
      code: 'unauthorized',
      pageIndex: 0,
    })
    expect(downloader.download).toHaveBeenCalledTimes(1)
  })

  it('allows an explicitly failed page to be retried', async () => {
    const repository = new MemoryQueueRepository()
    const downloader = {
      download: jest.fn()
        .mockRejectedValueOnce(new DownloadPageError('bad page', 'invalid-content', false))
        .mockResolvedValueOnce(downloadedPage),
    }
    const queue = makeQueue(repository, downloader)
    await queue.initialize()
    await queue.enqueue(manga('manga-1', 1))
    await waitFor(() => expect(queue.getSnapshot().manifests[0]?.state).toBe('failed'))

    await queue.retry('manga-1')
    await waitFor(() => expect(queue.getSnapshot().manifests[0]?.state).toBe('completed'))

    expect(downloader.download).toHaveBeenCalledTimes(2)
    expect(queue.getSnapshot().manifests[0].failure).toBeNull()
  })

  it('limits concurrent manga jobs and starts the next after a slot is released', async () => {
    const repository = new MemoryQueueRepository()
    const pending: Array<ReturnType<typeof deferred<DownloadedPage>>> = []
    const downloader = {
      download: jest.fn().mockImplementation(() => {
        const operation = deferred<DownloadedPage>()
        pending.push(operation)
        return operation.promise
      }),
    }
    const queue = makeQueue(repository, downloader, { concurrency: 2 })
    await queue.initialize()

    await Promise.all([
      queue.enqueue(manga('manga-1', 1)),
      queue.enqueue(manga('manga-2', 1)),
      queue.enqueue(manga('manga-3', 1)),
    ])
    await waitFor(() => expect(downloader.download).toHaveBeenCalledTimes(2))

    pending[0].resolve(downloadedPage)
    await waitFor(() => expect(downloader.download).toHaveBeenCalledTimes(3))
    pending[1].resolve(downloadedPage)
    pending[2].resolve(downloadedPage)
    await waitFor(() => expect(
      queue.getSnapshot().manifests.every(item => item.state === 'completed'),
    ).toBe(true))
  })

  it('aborts before deleting an active manga and removes its snapshot', async () => {
    const repository = new MemoryQueueRepository()
    const pending = abortableDownload()
    const queue = makeQueue(repository, { download: pending.download })
    await queue.initialize()
    await queue.enqueue(manga('manga-1', 1))
    await waitFor(() => expect(pending.download).toHaveBeenCalledTimes(1))

    await queue.delete('manga-1')

    expect(repository.deleted).toEqual(['manga-1'])
    expect(queue.getSnapshot().manifests).toHaveLength(0)
  })

  it('clears every identity only after active jobs are aborted', async () => {
    const repository = new MemoryQueueRepository()
    const pending = abortableDownload()
    const queue = makeQueue(repository, { download: pending.download })
    await queue.initialize()
    await queue.enqueue(manga('manga-1', 1))
    await waitFor(() => expect(pending.download).toHaveBeenCalledTimes(1))

    await queue.clearAll()

    expect(repository.deleteAllCount).toBe(1)
    expect(queue.getSnapshot().manifests).toHaveLength(0)
  })
})

function makeQueue(
  repository: MemoryQueueRepository,
  downloader: { download: jest.Mock },
  patch: {
    concurrency?: number
    waitForRetry?: (delayMs: number, signal: AbortSignal) => Promise<void>
  } = {},
) {
  return new DownloadQueue({
    ...identity,
    api: {} as ApiClient,
    repository,
    downloader,
    now: () => new Date('2026-07-27T12:00:00.000Z'),
    waitForRetry: jest.fn().mockResolvedValue(undefined),
    ...patch,
  })
}

function manga(uuid: string, pageCount: number): MangaDetail {
  return {
    uuid,
    displayTitle: uuid,
    originalTitle: uuid,
    fullname: uuid,
    publishDate: null,
    cover: 0,
    createAt: '2026-07-01T00:00:00.000Z',
    updateAt: '2026-07-27T00:00:00.000Z',
    pages: Array.from({ length: pageCount }, (_, index) => `${index}.jpg`),
    mangaTags: [],
  }
}

function abortableDownload() {
  const operation = jest.fn(({ signal }: { signal?: AbortSignal }) =>
    new Promise<DownloadedPage>((_resolve, reject) => {
      if (signal?.aborted) {
        reject(new DownloadPageCancelledError())
        return
      }
      signal?.addEventListener(
        'abort',
        () => reject(new DownloadPageCancelledError()),
        { once: true },
      )
    }))
  return { operation, download: jest.fn(operation) }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve })
  return { promise, resolve }
}

class MemoryQueueRepository {
  readonly stored = new Map<string, DownloadManifestV1>()
  readonly deleted: string[] = []
  createCount = 0
  deleteAllCount = 0

  async reconcile() {
    return [...this.stored.values()]
  }

  async create(
    serverUrl: string,
    userUuid: string,
    value: MangaDetail,
    now: Date,
  ) {
    this.createCount += 1
    const manifest = createDownloadManifest({ serverUrl, userUuid }, value, now)
    this.stored.set(value.uuid, manifest)
    return manifest
  }

  async save(manifest: DownloadManifestV1) {
    this.stored.set(manifest.manga.uuid, manifest)
  }

  async delete(_serverUrl: string, _userUuid: string, mangaUuid: string) {
    this.deleted.push(mangaUuid)
    this.stored.delete(mangaUuid)
  }

  async deleteAll() {
    this.deleteAllCount += 1
    this.stored.clear()
  }

  async pagePaths(
    _serverUrl: string,
    _userUuid: string,
    mangaUuid: string,
    pageIndex: number,
  ): Promise<DownloadPagePaths> {
    return {
      partialUri: `file:///${mangaUuid}/${pageIndex}.part`,
      completedUri: `file:///${mangaUuid}/${pageIndex}.page`,
    }
  }

  async localPageUris() {
    return null
  }
}
