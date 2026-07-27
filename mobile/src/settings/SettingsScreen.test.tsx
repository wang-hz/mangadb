import AsyncStorage from '@react-native-async-storage/async-storage'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import SettingsScreen from '@/app/(app)/(tabs)/settings'
import { useDownloads } from '@/downloads/DownloadContext'
import { ReaderPreferencesProvider } from '@/providers/ReaderPreferencesContext'
import { useSession } from '@/session/SessionContext'

jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }))
jest.mock('@/downloads/DownloadContext', () => ({ useDownloads: jest.fn() }))

describe('SettingsScreen reading preferences', () => {
  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
    jest.mocked(useSession).mockReturnValue({
      status: 'authenticated',
      serverUrl: 'https://example.com',
      auth: {
        token: 'token',
        user: { uuid: 'user-1', username: 'reader', role: 'user', expiresAt: Date.now() + 60_000 },
      },
      api: null,
      configureServer: jest.fn(),
      authenticate: jest.fn(),
      signOut: jest.fn(),
      clearServer: jest.fn(),
    })
    jest.mocked(useDownloads).mockReturnValue({
      status: 'ready',
      error: null,
      preferences: { wifiOnly: true },
      snapshot: {
        initialized: true,
        eligible: true,
        manifests: [],
      },
      enqueue: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      retry: jest.fn(),
      deleteDownload: jest.fn(),
      clearCurrentDownloads: jest.fn(),
      clearAllDownloads: jest.fn(),
      setWifiOnly: jest.fn().mockResolvedValue(undefined),
      storageUsageBytes: 0,
      localPagesFor: jest.fn().mockResolvedValue(null),
      manifestFor: jest.fn(),
    })
  })

  it('shows the global reading controls alongside account settings', async () => {
    render(
      <ReaderPreferencesProvider>
        <SettingsScreen />
      </ReaderPreferencesProvider>,
    )

    expect(screen.getByText('当前账号')).toBeOnTheScreen()
    expect(screen.getByText('阅读设置')).toBeOnTheScreen()
    await waitFor(() => expect(screen.getByLabelText('翻页')).not.toBeDisabled())
    expect(screen.getByLabelText('阅读时保持屏幕常亮')).toBeOnTheScreen()
    expect(screen.getByLabelText('仅使用 Wi-Fi 下载')).toBeOnTheScreen()
    expect(screen.getByText('0 本 · 0 B')).toBeOnTheScreen()
    const downloadSettings = jest.mocked(useDownloads).mock.results[0].value
    fireEvent(screen.getByLabelText('仅使用 Wi-Fi 下载'), 'valueChange', false)
    await waitFor(() => expect(downloadSettings.setWifiOnly).toHaveBeenCalledWith(false))
  })
})
