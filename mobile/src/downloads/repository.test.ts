import type { MangaDetail } from '@/api/types'
import type { DownloadFileStore } from '@/downloads/files'
import {
  DownloadRepository,
  DownloadRepositoryError,
} from '@/downloads/repository'

const manga: MangaDetail = {
  uuid: 'manga/with:path',
  displayTitle: '测试漫画',
  originalTitle: 'Original',
  fullname: 'manga',
  publishDate: null,
  cover: 0,
  createAt: '2026-07-01T00:00:00.000Z',
  updateAt: '2026-07-27T00:00:00.000Z',
  pages: ['0.jpg', '1.jpg'],
  mangaTags: [],
}

describe('DownloadRepository', () => {
  it('creates, loads and deletes an identity-isolated manifest', async () => {
    const files = new MemoryDownloadFileStore()
    const repository = repositoryWith(files)
    const created = await repository.create(
      'https://example.com/base/',
      'user-1',
      manga,
      new Date('2026-07-27T12:00:00.000Z'),
    )

    expect(created.identity.serverUrl).toBe('https://example.com/base')
    expect([...files.values.keys()].some(uri => uri.includes('example.com'))).toBe(false)
    expect([...files.values.keys()].some(uri => uri.includes('manga%2Fwith%3Apath'))).toBe(true)

    const loaded = await repository.load(
      'https://example.com/base',
      'user-1',
      manga.uuid,
    )
    expect(loaded).toEqual(created)

    await repository.delete('https://example.com/base', 'user-1', manga.uuid)
    await expect(repository.load(
      'https://example.com/base',
      'user-1',
      manga.uuid,
    )).resolves.toBeNull()
  })

  it('pauses interrupted manifests when loading', async () => {
    const files = new MemoryDownloadFileStore()
    const repository = repositoryWith(files)
    const manifest = await repository.create('https://example.com', 'user-1', manga)
    manifest.state = 'downloading'
    manifest.pages[0].state = 'downloading'
    await repository.save(manifest)

    const loaded = await repository.load('https://example.com', 'user-1', manga.uuid)

    expect(loaded?.state).toBe('paused')
    expect(loaded?.pages[0].state).toBe('pending')
  })

  it('rejects a digest collision with a different identity record', async () => {
    const files = new MemoryDownloadFileStore()
    const repository = repositoryWith(files)
    await repository.create('https://one.example.com', 'user-1', manga)

    await expect(repository.create(
      'https://two.example.com',
      'user-2',
      { ...manga, uuid: 'manga-2' },
    )).rejects.toThrow('下载身份摘要冲突')
  })

  it('rejects corrupt manifests instead of exposing partial data', async () => {
    const files = new MemoryDownloadFileStore()
    const repository = repositoryWith(files)
    await repository.create('https://example.com', 'user-1', manga)
    const manifestUri = [...files.values.keys()].find(uri => uri.endsWith('/manifest.json'))!
    files.values.set(manifestUri, '{broken')

    await expect(repository.load(
      'https://example.com',
      'user-1',
      manga.uuid,
    )).rejects.toBeInstanceOf(DownloadRepositoryError)
  })

  it('builds zero-padded private page paths and rejects invalid indices', async () => {
    const repository = repositoryWith(new MemoryDownloadFileStore())

    await expect(repository.pagePaths(
      'https://example.com',
      'user-1',
      manga.uuid,
      12,
    )).resolves.toEqual({
      partialUri: expect.stringMatching(/manga%2Fwith%3Apath\/partial\/000012\.part$/),
      completedUri: expect.stringMatching(/manga%2Fwith%3Apath\/pages\/000012\.page$/),
    })
    await expect(repository.pagePaths(
      'https://example.com',
      'user-1',
      manga.uuid,
      -1,
    )).rejects.toThrow('页面索引无效')
  })

  it('lists only the active identity and persists interrupted-state reconciliation', async () => {
    const files = new MemoryDownloadFileStore()
    const repository = repositoryWithIdentityDigest(files)
    const first = await repository.create('https://example.com', 'user-1', manga)
    first.state = 'downloading'
    first.pages[0].state = 'downloading'
    await repository.save(first)
    await repository.create(
      'https://example.com',
      'user-2',
      { ...manga, uuid: 'other-manga', updateAt: '2026-07-28T00:00:00.000Z' },
    )

    const reconciled = await repository.reconcile('https://example.com', 'user-1')

    expect(reconciled).toHaveLength(1)
    expect(reconciled[0].manga.uuid).toBe(manga.uuid)
    expect(reconciled[0].state).toBe('paused')
    expect(reconciled[0].pages[0].state).toBe('pending')
    expect(files.deletedDirectories).toContainEqual(expect.stringMatching(
      /manga%2Fwith%3Apath\/partial$/,
    ))
    await expect(repository.load(
      'https://example.com',
      'user-1',
      manga.uuid,
    )).resolves.toMatchObject({ state: 'paused' })
  })

  it('clears all offline identities from the versioned root', async () => {
    const files = new MemoryDownloadFileStore()
    const repository = repositoryWithIdentityDigest(files)
    await repository.create('https://example.com', 'user-1', manga)
    await repository.create(
      'https://example.com',
      'user-2',
      { ...manga, uuid: 'other-manga' },
    )

    await repository.deleteAll()

    expect(files.deletedDirectories).toContain('file:///documents/mangadb-downloads/v1')
  })

  it('returns only complete, size-verified local page URIs', async () => {
    const files = new MemoryDownloadFileStore()
    const repository = repositoryWith(files)
    const manifest = await repository.create('https://example.com', 'user-1', manga)
    manifest.state = 'completed'
    manifest.pages.forEach(page => {
      page.state = 'completed'
      page.bytesWritten = page.index + 3
    })
    await repository.save(manifest)
    for (const page of manifest.pages) {
      const paths = await repository.pagePaths(
        'https://example.com',
        'user-1',
        manga.uuid,
        page.index,
      )
      files.sizes.set(paths.completedUri, page.bytesWritten)
    }

    await expect(repository.localPageUris(
      'https://example.com',
      'user-1',
      manga.uuid,
    )).resolves.toEqual([
      expect.stringMatching(/000000\.page$/),
      expect.stringMatching(/000001\.page$/),
    ])

    const secondPage = await repository.pagePaths(
      'https://example.com',
      'user-1',
      manga.uuid,
      1,
    )
    files.sizes.delete(secondPage.completedUri)
    await expect(repository.localPageUris(
      'https://example.com',
      'user-1',
      manga.uuid,
    )).rejects.toThrow('第 2 页损坏或缺失')
  })

  it('stages a replacement outside the readable manga and commits it atomically', async () => {
    const files = new MemoryDownloadFileStore()
    const repository = repositoryWith(files)
    const original = await repository.create('https://example.com', 'user-1', manga)
    const replacement = await repository.createReplacement(
      'https://example.com',
      'user-1',
      { ...manga, updateAt: '2026-07-28T00:00:00.000Z' },
    )
    replacement.state = 'completed'
    replacement.pages = replacement.pages.map(page => ({
      ...page,
      state: 'completed',
      bytesWritten: 4,
      expectedBytes: 4,
    }))

    await repository.commitReplacement(replacement)

    expect(files.replacements).toHaveLength(1)
    expect(files.replacements[0]).toMatchObject({
      sourceUri: expect.stringMatching(/\/updates\/manga%2Fwith%3Apath$/),
      destinationUri: expect.stringMatching(/\/mangas\/manga%2Fwith%3Apath$/),
      backupUri: expect.stringMatching(/manga%2Fwith%3Apath\.backup$/),
    })
    expect(original.manga.updateAt).not.toBe(replacement.manga.updateAt)
  })
})

function repositoryWith(files: DownloadFileStore) {
  return new DownloadRepository(
    files,
    'file:///documents/mangadb-downloads/v1',
    async () => 'a'.repeat(64),
  )
}

function repositoryWithIdentityDigest(files: DownloadFileStore) {
  return new DownloadRepository(
    files,
    'file:///documents/mangadb-downloads/v1',
    async identity => identity.userUuid === 'user-1' ? 'a'.repeat(64) : 'b'.repeat(64),
  )
}

class MemoryDownloadFileStore implements DownloadFileStore {
  readonly values = new Map<string, string>()
  readonly directories = new Set<string>()
  readonly deletedDirectories: string[] = []
  readonly sizes = new Map<string, number>()
  readonly replacements: Array<{
    sourceUri: string
    destinationUri: string
    backupUri: string
  }> = []

  async ensureDirectory(uri: string) {
    this.directories.add(uri)
  }

  async readText(uri: string) {
    return this.values.get(uri) ?? null
  }

  async writeTextAtomic(uri: string, value: string) {
    this.values.set(uri, value)
  }

  async deleteDirectory(uri: string) {
    this.deletedDirectories.push(uri)
    this.directories.delete(uri)
    for (const key of [...this.values.keys()]) {
      if (key === uri || key.startsWith(`${uri}/`)) this.values.delete(key)
    }
  }

  async listDirectoryNames(uri: string) {
    const prefix = `${uri.replace(/\/+$/, '')}/`
    const names = new Set<string>()
    for (const directory of this.directories) {
      if (!directory.startsWith(prefix)) continue
      const remainder = directory.slice(prefix.length)
      if (remainder && !remainder.includes('/')) names.add(remainder)
    }
    return [...names].sort()
  }

  async fileSize(uri: string) {
    return this.sizes.get(uri) ?? null
  }

  async replaceDirectoryAtomic(
    sourceUri: string,
    destinationUri: string,
    backupUri: string,
  ) {
    this.replacements.push({ sourceUri, destinationUri, backupUri })
  }
}
