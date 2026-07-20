import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, render, waitFor } from '@testing-library/react-native'
import {
  ReaderPreferencesProvider,
  useReaderPreferences,
} from './ReaderPreferencesContext'

describe('ReaderPreferencesProvider', () => {
  let context: ReturnType<typeof useReaderPreferences>

  function Probe() {
    context = useReaderPreferences()
    return null
  }

  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
  })

  async function renderProvider() {
    render(
      <ReaderPreferencesProvider>
        <Probe />
      </ReaderPreferencesProvider>,
    )
    await waitFor(() => expect(context.status).toBe('ready'))
  }

  it('loads preferences and updates them for all consumers', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify({
      defaultMode: 'scroll',
      keepAwake: true,
    }))
    await renderProvider()
    expect(context.preferences).toMatchObject({ defaultMode: 'scroll', keepAwake: true })

    await act(async () => {
      await context.updatePreferences({ pagedDirection: 'rtl' })
    })
    expect(context.preferences.pagedDirection).toBe('rtl')
  })

  it('uses defaults when loading fails', async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValue(new Error('storage unavailable'))
    await renderProvider()
    expect(context.preferences).toMatchObject({
      defaultMode: 'paged',
      pagedDirection: 'ltr',
    })
  })

  it('rolls back an optimistic update when persistence fails', async () => {
    await renderProvider()
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk unavailable'))

    await act(async () => {
      await expect(context.updatePreferences({ keepAwake: true })).rejects.toThrow('disk unavailable')
    })
    expect(context.preferences.keepAwake).toBe(false)
  })
})
