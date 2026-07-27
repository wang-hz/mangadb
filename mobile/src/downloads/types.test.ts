import type { MangaDetail } from '@/api/types'
import {
  createDownloadManifest,
  isDownloadManifestV1,
  normalizeRestoredManifest,
} from '@/downloads/types'

const manga: MangaDetail = {
  uuid: 'manga-1',
  displayTitle: '测试漫画',
  originalTitle: 'Original',
  fullname: 'manga-1',
  publishDate: null,
  cover: 0,
  createAt: '2026-07-01T00:00:00.000Z',
  updateAt: '2026-07-27T00:00:00.000Z',
  pages: ['0.jpg', '1.jpg'],
  mangaTags: [],
}

describe('download manifest', () => {
  it('creates a versioned queued manifest with pending pages', () => {
    const manifest = createDownloadManifest(
      { serverUrl: 'https://example.com', userUuid: 'user-1' },
      manga,
      new Date('2026-07-27T12:00:00.000Z'),
    )

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      state: 'queued',
      requestedAt: '2026-07-27T12:00:00.000Z',
      completedAt: null,
    })
    expect(manifest.pages).toEqual([
      expect.objectContaining({ index: 0, state: 'pending', bytesWritten: 0 }),
      expect.objectContaining({ index: 1, state: 'pending', bytesWritten: 0 }),
    ])
    expect(isDownloadManifestV1(manifest)).toBe(true)
  })

  it('normalizes interrupted runtime states after restoration', () => {
    const manifest = createDownloadManifest(
      { serverUrl: 'https://example.com', userUuid: 'user-1' },
      manga,
    )
    manifest.state = 'downloading'
    manifest.pages[0].state = 'completed'
    manifest.pages[1].state = 'downloading'

    const restored = normalizeRestoredManifest(manifest)

    expect(restored.state).toBe('paused')
    expect(restored.pages.map(page => page.state)).toEqual(['completed', 'pending'])
    expect(manifest.state).toBe('downloading')
  })

  it('rejects malformed and mismatched page records', () => {
    const manifest = createDownloadManifest(
      { serverUrl: 'https://example.com', userUuid: 'user-1' },
      manga,
    )
    expect(isDownloadManifestV1({ ...manifest, schemaVersion: 2 })).toBe(false)
    expect(isDownloadManifestV1({
      ...manifest,
      pages: [{ ...manifest.pages[0], index: 4 }, manifest.pages[1]],
    })).toBe(false)
    expect(isDownloadManifestV1({ ...manifest, pages: manifest.pages.slice(0, 1) })).toBe(false)
  })
})
