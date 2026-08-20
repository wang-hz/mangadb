import { render } from '@testing-library/react-native'
import { Modal } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ReaderSettingsModal } from './ReaderSettingsModal'

jest.mock('./ReaderPreferencesControls', () => ({
  ReaderPreferencesControls: () => null,
}))

describe('ReaderSettingsModal', () => {
  it('supports every orientation enabled by the app', () => {
    const view = render(
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ReaderSettingsModal
          onClose={jest.fn()}
          onDefaultModeChange={jest.fn()}
          visible
        />
      </SafeAreaProvider>,
    )

    expect(view.UNSAFE_getByType(Modal).props.supportedOrientations).toEqual([
      'portrait',
      'portrait-upside-down',
      'landscape-left',
      'landscape-right',
    ])
  })
})

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}
