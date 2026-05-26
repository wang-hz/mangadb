import { message } from 'antd'
import { type DependencyList, useEffect, useState } from 'react'
import type { PageResult } from '../types'

export function usePagedData<T>(
  fetcher: () => Promise<PageResult<T>>,
  deps: DependencyList,
  errorMsg: string,
) {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let stale = false
    setLoading(true)
    fetcher()
      .then(res => { if (!stale) { setItems(res.items); setTotal(res.total) } })
      .catch(() => { if (!stale) message.error(errorMsg) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
    // fetcher is intentionally omitted from deps; callers control re-fetch via deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { items, total, loading }
}