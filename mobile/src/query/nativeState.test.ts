import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native'
import {
  getNativeNetworkSnapshot,
  installNativeQueryStateListeners,
  isConstrainedConnection,
  isNetworkAvailable,
  subscribeNativeNetwork,
} from '@/query/nativeState'

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(),
  },
}))

describe('native query state', () => {
  afterEach(() => {
    onlineManager.setEventListener(() => () => {})
    focusManager.setEventListener(() => () => {})
  })

  it.each([
    [{ isConnected: false, isInternetReachable: null }, false],
    [{ isConnected: true, isInternetReachable: false }, true],
    [{ isConnected: true, isInternetReachable: true }, true],
    [{ isConnected: true, isInternetReachable: null }, true],
    [{ isConnected: null, isInternetReachable: null }, true],
  ])('maps network state %j to %s', (partialState, expected) => {
    expect(isNetworkAvailable(partialState as NetInfoState)).toBe(expected)
  })

  it.each([
    [{ isConnected: false }, true],
    [{ isConnected: true, type: 'wifi', details: { isConnectionExpensive: true } }, true],
    [{
      isConnected: true,
      type: 'cellular',
      details: { isConnectionExpensive: false, cellularGeneration: '3g' },
    }, true],
    [{
      isConnected: true,
      type: 'cellular',
      details: { isConnectionExpensive: false, cellularGeneration: '5g' },
    }, false],
    [{ isConnected: true, type: 'wifi', details: { isConnectionExpensive: false } }, false],
  ])('detects constrained network state %j as %s', (partialState, expected) => {
    expect(isConstrainedConnection(partialState as NetInfoState)).toBe(expected)
  })

  it('updates query online and focus state and removes native listeners', () => {
    let networkListener: ((state: NetInfoState) => void) | undefined
    let appStateListener: ((state: AppStateStatus) => void) | undefined
    const removeNetworkListener = jest.fn()
    const removeAppStateListener = jest.fn()
    const networkSnapshotListener = jest.fn()
    const unsubscribeNetworkSnapshot = subscribeNativeNetwork(networkSnapshotListener)

    jest.mocked(NetInfo.addEventListener).mockImplementation(listener => {
      networkListener = listener
      return removeNetworkListener
    })
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener
      return { remove: removeAppStateListener } as NativeEventSubscription
    })

    const cleanup = installNativeQueryStateListeners()

    expect(focusManager.isFocused()).toBe(AppState.currentState === 'active')
    networkListener?.({
      isConnected: false,
      isInternetReachable: false,
    } as NetInfoState)
    expect(onlineManager.isOnline()).toBe(false)
    expect(getNativeNetworkSnapshot()).toEqual({
      isConnected: false,
      isConstrained: true,
    })

    networkListener?.({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
      details: { isConnectionExpensive: false },
    } as NetInfoState)
    expect(onlineManager.isOnline()).toBe(true)
    expect(getNativeNetworkSnapshot()).toEqual({
      isConnected: true,
      isConstrained: false,
    })
    expect(networkSnapshotListener).toHaveBeenCalledTimes(2)

    appStateListener?.('background')
    expect(focusManager.isFocused()).toBe(false)
    appStateListener?.('active')
    expect(focusManager.isFocused()).toBe(true)

    cleanup()
    expect(removeNetworkListener).toHaveBeenCalledTimes(1)
    expect(removeAppStateListener).toHaveBeenCalledTimes(1)
    unsubscribeNetworkSnapshot()
  })
})
