import { act, render } from '@testing-library/react-native'
import type { AppStateStatus, NativeEventSubscription } from 'react-native'
import { AppState, Text } from 'react-native'
import { AppPrivacyShield } from './AppPrivacyShield'

jest.mock('expo-blur', () => {
  const React = require('react')
  const { View } = require('react-native')

  return {
    BlurView: (props: object) => React.createElement(View, props),
  }
})

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

    expect(screen.getByTestId('app-privacy-shield').props.pointerEvents).toBe('none')

    act(() => listener?.('inactive'))
    expect(screen.getByTestId('app-privacy-shield').props.pointerEvents).toBe('auto')

    act(() => listener?.('background'))
    expect(screen.getByTestId('app-privacy-shield').props.pointerEvents).toBe('auto')

    act(() => listener?.('active'))
    expect(screen.getByTestId('app-privacy-shield').props.pointerEvents).toBe('none')

    screen.unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
