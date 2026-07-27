import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { AppState, type AppStateStatus } from 'react-native'

export function installNativeQueryStateListeners(): () => void {
  onlineManager.setEventListener(setOnline =>
    NetInfo.addEventListener(state => setOnline(isNetworkAvailable(state))))
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
