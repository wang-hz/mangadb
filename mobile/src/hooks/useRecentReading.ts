import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  listRecentReading,
  type RecentReadingEntry,
} from '@/storage/progress'

type RecentReadingStatus = 'loading' | 'ready' | 'error'

interface RecentReadingResult {
  entries: RecentReadingEntry[]
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
    status: RecentReadingStatus
    error: string | null
  }>({
    identity: null,
    entries: [],
    status: 'loading',
    error: null,
  })

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    if (!serverUrl || !userUuid || !identity) {
      setResult({ identity: null, entries: [], status: 'ready', error: null })
      return
    }
    try {
      const entries = await listRecentReading(serverUrl, userUuid)
      if (requestIdRef.current !== requestId) return
      setResult({ identity, entries, status: 'ready', error: null })
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      setResult({
        identity,
        entries: [],
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
    status: matchesIdentity ? result.status : 'loading',
    error: matchesIdentity ? result.error : null,
    refresh,
  }
}
