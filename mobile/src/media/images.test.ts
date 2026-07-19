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
      uri: 'https://library.example.com/base/api/file/mangas/manga-1/pages/3?thumb=1',
      headers: { Authorization: 'Bearer secret' },
    })
    expect(source.cacheKey).toContain('user-1')
    expect(source.cacheKey).toContain('thumbnail')
    expect(source.cacheKey).not.toContain('secret')
  })
})
