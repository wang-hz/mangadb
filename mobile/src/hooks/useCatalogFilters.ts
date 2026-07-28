import { useCallback, useEffect, useState } from 'react'
import {
  type CatalogFilters,
  DEFAULT_CATALOG_FILTERS,
  loadCatalogFilters,
  saveCatalogFilters,
} from '@/storage/catalogFilters'

export function useCatalogFilters(
  serverUrl: string | null,
  userUuid: string | undefined,
) {
  const identity = serverUrl && userUuid ? `${serverUrl}\u0000${userUuid}` : null
  const [result, setResult] = useState<{
    identity: string | null
    filters: CatalogFilters
  }>({ identity: null, filters: { ...DEFAULT_CATALOG_FILTERS } })

  useEffect(() => {
    let active = true
    if (!serverUrl || !userUuid || !identity) {
      setResult({ identity: null, filters: { ...DEFAULT_CATALOG_FILTERS, tagUuids: [] } })
      return
    }
    void loadCatalogFilters(serverUrl, userUuid).then(filters => {
      if (active) setResult({ identity, filters })
    })
    return () => { active = false }
  }, [identity, serverUrl, userUuid])

  const filters = result.identity === identity
    ? result.filters
    : { ...DEFAULT_CATALOG_FILTERS, tagUuids: [] }
  const updateFilters = useCallback((next: CatalogFilters) => {
    if (!serverUrl || !userUuid || !identity) return
    setResult({ identity, filters: next })
    void saveCatalogFilters(serverUrl, userUuid, next).then(saved => {
      setResult(current => current.identity === identity
        ? { identity, filters: saved }
        : current)
    }).catch(() => {})
  }, [identity, serverUrl, userUuid])

  return { filters, loaded: result.identity === identity, updateFilters }
}
