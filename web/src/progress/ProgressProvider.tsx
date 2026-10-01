import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ProgressSynchronizer, type RemoteProgress, type SyncState } from '../../../mobile/src/sync/protocol'
import { request } from '../api/request'
import { getUuid } from '../utils/token'
import { WebProgressStore } from './store'

interface ProgressContextValue {
  store: WebProgressStore
  records: Record<string, RemoteProgress>
  ready: boolean
  error: boolean
  pending: boolean
  sync: (force?: boolean) => Promise<void>
}
const Context = createContext<ProgressContextValue | null>(null)
const EVENT = 'mangadb-progress-changed'

export function ProgressProvider({ children }: { children: ReactNode }) {
  const uuid = getUuid()!
  const identity = `${window.location.origin}\u0000${uuid}`
  const location = useLocation()
  const [snapshot, setSnapshot] = useState<{ identity: string; state: SyncState } | null>(null)
  const [error, setError] = useState(false)
  const store = useMemo(() => new WebProgressStore(identity, () => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: identity }))
  }), [identity])
  const syncRef = useRef<ProgressSynchronizer | null>(null)
  const sync = useCallback(async (force = false) => {
    try { await syncRef.current?.sync(force) } catch { /* Local queue survives offline failures. */ }
  }, [])

  useEffect(() => {
    const synchronizer = new ProgressSynchronizer(store, (path, options) => {
      if (getUuid() !== uuid) return Promise.reject(new Error('Session changed'))
      const headers = new Headers(options?.headers)
      headers.set('X-MangaDB-User', uuid)
      return request(path, { ...options, headers }, uuid)
    })
    syncRef.current = synchronizer
    let active = true
    let revision = 0
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('mangadb-progress')
    const refresh = () => {
      const current = ++revision
      void store.read().then(state => {
        if (active && current === revision && getUuid() === uuid) {
          setSnapshot({ identity, state }); setError(false)
        }
      }).catch(() => { if (active) setError(true) })
    }
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail !== identity) return
      refresh()
      channel?.postMessage(identity)
    }
    const resumed = () => { if (getUuid() === uuid) { refresh(); void sync(true) } }
    const sessionChanged = () => {
      if (getUuid() !== uuid) {
        synchronizer.stop()
        window.location.reload()
      }
    }
    window.addEventListener(EVENT, changed)
    window.addEventListener('pagehide', resumed)
    window.addEventListener('online', resumed)
    window.addEventListener('focus', resumed)
    window.addEventListener('storage', sessionChanged)
    document.addEventListener('visibilitychange', resumed)
    if (channel) channel.onmessage = event => { if (event.data === identity) refresh() }
    const timer = setInterval(() => { if (!document.hidden) void sync() }, 15000)
    refresh()
    void sync(true)
    return () => {
      active = false
      synchronizer.stop()
      if (syncRef.current === synchronizer) syncRef.current = null
      clearInterval(timer)
      channel?.close()
      window.removeEventListener(EVENT, changed)
      window.removeEventListener('pagehide', resumed)
      window.removeEventListener('online', resumed)
      window.removeEventListener('focus', resumed)
      window.removeEventListener('storage', sessionChanged)
      document.removeEventListener('visibilitychange', resumed)
    }
  }, [store, identity, uuid, sync])

  useEffect(() => { void sync(true) }, [location.pathname, sync])
  const state = snapshot?.identity === identity ? snapshot.state : null
  return <Context.Provider value={{ store, records: state?.records ?? {}, ready: Boolean(state), error,
    pending: Boolean(state && Object.keys(state.pending).length), sync }}>{children}</Context.Provider>
}

export function useProgress(): ProgressContextValue {
  const value = useContext(Context)
  if (!value) throw new Error('ProgressProvider is missing')
  return value
}
