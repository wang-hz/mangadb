import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  activeCatalogFilterCount,
  DEFAULT_CATALOG_FILTERS,
  loadCatalogFilters,
  saveCatalogFilters,
} from './catalogFilters'

describe('catalog filter storage', () => {
  beforeEach(() => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(null)
    jest.mocked(AsyncStorage.setItem).mockResolvedValue(undefined)
  })

  it('restores an identity-scoped combined filter', async () => {
    const filters = {
      ...DEFAULT_CATALOG_FILTERS,
      search: '科幻',
      tagUuids: ['tag-1', 'tag-2'],
      publishYearFrom: 1990,
      publishYearTo: 2020,
      readingState: 'reading' as const,
      favoriteOnly: true,
      downloadedOnly: true,
    }
    await saveCatalogFilters('https://example.com', 'user-1', filters)

    const firstWrite = jest.mocked(AsyncStorage.setItem).mock.calls[0]
    if (!firstWrite) throw new Error('missing storage write')
    const [key, value] = firstWrite
    expect(key).toContain(encodeURIComponent('https://example.com'))
    expect(key).toContain('user-1')
    expect(JSON.parse(value)).toEqual(filters)
    expect(activeCatalogFilterCount(filters)).toBe(5)
  })

  it('defaults malformed fields and invalid year ranges', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValue(JSON.stringify({
      sortBy: 'title',
      sortOrder: 'sideways',
      tagUuids: ['tag-1', 'tag-1', 2],
      publishYearFrom: 2026,
      publishYearTo: 1990,
      readingState: 'paused',
      favoriteOnly: 'yes',
    }))

    await expect(loadCatalogFilters('https://example.com', 'user-1')).resolves.toEqual({
      ...DEFAULT_CATALOG_FILTERS,
      tagUuids: ['tag-1'],
    })
  })
})
