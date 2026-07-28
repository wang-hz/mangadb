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
    fireEvent.press(screen.getByLabelText('夜间'))
    await waitFor(() => expect(screen.getByLabelText('夜间').props.accessibilityState.checked).toBe(true))
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
      readerDimLevel: 0.4,
      keepAwake: true,
    })
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
