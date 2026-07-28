# Catalog Filtering and Local State

## Query ownership

- Title search, sorting, selected tags, and publication-year bounds are part of
  the server query and its paginated React Query key.
- Multiple selected tags use AND semantics: a manga must contain every selected
  tag.
- Reading state, favorite state, and complete-download state remain local. They
  are applied to loaded server pages without changing the server-reported total.
  The UI labels the visible count separately and offers continued pagination
  when the loaded range has no local matches.
- Stable manga UUIDs are used to deduplicate shifting offset pages.

## Persistence and privacy

The last search, sort, and filter state is stored per normalized server URL and
user UUID. Favorites use a separate identity-scoped local set. Neither value is
sent to another server or exposed to another signed-in account.

Favorites are intentionally local-only for this release. They should be
included if a future encrypted local backup/export format is introduced. A
future cross-device favorite API requires authenticated ownership, migration of
the local set, and an explicit conflict rule before replacing this storage.

## Recent searches

Recent-search history is intentionally omitted. Retaining the single current
search provides continuity without accumulating sensitive title queries or
requiring another history-clearing surface. Clearing the search field or using
the filter reset remains explicit and predictable.
