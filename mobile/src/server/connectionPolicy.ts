import Constants from 'expo-constants'

export function isLanHttpEnabled(): boolean {
  return isLanHttpEnabledFromExtra(Constants.expoConfig?.extra)
}

export function isLanHttpEnabledFromExtra(
  extra: Record<string, unknown> | undefined,
): boolean {
  return extra?.allowLanHttp === true
}
