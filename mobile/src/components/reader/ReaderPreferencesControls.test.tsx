import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { ReaderPreferencesProvider } from '@/providers/ReaderPreferencesContext'
import { ReaderPreferencesControls } from './ReaderPreferencesControls'

describe('ReaderPreferencesControls', () => {
  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
  })

  async function renderControls(onDefaultModeChange = jest.fn()) {
    render(
      <ReaderPreferencesProvider>
        <ReaderPreferencesControls onDefaultModeChange={onDefaultModeChange} />
      </ReaderPreferencesProvider>,
    )
    await waitFor(() => expect(screen.getByLabelText('翻页')).not.toBeDisabled())
    return onDefaultModeChange
  }

  it.each([false, true])('shares the reading content without brightness controls when dark=%s', async dark => {
    render(
      <ReaderPreferencesProvider>
        <ReaderPreferencesControls dark={dark} />
      </ReaderPreferencesProvider>,
    )
    await waitFor(() => expect(screen.getByLabelText('翻页')).not.toBeDisabled())

    expect(screen.getAllByRole('header').map(header => header.props.children)).toEqual([
      '阅读方式', '画面', '交互',
    ])
    expect(screen.getByText('阅读模式')).toBeOnTheScreen()
    expect(screen.getByText('阅读偏好保存在本机，所有服务器和账号共用。已读漫画优先沿用上次阅读模式；阅读器内修改会立即应用，并保存为本机默认值。')).toBeOnTheScreen()
    expect(screen.queryByText('默认阅读模式')).toBeNull()
    expect(screen.queryByText('阅读画面亮度')).toBeNull()
    expect(screen.queryByLabelText('夜间')).toBeNull()
  })

  it('updates every reading preference', async () => {
    const onDefaultModeChange = await renderControls()

    fireEvent.press(screen.getByLabelText('连续滚动'))
    await waitFor(() => expect(onDefaultModeChange).toHaveBeenCalledWith('scroll'))
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getByLabelText('从右到左'))
    await waitFor(() => expect(screen.getByLabelText('从右到左').props.accessibilityState.checked).toBe(true))
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2))
    fireEvent.press(screen.getByLabelText('铺满屏幕'))
    await waitFor(() => expect(screen.getByLabelText('铺满屏幕').props.accessibilityState.checked).toBe(true))
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(3))
    fireEvent.press(screen.getByLabelText('大'))
    await waitFor(() => expect(screen.getByLabelText('大').props.accessibilityState.checked).toBe(true))
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(4))
    fireEvent.press(screen.getByLabelText('5 秒'))
    await waitFor(() => expect(screen.getByLabelText('5 秒').props.accessibilityState.checked).toBe(true))
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(5))
    fireEvent.press(screen.getByLabelText('3 倍'))
    await waitFor(() => expect(screen.getByLabelText('3 倍').props.accessibilityState.checked).toBe(true))
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(6))
    fireEvent(screen.getByLabelText('阅读时保持屏幕常亮'), 'valueChange', true)
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(7))

    const saved = JSON.parse(jest.mocked(AsyncStorage.setItem).mock.calls.at(-1)![1])
    expect(saved).toMatchObject({
      defaultMode: 'scroll',
      pagedDirection: 'rtl',
      pagedFit: 'cover',
      scrollGap: 16,
      controlsAutoHideMs: 5000,
      doubleTapZoomScale: 3,
      keepAwake: true,
    })
  })

  it('uses the current mode for selection and failure rollback inside the reader', async () => {
    const onModeChange = jest.fn()
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    render(
      <ReaderPreferencesProvider>
        <ReaderPreferencesControls dark currentMode="scroll" onDefaultModeChange={onModeChange} />
      </ReaderPreferencesProvider>,
    )
    await waitFor(() => expect(screen.getByLabelText('翻页')).not.toBeDisabled())
    expect(screen.getByLabelText('连续滚动').props.accessibilityState.checked).toBe(true)
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk unavailable'))
    await act(async () => { fireEvent.press(screen.getByLabelText('翻页')) })
    expect(onModeChange).toHaveBeenNthCalledWith(1, 'paged')
    expect(onModeChange).toHaveBeenNthCalledWith(2, 'scroll')
    expect(alert).toHaveBeenCalled()
    alert.mockRestore()
  })

  it('restores the previous value and alerts when persistence fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const onDefaultModeChange = await renderControls()
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk unavailable'))

    await act(async () => { fireEvent.press(screen.getByLabelText('连续滚动')) })
    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      '无法保存阅读设置',
      '设置已恢复，请检查本机存储后重试。',
    ))
    expect(onDefaultModeChange).toHaveBeenNthCalledWith(1, 'scroll')
    expect(onDefaultModeChange).toHaveBeenNthCalledWith(2, 'paged')
    expect(screen.getByLabelText('翻页').props.accessibilityState.checked).toBe(true)
  })
})
