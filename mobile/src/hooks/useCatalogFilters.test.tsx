import { render, waitFor } from '@testing-library/react-native'
import {
  DEFAULT_CATALOG_FILTERS,
  loadCatalogFilters,
} from '@/storage/catalogFilters'
import { useCatalogFilters } from './useCatalogFilters'

jest.mock('@/storage/catalogFilters', () => {
  const actual = jest.requireActual('@/storage/catalogFilters')
  return {
    ...actual,
    loadCatalogFilters: jest.fn(),
    saveCatalogFilters: jest.fn().mockResolvedValue(undefined),
  }
})

describe('useCatalogFilters', () => {
  let current: ReturnType<typeof useCatalogFilters>

  function Probe() {
    current = useCatalogFilters('https://example.com', 'user-1')
    return null
  }

  it('finishes loading with safe defaults when persisted filters cannot be read', async () => {
    jest.mocked(loadCatalogFilters).mockRejectedValueOnce(new Error('storage unavailable'))

    render(<Probe />)

    await waitFor(() => expect(current.loaded).toBe(true))
    expect(current.filters).toEqual({ ...DEFAULT_CATALOG_FILTERS, tagUuids: [] })
  })
})
