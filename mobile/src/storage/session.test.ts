import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import {
  loadAccessToken,
  loadServerUrl,
  removeAccessToken,
  removeServerUrl,
  saveAccessToken,
  saveServerUrl,
} from './session'

describe('session storage', () => {
  it('stores the server URL in AsyncStorage', async () => {
    await saveServerUrl('https://example.com')
    await expect(loadServerUrl()).resolves.toBe('https://example.com')
    await removeServerUrl()
    await expect(AsyncStorage.getAllKeys()).resolves.not.toContain('mangadb.serverUrl.v1')
  })

  it('stores the access token in SecureStore', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('token')
    await saveAccessToken('token')
    await expect(loadAccessToken()).resolves.toBe('token')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('mangadb.accessToken.v1', 'token')
    await removeAccessToken()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('mangadb.accessToken.v1')
  })
})
