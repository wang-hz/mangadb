import { fireEvent, render, screen } from '@testing-library/react-native'
import { RouteErrorFallback } from './RouteErrorFallback'

describe('RouteErrorFallback', () => {
  it('exposes retry and leave recovery actions without private error details', () => {
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

    expect(screen.queryByText('private details')).not.toBeOnTheScreen()
    fireEvent.press(screen.getByText('重试'))
    fireEvent.press(screen.getByText('返回'))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(onLeave).toHaveBeenCalledTimes(1)
  })
})
