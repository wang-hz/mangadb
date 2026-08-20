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
  | 'create'
  | 'createReplacement'
  | 'commitReplacement'
  | 'delete'
  | 'deleteAll'
  | 'discardReplacement'
  | 'localPageUris'
  | 'pagePaths'
  | 'reconcile'
  | 'replacementPagePaths'
  | 'save'
  | 'saveReplacement'
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
  private readonly updateFlights = new Map<string, Promise<DownloadManifestV1>>()
  private readonly updateControllers = new Map<string, AbortController>()
  private readonly listeners = new Set<() => void>()
  private initializeFlight: Promise<void> | null = null
  private stopFlight: Promise<void> | null = null
  private initialized = false
  private eligible = true
  private stopped = false
  private clearing = false
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
    this.concurrency = Math.max(1, Math.trunc(options.concurrency ?? 1))
    this.maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 3))
    this.now = options.now ?? (() => new Date())
    this.waitForRetry = options.waitForRetry ?? defaultRetryWait
  }

  getSnapshot = (): DownloadQueueSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  initialize(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('下载服务已停止'))
    if (this.initialized) return Promise.resolve()
    if (this.initializeFlight) return this.initializeFlight
    const operation = this.initializeOnce()
    this.initializeFlight = operation
    void operation.finally(() => {
      if (this.initializeFlight === operation) this.initializeFlight = null
    }).catch(() => {})
    return operation
  }

  private async initializeOnce(): Promise<void> {
    const manifests = await this.repository.reconcile(this.serverUrl, this.userUuid)
    if (this.stopped) return
    this.manifests.clear()
    manifests.forEach(manifest => this.manifests.set(manifest.manga.uuid, manifest))
    this.initialized = true
    this.publish()
    this.pump()
  }

  enqueue(manga: MangaDetail): Promise<DownloadManifestV1> {
    if (this.clearing || this.stopped) {
      return Promise.reject(new Error('下载服务正在清理'))
    }
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

  update(manga: MangaDetail): Promise<DownloadManifestV1> {
    if (this.clearing || this.stopped) {
      return Promise.reject(new Error('下载服务正在清理'))
    }
    const existingFlight = this.updateFlights.get(manga.uuid)
    if (existingFlight) return existingFlight
    const operation = this.updateOnce(manga)
    this.updateFlights.set(manga.uuid, operation)
    void operation.finally(() => {
      if (this.updateFlights.get(manga.uuid) === operation) {
        this.updateFlights.delete(manga.uuid)
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
    const updateController = this.updateControllers.get(mangaUuid)
    if (updateController) {
      updateController.abort()
      await this.updateFlights.get(mangaUuid)?.catch(() => {})
    }
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

  async clearCurrent(): Promise<void> {
    if (this.clearing) return
    this.clearing = true
    try {
      await Promise.allSettled([...this.enqueueFlights.values()])
      this.updateControllers.forEach(controller => controller.abort())
      await Promise.allSettled([...this.updateFlights.values()])
      for (const mangaUuid of [...this.manifests.keys()]) {
        await this.delete(mangaUuid)
      }
    } finally {
      this.clearing = false
      this.pump()
    }
  }

  async clearAll(): Promise<void> {
    if (this.clearing) return
    this.clearing = true
    try {
      await Promise.allSettled([...this.enqueueFlights.values()])
      this.updateControllers.forEach(controller => controller.abort())
      await Promise.allSettled([...this.updateFlights.values()])
      const jobs = [...this.activeJobs.values()]
      jobs.forEach(job => {
        job.reason = 'delete'
        job.controller.abort()
      })
      await Promise.all(jobs.map(job => job.promise))
      await this.repository.deleteAll()
      this.manifests.clear()
      this.publish()
    } finally {
      this.clearing = false
      this.pump()
    }
  }

  setEligible(eligible: boolean): void {
    if (this.eligible === eligible) return
    this.eligible = eligible
    this.publish()
    if (!eligible) {
      this.updateControllers.forEach(controller => controller.abort())
      for (const active of this.activeJobs.values()) {
        active.reason = 'network'
        active.controller.abort()
      }
      return
    }
    this.pump()
  }

  stop(): Promise<void> {
    if (this.stopFlight) return this.stopFlight
    this.stopped = true
    this.eligible = false
    const operation = Promise.resolve().then(() => this.stopOnce())
    this.stopFlight = operation
    this.publish(true)
    return operation
  }

  private async stopOnce(): Promise<void> {
    while (true) {
      this.updateControllers.forEach(controller => controller.abort())
      for (const job of this.activeJobs.values()) {
        job.reason = 'session'
        job.controller.abort()
      }
      const flights = [
        ...(this.initializeFlight ? [this.initializeFlight] : []),
        ...this.enqueueFlights.values(),
        ...this.updateFlights.values(),
        ...[...this.activeJobs.values()].map(job => job.promise),
      ]
      if (flights.length === 0) break
      await Promise.allSettled(flights)
    }
    this.listeners.clear()
  }

  async localPageUris(mangaUuid: string): Promise<string[] | null> {
    const uris = await this.repository.localPageUris(
      this.serverUrl,
      this.userUuid,
      mangaUuid,
    )
    const manifest = this.manifests.get(mangaUuid)
    if (
      !uris &&
      manifest &&
      (manifest.state === 'completed' || manifest.state === 'stale') &&
      manifest.pages.every(page => page.state === 'completed')
    ) {
      this.manifests.delete(mangaUuid)
      this.publish()
    }
    return uris
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
    if (this.stopped) return manifest
    this.manifests.set(manga.uuid, manifest)
    this.publish()
    this.pump()
    return manifest
  }

  private async updateOnce(manga: MangaDetail): Promise<DownloadManifestV1> {
    const existing = this.manifests.get(manga.uuid)
    if (
      !existing ||
      (existing.state !== 'completed' && existing.state !== 'stale')
    ) throw new Error('只有完整下载可以更新')
    if (existing.manga.updateAt === manga.updateAt) return existing
    if (!this.initialized || !this.eligible) throw new Error('当前网络不允许更新下载')
    if (
      this.activeJobs.has(manga.uuid) ||
      this.updateControllers.has(manga.uuid) ||
      this.activeJobs.size + this.updateControllers.size >= this.concurrency
    ) throw new Error('下载队列繁忙，请稍后重试')

    const stale = {
      ...existing,
      state: 'stale' as const,
      updatedAt: this.timestamp(),
      failure: null,
    }
    let replacement: DownloadManifestV1 | null = null
    let controller: AbortController | null = null
    try {
      await this.persist(stale)
      this.assertUpdateActive()
      replacement = await this.repository.createReplacement(
        this.serverUrl,
        this.userUuid,
        manga,
        this.now(),
      )
      this.assertUpdateActive()
      controller = new AbortController()
      this.updateControllers.set(manga.uuid, controller)
      this.publish()
      for (const page of replacement.pages) {
        let lastFailure: DownloadPageError | null = null
        for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
          this.assertUpdateActive(controller)
          const replacementPage = requiredPage(replacement, page.index)
          replacement = replacePage(replacement, {
            ...replacementPage,
            state: 'downloading',
            attempts: attempt,
          }, {
            state: 'downloading',
            updatedAt: this.timestamp(),
            failure: null,
          })
          await this.repository.saveReplacement(replacement)
          this.assertUpdateActive(controller)
          try {
            const paths = await this.repository.replacementPagePaths(
              this.serverUrl,
              this.userUuid,
              manga.uuid,
              page.index,
            )
            this.assertUpdateActive(controller)
            const result = await this.downloader.download({
              api: this.api,
              mangaUuid: manga.uuid,
              pageIndex: page.index,
              paths,
              signal: controller.signal,
            })
            this.assertUpdateActive(controller)
            const currentReplacementPage = requiredPage(replacement, page.index)
            replacement = replacePage(replacement, {
              ...currentReplacementPage,
              state: 'completed',
              bytesWritten: result.bytesWritten,
              expectedBytes: result.expectedBytes,
              etag: result.etag,
              lastModified: result.lastModified,
            }, {
              state: 'downloading',
              updatedAt: this.timestamp(),
              failure: null,
            })
            await this.repository.saveReplacement(replacement)
            this.assertUpdateActive(controller)
            lastFailure = null
            break
          } catch (error) {
            if (error instanceof DownloadPageCancelledError || controller.signal.aborted) throw error
            lastFailure = error instanceof DownloadPageError
              ? error
              : new DownloadPageError('页面更新失败', 'unknown', false, error)
            if (!lastFailure.retryable || attempt >= this.maxAttempts) break
            await this.waitForRetry(retryDelayMs(attempt), controller.signal)
            this.assertUpdateActive(controller)
          }
        }
        if (lastFailure) throw lastFailure
      }
      replacement = {
        ...replacement,
        state: 'completed',
        updatedAt: this.timestamp(),
        completedAt: this.timestamp(),
        failure: null,
      }
      await this.repository.commitReplacement(replacement)
      this.assertUpdateActive(controller)
      this.manifests.set(manga.uuid, replacement)
      this.publish()
      return replacement
    } catch (error) {
      if (replacement) {
        await this.repository.discardReplacement(
          this.serverUrl,
          this.userUuid,
          manga.uuid,
        ).catch(() => {})
      }
      if (
        error instanceof DownloadPageCancelledError ||
        controller?.signal.aborted ||
        this.stopped
      ) {
        throw new Error('下载更新已暂停，旧版本仍可阅读')
      }
      throw error
    } finally {
      if (controller && this.updateControllers.get(manga.uuid) === controller) {
        this.updateControllers.delete(manga.uuid)
      }
      this.publish()
      this.pump()
    }
  }

  private pump(): void {
    if (!this.initialized || !this.eligible || this.stopped || this.clearing) return
    for (const manifest of this.sortedManifests()) {
      if (this.activeJobs.size + this.updateControllers.size >= this.concurrency) break
      if (manifest.state !== 'queued' || this.activeJobs.has(manifest.manga.uuid)) continue
      this.startJob(manifest.manga.uuid)
    }
  }

  private startJob(mangaUuid: string): void {
    if (this.stopped) return
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
        if (!this.stopped) this.publish()
        this.pump()
      })
    this.activeJobs.set(mangaUuid, active)
    this.publish()
  }

  private async runJob(mangaUuid: string, active: ActiveJob): Promise<void> {
    while (!active.controller.signal.aborted && !this.stopped) {
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
      this.manifests.set(mangaUuid, downloadingManifest)
      this.publish()

      try {
        const paths = await this.repository.pagePaths(
          this.serverUrl,
          this.userUuid,
          mangaUuid,
          page.index,
        )
        if (active.controller.signal.aborted || this.stopped) {
          await this.handleCancellation(mangaUuid, page.index, active.reason)
          return
        }
        const result = await this.downloader.download({
          api: this.api,
          mangaUuid,
          pageIndex: page.index,
          paths,
          signal: active.controller.signal,
        })
        if (active.controller.signal.aborted || this.stopped) {
          await this.handleCancellation(mangaUuid, page.index, active.reason)
          return
        }
        const current = this.manifests.get(mangaUuid)
        if (!current) return
        const currentPage = requiredPage(current, page.index)
        await this.persist(replacePage(current, {
          ...currentPage,
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
        const currentPage = requiredPage(current, page.index)
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
    if (this.stopped) return
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
    if (this.stopped) return
    this.manifests.set(manifest.manga.uuid, manifest)
    this.publish()
  }

  private publish(force = false): void {
    if (this.stopped && !force) return
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

  private assertUpdateActive(controller?: AbortController | null): void {
    if (this.stopped || controller?.signal.aborted) {
      throw new DownloadPageCancelledError()
    }
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

function requiredPage(
  manifest: DownloadManifestV1,
  pageIndex: number,
): DownloadPageRecord {
  const page = manifest.pages[pageIndex]
  if (!page || page.index !== pageIndex) {
    throw new Error('下载清单页面索引不一致')
  }
  return page
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
    let settled = false
    const cleanup = () => signal.removeEventListener('abort', abort)
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }, delayMs)
    const abort = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      cleanup()
      reject(new DownloadPageCancelledError())
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}
