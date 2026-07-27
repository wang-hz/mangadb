import { onlineManager } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NetworkStatusBanner } from '@/components/NetworkStatusBanner'

describe('NetworkStatusBanner', () => {
  afterEach(() => act(() => onlineManager.setOnline(true)))

  it('appears only while the device network is disconnected', () => {
    render(
      <SafeAreaProvider initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, right: 0, bottom: 34, left: 0 },
      }}>
        <Text>App content</Text>
        <NetworkStatusBanner />
      </SafeAreaProvider>,
    )

    expect(screen.queryByTestId('network-status-banner')).not.toBeOnTheScreen()

    act(() => onlineManager.setOnline(false))
    expect(screen.getByTestId('network-status-banner'))
      .toHaveTextContent('网络已断开，恢复连接后将自动重试')
    expect(screen.getByTestId('network-status-banner')).toHaveProp('accessibilityRole', 'alert')

    act(() => onlineManager.setOnline(true))
    expect(screen.queryByTestId('network-status-banner')).not.toBeOnTheScreen()
  })
})
