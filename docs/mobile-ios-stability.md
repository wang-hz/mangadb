# iOS grid restoration crash

An iPhone 17 Pro running iOS 26.6.1 reproduced a release crash with:

```text
RCTFatalException: Unhandled JS Exception: Invariant Violation:
scrollToIndex out of range: requested index 236 is out of 0 to 131
```

`useAdaptiveGridAnchor` remembered the visible **item** index and restored it
after the grid's column count changed. React Native FlatList expands viewability
callbacks to item indices, but forwards `scrollToIndex` to its internal
VirtualizedList, which groups multiple columns into **rows**. With 264 items and
two columns there are only 132 valid rows. Passing item index 236 directly
throws inside an animation-frame callback, outside the route error boundary.

The restoration now converts the visible item to a row index. Failed scroll
callbacks already contain a row index, so retries convert that index back to an
item before using the same restoration path. Each frame clamps against the
latest item count, skips empty lists, and rejects cancelled frames, old column
generations and callbacks after unmount. Retry attempts remain bounded.

Both the manga library and tag-detail grids use this shared hook.

## Regression checks

```sh
npm --prefix mobile test -- --runTestsByPath src/hooks/useAdaptiveGridAnchor.test.ts src/utils/grid.test.ts
npm --prefix mobile run typecheck
npm --prefix mobile test -- --silent
npm run typecheck
npm run build:all
```

The regression renders a real FlatList with 264 items, records visible item
236, and changes from four columns to two. Before the fix it throws the same
exception captured on the phone; after the fix it scrolls to row 118. Additional
checks cover retry indices, data shrinking, empty data, stale frames and the
retry limit.

For device verification, install a build containing the fix, load several pages
in the library or a tag, scroll well past the first screen, then repeatedly
rotate between portrait and landscape. Repeat while filtering or refreshing
reduces the item count, and after returning from the reader. The grid should
restore the visible row without exiting the app. Keep release source maps and
dSYMs with each build; capture the live console if another fatal callback occurs.
