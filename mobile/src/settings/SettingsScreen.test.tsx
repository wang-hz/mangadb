import AsyncStorage from '@react-native-async-storage/async-storage'
import { render, screen, waitFor } from '@testing-library/react-native'
import SettingsScreen from '@/app/(app)/(tabs)/settings'
import { ReaderPreferencesProvider } from '@/providers/ReaderPreferencesContext'
import { useSession } from '@/session/SessionContext'

jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }))

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
  })
})
