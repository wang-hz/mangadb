import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ReaderControls } from './ReaderControls'

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
}

function renderControls(patch: Partial<React.ComponentProps<typeof ReaderControls>> = {}) {
  const props = {
    title: '测试漫画', mode: 'paged' as const, direction: 'ltr' as const,
    pageIndex: 1, pageCount: 4,
    onBack: jest.fn(), onOpenSettings: jest.fn(),
    onJump: jest.fn(), onInteractionChange: jest.fn(), ...patch,
  }
  const view = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ReaderControls {...props} />
    </SafeAreaProvider>,
  )
  return { ...view, props }
}

describe('ReaderControls', () => {
  it('keeps navigation, settings, and completion without the bottom actions', () => {
    const { props } = renderControls({ completion: <Text>阅读完成</Text> })

    expect(screen.getByText('测试漫画')).toBeOnTheScreen()
    expect(screen.getByText('阅读完成')).toBeOnTheScreen()
    expect(screen.getByLabelText('阅读进度')).toBeOnTheScreen()
    expect(screen.queryByLabelText('展开页面缩略图')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    for (const label of ['页面', '翻页', '滚动']) {
      expect(screen.queryByText(label)).toBeNull()
    }

    fireEvent.press(screen.getByLabelText('退出阅读器'))
    fireEvent.press(screen.getByLabelText('打开阅读设置'))
    expect(props.onBack).toHaveBeenCalledTimes(1)
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it.each(['ltr', 'rtl'] as const)('navigates logical pages in %s mode', direction => {
    const { props } = renderControls({ direction })

    fireEvent.press(screen.getByLabelText('上一页'))
    fireEvent.press(screen.getByLabelText('下一页'))
    expect(props.onJump).toHaveBeenNthCalledWith(1, 0)
    expect(props.onJump).toHaveBeenNthCalledWith(2, 2)
  })

  it('keeps page jumps available and releases the interaction lock on close and unmount', () => {
    const { props, unmount } = renderControls()

    fireEvent.press(screen.getByLabelText('跳转页码'))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
    fireEvent.changeText(screen.getByLabelText('目标页码'), '4')
    fireEvent.press(screen.getByText('跳转'))
    expect(props.onJump).toHaveBeenCalledWith(3)
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)

    fireEvent.press(screen.getByLabelText('跳转页码'))
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(true)
    unmount()
    expect(props.onInteractionChange).toHaveBeenLastCalledWith(false)
  })

  it('disables page arrows for a single page and omits them in scrolling mode', () => {
    const single = renderControls({ pageIndex: 0, pageCount: 1 })
    expect(screen.getByLabelText('上一页')).toBeDisabled()
    expect(screen.getByLabelText('下一页')).toBeDisabled()
    single.unmount()

    renderControls({ mode: 'scroll' })
    expect(screen.queryByLabelText('上一页')).toBeNull()
    expect(screen.queryByLabelText('下一页')).toBeNull()
    expect(screen.getByLabelText('跳转页码')).toBeOnTheScreen()
  })
})
