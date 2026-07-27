import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import {
  DownloadPageCancelledError,
  type DownloadPageDownloader,
  DownloadPageError,
} from '@/downloads/pageDownloader'
import type { DownloadRepository } from '@/downloads/repository'
import {
  type DownloadFailure,
  type DownloadManifestV1,
  type DownloadPageRecord,
} from '@/downloads/types'

type QueueRepository = Pick<
  DownloadRepository,
  'create' | 'delete' | 'pagePaths' | 'reconcile' | 'save'
>
type PageDownloader = Pick<DownloadPageDownloader, 'download'>
type RetryWait = (delayMs: number, signal: AbortSignal) => Promise<void>

export interface DownloadQueueOptions {
  serverUrl: string
  userUuid: string
  api: ApiClient
  repository: QueueRepository
  downloader: PageDownloader
  concurrency?: number
  maxAttempts?: number
  now?: () => Date
  waitForRetry?: RetryWait
}

export interface DownloadQueueSnapshot {
  initialized: boolean
  eligible: boolean
  manifests: readonly DownloadManifestV1[]
}

type StopReason = 'user' | 'network' | 'session' | 'delete'

interface ActiveJob {
  controller: AbortController
  reason: StopReason | null
  promise: Promise<void>
}

export class DownloadQueue {
  private readonly serverUrl: string
  private readonly userUuid: string
  private readonly api: ApiClient
  private readonly repository: QueueRepository
  private readonly downloader: PageDownloader
  private readonly concurrency: number
  private readonly maxAttempts: number
  private readonly now: () => Date
  private readonly waitForRetry: RetryWait
  private readonly manifests = new Map<string, DownloadManifestV1>()
  private readonly activeJobs = new Map<string, ActiveJob>()
  private readonly enqueueFlights = new Map<string, Promise<DownloadManifestV1>>()
  private readonly listeners = new Set<() => void>()
  private initialized = false
  private eligible = true
  private stopped = false
  private snapshot: DownloadQueueSnapshot = {
    initialized: false,
    eligible: true,
    manifests: [],
  }

  constructor(options: DownloadQueueOptions) {
    this.serverUrl = options.serverUrl
    this.userUuid = options.userUuid
    this.api = options.api
    this.repository = options.repository
    this.downloader = options.downloader
    this.concurrency = Math.max(1, Math.trunc(options.concurrency ?? 2))
    this.maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 3))
    this.now = options.now ?? (() => new Date())
    this.waitForRetry = options.waitForRetry ?? defaultRetryWait
  }

  getSnapshot = (): DownloadQueueSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    const manifests = await this.repository.reconcile(this.serverUrl, this.userUuid)
    this.manifests.clear()
    manifests.forEach(manifest => this.manifests.set(manifest.manga.uuid, manifest))
    this.initialized = true
    this.publish()
    this.pump()
  }

  enqueue(manga: MangaDetail): Promise<DownloadManifestV1> {
    const existingFlight = this.enqueueFlights.get(manga.uuid)
    if (existingFlight) return existingFlight
    const operation = this.enqueueOnce(manga)
    this.enqueueFlights.set(manga.uuid, operation)
    void operation.finally(() => {
      if (this.enqueueFlights.get(manga.uuid) === operation) {
        this.enqueueFlights.delete(manga.uuid)
      }
    }).catch(() => {})
    return operation
  }

  async pause(mangaUuid: string): Promise<void> {
    const active = this.activeJobs.get(mangaUuid)
    if (active) {
      active.reason = 'user'
      active.controller.abort()
      await active.promise
      return
    }
    const manifest = this.manifests.get(mangaUuid)
    if (!manifest || manifest.state === 'completed' || manifest.state === 'paused') return
    await this.persist({
      ...manifest,
      state: 'paused',
      updatedAt: this.timestamp(),
    })
  }

  async resume(mangaUuid: string): Promise<void> {
    const manifest = this.manifests.get(mangaUuid)
    if (!manifest || manifest.state === 'completed' || this.activeJobs.has(mangaUuid)) return
    await this.persist({
      ...manifest,
      state: 'queued',
      updatedAt: this.timestamp(),
      failure: null,
      pages: manifest.pages.map(page => page.state === 'failed'
        ? { ...page, state: 'pending' }
        : page),
    })
    this.pump()
  }

  async retry(mangaUuid: string): Promise<void> {
    await this.resume(mangaUuid)
  }

  async delete(mangaUuid: string): Promise<void> {
    const active = this.activeJobs.get(mangaUuid)
    if (active) {
      active.reason = 'delete'
      active.controller.abort()
      await active.promise
    }
    await this.repository.delete(this.serverUrl, this.userUuid, mangaUuid)
    this.manifests.delete(mangaUuid)
    this.publish()
    this.pump()
  }

  setEligible(eligible: boolean): void {
    if (this.eligible === eligible) return
    this.eligible = eligible
    this.publish()
    if (!eligible) {
      for (const active of this.activeJobs.values()) {
        active.reason = 'network'
        active.controller.abort()
      }
      return
    }
    this.pump()
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.eligible = false
    this.publish()
    const jobs = [...this.activeJobs.values()]
    jobs.forEach(job => {
      job.reason = 'session'
      job.controller.abort()
    })
    await Promise.all(jobs.map(job => job.promise))
    this.listeners.clear()
  }

  private async enqueueOnce(manga: MangaDetail): Promise<DownloadManifestV1> {
    const existing = this.manifests.get(manga.uuid)
    if (existing) return existing
    const manifest = await this.repository.create(
      this.serverUrl,
      this.userUuid,
      manga,
      this.now(),
    )
    this.manifests.set(manga.uuid, manifest)
    this.publish()
    this.pump()
    return manifest
  }

  private pump(): void {
    if (!this.initialized || !this.eligible || this.stopped) return
    for (const manifest of this.sortedManifests()) {
      if (this.activeJobs.size >= this.concurrency) break
      if (manifest.state !== 'queued' || this.activeJobs.has(manifest.manga.uuid)) continue
      this.startJob(manifest.manga.uuid)
    }
  }

  private startJob(mangaUuid: string): void {
    const controller = new AbortController()
    const active: ActiveJob = {
      controller,
      reason: null,
      promise: Promise.resolve(),
    }
    active.promise = this.runJob(mangaUuid, active)
      .catch(error => this.failUnexpectedly(mangaUuid, error))
      .finally(() => {
        if (this.activeJobs.get(mangaUuid) === active) this.activeJobs.delete(mangaUuid)
        this.publish()
        this.pump()
      })
    this.activeJobs.set(mangaUuid, active)
    this.publish()
  }

  private async runJob(mangaUuid: string, active: ActiveJob): Promise<void> {
    while (!active.controller.signal.aborted) {
      const manifest = this.manifests.get(mangaUuid)
      if (!manifest) return
      const page = manifest.pages.find(item => item.state !== 'completed')
      if (!page) {
        await this.persist({
          ...manifest,
          state: 'completed',
          updatedAt: this.timestamp(),
          completedAt: this.timestamp(),
          failure: null,
        })
        return
      }

      const downloadingPage: DownloadPageRecord = {
        ...page,
        state: 'downloading',
        attempts: page.attempts + 1,
      }
      const downloadingManifest = replacePage(manifest, downloadingPage, {
        state: 'downloading',
        updatedAt: this.timestamp(),
        failure: null,
      })
      await this.persist(downloadingManifest)

      try {
        const paths = await this.repository.pagePaths(
          this.serverUrl,
          this.userUuid,
          mangaUuid,
          page.index,
        )
        const result = await this.downloader.download({
          api: this.api,
          mangaUuid,
          pageIndex: page.index,
          paths,
          signal: active.controller.signal,
        })
        const current = this.manifests.get(mangaUuid)
        if (!current) return
        await this.persist(replacePage(current, {
          ...current.pages[page.index],
          state: 'completed',
          bytesWritten: result.bytesWritten,
          expectedBytes: result.expectedBytes,
          etag: result.etag,
          lastModified: result.lastModified,
        }, {
          state: 'downloading',
          updatedAt: this.timestamp(),
          failure: null,
        }))
      } catch (error) {
        if (error instanceof DownloadPageCancelledError || active.controller.signal.aborted) {
          await this.handleCancellation(mangaUuid, page.index, active.reason)
          return
        }
        const failure = error instanceof DownloadPageError
          ? error
          : new DownloadPageError('页面下载失败', 'unknown', false, error)
        const current = this.manifests.get(mangaUuid)
        if (!current) return
        const currentPage = current.pages[page.index]
        if (
          failure.retryable &&
          currentPage.attempts < this.maxAttempts &&
          this.eligible &&
          !this.stopped
        ) {
          await this.persist(replacePage(current, {
            ...currentPage,
            state: 'pending',
          }, {
            state: 'downloading',
            updatedAt: this.timestamp(),
            failure: toFailure(failure, page.index),
          }))
          try {
            await this.waitForRetry(
              retryDelayMs(currentPage.attempts),
              active.controller.signal,
            )
          } catch {
            await this.handleCancellation(mangaUuid, page.index, active.reason)
            return
          }
          continue
        }
        const paused = failure.code === 'unauthorized'
        await this.persist(replacePage(current, {
          ...currentPage,
          state: paused ? 'pending' : 'failed',
        }, {
          state: paused ? 'paused' : 'failed',
          updatedAt: this.timestamp(),
          failure: toFailure(failure, page.index),
        }))
        return
      }
    }
    await this.handleCancellation(mangaUuid, undefined, active.reason)
  }

  private async handleCancellation(
    mangaUuid: string,
    pageIndex: number | undefined,
    reason: StopReason | null,
  ): Promise<void> {
    if (reason === 'delete') return
    const manifest = this.manifests.get(mangaUuid)
    if (!manifest) return
    const state = reason === 'network' ? 'queued' : 'paused'
    const pages = manifest.pages.map(page => page.index === pageIndex &&
      page.state === 'downloading'
      ? {
          ...page,
          state: 'pending' as const,
          attempts: Math.max(0, page.attempts - 1),
        }
      : page)
    await this.persist({
      ...manifest,
      state,
      pages,
      updatedAt: this.timestamp(),
      failure: null,
    })
  }

  private async failUnexpectedly(mangaUuid: string, error: unknown): Promise<void> {
    const manifest = this.manifests.get(mangaUuid)
    if (!manifest) return
    const pageIndex = manifest.pages.find(page => page.state === 'downloading')?.index
    const failure: DownloadFailure = {
      code: 'filesystem',
      message: '无法保存下载状态',
      ...(pageIndex === undefined ? {} : { pageIndex }),
    }
    const pages = manifest.pages.map(page => page.index === pageIndex
      ? { ...page, state: 'failed' as const }
      : page)
    const failed = {
      ...manifest,
      state: 'failed' as const,
      pages,
      updatedAt: this.timestamp(),
      failure,
    }
    try {
      await this.repository.save(failed)
      this.manifests.set(mangaUuid, failed)
    } catch {
      // Keep the last known durable snapshot when persistence itself is unavailable.
    }
    void error
    this.publish()
  }

  private async persist(manifest: DownloadManifestV1): Promise<void> {
    await this.repository.save(manifest)
    this.manifests.set(manifest.manga.uuid, manifest)
    this.publish()
  }

  private publish(): void {
    this.snapshot = {
      initialized: this.initialized,
      eligible: this.eligible,
      manifests: this.sortedManifests(),
    }
    this.listeners.forEach(listener => listener())
  }

  private sortedManifests(): DownloadManifestV1[] {
    return [...this.manifests.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt))
  }

  private timestamp(): string {
    return this.now().toISOString()
  }
}

function replacePage(
  manifest: DownloadManifestV1,
  page: DownloadPageRecord,
  patch: Partial<DownloadManifestV1>,
): DownloadManifestV1 {
  return {
    ...manifest,
    ...patch,
    pages: manifest.pages.map(item => item.index === page.index ? page : item),
  }
}

function toFailure(error: DownloadPageError, pageIndex: number): DownloadFailure {
  return {
    code: error.code,
    message: error.message,
    pageIndex,
  }
}

function retryDelayMs(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** Math.max(0, attempt - 1))
}

function defaultRetryWait(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DownloadPageCancelledError())
      return
    }
    const timeout = setTimeout(resolve, delayMs)
    signal.addEventListener('abort', () => {
      clearTimeout(timeout)
      reject(new DownloadPageCancelledError())
    }, { once: true })
  })
}
