import { ApiClient } from '@/api/client'
import { mangaPageImageSource } from './images'

describe('mangaPageImageSource', () => {
  it('isolates authenticated image caches by server, user and revision', () => {
    const client = new ApiClient('https://library.example.com/base', { token: 'secret' })
    const source = mangaPageImageSource(
      client,
      'https://library.example.com/base',
      'user-1',
      'manga-1',
      3,
      '2026-07-19T12:00:00.000Z',
      true,
    )

    expect(source).toMatchObject({
      headers: { Authorization: 'Bearer secret' },
    })
    expect(source.uri).toContain('https://library.example.com/base/api/file/mangas/manga-1/pages/3?')
    expect(source.uri).toContain('cacheRevision=2026-07-19T12%3A00%3A00.000Z')
    expect(source.uri).toContain('cacheUser=user-1')
    expect(source.uri).toContain('thumb=1')
    expect(source.cacheKey).toBe(source.uri)
    expect(source.cacheKey).toContain('user-1')
    expect(source.cacheKey).not.toContain('secret')
  })
})
