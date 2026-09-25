import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { MangaDetail } from '@/api/types'
import { markMangaCompleted, restartMangaReading } from '@/storage/progress'
import { ReadingProgressWriter } from '@/storage/progressWriter'
import { useReaderCompletion } from './useReaderCompletion'
import type { ReaderMode } from '@/utils/reader'

jest.mock('@/storage/progress', () => ({
  markMangaCompleted: jest.fn(), restartMangaReading: jest.fn(),
}))

const manga = { uuid: 'm1', pages: ['0', '1', '2'] } as MangaDetail
function setup(pageIndex = 2, pageCount = 3) {
  return {
    manga: { ...manga, pages: manga.pages.slice(0, pageCount) },
    pageIndex, mode: 'paged' as ReaderMode, serverUrl: 'server', userUuid: 'user',
    initialCompleted: false, writer: new ReadingProgressWriter(jest.fn().mockResolvedValue({})),
    onRestart: jest.fn(),
  }
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(finish => { resolve = finish })
  return { promise, resolve }
}

beforeEach(() => {
  jest.mocked(markMangaCompleted).mockReset().mockResolvedValue({} as never)
  jest.mocked(restartMangaReading).mockReset().mockResolvedValue({} as never)
})

it.each<ReaderMode>(['paged', 'scroll'])('only completes at the last page once per visit in %s mode', async mode => {
  const options = { ...setup(0), mode }
  const view = renderHook((props: ReturnType<typeof setup>) => useReaderCompletion(props), { initialProps: options })
  expect(markMangaCompleted).not.toHaveBeenCalled()
  view.rerender({ ...options, pageIndex: 2 })
  await waitFor(() => expect(view.result.current.completed).toBe(true))
  view.rerender({ ...options, pageIndex: 2, mode: mode === 'paged' ? 'scroll' : 'paged' })
  expect(markMangaCompleted).toHaveBeenCalledTimes(1)
  view.rerender(options)
  expect(view.result.current.completed).toBe(false)
  view.rerender({ ...options, pageIndex: 2 })
  await waitFor(() => expect(markMangaCompleted).toHaveBeenCalledTimes(2))
})

it('drains earlier progress and shares a single in-flight completion', async () => {
  const options = setup()
  const saved = deferred()
  const flush = jest.spyOn(options.writer, 'flush').mockReturnValue(saved.promise)
  const view = renderHook(() => useReaderCompletion(options))
  let first!: Promise<void>
  let second!: Promise<void>
  act(() => {
    first = view.result.current.complete()
    second = view.result.current.complete()
  })
  expect(first).toBe(second)
  expect(markMangaCompleted).not.toHaveBeenCalled()
  await act(async () => { saved.resolve(); await first })
  expect(flush).toHaveBeenCalledTimes(1)
  expect(markMangaCompleted).toHaveBeenCalledTimes(1)
})

it('does not retry failed automatic saves until a return action retries', async () => {
  jest.mocked(markMangaCompleted).mockRejectedValueOnce(new Error('storage failed'))
  const options = setup()
  const view = renderHook(() => useReaderCompletion(options))
  await waitFor(() => expect(view.result.current.error).toBe('storage failed'))
  expect(view.result.current.completed).toBe(false)
  expect(markMangaCompleted).toHaveBeenCalledTimes(1)
  await act(async () => { await view.result.current.complete() })
  expect(view.result.current.completed).toBe(true)
  expect(view.result.current.error).toBeNull()
})

it('waits for completion before a quick reread and keeps one-page rereads in progress', async () => {
  const options = setup(0, 1)
  const saved = deferred()
  jest.mocked(markMangaCompleted).mockImplementationOnce(async () => { await saved.promise; return {} as never })
  const view = renderHook(() => useReaderCompletion(options))
  await waitFor(() => expect(markMangaCompleted).toHaveBeenCalledTimes(1))
  let reread!: Promise<void>
  act(() => { reread = view.result.current.reread() })
  expect(restartMangaReading).not.toHaveBeenCalled()
  await act(async () => { saved.resolve(); await reread })
  expect(restartMangaReading).toHaveBeenCalledTimes(1)
  expect(options.onRestart).toHaveBeenCalledTimes(1)
  expect(view.result.current.completed).toBe(false)
  expect(markMangaCompleted).toHaveBeenCalledTimes(1)
})

it('does not jump to the beginning if saving the reread fails', async () => {
  const options = setup()
  const view = renderHook(() => useReaderCompletion(options))
  await waitFor(() => expect(view.result.current.completed).toBe(true))
  jest.mocked(restartMangaReading).mockRejectedValueOnce(new Error('restart failed'))
  await act(async () => { await expect(view.result.current.reread()).rejects.toThrow('restart failed') })
  expect(options.onRestart).not.toHaveBeenCalled()
  expect(view.result.current.completed).toBe(true)
  expect(view.result.current.pending).toBe(false)
  await act(async () => { await view.result.current.reread() })
  expect(options.onRestart).toHaveBeenCalledTimes(1)
})

it('does not mark a stale last-page visit complete after moving backwards', async () => {
  const options = setup()
  const saved = deferred()
  jest.spyOn(options.writer, 'flush').mockReturnValueOnce(saved.promise)
  const view = renderHook((props: ReturnType<typeof setup>) => useReaderCompletion(props), { initialProps: options })
  view.rerender({ ...options, pageIndex: 0 })
  await act(async () => { saved.resolve() })
  expect(markMangaCompleted).not.toHaveBeenCalled()
  expect(view.result.current.completed).toBe(false)
  view.rerender(options)
  await waitFor(() => expect(view.result.current.completed).toBe(true))
})

it('can complete after an earlier position write failed', async () => {
  const options = setup()
  jest.spyOn(options.writer, 'flush').mockRejectedValue(new Error('old position failed'))
  const view = renderHook(() => useReaderCompletion(options))
  await waitFor(() => expect(view.result.current.completed).toBe(true))
  expect(markMangaCompleted).toHaveBeenCalledTimes(1)
})

it('does not automatically complete again after remounting a finished manga', async () => {
  const options = { ...setup(), initialCompleted: true }
  const view = renderHook(() => useReaderCompletion(options))
  await act(async () => { await view.result.current.complete() })
  expect(markMangaCompleted).not.toHaveBeenCalled()
  expect(view.result.current.completed).toBe(true)
})
