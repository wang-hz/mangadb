import {
  focusManager,
  InfiniteQueryObserver,
  onlineManager,
  QueryObserver,
} from '@tanstack/react-query'
import { waitFor } from '@testing-library/react-native'
import { createMobileQueryClient, shouldRetryQuery } from '@/query/client'

describe('mobile query client', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
    focusManager.setFocused(true)
  })

  it('does not retry client errors', () => {
    expect(shouldRetryQuery(0, { status: 400 })).toBe(false)
    expect(shouldRetryQuery(0, { status: 401 })).toBe(false)
    expect(shouldRetryQuery(0, { status: 404 })).toBe(false)
    expect(shouldRetryQuery(0, { status: 429 })).toBe(false)
  })

  it('allows at most two retries for recoverable failures', () => {
    expect(shouldRetryQuery(0, { status: 0 })).toBe(true)
    expect(shouldRetryQuery(1, { status: 500 })).toBe(true)
    expect(shouldRetryQuery(2, { status: 500 })).toBe(false)
    expect(shouldRetryQuery(2, new Error('network error'))).toBe(false)
  })

  it('runs a query started offline once after reconnecting', async () => {
    const client = createMobileQueryClient()
    client.mount()
    onlineManager.setOnline(false)
    const queryFn = jest.fn().mockResolvedValue('ready')

    const result = client.fetchQuery({ queryKey: ['reconnect'], queryFn })
    await Promise.resolve()

    expect(queryFn).not.toHaveBeenCalled()
    expect(client.getQueryState(['reconnect'])?.fetchStatus).toBe('paused')

    onlineManager.setOnline(true)
    await expect(result).resolves.toBe('ready')
    expect(queryFn).toHaveBeenCalledTimes(1)

    client.unmount()
    client.clear()
  })

  it('refreshes an active stale query when the app regains focus', async () => {
    const client = createMobileQueryClient()
    client.mount()
    const queryFn = jest.fn().mockResolvedValue('ready')
    const observer = new QueryObserver(client, {
      queryKey: ['foreground'],
      queryFn,
      staleTime: 0,
    })
    const unsubscribe = observer.subscribe(() => {})

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
    focusManager.setFocused(false)
    focusManager.setFocused(true)
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))

    unsubscribe()
    client.unmount()
    client.clear()
  })

  it('does not duplicate an in-flight next page after reconnecting', async () => {
    const client = createMobileQueryClient()
    client.mount()
    const nextPage = deferred<{ items: number[]; nextPage?: number }>()
    const queryFn = jest.fn(({ pageParam }: { pageParam: number }) => pageParam === 1
      ? Promise.resolve({ items: [1], nextPage: 2 })
      : nextPage.promise)
    const observer = new InfiniteQueryObserver(client, {
      queryKey: ['infinite-reconnect'],
      queryFn,
      initialPageParam: 1,
      getNextPageParam: lastPage => lastPage.nextPage,
      staleTime: 0,
    })
    const unsubscribe = observer.subscribe(() => {})

    await waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    const result = observer.fetchNextPage()
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))

    onlineManager.setOnline(false)
    onlineManager.setOnline(true)
    await Promise.resolve()
    expect(queryFn).toHaveBeenCalledTimes(2)

    nextPage.resolve({ items: [2] })
    await result
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(observer.getCurrentResult().data?.pages).toEqual([
      { items: [1], nextPage: 2 },
      { items: [2] },
    ])

    unsubscribe()
    client.unmount()
    client.clear()
  })

  it('keeps cached data visible while an offline refresh is paused', async () => {
    const client = createMobileQueryClient()
    client.mount()
    const queryFn = jest.fn()
      .mockResolvedValueOnce('cached')
      .mockResolvedValueOnce('updated')
    const observer = new QueryObserver(client, {
      queryKey: ['offline-cache'],
      queryFn,
      staleTime: 0,
    })
    const unsubscribe = observer.subscribe(() => {})

    await waitFor(() => expect(observer.getCurrentResult().data).toBe('cached'))
    onlineManager.setOnline(false)
    const refresh = observer.refetch()
    await waitFor(() => expect(observer.getCurrentResult().fetchStatus).toBe('paused'))
    expect(observer.getCurrentResult().data).toBe('cached')
    expect(queryFn).toHaveBeenCalledTimes(1)

    onlineManager.setOnline(true)
    await refresh
    expect(observer.getCurrentResult().data).toBe('updated')
    expect(queryFn).toHaveBeenCalledTimes(2)

    unsubscribe()
    client.unmount()
    client.clear()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve })
  return { promise, resolve }
}
