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

  function SessionProbe() {
    session = useSession()
    return null
  }

  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
  })

  it('does not let a delayed 401 from an old server clear a new session', async () => {
    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    )
    await waitFor(() => expect(session.status).toBe('needs-server'))

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
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ))

    await expect(staleApi?.request('/api/private')).rejects.toMatchObject({ status: 401 })
    expect(session.auth?.token).toBe(secondToken)
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(deletesBeforeStaleResponse)
  })
})
