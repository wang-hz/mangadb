import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { ReaderCompletionPanel } from './ReaderCompletionPanel'

describe('ReaderCompletionPanel', () => {
  it('marks completion and exposes reread/detail actions', async () => {
    const onMarkCompleted = jest.fn().mockResolvedValue(undefined)
    const onReread = jest.fn()
    const onReturnToDetail = jest.fn()
    render(
      <ReaderCompletionPanel
        completed={false}
        onMarkCompleted={onMarkCompleted}
        onReread={onReread}
        onReturnToDetail={onReturnToDetail}
      />,
    )

    fireEvent.press(screen.getByText('标记已完成'))
    await waitFor(() => expect(onMarkCompleted).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getByText('从头重读'))
    fireEvent.press(screen.getByText('返回详情'))
    expect(onReread).toHaveBeenCalledTimes(1)
    expect(onReturnToDetail).toHaveBeenCalledTimes(1)
  })

  it('does not save completion twice', () => {
    const onMarkCompleted = jest.fn()
    render(
      <ReaderCompletionPanel
        completed
        onMarkCompleted={onMarkCompleted}
        onReread={jest.fn()}
        onReturnToDetail={jest.fn()}
      />,
    )
    fireEvent.press(screen.getByText('已完成'))
    expect(onMarkCompleted).not.toHaveBeenCalled()
  })

  it('keeps actions available when saving completion fails', async () => {
    render(
      <ReaderCompletionPanel
        completed={false}
        onMarkCompleted={jest.fn().mockRejectedValue(new Error('存储不可用'))}
        onReread={jest.fn()}
        onReturnToDetail={jest.fn()}
      />,
    )
    fireEvent.press(screen.getByText('标记已完成'))
    await waitFor(() => expect(screen.getByText('存储不可用')).toBeOnTheScreen())
    expect(screen.getByText('标记已完成')).toBeEnabled()
  })
})
