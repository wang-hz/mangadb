import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

const SERVER_URL_KEY = 'mangadb.serverUrl.v1'
const ACCESS_TOKEN_KEY = 'mangadb.accessToken.v1'

export async function loadServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem(SERVER_URL_KEY)
}

export async function saveServerUrl(serverUrl: string): Promise<void> {
  await AsyncStorage.setItem(SERVER_URL_KEY, serverUrl)
}

export async function removeServerUrl(): Promise<void> {
  await AsyncStorage.removeItem(SERVER_URL_KEY)
}

export async function loadAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
}

export async function saveAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token)
}

export async function removeAccessToken(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)
}
