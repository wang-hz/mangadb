import AsyncStorage from '@react-native-async-storage/async-storage'

export const ACCESS_TOKEN_LOGOUT_TOMBSTONE_KEY = 'mangadb.accessTokenLogoutPending.v1'

export async function loadAccessTokenLogoutTombstone(): Promise<boolean> {
  return await AsyncStorage.getItem(ACCESS_TOKEN_LOGOUT_TOMBSTONE_KEY) === '1'
}

export async function markAccessTokenLogoutTombstone(): Promise<void> {
  await AsyncStorage.setItem(ACCESS_TOKEN_LOGOUT_TOMBSTONE_KEY, '1')
}

export async function clearAccessTokenLogoutTombstone(): Promise<void> {
  await AsyncStorage.removeItem(ACCESS_TOKEN_LOGOUT_TOMBSTONE_KEY)
}
