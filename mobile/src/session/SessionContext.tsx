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
import {
  reportServerReachability,
  setActiveServer,
} from '@/server/reachability'
import { userFromToken } from './token'

type SessionStatus = 'loading' | 'needs-server' | 'needs-login' | 'authenticated'

interface AuthSession {
  token: string
  user: SessionUser
}

export interface SessionCleanupResult {
  cacheCleared: boolean
}

interface SessionContextValue {
  status: SessionStatus
  serverUrl: string | null
  auth: AuthSession | null
  api: ApiClient | null
  configureServer: (serverUrl: string) => Promise<void>
  authenticate: (token: string) => Promise<void>
  signOut: () => Promise<SessionCleanupResult>
  clearServer: () => Promise<SessionCleanupResult>
}

const SessionContext = createContext<SessionContextValue | null>(null)
const noopSessionCleanup = async () => true

interface SessionProviderProps extends PropsWithChildren {
  onSessionCleanup?: () => Promise<boolean>
}

export function SessionProvider({
  children,
  onSessionCleanup = noopSessionCleanup,
}: SessionProviderProps) {
  const [loading, setLoading] = useState(true)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const serverUrlRef = useRef<string | null>(null)
  const authRef = useRef<AuthSession | null>(null)
  const authVersionRef = useRef(0)
  const sessionTransitionQueueRef = useRef<Promise<void>>(Promise.resolve())
  const signOutInFlightRef = useRef<Promise<SessionCleanupResult> | null>(null)
  const clearServerInFlightRef = useRef<Promise<SessionCleanupResult> | null>(null)

  useEffect(() => {
    setActiveServer(serverUrl)
    return () => setActiveServer(null)
  }, [serverUrl])

  const runSessionTransition = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = sessionTransitionQueueRef.current.then(operation, operation)
    sessionTransitionQueueRef.current = result.then(() => {}, () => {})
    return result
  }, [])

  const cleanupCaches = useCallback(async () => {
    try { return await onSessionCleanup() } catch { return false }
  }, [onSessionCleanup])

  const signOut = useCallback((): Promise<SessionCleanupResult> => {
    if (signOutInFlightRef.current) return signOutInFlightRef.current
    authVersionRef.current += 1
    const operation = runSessionTransition(async () => {
      await removeAccessToken()
      authRef.current = null
      setAuth(null)
      return { cacheCleared: await cleanupCaches() }
    })
    signOutInFlightRef.current = operation
    void operation.finally(() => {
      if (signOutInFlightRef.current === operation) signOutInFlightRef.current = null
    }).catch(() => {})
    return operation
  }, [cleanupCaches, runSessionTransition])

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
          else {
            try { await removeAccessToken() } catch {}
            await cleanupCaches()
          }
        } else if (token) {
          try { await removeAccessToken() } catch {}
          await cleanupCaches()
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
  }, [cleanupCaches])

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
    await runSessionTransition(async () => {
      if (!serverUrlRef.current) throw new Error('请先配置服务器')
      await saveAccessToken(token)
      if (authVersionRef.current === authVersion) {
        authRef.current = nextAuth
        setAuth(nextAuth)
      }
    })
  }, [runSessionTransition])

  const expireAuth = useCallback(async (sourceServerUrl: string, sourceToken: string) => {
    if (
      serverUrlRef.current !== sourceServerUrl ||
      authRef.current?.token !== sourceToken
    ) return
    try {
      await signOut()
    } catch {
      await runSessionTransition(async () => {
        if (
          serverUrlRef.current !== sourceServerUrl ||
          authRef.current?.token !== sourceToken
        ) return
        authVersionRef.current += 1
        authRef.current = null
        setAuth(null)
        await Promise.allSettled([removeAccessToken(), cleanupCaches()])
      })
    }
  }, [cleanupCaches, runSessionTransition, signOut])

  const clearServer = useCallback((): Promise<SessionCleanupResult> => {
    if (clearServerInFlightRef.current) return clearServerInFlightRef.current
    authVersionRef.current += 1
    const operation = runSessionTransition(async () => {
      await Promise.all([removeAccessToken(), removeServerUrl()])
      authRef.current = null
      serverUrlRef.current = null
      setAuth(null)
      setServerUrl(null)
      return { cacheCleared: await cleanupCaches() }
    })
    clearServerInFlightRef.current = operation
    void operation.finally(() => {
      if (clearServerInFlightRef.current === operation) clearServerInFlightRef.current = null
    }).catch(() => {})
    return operation
  }, [cleanupCaches, runSessionTransition])

  const api = useMemo(() => {
    if (!serverUrl) return null
    const sourceToken = auth?.token
    return new ApiClient(serverUrl, {
      token: sourceToken,
      onReachabilityChange: reachable => reportServerReachability(serverUrl, reachable),
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
