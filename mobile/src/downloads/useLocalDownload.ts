import { useEffect, useState } from 'react'
import type { MangaDetail } from '@/api/types'
import { useDownloads } from '@/downloads/DownloadContext'

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
  const downloads = useDownloads()
  const manifest = mangaUuid ? downloads.manifestFor(mangaUuid) : null
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
  const [verification, setVerification] = useState<Verification | null>(null)

  useEffect(() => {
    if (!candidate || !identity) return
    let active = true
    downloads.localPagesFor(candidate.manga.uuid)
      .then(pageUris => {
        if (!active) return
        setVerification({
          identity,
          pageUris,
          error: pageUris ? null : '本机下载尚未完成',
        })
      })
      .catch(error => {
        if (!active) return
        setVerification({
          identity,
          pageUris: null,
          error: error instanceof Error ? error.message : '无法校验本机下载',
        })
      })
    return () => { active = false }
  }, [candidate, downloads.localPagesFor, identity])

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
  if (!candidate || !identity) {
    return { status: 'unavailable', manga: null, pageUris: null, error: null }
  }
  if (!verification || verification.identity !== identity) {
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
