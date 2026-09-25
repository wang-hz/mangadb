import AsyncStorage from '@react-native-async-storage/async-storage'
import { Share } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import SettingsOptions from './SettingsOptions'
import { useDownloads } from '@/downloads/DownloadContext'
import { ReaderPreferencesProvider } from '@/providers/ReaderPreferencesContext'
import { useSession } from '@/session/SessionContext'

jest.mock('@/session/SessionContext', () => ({ useSession: jest.fn() }))
jest.mock('@/downloads/DownloadContext', () => ({ useDownloads: jest.fn() }))

describe('SettingsScreen reading preferences', () => {
  afterEach(() => jest.restoreAllMocks())

  beforeEach(() => {
    jest.clearAllMocks()
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
      update: jest.fn(),
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

  it('shows reading preferences in their own subpage', async () => {
    render(
      <ReaderPreferencesProvider>
        <SettingsOptions section="reading" />
      </ReaderPreferencesProvider>,
    )

    expect(screen.queryByText('当前账号')).toBeNull()
    expect(screen.getByText('阅读设置')).toBeOnTheScreen()
    await waitFor(() => expect(screen.getByLabelText('翻页')).not.toBeDisabled())
    expect(screen.getByLabelText('阅读时保持屏幕常亮')).toBeOnTheScreen()
  })

  it('shares only the bounded local diagnostic payload', async () => {
    const diagnostic = {
      schemaVersion: 1,
      id: 'record-1',
      timestamp: '2026-08-20T00:00:00.000Z',
      appVersion: '0.1.0',
      platform: 'ios',
      category: 'reader',
      code: 'page-stall.paged',
      route: '/reader/:id',
      viewport: 'landscape-900x400',
    }
    jest.mocked(AsyncStorage.getItem).mockImplementation(async key =>
      key === 'mangadb.localDiagnostics.v1' ? JSON.stringify([diagnostic]) : null)
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction })

    render(
      <ReaderPreferencesProvider>
        <SettingsOptions section="diagnostics" />
      </ReaderPreferencesProvider>,
    )

    expect(await screen.findByText('当前共 1 条记录')).toBeOnTheScreen()
    fireEvent.press(screen.getByText('分享诊断记录'))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const sharePayload = share.mock.calls[0]?.[0]
    if (!sharePayload) throw new Error('missing share payload')
    expect(sharePayload.message).toContain('page-stall.paged')
    expect(sharePayload.message).not.toContain('https://')
    expect(sharePayload.message).not.toContain('token')
  })

  it('catches Wi-Fi preference failures and allows a retry', async () => {
    render(
      <ReaderPreferencesProvider>
        <SettingsOptions section="downloads" />
      </ReaderPreferencesProvider>,
    )
    await waitFor(() => expect(screen.getByLabelText('仅使用 Wi-Fi 下载')).not.toBeDisabled())
    const downloadSettings = jest.mocked(useDownloads).mock.results.at(-1)?.value
    if (!downloadSettings) throw new Error('missing download context result')
    const save = deferred<void>()
    jest.mocked(downloadSettings.setWifiOnly).mockImplementationOnce(() => save.promise)

    fireEvent(screen.getByLabelText('仅使用 Wi-Fi 下载'), 'valueChange', false)

    expect(downloadSettings.setWifiOnly).toHaveBeenCalledTimes(1)
    fireEvent(screen.getByLabelText('仅使用 Wi-Fi 下载'), 'valueChange', false)
    expect(downloadSettings.setWifiOnly).toHaveBeenCalledTimes(1)
    await act(async () => { save.reject(new Error('storage failed')) })
    expect(await screen.findByText('无法保存下载网络设置，请重试。')).toBeOnTheScreen()
    fireEvent(screen.getByLabelText('仅使用 Wi-Fi 下载'), 'valueChange', false)
    await waitFor(() => expect(downloadSettings.setWifiOnly).toHaveBeenCalledTimes(2))
  })
})

function deferred<T>() {
  let reject!: (error: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}
