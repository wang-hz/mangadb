import { act, render, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { listRecentReading } from '@/storage/progress'
import { useRecentReading } from './useRecentReading'

jest.mock('@/storage/progress', () => ({ listRecentReading: jest.fn() }))
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
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads on focus and refreshes when the app becomes active', async () => {
    render(<Probe />)
    await waitFor(() => expect(current.status).toBe('ready'))
    expect(listRecentReading).toHaveBeenCalledTimes(1)

    await act(async () => { appStateListener?.('background') })
    expect(listRecentReading).toHaveBeenCalledTimes(1)
    await act(async () => { appStateListener?.('active') })
    expect(listRecentReading).toHaveBeenCalledTimes(2)
  })

  it('does not expose results from a previous identity', async () => {
    let resolveFirst: ((entries: []) => void) | undefined
    jest.mocked(listRecentReading)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockResolvedValueOnce([])
    const view = render(<Probe />)
    view.rerender(<Probe serverUrl="https://two.example.com" userUuid="user-2" />)

    await waitFor(() => expect(listRecentReading).toHaveBeenCalledTimes(2))
    await act(async () => { resolveFirst?.([]) })

    expect(current.entries).toEqual([])
    expect(current.status).toBe('ready')
  })

  it('removes the app-state listener on unmount', () => {
    const view = render(<Probe />)
    view.unmount()
    expect(remove).toHaveBeenCalled()
  })
})
