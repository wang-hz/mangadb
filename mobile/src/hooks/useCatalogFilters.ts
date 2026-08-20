import { useCallback, useEffect, useRef, useState } from 'react'
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
  const revisionRef = useRef(0)
  const [result, setResult] = useState<{
    identity: string | null
    filters: CatalogFilters
  }>({ identity: null, filters: { ...DEFAULT_CATALOG_FILTERS } })

  useEffect(() => {
    let active = true
    const revision = revisionRef.current
    if (!serverUrl || !userUuid || !identity) {
      setResult({ identity: null, filters: { ...DEFAULT_CATALOG_FILTERS, tagUuids: [] } })
      return
    }
    void loadCatalogFilters(serverUrl, userUuid)
      .catch(() => ({ ...DEFAULT_CATALOG_FILTERS, tagUuids: [] }))
      .then(filters => {
        if (active && revisionRef.current === revision) setResult({ identity, filters })
      })
    return () => { active = false }
  }, [identity, serverUrl, userUuid])

  const filters = result.identity === identity
    ? result.filters
    : { ...DEFAULT_CATALOG_FILTERS, tagUuids: [] }
  const updateFilters = useCallback((next: CatalogFilters) => {
    if (!serverUrl || !userUuid || !identity) return
    revisionRef.current += 1
    setResult({ identity, filters: next })
    void saveCatalogFilters(serverUrl, userUuid, next).catch(() => {})
  }, [identity, serverUrl, userUuid])

  return { filters, loaded: result.identity === identity, updateFilters }
}
