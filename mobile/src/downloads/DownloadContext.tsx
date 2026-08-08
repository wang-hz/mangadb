import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ApiClient } from '@/api/client'
import type { MangaDetail } from '@/api/types'
import { ExpoDownloadFileStore } from '@/downloads/files'
import { DownloadPageDownloader } from '@/downloads/pageDownloader'
import {
  DEFAULT_DOWNLOAD_PREFERENCES,
  type DownloadPreferences,
  isDownloadNetworkEligible,
  loadDownloadPreferences,
  saveDownloadPreferences,
} from '@/downloads/preferences'
import {
  DownloadQueue,
  type DownloadQueueOptions,
  type DownloadQueueSnapshot,
} from '@/downloads/queue'
import { registerActiveDownloadQueue } from '@/downloads/registry'
import { DownloadRepository } from '@/downloads/repository'
import type { DownloadManifestV1 } from '@/downloads/types'
import {
  getNativeAppActive,
  getNativeNetworkSnapshot,
  subscribeNativeAppState,
  subscribeNativeNetwork,
} from '@/query/nativeState'
import { useSession } from '@/session/SessionContext'

export type DownloadStatus = 'loading' | 'ready' | 'error' | 'unavailable'

interface DownloadContextValue {
  status: DownloadStatus
  error: string | null
  preferences: DownloadPreferences
  snapshot: DownloadQueueSnapshot
  enqueue: (manga: MangaDetail) => Promise<DownloadManifestV1>
  update: (manga: MangaDetail) => Promise<DownloadManifestV1>
  pause: (mangaUuid: string) => Promise<void>
  resume: (mangaUuid: string) => Promise<void>
  retry: (mangaUuid: string) => Promise<void>
  deleteDownload: (mangaUuid: string) => Promise<void>
  clearCurrentDownloads: () => Promise<void>
  clearAllDownloads: () => Promise<void>
  setWifiOnly: (wifiOnly: boolean) => Promise<void>
  storageUsageBytes: number
  localPagesFor: (mangaUuid: string) => Promise<string[] | null>
  manifestFor: (mangaUuid: string) => DownloadManifestV1 | null
}

export interface DownloadActionsValue {
  status: DownloadStatus
  error: string | null
  preferences: DownloadPreferences
  enqueue: (manga: MangaDetail) => Promise<DownloadManifestV1>
  update: (manga: MangaDetail) => Promise<DownloadManifestV1>
  pause: (mangaUuid: string) => Promise<void>
  resume: (mangaUuid: string) => Promise<void>
  retry: (mangaUuid: string) => Promise<void>
  deleteDownload: (mangaUuid: string) => Promise<void>
  clearCurrentDownloads: () => Promise<void>
  clearAllDownloads: () => Promise<void>
  setWifiOnly: (wifiOnly: boolean) => Promise<void>
  localPagesFor: (mangaUuid: string) => Promise<string[] | null>
}

export type DownloadQueueController = Pick<
  DownloadQueue,
  | 'delete'
  | 'clearAll'
  | 'clearCurrent'
  | 'enqueue'
  | 'getSnapshot'
  | 'initialize'
  | 'localPageUris'
  | 'pause'
  | 'resume'
  | 'retry'
  | 'setEligible'
  | 'stop'
  | 'subscribe'
  | 'update'
>

interface DownloadProviderProps extends PropsWithChildren {
  createQueue?: (options: {
    serverUrl: string
    userUuid: string
    api: ApiClient
  }) => DownloadQueueController
}

const EMPTY_SNAPSHOT: DownloadQueueSnapshot = {
  initialized: false,
  eligible: false,
  manifests: [],
}

const DownloadContext = createContext<DownloadContextValue | null>(null)
const DownloadActionsContext = createContext<DownloadActionsValue | null>(null)
const DownloadStoreContext = createContext<DownloadQueueController | null>(null)

export function DownloadProvider({
  children,
  createQueue = createDefaultQueue,
}: DownloadProviderProps) {
  const session = useSession()
  const network = useSyncExternalStore(
    subscribeNativeNetwork,
    getNativeNetworkSnapshot,
    getNativeNetworkSnapshot,
  )
  const appActive = useSyncExternalStore(
    subscribeNativeAppState,
    getNativeAppActive,
    getNativeAppActive,
  )
  const [preferences, setPreferences] = useState<DownloadPreferences | null>(null)
  const preferencesRef = useRef(DEFAULT_DOWNLOAD_PREFERENCES)
  const [queue, setQueue] = useState<DownloadQueueController | null>(null)
  const [snapshot, setSnapshot] = useState<DownloadQueueSnapshot>(EMPTY_SNAPSHOT)
  const [status, setStatus] = useState<DownloadStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const storageUsageCacheRef = useRef(new Map<string, {
    manifest: DownloadManifestV1
    bytes: number
  }>())

  useEffect(() => {
    let active = true
    loadDownloadPreferences()
      .then(value => {
        if (!active) return
        preferencesRef.current = value
        setPreferences(value)
      })
      .catch(() => {
        if (!active) return
        preferencesRef.current = DEFAULT_DOWNLOAD_PREFERENCES
        setPreferences(DEFAULT_DOWNLOAD_PREFERENCES)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (preferences === null) return
    if (
      session.status !== 'authenticated' ||
      !session.serverUrl ||
      !session.auth ||
      !session.api
    ) {
      setQueue(null)
      setSnapshot(EMPTY_SNAPSHOT)
      setStatus('unavailable')
      setError(null)
      return
    }

    let active = true
    const nextQueue = createQueue({
      serverUrl: session.serverUrl,
      userUuid: session.auth.user.uuid,
      api: session.api,
    })
    nextQueue.setEligible(
      getNativeAppActive() && isDownloadNetworkEligible(
        getNativeNetworkSnapshot(),
        preferencesRef.current.wifiOnly,
      ),
    )
    const unsubscribeQueue = nextQueue.subscribe(() => {
      if (active) setSnapshot(nextQueue.getSnapshot())
    })
    const unregisterQueue = registerActiveDownloadQueue(nextQueue)
    setQueue(nextQueue)
    setSnapshot(nextQueue.getSnapshot())
    setStatus('loading')
    setError(null)
    void nextQueue.initialize()
      .then(() => {
        if (!active) return
        setSnapshot(nextQueue.getSnapshot())
        setStatus('ready')
      })
      .catch(initializationError => {
        if (!active) return
        setStatus('error')
        setError(initializationError instanceof Error
          ? initializationError.message
          : '无法读取本机下载')
      })

    return () => {
      active = false
      unsubscribeQueue()
      unregisterQueue()
      void nextQueue.stop().catch(() => {})
    }
  }, [
    createQueue,
    preferences === null,
    session.api,
    session.auth,
    session.serverUrl,
    session.status,
  ])

  useEffect(() => {
    if (!queue || !preferences) return
    queue.setEligible(appActive && isDownloadNetworkEligible(network, preferences.wifiOnly))
  }, [appActive, network, preferences, queue])

  const setWifiOnly = useCallback(async (wifiOnly: boolean) => {
    const nextPreferences = { wifiOnly }
    await saveDownloadPreferences(nextPreferences)
    preferencesRef.current = nextPreferences
    setPreferences(nextPreferences)
  }, [])

  const requireQueue = useCallback(() => {
    if (!queue) throw new Error('下载服务尚未就绪')
    return queue
  }, [queue])

  const actions = useMemo<DownloadActionsValue>(() => ({
    status,
    error,
    preferences: preferences ?? DEFAULT_DOWNLOAD_PREFERENCES,
    enqueue: manga => requireQueue().enqueue(manga),
    update: manga => requireQueue().update(manga),
    pause: mangaUuid => requireQueue().pause(mangaUuid),
    resume: mangaUuid => requireQueue().resume(mangaUuid),
    retry: mangaUuid => requireQueue().retry(mangaUuid),
    deleteDownload: mangaUuid => requireQueue().delete(mangaUuid),
    clearCurrentDownloads: () => requireQueue().clearCurrent(),
    clearAllDownloads: () => requireQueue().clearAll(),
    setWifiOnly,
    localPagesFor: mangaUuid => requireQueue().localPageUris(mangaUuid),
  }), [error, preferences, requireQueue, setWifiOnly, status])

  const storageUsageBytes = useMemo(() => {
    const nextCache = new Map<string, { manifest: DownloadManifestV1; bytes: number }>()
    let total = 0
    snapshot.manifests.forEach(manifest => {
      const cached = storageUsageCacheRef.current.get(manifest.manga.uuid)
      const bytes = cached?.manifest === manifest
        ? cached.bytes
        : manifest.pages.reduce((sum, page) => sum + page.bytesWritten, 0)
      nextCache.set(manifest.manga.uuid, { manifest, bytes })
      total += bytes
    })
    storageUsageCacheRef.current = nextCache
    return total
  }, [snapshot.manifests])

  const value = useMemo<DownloadContextValue>(() => ({
    ...actions,
    snapshot,
    storageUsageBytes,
    manifestFor: mangaUuid =>
      snapshot.manifests.find(manifest => manifest.manga.uuid === mangaUuid) ?? null,
  }), [actions, snapshot, storageUsageBytes])

  return (
    <DownloadStoreContext.Provider value={queue}>
      <DownloadActionsContext.Provider value={actions}>
        <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>
      </DownloadActionsContext.Provider>
    </DownloadStoreContext.Provider>
  )
}

export function useDownloads(): DownloadContextValue {
  const context = useContext(DownloadContext)
  if (!context) throw new Error('useDownloads must be used inside DownloadProvider')
  return context
}

export function useDownloadActions(): DownloadActionsValue {
  const context = useContext(DownloadActionsContext)
  if (!context) throw new Error('useDownloadActions must be used inside DownloadProvider')
  return context
}

export function useDownloadManifest(mangaUuid?: string): DownloadManifestV1 | null {
  const queue = useContext(DownloadStoreContext)
  const subscribe = useCallback((listener: () => void) =>
    queue ? queue.subscribe(listener) : () => {}, [queue])
  const getSnapshot = useCallback(() => {
    if (!queue || !mangaUuid) return null
    return queue.getSnapshot().manifests.find(
      manifest => manifest.manga.uuid === mangaUuid,
    ) ?? null
  }, [mangaUuid, queue])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useDownloadedMangaUuids(): ReadonlySet<string> {
  const queue = useContext(DownloadStoreContext)
  const cachedRef = useRef<{ key: string; value: ReadonlySet<string> }>({
    key: '',
    value: new Set(),
  })
  const subscribe = useCallback((listener: () => void) =>
    queue ? queue.subscribe(listener) : () => {}, [queue])
  const getSnapshot = useCallback(() => {
    const uuids = queue?.getSnapshot().manifests
      .filter(manifest =>
        (manifest.state === 'completed' || manifest.state === 'stale') &&
        manifest.pages.every(page => page.state === 'completed'))
      .map(manifest => manifest.manga.uuid)
      .sort() ?? []
    const key = uuids.join('\u0000')
    if (cachedRef.current.key !== key) {
      cachedRef.current = { key, value: new Set(uuids) }
    }
    return cachedRef.current.value
  }, [queue])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function createDefaultQueue(options: {
  serverUrl: string
  userUuid: string
  api: ApiClient
}): DownloadQueue {
  const files = new ExpoDownloadFileStore()
  const queueOptions: DownloadQueueOptions = {
    ...options,
    repository: new DownloadRepository(files),
    downloader: new DownloadPageDownloader(files),
  }
  return new DownloadQueue(queueOptions)
}
