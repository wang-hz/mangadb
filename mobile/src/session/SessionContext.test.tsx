import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { act, render, waitFor } from '@testing-library/react-native'
import { SessionProvider, useSession } from './SessionContext'

function token(username: string, uuid: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${encode({ alg: 'none' })}.${encode({
    sub: username,
    uuid,
    role: 'user',
    exp: Math.floor(Date.now() / 1000) + 3_600,
  })}.`
}

describe('SessionProvider', () => {
  let session: ReturnType<typeof useSession>
  let onSessionCleanup: jest.MockedFunction<() => Promise<boolean>>

  function SessionProbe() {
    session = useSession()
    return null
  }

  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
    jest.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined)
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined)
    onSessionCleanup = jest.fn().mockResolvedValue(true)
  })

  async function renderSession() {
    render(
      <SessionProvider onSessionCleanup={onSessionCleanup}>
        <SessionProbe />
      </SessionProvider>,
    )
    await waitFor(() => expect(session.status).toBe('needs-server'))
  }

  async function authenticateSession(
    serverUrl = 'https://one.example.com',
    accessToken = token('reader', 'user-1'),
  ) {
    await act(async () => {
      await session.configureServer(serverUrl)
      await session.authenticate(accessToken)
    })
    expect(session.status).toBe('authenticated')
    return accessToken
  }

  it('does not let a delayed 401 from an old server clear a new session', async () => {
    await renderSession()

    const firstToken = token('first', 'user-1')
    await act(async () => {
      await session.configureServer('https://one.example.com')
      await session.authenticate(firstToken)
    })
    const staleApi = session.api

    const secondToken = token('second', 'user-2')
    await act(async () => {
      await session.configureServer('https://two.example.com')
      await session.authenticate(secondToken)
    })
    const deletesBeforeStaleResponse = jest.mocked(SecureStore.deleteItemAsync).mock.calls.length
    const cleanupsBeforeStaleResponse = onSessionCleanup.mock.calls.length
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ))

    await expect(staleApi?.request('/api/private')).rejects.toMatchObject({ status: 401 })
    expect(session.auth?.token).toBe(secondToken)
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(deletesBeforeStaleResponse)
    expect(onSessionCleanup).toHaveBeenCalledTimes(cleanupsBeforeStaleResponse)
  })

  it('removes a stored LAN HTTP session from an HTTPS-only build', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('http://192.168.1.20:3000')
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(token('reader', 'user-1'))

    render(
      <SessionProvider allowLanHttp={false} onSessionCleanup={onSessionCleanup}>
        <SessionProbe />
      </SessionProvider>,
    )

    await waitFor(() => expect(session.status).toBe('needs-server'))
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('mangadb.serverUrl.v1')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('mangadb.accessToken.v1')
    expect(onSessionCleanup).toHaveBeenCalledTimes(1)
  })

  it('rejects configuring LAN HTTP when the build is HTTPS-only', async () => {
    await renderSession()

    await expect(session.configureServer('http://192.168.1.20:3000'))
      .rejects.toThrow('此应用构建仅支持 HTTPS 服务器')
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  })

  it('signs out while retaining the active server', async () => {
    await renderSession()
    await authenticateSession()
    jest.mocked(SecureStore.deleteItemAsync).mockClear()
    jest.mocked(AsyncStorage.removeItem).mockClear()
    onSessionCleanup.mockClear()

    await act(async () => {
      await expect(session.signOut()).resolves.toEqual({ cacheCleared: true })
    })

    expect(session.status).toBe('needs-login')
    expect(session.serverUrl).toBe('https://one.example.com')
    expect(session.auth).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1)
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled()
    expect(AsyncStorage.clear).not.toHaveBeenCalled()
    expect(onSessionCleanup).toHaveBeenCalledTimes(1)
  })

  it('clears the server without touching reading progress storage', async () => {
    await renderSession()
    await authenticateSession()
    jest.mocked(SecureStore.deleteItemAsync).mockClear()
    jest.mocked(AsyncStorage.removeItem).mockClear()
    onSessionCleanup.mockClear()

    await act(async () => {
      await expect(session.clearServer()).resolves.toEqual({ cacheCleared: true })
    })

    expect(session.status).toBe('needs-server')
    expect(session.serverUrl).toBeNull()
    expect(session.auth).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1)
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('mangadb.serverUrl.v1')
    expect(AsyncStorage.clear).not.toHaveBeenCalled()
    expect(onSessionCleanup).toHaveBeenCalledTimes(1)
  })

  it('keeps the current session when credential deletion fails and allows retry', async () => {
    await renderSession()
    const accessToken = await authenticateSession()
    onSessionCleanup.mockClear()
    jest.mocked(SecureStore.deleteItemAsync)
      .mockRejectedValueOnce(new Error('keychain unavailable'))
      .mockResolvedValueOnce(undefined)

    await act(async () => {
      await expect(session.signOut()).rejects.toThrow('keychain unavailable')
    })
    expect(session.status).toBe('authenticated')
    expect(session.auth?.token).toBe(accessToken)
    expect(onSessionCleanup).not.toHaveBeenCalled()

    await act(async () => {
      await expect(session.signOut()).resolves.toEqual({ cacheCleared: true })
    })
    expect(session.status).toBe('needs-login')
  })

  it('coalesces concurrent 401 cleanup for the current session', async () => {
    await renderSession()
    await authenticateSession()
    const api = session.api!
    jest.mocked(SecureStore.deleteItemAsync).mockClear()
    onSessionCleanup.mockClear()
    globalThis.fetch = jest.fn().mockImplementation(() => Promise.resolve(new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )))

    await act(async () => {
      await Promise.allSettled([
        api.request('/api/first'),
        api.request('/api/second'),
      ])
    })

    expect(session.status).toBe('needs-login')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1)
    expect(onSessionCleanup).toHaveBeenCalledTimes(1)
  })

  it('expires the runtime session even when secure token deletion initially fails', async () => {
    await renderSession()
    await authenticateSession()
    const api = session.api!
    jest.mocked(SecureStore.deleteItemAsync)
      .mockClear()
      .mockRejectedValueOnce(new Error('keychain unavailable'))
      .mockResolvedValueOnce(undefined)
    onSessionCleanup.mockClear()
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ))

    await act(async () => {
      await expect(api.request('/api/private')).rejects.toMatchObject({ status: 401 })
    })

    expect(session.status).toBe('needs-login')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(2)
    expect(onSessionCleanup).toHaveBeenCalledTimes(1)
  })

  it('waits for old cache cleanup before publishing a new authentication', async () => {
    await renderSession()
    await authenticateSession()
    jest.mocked(SecureStore.setItemAsync).mockClear()
    let finishCleanup: ((value: boolean) => void) | undefined
    onSessionCleanup.mockImplementationOnce(() => new Promise(resolve => {
      finishCleanup = resolve
    }))

    const signOutPromise = session.signOut()
    await waitFor(() => expect(session.status).toBe('needs-login'))
    const nextToken = token('next-reader', 'user-2')
    const authenticatePromise = session.authenticate(nextToken)
    await Promise.resolve()
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()

    finishCleanup?.(true)
    await act(async () => {
      await Promise.all([signOutPromise, authenticatePromise])
    })
    expect(session.auth?.token).toBe(nextToken)
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1)
  })
})
