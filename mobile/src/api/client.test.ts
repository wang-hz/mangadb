import { ApiClient } from './client'

describe('ApiClient', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    globalThis.fetch = fetchMock
  })

  it('builds server-relative URLs and sends Bearer authentication', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const client = new ApiClient('https://example.com/mangadb/', { token: 'secret' })

    await expect(client.request('/api/test')).resolves.toEqual({ status: 'ok' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/mangadb/api/test',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
    const options = fetchMock.mock.calls[0][1] as RequestInit
    expect((options.headers as Headers).get('Authorization')).toBe('Bearer secret')
  })

  it('clears the session callback and exposes a typed 401 error', async () => {
    const onUnauthorized = jest.fn()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }))
    const client = new ApiClient('https://example.com', { onUnauthorized })

    await expect(client.request('/api/private')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Unauthorized',
    })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('preserves a 401 response when local credential cleanup fails', async () => {
    const onUnauthorized = jest.fn().mockRejectedValue(new Error('SecureStore unavailable'))
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }))
    const client = new ApiClient('https://example.com', { onUnauthorized })

    await expect(client.request('/api/private')).rejects.toMatchObject({
      status: 401,
      message: 'Unauthorized',
    })
  })

  it('returns undefined for successful empty responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const client = new ApiClient('https://example.com')
    await expect(client.request('/api/logout', { method: 'POST' })).resolves.toBeUndefined()
  })
})
