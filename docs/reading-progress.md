# Reading progress synchronization

Android, iOS and the web reader synchronize reading positions, paged/scroll mode,
reading/completed state and recent-reading visibility for the same user on the
same MangaDB server. Favorites, downloads, zoom, brightness and reader preferences
remain device-local. OPDS clients do not participate in this protocol.

## Upgrade

Apply the new migration before deploying the API and clients:

```bash
npx prisma migrate deploy
npm run prisma:generate
npm run build:all
```

The `reading_progress` table is owned by `(user_uuid, manga_uuid)`. Deleting a
user or manga cascades to its progress. No environment variables are added.
Mobile clients automatically import their existing identity-scoped progress once,
including older standalone manga keys, using the original reading timestamps.
Untimed legacy unread tombstones cannot establish cross-device ordering and are
not uploaded as fresh deletions. Local entries missing from the server are removed
when an upload acknowledges that the manga no longer exists.

## Synchronization and conflicts

Both clients persist local state and a coalesced upload queue before confirming a
save. The mobile queue lives alongside its authoritative progress index in
AsyncStorage; the web queue uses IndexedDB transactions that serialize writes
across tabs. Failed requests retain the queue for retry, including after restart.
New local edits made during an upload cannot be cleared by that upload's response.

Synchronization runs at login, foreground/focus, reconnect and reader entry,
periodically every 15 seconds while active, and on reader exit/background as a
best effort. Manual refresh requests a sync without blocking access to local data.
Reader startup waits up to 1.2 seconds for sync and then uses the available local
position. Remote changes update catalog/detail/recent state; an open reader keeps
its position until the next visit. Explicit page/mode URL parameters override
saved progress. Recent reading retains up to 100 visible manga summaries; older
progress remains available for continuation.

The winning operation is the one with the latest millisecond timestamp; equal
timestamps use the lexically greater operation UUID. PostgreSQL performs the
comparison atomically. Upload arrival order and page distance do not determine
the winner, so backward reading and explicit rereads are supported. Devices use
server-time calibration for new operations. Ordinary historical imports retain
their timestamps; impossible future queued timestamps are corrected after clock
calibration. Operation times still depend on reasonably accurate device clocks
while offline, so this is not a causal ordering guarantee across disconnected
devices.

Marking unread stores a timestamped deletion tombstone rather than removing the
server row. Removing from recent preserves position/completion and stores the
visibility change. Reopening unhides the manga. Rereading resets position and
completion. Reaching the final page marks completion; a one-page reread remains
reading until a subsequent reading visit. Current page counts constrain restored
and submitted page indexes.

## API

All endpoints require the existing bearer-token or cookie authentication under
`/api/mangadb/reading-progress`. Ownership always comes from authentication, never
from a body/query user UUID. Web clients send `X-MangaDB-User` as an assertion;
a different authenticated user returns 403 before reading or writing any progress.
Responses use `Cache-Control: no-store` and vary on the assertion header. The PWA
uses a dedicated `NetworkOnly` route for progress; IndexedDB supplies offline state.

- `GET /`: query `limit` (1–100, default 100) and optional `after` manga UUID.
  Returns `{ items, next, serverTime }`, ordered by manga UUID, including tombstones.
- `GET /:uuid`: returns `{ item, serverTime }`; `item` is null if no progress exists.
- `POST /`: accepts `{ operations }` (1–100 entries) and returns
  `{ items, missing, serverTime }` with canonical winners and missing manga UUIDs.
  Partial success before an interrupted request is safe to retry with the same
  operation IDs. Invalid payloads return 400. Timestamps more than one minute
  ahead of server time return 409 with `serverTime` before writes begin.

An operation contains:

```ts
{
  mangaUuid: string
  pageIndex: number // zero-based integer
  mode: 'paged' | 'scroll'
  state: 'reading' | 'completed'
  hiddenFromRecent: boolean
  deleted: boolean
  updatedAt: string // ISO UTC timestamp with millisecond precision
  operationId: string // UUID, stable across retries
}
```

Canonical records also include `pageCount` and a `manga` summary with UUID, titles,
publication date, cover index and creation/update timestamps. A submitted operation
losing a conflict receives the existing winner; retries do not refresh its time.

## Verification

```bash
npm test
npm run typecheck
npm run build:all
npm run mobile:typecheck
npm run mobile:test
```

Database/HTTP tests are skipped by the default suite and must run against a
separately migrated disposable PostgreSQL database:

```bash
PROGRESS_TEST_DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/TEST_DB' npm run test:progress:integration
```

Coverage includes atomic concurrent writes, user isolation, authentication,
stale-tab assertions, repeated/out-of-order uploads, deletion tombstones, missing
manga, migration, offline queue recreation, edits during upload, scrolling page
selection and URL overrides. Browser acceptance additionally covers two isolated
browser contexts, the actual mobile `ApiClient` exchanging progress with the web,
offline edits followed by reload, immediate exit after reread, tab notifications
and an installed service worker across a cookie/account change.

Physical Android/iOS device acceptance remains a release check: verify background
termination, downloaded offline manga, reconnection and account/server changes.
