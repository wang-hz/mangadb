import { checkServer, login, logout } from './auth'
import type { ApiClient } from './client'

describe('authentication API', () => {
  const request = jest.fn()
  const client = { request } as unknown as ApiClient

  it('checks health before reading setup status', async () => {
    request
      .mockResolvedValueOnce({ status: 'ok' })
      .mockResolvedValueOnce({ needsSetup: false })

    await expect(checkServer(client)).resolves.toEqual({ needsSetup: false })
    expect(request.mock.calls).toEqual([
      ['/health'],
      ['/api/auth/setup-status'],
    ])
  })

  it('rejects an unhealthy or incompatible server', async () => {
    request.mockResolvedValueOnce({ status: 'error' })
    await expect(checkServer(client)).rejects.toMatchObject({ status: 503 })

    request
      .mockResolvedValueOnce({ status: 'ok' })
      .mockResolvedValueOnce({})
    await expect(checkServer(client)).rejects.toMatchObject({ status: 502 })
  })

  it('sends credentials as JSON and requires a token response', async () => {
    request.mockResolvedValueOnce({ token: 'signed-token' })
    await expect(login(client, 'reader', 'password')).resolves.toEqual({ token: 'signed-token' })
    expect(request).toHaveBeenLastCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reader', password: 'password' }),
    })

    request.mockResolvedValueOnce({})
    await expect(login(client, 'reader', 'password')).rejects.toMatchObject({ status: 502 })
  })

  it('revokes the current server session', async () => {
    request.mockResolvedValueOnce(undefined)

    await expect(logout(client)).resolves.toBeUndefined()
    expect(request).toHaveBeenLastCalledWith('/api/auth/logout', { method: 'POST' })
  })
})
