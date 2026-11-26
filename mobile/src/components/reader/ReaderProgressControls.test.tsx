import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AppState, type NativeEventSubscription } from 'react-native'
import { ReaderProgressControls } from './ReaderProgressControls'

function renderControls(pageCount = 11) {
  const onJump = jest.fn()
  const onInteractionChange = jest.fn()
  const view = render(<ReaderProgressControls pageCount={pageCount} pageIndex={0} onJump={onJump} onInteractionChange={onInteractionChange} />)
  const slider = screen.getByLabelText('阅读进度')
  // Layout events occur before a native view can become a touch responder.
  act(() => slider.props.onLayout({ nativeEvent: { layout: { width: 220 } } }))
  return { ...view, slider, onJump, onInteractionChange }
}

function beginDrag(slider: ReturnType<typeof screen.getByLabelText>) {
  fireEvent(slider, 'responderGrant', { nativeEvent: { locationX: 10, pageX: 30 } })
  fireEvent(slider, 'responderMove', { nativeEvent: { pageX: 130 } })
}

describe('ReaderProgressControls', () => {
  beforeEach(() => {
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as NativeEventSubscription)
  })
  afterEach(() => jest.restoreAllMocks())

  it.each([9, 99, 999])('keeps maximum page-number space reserved when crossing page %i', page => {
    const props = { pageCount: 1111, onJump: jest.fn(), onInteractionChange: jest.fn() }
    const view = render(<ReaderProgressControls {...props} pageIndex={page - 1} />)
    const reserve = screen.getByTestId('reader-page-number-reserve', { includeHiddenElements: true })
    expect(reserve).toHaveTextContent('1111 / 1111')
    expect(screen.queryByText('1111 / 1111')).toBeNull()
    expect(screen.getByText(`${page} / 1111`)).toBeOnTheScreen()

    view.rerender(<ReaderProgressControls {...props} pageIndex={page} />)

    expect(screen.getByTestId('reader-page-number-reserve', { includeHiddenElements: true })).toHaveTextContent('1111 / 1111')
    expect(screen.getByText(`${page + 1} / 1111`)).toBeOnTheScreen()
    expect(screen.getByLabelText('跳转页码')).toHaveStyle({ minWidth: 44, minHeight: 44, flexShrink: 0 })
  })

  it('preserves maximum page-number space during scrubbing without exposing duplicate labels', () => {
    const { slider, onJump } = renderControls(1111)
    beginDrag(slider)
    fireEvent(slider, 'responderMove', { nativeEvent: { pageX: 1000 } })

    expect(screen.getAllByText('1111 / 1111')).toHaveLength(1)
    expect(screen.getByTestId('reader-page-number-reserve', { includeHiddenElements: true })).toHaveTextContent('1111 / 1111')
    expect(onJump).not.toHaveBeenCalled()
    fireEvent(slider, 'responderRelease')
    expect(onJump).toHaveBeenCalledWith(1110)
  })

  it('previews while dragging and commits just once on release', () => {
    const { slider, onJump, onInteractionChange } = renderControls()
    beginDrag(slider)
    expect(screen.getByText('6 / 11')).toBeOnTheScreen()
    expect(onJump).not.toHaveBeenCalled()
    expect(onInteractionChange).toHaveBeenLastCalledWith(true)
    fireEvent(slider, 'responderRelease')
    expect(onJump).toHaveBeenCalledTimes(1)
    expect(onJump).toHaveBeenCalledWith(5)
    expect(onInteractionChange).toHaveBeenLastCalledWith(false)
  })

  it('clamps to both ends of the track', () => {
    const { slider, onJump } = renderControls()
    beginDrag(slider)
    fireEvent(slider, 'responderMove', { nativeEvent: { pageX: 1000 } })
    fireEvent(slider, 'responderRelease')
    expect(onJump).toHaveBeenLastCalledWith(10)
    beginDrag(slider)
    fireEvent(slider, 'responderMove', { nativeEvent: { pageX: -1000 } })
    fireEvent(slider, 'responderRelease')
    expect(onJump).toHaveBeenLastCalledWith(0)
  })

  it('maps the RTL track to logical pages while preserving accessible increments', () => {
    const onJump = jest.fn()
    render(<ReaderProgressControls direction="rtl" pageCount={11} pageIndex={0} onJump={onJump} onInteractionChange={jest.fn()} />)
    const slider = screen.getByLabelText('阅读进度')
    act(() => slider.props.onLayout({ nativeEvent: { layout: { width: 220 } } }))
    fireEvent(slider, 'responderGrant', { nativeEvent: { locationX: 10, pageX: 30 } })
    expect(screen.getByText('11 / 11')).toBeOnTheScreen()
    fireEvent(slider, 'responderRelease')
    expect(onJump).toHaveBeenLastCalledWith(10)
    fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(onJump).toHaveBeenLastCalledWith(1)
  })

  it('discards a cancelled gesture', () => {
    const { slider, onJump } = renderControls()
    beginDrag(slider)
    fireEvent(slider, 'responderTerminate')
    fireEvent(slider, 'responderRelease')
    expect(screen.getByText('1 / 11')).toBeOnTheScreen()
    expect(onJump).not.toHaveBeenCalled()
  })

  it('cancels an unfinished gesture when backgrounded', () => {
    let background: (state: 'background') => void = () => {}
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      background = listener
      return { remove: jest.fn() } as NativeEventSubscription
    })
    const { slider, onJump } = renderControls()
    beginDrag(slider)
    act(() => background('background'))
    fireEvent(slider, 'responderRelease')
    expect(onJump).not.toHaveBeenCalled()
  })

  it('discards the draft when page count changes or the reader is remounted', () => {
    const { slider, onJump, onInteractionChange, rerender, unmount } = renderControls()
    beginDrag(slider)
    rerender(<ReaderProgressControls pageCount={5} pageIndex={0} onJump={onJump} onInteractionChange={onInteractionChange} />)
    fireEvent(slider, 'responderRelease')
    expect(onJump).not.toHaveBeenCalled()
    beginDrag(slider)
    unmount()
    expect(onInteractionChange).toHaveBeenLastCalledWith(false)
    expect(onJump).not.toHaveBeenCalled()
  })

  it('supports accessible increments and disables a one-page track', () => {
    const { slider, onJump, unmount } = renderControls()
    fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(onJump).toHaveBeenCalledWith(1)
    unmount()
    const single = renderControls(1)
    expect(single.slider.props.onStartShouldSetResponder()).toBe(false)
    fireEvent(single.slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(single.onJump).not.toHaveBeenCalled()
  })

  it.each(['', '1.5', '0', '12'])('rejects invalid page input %j', value => {
    const { onJump } = renderControls()
    fireEvent.press(screen.getByLabelText('跳转页码'))
    fireEvent.changeText(screen.getByLabelText('目标页码'), value)
    fireEvent.press(screen.getByText('跳转'))
    expect(onJump).not.toHaveBeenCalled()
    expect(screen.getByLabelText('目标页码')).toBeOnTheScreen()
  })

  it('converts a confirmed page to a zero-based index and supports cancellation', () => {
    const { onJump, onInteractionChange } = renderControls()
    fireEvent.press(screen.getByLabelText('跳转页码'))
    expect(onInteractionChange).toHaveBeenLastCalledWith(true)
    fireEvent.changeText(screen.getByLabelText('目标页码'), '11')
    fireEvent.press(screen.getByText('跳转'))
    expect(onJump).toHaveBeenCalledWith(10)
    expect(onInteractionChange).toHaveBeenLastCalledWith(false)
    fireEvent.press(screen.getByLabelText('跳转页码'))
    fireEvent.press(screen.getByText('取消'))
    expect(onJump).toHaveBeenCalledTimes(1)
  })
})
