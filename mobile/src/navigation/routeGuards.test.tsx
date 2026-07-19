import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Slot } from 'expo-router'
import {
  act,
  cleanup,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library'
import { Pressable, Text } from 'react-native'
import IndexScreen from '@/app/index'
import ProtectedLayout from '@/app/(app)/_layout'
import { SessionProvider, useSession } from '@/session/SessionContext'

const mockSessionCleanup = jest.fn<Promise<boolean>, []>()

function TestRootLayout() {
  return (
    <SessionProvider onSessionCleanup={mockSessionCleanup}>
      <Slot />
    </SessionProvider>
  )
}

function SlotLayout() {
  return <Slot />
}

function ConnectStub() {
  return <Text>连接服务器页面</Text>
}

function LoginStub() {
  return <Text>登录页面</Text>
}

function MangaStub() {
  const { api } = useSession()
  return (
    <>
      <Text>漫画页面</Text>
      <Pressable
        accessibilityLabel="发起鉴权请求"
        onPress={() => { void api?.request('/api/private').catch(() => {}) }}
      />
    </>
  )
}

const routes = {
  '_layout': TestRootLayout,
  'index': IndexScreen,
  'connect': ConnectStub,
  'login': LoginStub,
  '(app)/_layout': ProtectedLayout,
  '(app)/(tabs)/_layout': SlotLayout,
  '(app)/(tabs)/mangas': MangaStub,
}

describe('startup and protected navigation', () => {
  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    jest.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined)
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined)
    mockSessionCleanup.mockResolvedValue(true)
    globalThis.fetch = jest.fn()
  })

  afterEach(() => {
    cleanup()
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('routes a first launch to server connection', async () => {
    const result = renderRouter(routes, { initialUrl: '/' })

    await waitFor(() => expect(result.getPathname()).toBe('/connect'))
    expect(screen.getByText('连接服务器页面')).toBeTruthy()
  })

  it('routes a configured server without a token to login', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('https://example.com')
    const result = renderRouter(routes, { initialUrl: '/' })

    await waitFor(() => expect(result.getPathname()).toBe('/login'))
    expect(screen.getByText('登录页面')).toBeTruthy()
  })

  it('routes a valid stored session to the manga library', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('https://example.com')
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(token('reader', 'user-1'))
    const result = renderRouter(routes, { initialUrl: '/' })

    await waitFor(() => expect(result.getPathname()).toBe('/mangas'))
    expect(screen.getByText('漫画页面')).toBeTruthy()
  })

  it('holds a protected deep link while loading then redirects to login', async () => {
    let finishServerLoad: ((serverUrl: string | null) => void) | undefined
    jest.mocked(AsyncStorage.getItem).mockImplementation(() => new Promise(resolve => {
      finishServerLoad = resolve
    }))
    const result = renderRouter(routes, { initialUrl: '/mangas' })

    expect(screen.getByText('正在验证会话')).toBeTruthy()
    await act(async () => { finishServerLoad?.('https://example.com') })
    await waitFor(() => expect(result.getPathname()).toBe('/login'))
  })

  it('removes an expired startup token before routing to login', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('https://example.com')
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(token('reader', 'user-1', -60))
    const result = renderRouter(routes, { initialUrl: '/' })

    await waitFor(() => expect(result.getPathname()).toBe('/login'))
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1)
    expect(mockSessionCleanup).toHaveBeenCalledTimes(1)
  })

  it('redirects an authenticated route after the server expires its token', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue('https://example.com')
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(token('reader', 'user-1'))
    globalThis.fetch = jest.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ))
    const result = renderRouter(routes, { initialUrl: '/mangas' })
    await waitFor(() => {
      expect(screen.getByLabelText('发起鉴权请求')).toBeTruthy()
    })

    fireEvent.press(screen.getByLabelText('发起鉴权请求'))

    await waitFor(() => expect(result.getPathname()).toBe('/login'))
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1)
    expect(mockSessionCleanup).toHaveBeenCalledTimes(1)
  })
})

function token(username: string, uuid: string, expiresInSeconds = 3_600): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `${encode({ alg: 'none' })}.${encode({
    sub: username,
    uuid,
    role: 'user',
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  })}.`
}
