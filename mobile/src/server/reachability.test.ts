import {
  getServerReachabilitySnapshot,
  reportServerReachability,
  setActiveServer,
  subscribeServerReachability,
} from '@/server/reachability'

describe('server reachability', () => {
  afterEach(() => setActiveServer(null))

  it('tracks the active server and notifies only when state changes', () => {
    const listener = jest.fn()
    const unsubscribe = subscribeServerReachability(listener)

    setActiveServer('https://one.example.com')
    reportServerReachability('https://one.example.com', false)
    reportServerReachability('https://one.example.com', false)

    expect(getServerReachabilitySnapshot()).toEqual({
      serverUrl: 'https://one.example.com',
      status: 'unreachable',
    })
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('ignores delayed results from a server that is no longer active', () => {
    setActiveServer('https://one.example.com')
    setActiveServer('https://two.example.com')

    reportServerReachability('https://one.example.com', false)

    expect(getServerReachabilitySnapshot()).toEqual({
      serverUrl: 'https://two.example.com',
      status: 'unknown',
    })
  })
})
