import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { recordDiagnostic } from '@/diagnostics/localDiagnostics'
import { RouteErrorFallback } from './RouteErrorFallback'

jest.mock('@/diagnostics/localDiagnostics', () => ({ recordDiagnostic: jest.fn() }))

describe('RouteErrorFallback', () => {
  it('records the error and exposes retry and leave recovery actions', async () => {
    jest.mocked(recordDiagnostic).mockResolvedValue(undefined)
    const retry = jest.fn().mockResolvedValue(undefined)
    const onLeave = jest.fn()

    render(
      <RouteErrorFallback
        error={new TypeError('private details')}
        leaveLabel="返回"
        message="可恢复错误"
        onLeave={onLeave}
        retry={retry}
        title="页面遇到问题"
      />,
    )

    await waitFor(() => expect(recordDiagnostic).toHaveBeenCalledWith('js-error', 'TypeError'))
    expect(screen.queryByText('private details')).not.toBeOnTheScreen()
    fireEvent.press(screen.getByText('重试'))
    fireEvent.press(screen.getByText('返回'))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
