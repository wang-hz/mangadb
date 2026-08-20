import type { MangaDetail } from '@/api/types'
import {
  defaultDownloadRootUri,
  type DownloadFileStore,
  ExpoDownloadFileStore,
} from '@/downloads/files'
import { downloadIdentityKey, normalizeDownloadIdentity } from '@/downloads/identity'
import {
  createDownloadManifest,
  type DownloadIdentity,
  type DownloadManifestV1,
  isDownloadManifestV1,
  normalizeRestoredManifest,
} from '@/downloads/types'

interface IdentityRecord extends DownloadIdentity {
  schemaVersion: 1
}

interface IdentityPaths {
  identityUri: string
  identityFileUri: string
  mangasUri: string
  updatesUri: string
}

export interface DownloadPagePaths {
  partialUri: string
  completedUri: string
}

export class DownloadRepository {
  private readonly identityPathsCache = new Map<string, Promise<IdentityPaths>>()

  constructor(
    private readonly files: DownloadFileStore = new ExpoDownloadFileStore(),
    private readonly rootUri = defaultDownloadRootUri(),
    private readonly identityKey: typeof downloadIdentityKey = downloadIdentityKey,
  ) {}

  async create(
    serverUrl: string,
    userUuid: string,
    manga: MangaDetail,
    now = new Date(),
  ): Promise<DownloadManifestV1> {
    const identity = normalizeDownloadIdentity(serverUrl, userUuid)
    const paths = await this.paths(identity, manga.uuid)
    await this.ensureIdentity(paths.identityUri, paths.identityFileUri, identity)
    await this.files.ensureDirectory(paths.mangaUri)
    const manifest = createDownloadManifest(identity, manga, now)
    await this.files.writeTextAtomic(paths.manifestUri, JSON.stringify(manifest))
    return manifest
  }

  async load(
    serverUrl: string,
    userUuid: string,
    mangaUuid: string,
  ): Promise<DownloadManifestV1 | null> {
    const identity = normalizeDownloadIdentity(serverUrl, userUuid)
    const paths = await this.paths(identity, mangaUuid)
    const raw = await this.files.readText(paths.manifestUri)
    if (raw === null) return null
    return parseManifest(raw, identity, mangaUuid)
  }

  async save(manifest: DownloadManifestV1): Promise<void> {
    if (!isDownloadManifestV1(manifest)) {
      throw new DownloadRepositoryError('拒绝保存无效的下载清单')
    }
    const identity = normalizeDownloadIdentity(
      manifest.identity.serverUrl,
      manifest.identity.userUuid,
    )
    const paths = await this.paths(identity, manifest.manga.uuid)
    await this.ensureIdentity(paths.identityUri, paths.identityFileUri, identity)
    await this.files.ensureDirectory(paths.mangaUri)
    await this.files.writeTextAtomic(paths.manifestUri, JSON.stringify(manifest))
  }

  async createReplacement(
    serverUrl: string,
    userUuid: string,
    manga: MangaDetail,
    now = new Date(),
  ): Promise<DownloadManifestV1> {
    const identity = normalizeDownloadIdentity(serverUrl, userUuid)
    const paths = await this.paths(identity, manga.uuid)
    await this.ensureIdentity(paths.identityUri, paths.identityFileUri, identity)
    await this.files.deleteDirectory(paths.replacementMangaUri)
    await this.files.ensureDirectory(paths.replacementMangaUri)
    const manifest = createDownloadManifest(identity, manga, now)
    await this.files.writeTextAtomic(
      paths.replacementManifestUri,
      JSON.stringify(manifest),
    )
    return manifest
  }

  async saveReplacement(manifest: DownloadManifestV1): Promise<void> {
    if (!isDownloadManifestV1(manifest)) {
      throw new DownloadRepositoryError('拒绝保存无效的更新清单')
    }
    const identity = normalizeDownloadIdentity(
      manifest.identity.serverUrl,
      manifest.identity.userUuid,
    )
    const paths = await this.paths(identity, manifest.manga.uuid)
    await this.ensureIdentity(paths.identityUri, paths.identityFileUri, identity)
    await this.files.ensureDirectory(paths.replacementMangaUri)
    await this.files.writeTextAtomic(
      paths.replacementManifestUri,
      JSON.stringify(manifest),
    )
  }

  async commitReplacement(manifest: DownloadManifestV1): Promise<void> {
    if (
      manifest.state !== 'completed' ||
      manifest.pages.some(page => page.state !== 'completed')
    ) {
      throw new DownloadRepositoryError('更新下载尚未完成')
    }
    await this.saveReplacement(manifest)
    const identity = normalizeDownloadIdentity(
      manifest.identity.serverUrl,
      manifest.identity.userUuid,
    )
    const paths = await this.paths(identity, manifest.manga.uuid)
    await this.files.replaceDirectoryAtomic(
      paths.replacementMangaUri,
      paths.mangaUri,
      paths.backupMangaUri,
    )
  }

  async discardReplacement(
    serverUrl: string,
    userUuid: string,
    mangaUuid: string,
  ): Promise<void> {
    const identity = normalizeDownloadIdentity(serverUrl, userUuid)
    const paths = await this.paths(identity, mangaUuid)
    await this.files.deleteDirectory(paths.replacementMangaUri)
  }

  async delete(serverUrl: string, userUuid: string, mangaUuid: string): Promise<void> {
    const identity = normalizeDownloadIdentity(serverUrl, userUuid)
    const paths = await this.paths(identity, mangaUuid)
    await this.files.deleteDirectory(paths.mangaUri)
  }

  async deleteAll(): Promise<void> {
    await this.files.deleteDirectory(this.rootUri)
  }

  async list(serverUrl: string, userUuid: string): Promise<DownloadManifestV1[]> {
    const identity = normalizeDownloadIdentity(serverUrl, userUuid)
    const identityPaths = await this.identityPaths(identity)
    await this.ensureListIdentity(identity, identityPaths)

    await this.recoverReplacementBackups(identity, identityPaths)
    const names = await this.files.listDirectoryNames(identityPaths.mangasUri)
    const manifests: DownloadManifestV1[] = []
    for (const name of names) {
      const mangaUri = joinUri(identityPaths.mangasUri, name)
      try {
        const mangaUuid = decodeURIComponent(name)
        const manifest = await this.load(
          identity.serverUrl,
          identity.userUuid,
          mangaUuid,
        )
        if (!manifest) throw new DownloadRepositoryError('下载清单缺失')
        manifests.push(manifest)
      } catch (error) {
        if (
          !(error instanceof DownloadRepositoryError) &&
          !(error instanceof URIError)
        ) throw error
        await this.files.deleteDirectory(mangaUri)
      }
    }
    return manifests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async reconcile(serverUrl: string, userUuid: string): Promise<DownloadManifestV1[]> {
    const manifests = await this.list(serverUrl, userUuid)
    const validManifests: DownloadManifestV1[] = []
    for (const manifest of manifests) {
      const identity = normalizeDownloadIdentity(
        manifest.identity.serverUrl,
        manifest.identity.userUuid,
      )
      const paths = await this.paths(identity, manifest.manga.uuid)
      await this.files.deleteDirectory(joinUri(paths.mangaUri, 'partial'))
      try {
        await this.verifyCompletedPages(manifest, paths.mangaUri)
      } catch (error) {
        if (!(error instanceof DownloadRepositoryError)) throw error
        await this.files.deleteDirectory(paths.mangaUri)
        continue
      }
      await this.save(manifest)
      validManifests.push(manifest)
    }
    const identity = normalizeDownloadIdentity(serverUrl, userUuid)
    const identityPaths = await this.identityPaths(identity)
    await this.files.deleteDirectory(identityPaths.updatesUri)
    return validManifests
  }

  async pagePaths(
    serverUrl: string,
    userUuid: string,
    mangaUuid: string,
    pageIndex: number,
  ): Promise<DownloadPagePaths> {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new DownloadRepositoryError('页面索引无效')
    }
    const identity = normalizeDownloadIdentity(serverUrl, userUuid)
    const paths = await this.paths(identity, mangaUuid)
    const filename = String(pageIndex).padStart(6, '0')
    return {
      partialUri: joinUri(paths.mangaUri, 'partial', `${filename}.part`),
      completedUri: joinUri(paths.mangaUri, 'pages', `${filename}.page`),
    }
  }

  async replacementPagePaths(
    serverUrl: string,
    userUuid: string,
    mangaUuid: string,
    pageIndex: number,
  ): Promise<DownloadPagePaths> {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new DownloadRepositoryError('页面索引无效')
    }
    const identity = normalizeDownloadIdentity(serverUrl, userUuid)
    const paths = await this.paths(identity, mangaUuid)
    const filename = String(pageIndex).padStart(6, '0')
    return {
      partialUri: joinUri(paths.replacementMangaUri, 'partial', `${filename}.part`),
      completedUri: joinUri(paths.replacementMangaUri, 'pages', `${filename}.page`),
    }
  }

  async localPageUris(
    serverUrl: string,
    userUuid: string,
    mangaUuid: string,
  ): Promise<string[] | null> {
    let manifest: DownloadManifestV1 | null
    try {
      manifest = await this.load(serverUrl, userUuid, mangaUuid)
    } catch (error) {
      if (!(error instanceof DownloadRepositoryError)) throw error
      await this.delete(serverUrl, userUuid, mangaUuid)
      return null
    }
    if (!manifest) {
      await this.delete(serverUrl, userUuid, mangaUuid)
      return null
    }
    if (
      (manifest.state !== 'completed' && manifest.state !== 'stale') ||
      manifest.pages.some(page => page.state !== 'completed')
    ) return null

    try {
      return await mapWithConcurrency(manifest.pages, 8, async page => {
        const paths = await this.pagePaths(serverUrl, userUuid, mangaUuid, page.index)
        const size = await this.files.fileSize(paths.completedUri)
        const expected = page.expectedBytes ?? page.bytesWritten
        if (size === null || size <= 0 || expected <= 0 || size !== expected) {
          throw new DownloadRepositoryError(`本机下载的第 ${page.index + 1} 页损坏或缺失`)
        }
        return paths.completedUri
      })
    } catch (error) {
      if (!(error instanceof DownloadRepositoryError)) throw error
      await this.delete(serverUrl, userUuid, mangaUuid)
      return null
    }
  }

  private async ensureListIdentity(
    identity: DownloadIdentity,
    identityPaths: IdentityPaths,
  ): Promise<void> {
    const raw = await this.files.readText(identityPaths.identityFileUri)
    if (raw !== null) {
      let value: unknown
      try {
        value = JSON.parse(raw)
      } catch {
        value = null
      }
      if (isIdentityRecord(value)) {
        if (!isMatchingIdentityRecord(value, identity)) {
          throw new DownloadRepositoryError('下载身份摘要冲突')
        }
        return
      }
    }
    await this.rebuildIdentityRecord(identity, identityPaths)
  }

  private async rebuildIdentityRecord(
    identity: DownloadIdentity,
    identityPaths: IdentityPaths,
  ): Promise<void> {
    const invalidDirectories: string[] = []
    const locations = [
      { uri: identityPaths.mangasUri, allowBackup: true },
      { uri: identityPaths.updatesUri, allowBackup: false },
    ]
    for (const location of locations) {
      const names = await this.files.listDirectoryNames(location.uri)
      for (const name of names) {
        const itemUri = joinUri(location.uri, name)
        const raw = await this.files.readText(joinUri(itemUri, 'manifest.json'))
        if (raw === null) {
          invalidDirectories.push(itemUri)
          continue
        }
        let manifest: DownloadManifestV1
        try {
          manifest = parseManifestDocument(raw)
        } catch (error) {
          if (!(error instanceof DownloadRepositoryError)) throw error
          invalidDirectories.push(itemUri)
          continue
        }
        if (
          manifest.identity.serverUrl !== identity.serverUrl ||
          manifest.identity.userUuid !== identity.userUuid
        ) {
          throw new DownloadRepositoryError('下载身份摘要冲突')
        }
        if (!directoryNameMatchesManifest(name, manifest.manga.uuid, location.allowBackup)) {
          invalidDirectories.push(itemUri)
        }
      }
    }
    for (const uri of invalidDirectories) await this.files.deleteDirectory(uri)
    const record: IdentityRecord = { schemaVersion: 1, ...identity }
    await this.files.writeTextAtomic(
      identityPaths.identityFileUri,
      JSON.stringify(record),
    )
  }

  private async recoverReplacementBackups(
    identity: DownloadIdentity,
    identityPaths: IdentityPaths,
  ): Promise<void> {
    const names = await this.files.listDirectoryNames(identityPaths.mangasUri)
    for (const name of names) {
      if (!name.endsWith('.backup')) continue
      const encodedMangaUuid = name.slice(0, -'.backup'.length)
      if (!encodedMangaUuid) continue
      let mangaUuid: string
      try {
        mangaUuid = decodeURIComponent(encodedMangaUuid)
      } catch {
        continue
      }
      const backupUri = joinUri(identityPaths.mangasUri, name)
      const backupRaw = await this.files.readText(joinUri(backupUri, 'manifest.json'))
      if (backupRaw === null) continue
      let backup: DownloadManifestV1
      try {
        backup = parseManifest(backupRaw, identity, mangaUuid)
      } catch (error) {
        if (!(error instanceof DownloadRepositoryError)) throw error
        // A real manga UUID may itself end in ".backup"; only touch a directory
        // whose manifest proves that it belongs to the suffix-stripped UUID.
        continue
      }

      const destinationUri = joinUri(identityPaths.mangasUri, encodedMangaUuid)
      const destinationRaw = await this.files.readText(
        joinUri(destinationUri, 'manifest.json'),
      )
      const backupHealthy = await this.isReadableManifest(backup, backupUri)
      let destinationHealthy = false
      if (destinationRaw !== null) {
        try {
          const destination = parseManifest(destinationRaw, identity, mangaUuid)
          destinationHealthy = await this.isReadableManifest(
            destination,
            destinationUri,
          )
        } catch (error) {
          if (!(error instanceof DownloadRepositoryError)) throw error
        }
      }
      if (!backupHealthy && !destinationHealthy) continue
      await this.files.recoverDirectoryReplacement(
        destinationUri,
        backupUri,
        backupHealthy && !destinationHealthy,
      )
    }
  }

  private async isReadableManifest(
    manifest: DownloadManifestV1,
    mangaUri: string,
  ): Promise<boolean> {
    if (
      (manifest.state !== 'completed' && manifest.state !== 'stale') ||
      manifest.pages.some(page => page.state !== 'completed')
    ) return false
    try {
      await this.verifyCompletedPages(manifest, mangaUri)
      return true
    } catch (error) {
      if (error instanceof DownloadRepositoryError) return false
      throw error
    }
  }

  private async verifyCompletedPages(
    manifest: DownloadManifestV1,
    mangaUri: string,
  ): Promise<void> {
    const completedPages = manifest.pages.filter(page => page.state === 'completed')
    await mapWithConcurrency(completedPages, 8, async page => {
      const filename = String(page.index).padStart(6, '0')
      const uri = joinUri(mangaUri, 'pages', `${filename}.page`)
      const size = await this.files.fileSize(uri)
      const expected = page.expectedBytes ?? page.bytesWritten
      if (size === null || size <= 0 || expected <= 0 || size !== expected) {
        throw new DownloadRepositoryError(`本机下载的第 ${page.index + 1} 页损坏或缺失`)
      }
    })
  }

  private async ensureIdentity(
    identityUri: string,
    identityFileUri: string,
    identity: DownloadIdentity,
  ): Promise<void> {
    await this.files.ensureDirectory(identityUri)
    const existing = await this.files.readText(identityFileUri)
    if (existing !== null) {
      let record: unknown
      try {
        record = JSON.parse(existing)
      } catch {
        throw new DownloadRepositoryError('下载身份记录损坏')
      }
      if (!isMatchingIdentityRecord(record, identity)) {
        throw new DownloadRepositoryError('下载身份摘要冲突')
      }
      return
    }
    const record: IdentityRecord = { schemaVersion: 1, ...identity }
    await this.files.writeTextAtomic(identityFileUri, JSON.stringify(record))
  }

  private async paths(identity: DownloadIdentity, mangaUuid: string) {
    if (!mangaUuid.trim()) throw new DownloadRepositoryError('漫画标识不能为空')
    const identityPaths = await this.identityPaths(identity)
    const identityUri = identityPaths.identityUri
    const mangaUri = joinUri(identityUri, 'mangas', encodeURIComponent(mangaUuid))
    return {
      identityUri,
      identityFileUri: identityPaths.identityFileUri,
      mangaUri,
      manifestUri: joinUri(mangaUri, 'manifest.json'),
      replacementMangaUri: joinUri(identityPaths.updatesUri, encodeURIComponent(mangaUuid)),
      replacementManifestUri: joinUri(
        identityPaths.updatesUri,
        encodeURIComponent(mangaUuid),
        'manifest.json',
      ),
      backupMangaUri: joinUri(
        identityPaths.mangasUri,
        `${encodeURIComponent(mangaUuid)}.backup`,
      ),
    }
  }

  private identityPaths(identity: DownloadIdentity): Promise<IdentityPaths> {
    const cacheKey = `${identity.serverUrl}\u0000${identity.userUuid}`
    const existing = this.identityPathsCache.get(cacheKey)
    if (existing) return existing
    const operation = this.identityKey(identity).then(key => {
      const identityUri = joinUri(this.rootUri, 'identities', key)
      return {
        identityUri,
        identityFileUri: joinUri(identityUri, 'identity.json'),
        mangasUri: joinUri(identityUri, 'mangas'),
        updatesUri: joinUri(identityUri, 'updates'),
      }
    })
    this.identityPathsCache.set(cacheKey, operation)
    void operation.catch(() => {
      if (this.identityPathsCache.get(cacheKey) === operation) {
        this.identityPathsCache.delete(cacheKey)
      }
    })
    return operation
  }
}

function parseManifest(
  raw: string,
  identity: DownloadIdentity,
  mangaUuid: string,
): DownloadManifestV1 {
  const value = parseManifestDocument(raw)
  if (
    value.identity.serverUrl !== identity.serverUrl ||
    value.identity.userUuid !== identity.userUuid ||
    value.manga.uuid !== mangaUuid
  ) {
    throw new DownloadRepositoryError('下载清单身份不匹配')
  }
  return value
}

function parseManifestDocument(raw: string): DownloadManifestV1 {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new DownloadRepositoryError('下载清单不是有效的 JSON')
  }
  if (!isDownloadManifestV1(value)) {
    throw new DownloadRepositoryError('下载清单版本或内容无效')
  }
  return normalizeRestoredManifest(value)
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  const indexedValues = values.map((value, index) => ({ index, value }))
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex
        nextIndex += 1
        const entry = indexedValues[index]
        if (!entry) throw new Error('并发任务索引越界')
        results[entry.index] = await operation(entry.value)
      }
    },
  )
  await Promise.all(workers)
  return results
}

export class DownloadRepositoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DownloadRepositoryError'
  }
}

function isMatchingIdentityRecord(
  value: unknown,
  identity: DownloadIdentity,
): value is IdentityRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Partial<IdentityRecord>
  return record.schemaVersion === 1 &&
    record.serverUrl === identity.serverUrl &&
    record.userUuid === identity.userUuid
}

function isIdentityRecord(value: unknown): value is IdentityRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Partial<IdentityRecord>
  return record.schemaVersion === 1 &&
    typeof record.serverUrl === 'string' &&
    record.serverUrl.length > 0 &&
    typeof record.userUuid === 'string' &&
    record.userUuid.length > 0
}

function directoryNameMatchesManifest(
  name: string,
  mangaUuid: string,
  allowBackup: boolean,
): boolean {
  try {
    if (decodeURIComponent(name) === mangaUuid) return true
    return allowBackup &&
      name.endsWith('.backup') &&
      decodeURIComponent(name.slice(0, -'.backup'.length)) === mangaUuid
  } catch {
    return false
  }
}

function joinUri(base: string, ...segments: string[]): string {
  return [base.replace(/\/+$/, ''), ...segments.map(segment =>
    segment.replace(/^\/+|\/+$/g, ''))].join('/')
}
