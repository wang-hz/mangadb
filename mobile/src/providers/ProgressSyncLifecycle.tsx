import NetInfo from '@react-native-community/netinfo'
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useSession } from '@/session/SessionContext'
import { createProgressSyncStore } from '@/storage/progress'
import { ProgressSynchronizer } from '@/sync/protocol'
import { registerProgressSync } from '@/sync/registry'

export function ProgressSyncLifecycle() {
  const { api, auth, serverUrl } = useSession()
  useEffect(() => {
    if (!api || !auth || !serverUrl) return
    const sync = new ProgressSynchronizer(createProgressSyncStore(serverUrl, auth.user.uuid),
      (path, options) => api.request(path, options))
    const unregister = registerProgressSync(serverUrl, auth.user.uuid, sync)
    const run = (force = false) => { void sync.sync(force).catch(() => {}) }
    run(true)
    const timer = setInterval(() => { if (AppState.currentState === 'active') run() }, 15000)
    const subscription = AppState.addEventListener('change', () => run(true))
    const unsubscribeNetwork = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) run(true)
    })
    return () => {
      unregister()
      clearInterval(timer)
      subscription.remove()
      unsubscribeNetwork()
    }
  }, [api, auth, serverUrl])
  return null
}
