export type ServerReachabilityStatus = 'unknown' | 'reachable' | 'unreachable'

interface ServerReachabilitySnapshot {
  serverUrl: string | null
  status: ServerReachabilityStatus
}

let snapshot: ServerReachabilitySnapshot = {
  serverUrl: null,
  status: 'unknown',
}
const listeners = new Set<() => void>()

export function setActiveServer(serverUrl: string | null): void {
  if (snapshot.serverUrl === serverUrl) return
  updateSnapshot({ serverUrl, status: 'unknown' })
}

export function reportServerReachability(serverUrl: string, reachable: boolean): void {
  if (snapshot.serverUrl !== serverUrl) return
  const status = reachable ? 'reachable' : 'unreachable'
  if (snapshot.status === status) return
  updateSnapshot({ ...snapshot, status })
}

export function getServerReachabilitySnapshot(): ServerReachabilitySnapshot {
  return snapshot
}

export function subscribeServerReachability(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function updateSnapshot(nextSnapshot: ServerReachabilitySnapshot): void {
  snapshot = nextSnapshot
  listeners.forEach(listener => listener())
}
