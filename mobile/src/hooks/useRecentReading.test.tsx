import { synchronizeProgress } from '@/sync/registry'
import { act, render, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { listRecentReading, listReadingProgress, subscribeProgress } from '@/storage/progress'
import { useRecentReading } from './useRecentReading'

jest.mock('@/sync/registry', () => ({ synchronizeProgress: jest.fn(async () => {}) }))

jest.mock('@/storage/progress', () => ({
  subscribeProgress: jest.fn(() => () => {}),
  listRecentReading: jest.fn(),
  listReadingProgress: jest.fn(),
}))
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react')
    React.useEffect(effect, [effect])
  },
}))

describe('useRecentReading', () => {
  let current: ReturnType<typeof useRecentReading>
  let appStateListener: ((state: string) => void) | undefined
  const remove = jest.fn()

  function Probe({ serverUrl = 'https://example.com', userUuid = 'user-1' }) {
    current = useRecentReading(serverUrl, userUuid)
    return null
  }

  beforeEach(() => {
    appStateListener = undefined
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      appStateListener = listener as (state: string) => void
      return { remove }
    })
    jest.mocked(listRecentReading).mockResolvedValue([])
    jest.mocked(listReadingProgress).mockResolvedValue([])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads on focus and refreshes when the app becomes active', async () => {
    render(<Probe />)
    await waitFor(() => expect(current.status).toBe('ready'))
    expect(listReadingProgress).toHaveBeenCalledTimes(1)
    expect(listRecentReading).toHaveBeenCalledTimes(1)

    await act(async () => { appStateListener?.('background') })
    expect(listReadingProgress).toHaveBeenCalledTimes(1)
    await act(async () => { appStateListener?.('active') })
    expect(listReadingProgress).toHaveBeenCalledTimes(2)
    expect(listRecentReading).toHaveBeenCalledTimes(2)
  })

  it('does not expose results from a previous identity', async () => {
    let resolveFirst: ((entries: []) => void) | undefined
    jest.mocked(listReadingProgress)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockResolvedValueOnce([])
    const view = render(<Probe />)
    view.rerender(<Probe serverUrl="https://two.example.com" userUuid="user-2" />)

    await waitFor(() => expect(listReadingProgress).toHaveBeenCalledTimes(2))
    await act(async () => { resolveFirst?.([]) })

    expect(current.entries).toEqual([])
    expect(current.status).toBe('ready')
  })

  it('requests server sync on manual refresh but only reloads local data on storage notifications', async () => {
    render(<Probe />)
    await waitFor(() => expect(current.status).toBe('ready'))
    jest.mocked(synchronizeProgress).mockClear()
    await act(async () => { await current.refresh() })
    expect(synchronizeProgress).toHaveBeenCalledWith('https://example.com', 'user-1', true)
    const listener = jest.mocked(subscribeProgress).mock.calls[0]![0]
    await act(async () => { listener('https://example.com', 'user-1') })
    expect(synchronizeProgress).toHaveBeenCalledTimes(1)
    expect(listReadingProgress).toHaveBeenCalledTimes(3)
  })

  it('removes the app-state listener on unmount', () => {
    const view = render(<Probe />)
    view.unmount()
    expect(remove).toHaveBeenCalled()
  })
})
