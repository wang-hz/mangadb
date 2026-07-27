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
})

function repositoryWith(files: DownloadFileStore) {
  return new DownloadRepository(
    files,
    'file:///documents/mangadb-downloads/v1',
    async () => 'a'.repeat(64),
  )
}

class MemoryDownloadFileStore implements DownloadFileStore {
  readonly values = new Map<string, string>()
  readonly directories = new Set<string>()

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
    this.directories.delete(uri)
    for (const key of [...this.values.keys()]) {
      if (key === uri || key.startsWith(`${uri}/`)) this.values.delete(key)
    }
  }
}
