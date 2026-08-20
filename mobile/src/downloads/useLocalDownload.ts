import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { MangaDetail } from '@/api/types'
import {
  useDownloadActions,
  useDownloadManifest,
} from '@/downloads/DownloadContext'
import {
  getNativeAppActive,
  subscribeNativeAppState,
} from '@/query/nativeState'

export type LocalDownloadStatus = 'loading' | 'available' | 'unavailable' | 'error'

export interface LocalDownload {
  status: LocalDownloadStatus
  manga: MangaDetail | null
  pageUris: readonly string[] | null
  error: string | null
}

interface Verification {
  identity: string
  pageUris: readonly string[] | null
  error: string | null
}

export function useLocalDownload(mangaUuid?: string): LocalDownload {
  const downloads = useDownloadActions()
  const manifest = useDownloadManifest(mangaUuid)
  const appActive = useSyncExternalStore(
    subscribeNativeAppState,
    getNativeAppActive,
    getNativeAppActive,
  )
  const foregroundRef = useRef({ active: appActive, generation: 0 })
  if (foregroundRef.current.active !== appActive) {
    foregroundRef.current = {
      active: appActive,
      generation: foregroundRef.current.generation + Number(appActive),
    }
  }
  const candidate = manifest &&
    (manifest.state === 'completed' || manifest.state === 'stale') &&
    manifest.pages.every(page => page.state === 'completed')
    ? manifest
    : null
  const identity = candidate
    ? [
        candidate.manga.uuid,
        candidate.updatedAt,
        ...candidate.pages.map(page => page.bytesWritten),
      ].join(':')
    : null
  const verificationIdentity = identity
    ? `${identity}\u0000${foregroundRef.current.generation}`
    : null
  const [verification, setVerification] = useState<Verification | null>(null)

  useEffect(() => {
    if (!candidate || !verificationIdentity || !appActive) return
    let active = true
    downloads.localPagesFor(candidate.manga.uuid)
      .then(pageUris => {
        if (!active) return
        setVerification({
          identity: verificationIdentity,
          pageUris,
          error: pageUris ? null : '本机下载尚未完成',
        })
      })
      .catch(error => {
        if (!active) return
        setVerification({
          identity: verificationIdentity,
          pageUris: null,
          error: error instanceof Error ? error.message : '无法校验本机下载',
        })
      })
    return () => { active = false }
  }, [appActive, candidate, downloads.localPagesFor, verificationIdentity])

  if (!mangaUuid || downloads.status === 'unavailable') {
    return { status: 'unavailable', manga: null, pageUris: null, error: null }
  }
  if (downloads.status === 'error') {
    return {
      status: 'error',
      manga: candidate?.manga ?? null,
      pageUris: null,
      error: downloads.error || '无法读取本机下载',
    }
  }
  if (downloads.status === 'loading') {
    return { status: 'loading', manga: null, pageUris: null, error: null }
  }
  if (!candidate || !verificationIdentity) {
    return { status: 'unavailable', manga: null, pageUris: null, error: null }
  }
  if (!appActive || !verification || verification.identity !== verificationIdentity) {
    return { status: 'loading', manga: candidate.manga, pageUris: null, error: null }
  }
  if (!verification.pageUris) {
    return {
      status: 'error',
      manga: candidate.manga,
      pageUris: null,
      error: verification.error,
    }
  }
  return {
    status: 'available',
    manga: candidate.manga,
    pageUris: verification.pageUris,
    error: null,
  }
}
