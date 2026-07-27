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

export interface DownloadPagePaths {
  partialUri: string
  completedUri: string
}

export class DownloadRepository {
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
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new DownloadRepositoryError('下载清单不是有效的 JSON')
    }
    if (!isDownloadManifestV1(value)) {
      throw new DownloadRepositoryError('下载清单版本或内容无效')
    }
    if (
      value.identity.serverUrl !== identity.serverUrl ||
      value.identity.userUuid !== identity.userUuid ||
      value.manga.uuid !== mangaUuid
    ) {
      throw new DownloadRepositoryError('下载清单身份不匹配')
    }
    return normalizeRestoredManifest(value)
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
    const identityRaw = await this.files.readText(identityPaths.identityFileUri)
    if (identityRaw === null) return []
    let identityRecord: unknown
    try {
      identityRecord = JSON.parse(identityRaw)
    } catch {
      throw new DownloadRepositoryError('下载身份记录损坏')
    }
    if (!isMatchingIdentityRecord(identityRecord, identity)) {
      throw new DownloadRepositoryError('下载身份摘要冲突')
    }

    const names = await this.files.listDirectoryNames(identityPaths.mangasUri)
    const manifests: DownloadManifestV1[] = []
    for (const name of names) {
      let mangaUuid: string
      try {
        mangaUuid = decodeURIComponent(name)
      } catch {
        throw new DownloadRepositoryError('漫画下载目录名称无效')
      }
      const manifest = await this.load(identity.serverUrl, identity.userUuid, mangaUuid)
      if (manifest) manifests.push(manifest)
    }
    return manifests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async reconcile(serverUrl: string, userUuid: string): Promise<DownloadManifestV1[]> {
    const manifests = await this.list(serverUrl, userUuid)
    await Promise.all(manifests.map(manifest => this.save(manifest)))
    return manifests
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
    }
  }

  private async identityPaths(identity: DownloadIdentity) {
    const key = await this.identityKey(identity)
    const identityUri = joinUri(this.rootUri, 'identities', key)
    return {
      identityUri,
      identityFileUri: joinUri(identityUri, 'identity.json'),
      mangasUri: joinUri(identityUri, 'mangas'),
    }
  }
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

function joinUri(base: string, ...segments: string[]): string {
  return [base.replace(/\/+$/, ''), ...segments.map(segment =>
    segment.replace(/^\/+|\/+$/g, ''))].join('/')
}
