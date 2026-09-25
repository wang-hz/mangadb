interface ReaderStack {
  index: number
  routes: readonly { name: string; params?: object }[]
}

export type ReaderReturnAction =
  | { type: 'dismiss'; count: number }
  | { type: 'detail' }
  | { type: 'library' }

// Only pop the current reader and its adjacent detail, preserving the source stack.
export function readerReturnAction(
  state: ReaderStack | undefined,
  mangaUuid: string,
  destination: 'detail' | 'list',
): ReaderReturnAction {
  if (!state) return { type: destination === 'detail' ? 'detail' : 'library' }
  const previous = state.routes[state.index - 1]
  const previousIsDetail = previous?.name === 'manga/[uuid]' &&
    previous.params && 'uuid' in previous.params && previous.params.uuid === mangaUuid
  if (destination === 'detail') {
    return previousIsDetail ? { type: 'dismiss', count: 1 } : { type: 'detail' }
  }
  const count = previousIsDetail ? 2 : 1
  return state.index >= count ? { type: 'dismiss', count } : { type: 'library' }
}
