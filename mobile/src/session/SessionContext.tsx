import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { SessionUser } from '@/api/types'
import { ApiClient } from '@/api/client'
import {
  loadAccessToken,
  loadServerUrl,
  removeAccessToken,
  removeServerUrl,
  saveAccessToken,
  saveServerUrl,
} from '@/storage/session'
import { userFromToken } from './token'

type SessionStatus = 'loading' | 'needs-server' | 'needs-login' | 'authenticated'

interface AuthSession {
  token: string
  user: SessionUser
}

interface SessionContextValue {
  status: SessionStatus
  serverUrl: string | null
  auth: AuthSession | null
  api: ApiClient | null
  configureServer: (serverUrl: string) => Promise<void>
  authenticate: (token: string) => Promise<void>
  signOut: () => Promise<void>
  clearServer: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const serverUrlRef = useRef<string | null>(null)
  const authRef = useRef<AuthSession | null>(null)
  const authVersionRef = useRef(0)
  const tokenStorageQueueRef = useRef<Promise<void>>(Promise.resolve())

  const runTokenStorageOperation = useCallback((operation: () => Promise<void>) => {
    const result = tokenStorageQueueRef.current.then(operation, operation)
    tokenStorageQueueRef.current = result.catch(() => {})
    return result
  }, [])

  const signOut = useCallback(async () => {
    authVersionRef.current += 1
    authRef.current = null
    setAuth(null)
    await runTokenStorageOperation(removeAccessToken)
  }, [runTokenStorageOperation])

  useEffect(() => {
    let active = true
    Promise.all([loadServerUrl(), loadAccessToken()])
      .then(async ([storedServerUrl, token]) => {
        if (!active) return
        serverUrlRef.current = storedServerUrl
        setServerUrl(storedServerUrl)
        if (storedServerUrl && token) {
          const user = userFromToken(token)
          if (user) {
            const storedAuth = { token, user }
            authRef.current = storedAuth
            setAuth(storedAuth)
          }
          else await removeAccessToken()
        }
      })
      .catch(() => {
        if (!active) return
        serverUrlRef.current = null
        authRef.current = null
        setServerUrl(null)
        setAuth(null)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const configureServer = useCallback(async (nextServerUrl: string) => {
    if (nextServerUrl !== serverUrlRef.current) await signOut()
    await saveServerUrl(nextServerUrl)
    serverUrlRef.current = nextServerUrl
    setServerUrl(nextServerUrl)
  }, [signOut])

  const authenticate = useCallback(async (token: string) => {
    const user = userFromToken(token)
    if (!user) throw new Error('服务器返回了无效或已过期的登录凭证')
    const nextAuth = { token, user }
    const authVersion = authVersionRef.current + 1
    authVersionRef.current = authVersion
    authRef.current = nextAuth
    try {
      await runTokenStorageOperation(() => saveAccessToken(token))
      if (authVersionRef.current === authVersion) setAuth(nextAuth)
    } catch (error) {
      if (authVersionRef.current === authVersion) {
        authRef.current = null
        setAuth(null)
      }
      throw error
    }
  }, [runTokenStorageOperation])

  const expireAuth = useCallback(async (sourceServerUrl: string, sourceToken: string) => {
    if (
      serverUrlRef.current !== sourceServerUrl ||
      authRef.current?.token !== sourceToken
    ) return
    await signOut()
  }, [signOut])

  const clearServer = useCallback(async () => {
    authVersionRef.current += 1
    authRef.current = null
    serverUrlRef.current = null
    setAuth(null)
    setServerUrl(null)
    await Promise.all([
      runTokenStorageOperation(removeAccessToken),
      removeServerUrl(),
    ])
  }, [runTokenStorageOperation])

  const api = useMemo(() => {
    if (!serverUrl) return null
    const sourceToken = auth?.token
    return new ApiClient(serverUrl, {
      token: sourceToken,
      onUnauthorized: sourceToken
        ? () => expireAuth(serverUrl, sourceToken)
        : undefined,
    })
  }, [serverUrl, auth?.token, expireAuth])

  const status: SessionStatus = loading
    ? 'loading'
    : !serverUrl
      ? 'needs-server'
      : !auth
        ? 'needs-login'
        : 'authenticated'

  const value = useMemo<SessionContextValue>(() => ({
    status,
    serverUrl,
    auth,
    api,
    configureServer,
    authenticate,
    signOut,
    clearServer,
  }), [status, serverUrl, auth, api, configureServer, authenticate, signOut, clearServer])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}
