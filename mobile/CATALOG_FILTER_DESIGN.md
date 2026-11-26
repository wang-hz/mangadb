# Catalog Search, Sorting, and Local State

## Query ownership

- Title search and sorting are part of the manga library's server query and its
  paginated React Query key.
- The manga library has no filter controls. Previously saved tags, publication
  years, reading-state, favorite, and download filters are ignored, both in
  server requests and when displaying loaded pages.
- Reading progress, favorites, and download state remain visible on manga cards.
- Stable manga UUIDs are used to deduplicate shifting offset pages.
- Tag details use the same sort controls as the manga library: recently updated,
  recently added, and publication date, with ascending/descending order. The tag
  UUID, search, sort field, and order are included in the paginated query key.
  Sort choices belong to the current tag screen only, default to updated time
  descending on a new visit, and survive opening a manga or reader and returning.

## Persistence and privacy

The last library search and sort state is stored per normalized server URL and
user UUID using the existing catalog storage format. Legacy filter fields may
remain stored but do not affect the manga library. Favorites use a separate
identity-scoped local set. Neither value is sent to another server or exposed to
another signed-in account.

Favorites are intentionally local-only for this release. They should be
included if a future encrypted local backup/export format is introduced. A
future cross-device favorite API requires authenticated ownership, migration of
the local set, and an explicit conflict rule before replacing this storage.

## Recent searches

Recent-search history is intentionally omitted. Retaining the single current
search provides continuity without accumulating sensitive title queries or
requiring another history-clearing surface. The search field can be cleared
directly.
