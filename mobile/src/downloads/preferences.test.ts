import AsyncStorage from '@react-native-async-storage/async-storage'
import { NetInfoStateType } from '@react-native-community/netinfo'
import {
  DEFAULT_DOWNLOAD_PREFERENCES,
  isDownloadNetworkEligible,
  loadDownloadPreferences,
  saveDownloadPreferences,
} from '@/downloads/preferences'

describe('download preferences', () => {
  it('defaults to Wi-Fi only and rejects corrupt storage', async () => {
    jest.mocked(AsyncStorage.getItem)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('{"wifiOnly":"yes"}')

    await expect(loadDownloadPreferences()).resolves.toEqual(DEFAULT_DOWNLOAD_PREFERENCES)
    await expect(loadDownloadPreferences()).resolves.toEqual(DEFAULT_DOWNLOAD_PREFERENCES)
  })

  it('persists a validated preference', async () => {
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
    await saveDownloadPreferences({ wifiOnly: false })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'mangadb.downloadPreferences.v1',
      '{"wifiOnly":false}',
    )
  })

  it.each([
    [{
      isConnected: false,
      isConstrained: true,
      connectionType: NetInfoStateType.none,
    }, true, false],
    [{
      isConnected: true,
      isConstrained: false,
      connectionType: NetInfoStateType.wifi,
    }, true, true],
    [{
      isConnected: true,
      isConstrained: false,
      connectionType: NetInfoStateType.ethernet,
    }, true, true],
    [{
      isConnected: true,
      isConstrained: true,
      connectionType: NetInfoStateType.wifi,
    }, true, false],
    [{
      isConnected: true,
      isConstrained: false,
      connectionType: NetInfoStateType.cellular,
    }, true, false],
    [{
      isConnected: true,
      isConstrained: true,
      connectionType: NetInfoStateType.cellular,
    }, false, true],
  ])('evaluates network %j with wifiOnly=%s as %s', (network, wifiOnly, expected) => {
    expect(isDownloadNetworkEligible(network, wifiOnly)).toBe(expected)
  })
})
