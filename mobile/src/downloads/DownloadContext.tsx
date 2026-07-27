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
  getNativeNetworkSnapshot,
  subscribeNativeNetwork,
} from '@/query/nativeState'
import { useSession } from '@/session/SessionContext'

type DownloadStatus = 'loading' | 'ready' | 'error' | 'unavailable'

interface DownloadContextValue {
  status: DownloadStatus
  error: string | null
  preferences: DownloadPreferences
  snapshot: DownloadQueueSnapshot
  enqueue: (manga: MangaDetail) => Promise<DownloadManifestV1>
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
  const [preferences, setPreferences] = useState<DownloadPreferences | null>(null)
  const preferencesRef = useRef(DEFAULT_DOWNLOAD_PREFERENCES)
  const [queue, setQueue] = useState<DownloadQueueController | null>(null)
  const [snapshot, setSnapshot] = useState<DownloadQueueSnapshot>(EMPTY_SNAPSHOT)
  const [status, setStatus] = useState<DownloadStatus>('loading')
  const [error, setError] = useState<string | null>(null)

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
    nextQueue.setEligible(isDownloadNetworkEligible(
      getNativeNetworkSnapshot(),
      preferencesRef.current.wifiOnly,
    ))
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
    queue.setEligible(isDownloadNetworkEligible(network, preferences.wifiOnly))
  }, [network, preferences, queue])

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

  const value = useMemo<DownloadContextValue>(() => ({
    status,
    error,
    preferences: preferences ?? DEFAULT_DOWNLOAD_PREFERENCES,
    snapshot,
    enqueue: manga => requireQueue().enqueue(manga),
    pause: mangaUuid => requireQueue().pause(mangaUuid),
    resume: mangaUuid => requireQueue().resume(mangaUuid),
    retry: mangaUuid => requireQueue().retry(mangaUuid),
    deleteDownload: mangaUuid => requireQueue().delete(mangaUuid),
    clearCurrentDownloads: () => requireQueue().clearCurrent(),
    clearAllDownloads: () => requireQueue().clearAll(),
    setWifiOnly,
    storageUsageBytes: snapshot.manifests.reduce(
      (total, manifest) => total + manifest.pages.reduce(
        (mangaTotal, page) => mangaTotal + page.bytesWritten,
        0,
      ),
      0,
    ),
    localPagesFor: mangaUuid => requireQueue().localPageUris(mangaUuid),
    manifestFor: mangaUuid =>
      snapshot.manifests.find(manifest => manifest.manga.uuid === mangaUuid) ?? null,
  }), [error, preferences, requireQueue, setWifiOnly, snapshot, status])

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>
}

export function useDownloads(): DownloadContextValue {
  const context = useContext(DownloadContext)
  if (!context) throw new Error('useDownloads must be used inside DownloadProvider')
  return context
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
