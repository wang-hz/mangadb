import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  clearDiagnostics,
  loadDiagnostics,
  recordDiagnostic,
  setDiagnosticContext,
  viewportBucket,
} from './localDiagnostics'

describe('local diagnostics', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    await clearDiagnostics()
    setDiagnosticContext({ route: '/', viewport: 'unknown' })
  })

  it('stores a bounded and sanitized diagnostic ring', async () => {
    setDiagnosticContext({
      route: '/reader/private-manga-uuid',
      viewport: viewportBucket(852, 393),
    })
    for (let index = 0; index < 55; index += 1) {
      await recordDiagnostic('reader', `page-stall.${index}`)
    }

    const records = await loadDiagnostics()
    expect(records).toHaveLength(50)
    expect(records[0]?.code).toBe('page-stall.5')
    expect(records.at(-1)).toMatchObject({
      route: '/reader/:id',
      viewport: 'landscape-900x400',
      code: 'page-stall.54',
    })
    expect(JSON.stringify(records)).not.toContain('private-manga-uuid')
  })

  it('discards malformed stored diagnostics and can clear valid records', async () => {
    await AsyncStorage.setItem('mangadb.localDiagnostics.v1', '{broken')
    await expect(loadDiagnostics()).resolves.toEqual([])
    await recordDiagnostic('storage', 'read-failed')
    await expect(loadDiagnostics()).resolves.toHaveLength(1)
    await clearDiagnostics()
    await expect(loadDiagnostics()).resolves.toEqual([])
  })
})
