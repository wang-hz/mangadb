import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { ReaderCompletionPanel } from './ReaderCompletionPanel'

function props() {
  return {
    completed: false, pending: false, error: null,
    onMarkCompleted: jest.fn().mockResolvedValue(undefined),
    onReread: jest.fn().mockResolvedValue(undefined),
    onReturnToDetail: jest.fn(), onReturnToList: jest.fn(),
  }
}

it('offers exactly the three completion actions', () => {
  render(<ReaderCompletionPanel {...props()} />)
  expect(screen.getAllByRole('button')).toHaveLength(3)
  expect(screen.getByText('从头重读')).toBeOnTheScreen()
  expect(screen.getByText('返回漫画')).toBeOnTheScreen()
  expect(screen.getByText('返回列表')).toBeOnTheScreen()
  expect(screen.queryByText('标记已完成')).toBeNull()
})

it.each(['返回漫画', '返回列表'])('saves before navigating with %s and retries failures', async label => {
  const actions = props()
  actions.onMarkCompleted.mockRejectedValueOnce(new Error('存储不可用'))
  render(<ReaderCompletionPanel {...actions} />)
  fireEvent.press(screen.getByText(label))
  expect(await screen.findByText('存储不可用')).toBeOnTheScreen()
  expect(actions.onReturnToDetail).not.toHaveBeenCalled()
  expect(actions.onReturnToList).not.toHaveBeenCalled()
  fireEvent.press(screen.getByText(label))
  await waitFor(() => expect(label === '返回漫画' ? actions.onReturnToDetail : actions.onReturnToList).toHaveBeenCalledTimes(1))
})

it('rereads without marking completed and prevents duplicate actions', async () => {
  const actions = props()
  let finish!: () => void
  actions.onReread.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
  render(<ReaderCompletionPanel {...actions} />)
  fireEvent.press(screen.getByText('从头重读'))
  fireEvent.press(screen.getByText('从头重读'))
  expect(actions.onReread).toHaveBeenCalledTimes(1)
  expect(actions.onMarkCompleted).not.toHaveBeenCalled()
  await act(async () => { finish() })
})

it('disables actions during automatic saving and displays its error', () => {
  const actions = props()
  const view = render(<ReaderCompletionPanel {...actions} pending />)
  fireEvent.press(screen.getByText('返回列表'))
  expect(actions.onMarkCompleted).not.toHaveBeenCalled()
  view.rerender(<ReaderCompletionPanel {...actions} error="保存失败" />)
  expect(screen.getByText('保存失败')).toBeOnTheScreen()
})
