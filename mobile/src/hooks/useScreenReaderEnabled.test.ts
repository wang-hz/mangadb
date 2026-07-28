import { AccessibilityInfo } from 'react-native'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useScreenReaderEnabled } from './useScreenReaderEnabled'

describe('useScreenReaderEnabled', () => {
  afterEach(() => jest.restoreAllMocks())

  it('tracks changes and removes the native listener', async () => {
    let onChange: ((enabled: boolean) => void) | undefined
    const remove = jest.fn()
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true)
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      _event: string,
      listener: (enabled: boolean) => void,
    ) => {
      onChange = listener
      return { remove } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>
    }) as typeof AccessibilityInfo.addEventListener)

    const { result, unmount } = renderHook(() => useScreenReaderEnabled())
    await waitFor(() => expect(result.current).toBe(true))

    act(() => onChange?.(false))
    expect(result.current).toBe(false)

    unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
