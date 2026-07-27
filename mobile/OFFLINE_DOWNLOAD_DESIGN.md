# MangaDB Mobile Offline Download Design

## Scope

The first offline-download release must let an authenticated user download, pause, resume, retry, update, and delete a complete manga. A completed download must open after a cold launch in airplane mode without contacting the server.

This design covers app-owned storage, manifests, queue behavior, authentication boundaries, storage management, revision updates, and reader resolution. Cross-device download synchronization and server-side archive generation are out of scope.

## Security and ownership

Every download belongs to an exact identity:

```text
normalized server URL + user UUID + manga UUID
```

- Manifests and files are never resolved without the active server URL and user UUID.
- Access tokens are kept in SecureStore/session memory and are never written to manifests, filenames, logs, or telemetry.
- Logout and server switching stop active work and discard in-memory request contexts before session cache cleanup.
- Downloaded files are retained across logout and server switching, but remain hidden from all other identities. A matching login can use them again.
- Settings provide separate destructive actions for deleting the current identity's downloads and all offline content.
- Files rely on the iOS/Android application sandbox. Encrypting page files at rest is a possible later enhancement, not part of this release.

The identity directory name must be derived from a collision-resistant digest of the normalized server URL and user UUID. Raw server URLs, usernames, tokens, and titles must not be used as directory names.

## File layout

All content lives below an app-owned document directory so the operating system does not evict completed downloads:

```text
<document>/mangadb-downloads/v1/
  identities/
    <identity-digest>/
      identity.json
      mangas/
        <manga-uuid>/
          manifest.json
          pages/
            000000.page
            000001.page
          partial/
            000002.part
```

- `identity.json` contains the normalized server URL and user UUID for collision verification.
- Page extensions are storage-internal; the reader loads the local URI without inferring MIME type from the filename.
- Manifest and identity writes use a temporary file followed by an atomic move where supported.
- Temporary and orphaned files are reconciled on startup before new queue work begins.

## Manifest

The versioned manifest contains no credentials:

```ts
interface DownloadManifestV1 {
  schemaVersion: 1
  identity: {
    serverUrl: string
    userUuid: string
  }
  manga: {
    uuid: string
    displayTitle: string
    originalTitle: string
    publishDate: string | null
    cover: number | null
    updateAt: string
    pages: string[]
    mangaTags: MangaTagItem[]
  }
  state: 'queued' | 'downloading' | 'paused' | 'failed' | 'completed' | 'stale'
  requestedAt: string
  updatedAt: string
  completedAt: string | null
  failure: {
    code: DownloadFailureCode
    message: string
    pageIndex?: number
  } | null
  pages: Array<{
    index: number
    state: 'pending' | 'downloading' | 'completed' | 'failed'
    bytesWritten: number
    expectedBytes: number | null
    etag: string | null
    lastModified: string | null
    attempts: number
  }>
}
```

Runtime-only state, including AbortControllers and promises, is not persisted. A manifest found in `downloading` state after process death is normalized to `paused` during reconciliation.

## State transitions

```text
queued -> downloading -> completed
   |          |   |
   |          |   +-> failed -> queued
   |          +-----> paused -> queued
   +----------------> paused

completed -> stale -> queued -> downloading -> completed
```

- Cancel means transition to `paused`, stop future pages, abort the current fetch, and retain valid completed pages.
- Delete removes the whole manga directory only after queue ownership has been released.
- Retry resets failed pages to pending and keeps verified completed pages.
- Manga revision changes transition completed/paused downloads to `stale`.

## Download and resume behavior

- The queue uses a small global concurrency limit. The initial value is two manga jobs with one page request per manga, and can be adjusted after physical-device testing.
- A page is written to `partial/<index>.part`, validated, and moved to `pages/<index>.page`.
- If the server supports `Content-Length`, the completed byte count must match it. Empty responses are always rejected.
- `ETag` and `Last-Modified` are recorded when available. Manga `updateAt` remains the authoritative revision because the current page API does not publish content hashes.
- Partial byte-range resume is enabled only when the server advertises byte ranges and returns a valid `206` response. Otherwise the partial page is restarted safely.
- A process restart resumes from the first non-completed page after explicit user resume or automatic queue restoration, depending on the persisted state.
- 401 expires the session through the existing API/session flow and pauses the job.
- Retryable transport failures use bounded exponential backoff. Other 4xx responses fail immediately.

## Network policy

- Wi-Fi-only is enabled by default for managed downloads.
- Offline state pauses queued and active work without counting an attempt.
- Expensive connections and cellular connections pause work when Wi-Fi-only is enabled.
- Changing the setting to allow cellular resumes eligible jobs explicitly and displays the expected data-use warning.
- Reader prefetch and managed downloads use separate schedulers; managed downloads take priority and must not be stored in the evictable image cache.

## Storage checks and limits

- Before starting, estimate required bytes from known page sizes when available. When sizes are unknown, require a conservative free-space reserve.
- Recheck free space before every page and stop before the reserve would be crossed.
- The initial reserve is the greater of 256 MiB or 5% of total device capacity, subject to what the platform API can report reliably.
- Storage usage is calculated from manifests/files and exposed in Settings.
- Failed and abandoned partial files are removed during reconciliation.
- Completed downloads are never removed automatically by cache eviction. Only explicit deletion or a documented future retention policy may remove them.

## Revision and update handling

- Catalog/detail data compares server `updateAt` with the downloaded manifest revision.
- A mismatch marks the download stale but keeps it readable until the user updates or deletes it.
- Updating creates a new pending plan, reuses pages only when validators prove they are unchanged, and does not destroy the last complete readable revision until replacement succeeds.
- If dual-revision storage cannot fit, the UI asks the user to delete/redownload instead of silently removing the working copy.

## Reader resolution

The reader resolves each page in this order:

1. A completed, identity-matching local page from a valid manifest.
2. The authenticated network image source.

When the device is offline:

- Completed downloads open from locally stored metadata and pages.
- Partial downloads show only a download-management action; the reader does not present a partial manga as complete.
- Missing or corrupt local pages produce a local-corruption error and a repair/redownload action.

Local progress keeps the existing server/user/manga namespace and works unchanged in airplane mode.

## UI surfaces

- Manga detail: download, pause, resume, retry, update, and delete actions with bytes/pages progress.
- Manga cards: queued/downloading/downloaded/stale/failed badges.
- Downloads screen: active, queued, paused, failed, completed, and stale sections.
- Settings: Wi-Fi-only toggle, concurrency-independent storage usage, delete current identity downloads, and clear all offline content.
- Global download status: non-blocking progress and actionable failure state without exposing file paths or request URLs.

## Implementation slices

1. Add direct filesystem and digest dependencies supported by the current Expo SDK.
2. Implement identity keys, paths, manifest validation/migration, and atomic persistence.
3. Implement reconciliation and storage accounting.
4. Implement the abortable authenticated page downloader and queue state machine.
5. Integrate NetInfo, Wi-Fi-only policy, retry/backoff, and session cleanup.
6. Add download APIs/context and query/cache invalidation boundaries.
7. Add manga-detail actions, card badges, Downloads screen, and Settings storage controls.
8. Add local metadata/page resolution to detail and reader routes.
9. Run cold-launch airplane-mode, low-storage, interruption, revision, and account-isolation acceptance.

Each slice must include unit/component tests, `npm run typecheck`, `npm test -- --runInBand`, a TODO update, and an independent conventional commit.

## Required verification

- Interrupted download and process restart.
- Pause/resume and duplicate queue requests.
- Offline and Wi-Fi/cellular transitions.
- Low storage and abandoned partial cleanup.
- Logout, account switch, and server switch while a request is active.
- Expired session during a page request.
- Revision changes with a previously complete download.
- Corrupt/missing local files.
- Deletion during queued, paused, failed, and completed states.
- Cold app launch in airplane mode followed by complete reading and progress restoration.
