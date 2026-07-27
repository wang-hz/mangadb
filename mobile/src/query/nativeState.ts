import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { AppState, type AppStateStatus } from 'react-native'

export interface NativeNetworkSnapshot {
  isConnected: boolean
  isConstrained: boolean
}

let networkSnapshot: NativeNetworkSnapshot = {
  isConnected: true,
  isConstrained: false,
}
const networkListeners = new Set<() => void>()

export function installNativeQueryStateListeners(): () => void {
  onlineManager.setEventListener(setOnline =>
    NetInfo.addEventListener(state => {
      const isConnected = isNetworkAvailable(state)
      setOnline(isConnected)
      updateNetworkSnapshot({
        isConnected,
        isConstrained: isConstrainedConnection(state),
      })
    }))
  focusManager.setEventListener(setFocused => {
    const handleAppState = (state: AppStateStatus) => setFocused(state === 'active')
    handleAppState(AppState.currentState)
    const subscription = AppState.addEventListener('change', handleAppState)
    return () => subscription.remove()
  })

  return () => {
    onlineManager.setEventListener(() => () => {})
    focusManager.setEventListener(() => () => {})
  }
}

export function isNetworkAvailable(state: NetInfoState): boolean {
  // A MangaDB server may be reachable over LAN even when the public internet is not.
  return state.isConnected !== false
}

export function isConstrainedConnection(state: NetInfoState): boolean {
  if (!isNetworkAvailable(state)) return true
  if (state.details?.isConnectionExpensive) return true
  return state.type === 'cellular' &&
    (state.details.cellularGeneration === '2g' || state.details.cellularGeneration === '3g')
}

export function getNativeNetworkSnapshot(): NativeNetworkSnapshot {
  return networkSnapshot
}

export function subscribeNativeNetwork(listener: () => void): () => void {
  networkListeners.add(listener)
  return () => networkListeners.delete(listener)
}

function updateNetworkSnapshot(nextSnapshot: NativeNetworkSnapshot): void {
  if (
    networkSnapshot.isConnected === nextSnapshot.isConnected &&
    networkSnapshot.isConstrained === nextSnapshot.isConstrained
  ) return
  networkSnapshot = nextSnapshot
  networkListeners.forEach(listener => listener())
}
