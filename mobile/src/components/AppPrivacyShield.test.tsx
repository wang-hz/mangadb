import { act, render } from '@testing-library/react-native'
import type { AppStateStatus, NativeEventSubscription } from 'react-native'
import { AppState, Text } from 'react-native'
import { AppPrivacyShield } from './AppPrivacyShield'

describe('AppPrivacyShield', () => {
  it('covers the app while iOS is inactive or backgrounded', () => {
    let listener: ((state: AppStateStatus) => void) | undefined
    const remove = jest.fn()
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, nextListener) => {
      listener = nextListener
      return { remove } as NativeEventSubscription
    })

    const screen = render(
      <AppPrivacyShield>
        <Text>content</Text>
      </AppPrivacyShield>,
    )

    expect(screen.queryByTestId('app-privacy-shield')).toBeNull()

    act(() => listener?.('inactive'))
    expect(screen.getByTestId('app-privacy-shield').props.pointerEvents).toBe('auto')

    act(() => listener?.('background'))
    expect(screen.getByTestId('app-privacy-shield').props.pointerEvents).toBe('auto')

    act(() => listener?.('active'))
    expect(screen.queryByTestId('app-privacy-shield')).toBeNull()

    screen.unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
