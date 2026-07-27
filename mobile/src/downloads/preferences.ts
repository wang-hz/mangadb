import AsyncStorage from '@react-native-async-storage/async-storage'
import { NetInfoStateType } from '@react-native-community/netinfo'
import type { NativeNetworkSnapshot } from '@/query/nativeState'

const DOWNLOAD_PREFERENCES_KEY = 'mangadb.downloadPreferences.v1'

export interface DownloadPreferences {
  wifiOnly: boolean
}

export const DEFAULT_DOWNLOAD_PREFERENCES: DownloadPreferences = {
  wifiOnly: true,
}

export async function loadDownloadPreferences(): Promise<DownloadPreferences> {
  const raw = await AsyncStorage.getItem(DOWNLOAD_PREFERENCES_KEY)
  if (!raw) return DEFAULT_DOWNLOAD_PREFERENCES
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as Partial<DownloadPreferences>).wifiOnly === 'boolean'
    ) {
      return { wifiOnly: (value as DownloadPreferences).wifiOnly }
    }
  } catch {}
  return DEFAULT_DOWNLOAD_PREFERENCES
}

export async function saveDownloadPreferences(
  preferences: DownloadPreferences,
): Promise<void> {
  await AsyncStorage.setItem(DOWNLOAD_PREFERENCES_KEY, JSON.stringify(preferences))
}

export function isDownloadNetworkEligible(
  network: NativeNetworkSnapshot,
  wifiOnly: boolean,
): boolean {
  if (!network.isConnected) return false
  if (!wifiOnly) return true
  return !network.isConstrained &&
    (
      network.connectionType === NetInfoStateType.wifi ||
      network.connectionType === NetInfoStateType.ethernet
    )
}
