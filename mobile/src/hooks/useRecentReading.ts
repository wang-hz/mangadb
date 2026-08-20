import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  listRecentReading,
  listReadingProgress,
  type ReadingProgressEntry,
  type RecentReadingEntry,
} from '@/storage/progress'

type RecentReadingStatus = 'loading' | 'ready' | 'error'

interface RecentReadingResult {
  entries: RecentReadingEntry[]
  allEntries: ReadingProgressEntry[]
  status: RecentReadingStatus
  error: string | null
  refresh: () => Promise<void>
}

export function useRecentReading(
  serverUrl: string | null,
  userUuid: string | undefined,
): RecentReadingResult {
  const identity = serverUrl && userUuid ? `${serverUrl}\u0000${userUuid}` : null
  const requestIdRef = useRef(0)
  const [result, setResult] = useState<{
    identity: string | null
    entries: RecentReadingEntry[]
    allEntries: ReadingProgressEntry[]
    status: RecentReadingStatus
    error: string | null
  }>({
    identity: null,
    entries: [],
    allEntries: [],
    status: 'loading',
    error: null,
  })

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    if (!serverUrl || !userUuid || !identity) {
      setResult({
        identity: null,
        entries: [],
        allEntries: [],
        status: 'ready',
        error: null,
      })
      return
    }
    try {
      const [entries, allEntries] = await Promise.all([
        listRecentReading(serverUrl, userUuid),
        listReadingProgress(serverUrl, userUuid),
      ])
      if (requestIdRef.current !== requestId) return
      setResult({
        identity,
        entries,
        allEntries,
        status: 'ready',
        error: null,
      })
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      setResult({
        identity,
        entries: [],
        allEntries: [],
        status: 'error',
        error: error instanceof Error ? error.message : '无法读取最近阅读',
      })
    }
  }, [identity, serverUrl, userUuid])

  useFocusEffect(useCallback(() => {
    void refresh()
  }, [refresh]))

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh()
    })
    return () => subscription.remove()
  }, [refresh])

  const matchesIdentity = result.identity === identity
  return {
    entries: matchesIdentity ? result.entries : [],
    allEntries: matchesIdentity ? result.allEntries : [],
    status: matchesIdentity ? result.status : 'loading',
    error: matchesIdentity ? result.error : null,
    refresh,
  }
}
