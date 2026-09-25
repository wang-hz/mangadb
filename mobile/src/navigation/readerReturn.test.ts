import { readerReturnAction } from './readerReturn'

const detail = { name: 'manga/[uuid]', params: { uuid: 'm1' } }
const reader = { name: 'reader/[uuid]', params: { uuid: 'm1' } }

it.each(['mangas', 'recent', 'settings', 'tag/[uuid]'])('preserves the %s source below the detail', name => {
  const state = { index: 2, routes: [{ name }, detail, reader] }
  expect(readerReturnAction(state, 'm1', 'detail')).toEqual({ type: 'dismiss', count: 1 })
  expect(readerReturnAction(state, 'm1', 'list')).toEqual({ type: 'dismiss', count: 2 })
})

it('replaces a direct reader with detail or pops it back to recent reading', () => {
  const state = { index: 1, routes: [{ name: '(tabs)' }, reader] }
  expect(readerReturnAction(state, 'm1', 'detail')).toEqual({ type: 'detail' })
  expect(readerReturnAction(state, 'm1', 'list')).toEqual({ type: 'dismiss', count: 1 })
})

it.each([
  { index: 0, routes: [reader] },
  { index: 1, routes: [detail, reader] },
  undefined,
])('falls back to the library when the source is absent', state => {
  expect(readerReturnAction(state, 'm1', 'list')).toEqual({ type: 'library' })
})

it('does not confuse another manga detail with the current manga', () => {
  const state = { index: 1, routes: [{ ...detail, params: { uuid: 'other' } }, reader] }
  expect(readerReturnAction(state, 'm1', 'detail')).toEqual({ type: 'detail' })
  expect(readerReturnAction(state, 'm1', 'list')).toEqual({ type: 'dismiss', count: 1 })
})
