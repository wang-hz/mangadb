import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Modal, ScrollView } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type { MangaDetail } from '@/api/types'
import { ReaderInfoModal } from './ReaderInfoModal'

const manga: MangaDetail = {
  uuid: 'manga-1',
  displayTitle: '示例漫画',
  originalTitle: 'Original Manga',
  fullname: '/library/example',
  publishDate: '2026-01-02T00:00:00.000Z',
  cover: 0,
  createAt: '2026-01-01T00:00:00.000Z',
  updateAt: '2026-01-03T00:00:00.000Z',
  pages: ['page-1', 'page-2'],
  mangaTags: [
    { tag: { uuid: 'tag-3', name: 'Z', tagType: { uuid: 'type-2', name: 'B 类型' } } },
    { tag: { uuid: 'tag-2', name: 'B', tagType: { uuid: 'type-1', name: 'A 类型' } } },
    { tag: { uuid: 'tag-1', name: 'A', tagType: { uuid: 'type-1', name: 'A 类型' } } },
  ],
}

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
}

type Props = React.ComponentProps<typeof ReaderInfoModal>

function element(props: Props) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ReaderInfoModal {...props} />
    </SafeAreaProvider>
  )
}

function renderInfo(patch: Partial<Props> = {}) {
  let props = {
    manga,
    visible: true,
    onClose: jest.fn(),
    onReturnToDetail: jest.fn().mockResolvedValue(undefined),
    onReturnToList: jest.fn().mockResolvedValue(undefined),
    ...patch,
  }
  const view = render(element(props))
  return {
    ...view,
    props,
    rerenderInfo: (next: Partial<Props>) => {
      props = { ...props, ...next }
      view.rerender(element(props))
    },
  }
}

describe('ReaderInfoModal', () => {
  it('shows existing manga metadata and sorted read-only tags in a scrollable sheet', () => {
    const view = renderInfo()

    expect(screen.getByText('漫画信息')).toBeOnTheScreen()
    expect(screen.getByText('示例漫画')).toBeOnTheScreen()
    expect(screen.getByText('Original Manga')).toBeOnTheScreen()
    expect(screen.getByText('2026.01.02')).toBeOnTheScreen()
    expect(screen.getByText('2 页')).toBeOnTheScreen()
    expect(screen.getAllByText(/类型 ·/)).toEqual([
      screen.getByText('A 类型 · A'),
      screen.getByText('A 类型 · B'),
      screen.getByText('B 类型 · Z'),
    ])
    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(view.UNSAFE_getByType(ScrollView)).toBeTruthy()
  })

  it('handles missing metadata and omits a repeated original title', () => {
    renderInfo({
      manga: { ...manga, originalTitle: manga.displayTitle, publishDate: null, mangaTags: [] },
    })

    expect(screen.getAllByText('示例漫画')).toHaveLength(1)
    expect(screen.getByText('未知')).toBeOnTheScreen()
    expect(screen.getByText('暂无标签')).toBeOnTheScreen()
  })

  it('supports every app orientation and both close paths', () => {
    const { props, UNSAFE_getByType } = renderInfo()
    const modal = UNSAFE_getByType(Modal)

    expect(modal.props.supportedOrientations).toEqual([
      'portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right',
    ])
    fireEvent.press(screen.getByLabelText('关闭漫画信息'))
    fireEvent(modal, 'requestClose')
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it.each(['返回漫画', '返回列表'])('runs the saved return callback for %s', async label => {
    const { props } = renderInfo()

    fireEvent.press(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(screen.queryByText('正在保存阅读状态…')).toBeNull())

    expect(props.onReturnToDetail).toHaveBeenCalledTimes(label === '返回漫画' ? 1 : 0)
    expect(props.onReturnToList).toHaveBeenCalledTimes(label === '返回列表' ? 1 : 0)
  })

  it('shares a single pending action across both return buttons', async () => {
    let finish!: () => void
    const onReturnToDetail = jest.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const { props } = renderInfo({ onReturnToDetail })

    act(() => {
      fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
      fireEvent.press(screen.getByRole('button', { name: '返回列表' }))
      fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    })

    expect(onReturnToDetail).toHaveBeenCalledTimes(1)
    expect(props.onReturnToList).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '返回漫画' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '返回列表' })).toBeDisabled()
    expect(screen.getByText('正在保存阅读状态…')).toBeOnTheScreen()

    await act(async () => { finish() })
    expect(screen.getByRole('button', { name: '返回列表' })).not.toBeDisabled()
  })

  it('keeps failures visible and retries the complete callback', async () => {
    const onReturnToList = jest.fn()
      .mockRejectedValueOnce(new Error('本机存储不可用'))
      .mockResolvedValueOnce(undefined)
    renderInfo({ onReturnToList })

    fireEvent.press(screen.getByRole('button', { name: '返回列表' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('本机存储不可用')
    expect(screen.getByRole('button', { name: '返回列表' })).not.toBeDisabled()

    fireEvent.press(screen.getByRole('button', { name: '返回列表' }))
    await waitFor(() => expect(screen.queryByText('正在保存阅读状态…')).toBeNull())
    expect(onReturnToList).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears errors when reopened and ignores errors from a previous opening', async () => {
    let fail!: (reason: Error) => void
    const onReturnToDetail = jest.fn()
      .mockRejectedValueOnce(new Error('保存失败'))
      .mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject }))
    const view = renderInfo({ onReturnToDetail })

    fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
    view.rerenderInfo({ visible: false })
    view.rerenderInfo({ visible: true })
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    view.rerenderInfo({ visible: false })
    view.rerenderInfo({ visible: true })
    await act(async () => { fail(new Error('旧操作错误')) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: '返回漫画' })).not.toBeDisabled()
  })

  it('settles an action safely after unmounting', async () => {
    let fail!: (reason: Error) => void
    const onReturnToDetail = jest.fn(() => new Promise<void>((_, reject) => { fail = reject }))
    const view = renderInfo({ onReturnToDetail })

    fireEvent.press(screen.getByRole('button', { name: '返回漫画' }))
    view.unmount()
    await act(async () => { fail(new Error('已关闭')) })
    expect(onReturnToDetail).toHaveBeenCalledTimes(1)
  })
})
