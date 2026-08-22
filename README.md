# MangaDB

A self-hosted manga library server with a web UI and OPDS feed support.

[中文说明](README.zh.md)

## Features

- Browse and manage your manga collection through a web interface
- Online reader with flip and scroll modes; set the cover from within the reader; touch swipe gestures on mobile
- Tag-based organization with customizable tag types; inline tag editing on the detail page
- Batch operations: set publish date or add a tag across all mangas in a tag
- **Bulk import**: drag-and-drop ZIP/CBZ archives or image folders; filenames are auto-parsed for title, group, artist, event, parody, publish date, and tags
- OPDS v1.2 catalog feed for compatibility with e-reader apps (e.g. KOReader, Moon+ Reader, Chunky, Panels); built-in setup guide under the user menu
- Download manga as ZIP archives
- User authentication with admin/user roles and a first-time setup wizard
- Admin login log: view login history with username, IP, user agent, and result
- PWA support — installable on mobile devices
- Mobile-responsive UI with bottom tab navigation
- Native Android and iPhone client for browsing, tags, manga details, and flip or continuous-scroll reading
- Multilingual UI: Simplified Chinese, Traditional Chinese, Japanese, English
- Docker support with images published to GitHub Container Registry

## Tech Stack

- **Backend**: Node.js, Express 5, TypeScript, Prisma ORM
- **Database**: PostgreSQL
- **Frontend**: React 18, Ant Design, Vite
- **Mobile**: Expo SDK 55, React Native, Expo Router, TanStack Query
- **Container**: Docker, published to GitHub Container Registry

## Prerequisites

- Node.js 20+
- PostgreSQL

## Getting Started

```bash
# Install dependencies
npm install
cd web && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL, PORT, and DATA_DIR

# Run database migrations
npx prisma migrate dev

# Start backend (dev mode with hot reload)
npm run dev

# Start frontend (in a separate terminal)
npm run web:dev
```

The server runs at `http://localhost:3000` by default. On first launch you will be redirected to a setup page to create the initial admin account.

## Expo Mobile App

The independent client under `mobile/` targets Android phones/tablets and iPhone/iPad with the application identifier `top.wanghaizhou.mangadb`. Its UI is Simplified Chinese and supports server setup, login, manga and tag browsing, manga details, paged and continuous-scroll readers, identity-isolated offline downloads, per-account local reading positions, settings, and logout.

The client does not include administration or cross-device synchronization.
Favorites, recent reading, and progress are stored locally and isolated by
server and user identity.

### Mobile toolchain

- Node.js 20.19.4 or later in the Node 20 line; this project was validated with Node.js 20.20.2
- Android Studio with JDK 17, Android SDK Platform 36, Build Tools 36.0.0, NDK 27.1.12297006, and CMake 3.22.1
- Xcode 26.2 and CocoaPods for iOS Simulator builds

Install the mobile dependencies separately; installing the repository root does not install `mobile/node_modules`:

```bash
npm --prefix mobile ci
```

The versions follow the [Expo SDK 55 compatibility matrix](https://docs.expo.dev/versions/v55.0.0/). See the [Android SDK setup guide](https://developer.android.com/about/versions/16/setup-sdk) when Platform 36 or Build Tools 36.0.0 are missing. With the Android SDK licenses accepted, the first Gradle build can install the pinned NDK and CMake automatically.

### Development and server connection

Start the API and Expo in separate terminals:

```bash
npm run dev
npm run mobile:dev
```

Use `npm run mobile:android` or `npm run mobile:ios` to generate and run a local native project. Useful server addresses are:

- Android Emulator: `http://10.0.2.2:3000`
- iOS Simulator: `http://localhost:3000`
- Physical phone on the same Wi-Fi: `http://<computer-LAN-IP>:3000` or a `.local` hostname

Public servers must use trusted HTTPS, and release artifacts are HTTPS-only by default. The app rejects public HTTP and does not bypass self-signed HTTPS certificate errors. iOS still includes the local-network usage description and the narrow ATS local-network exception needed by opted-in self-hosted builds.

To build a client for a trusted LAN server that has no TLS endpoint, opt in explicitly before native generation:

```bash
MANGADB_ALLOW_LAN_HTTP=true npm run mobile:build:android
MANGADB_ALLOW_LAN_HTTP=true npm run mobile:build:ios
```

An opted-in build permits loopback HTTP directly and asks for confirmation before saving a private-network IP or `.local` HTTP address. Public HTTP remains rejected by application-level validation. Android cannot express arbitrary RFC1918 addresses in Network Security Config, so its opt-in native capability is necessarily process-wide; the URL validator is the narrower enforcement boundary. Do not enable this option for public distribution.

### Validation

```bash
npm run mobile:typecheck
npm run mobile:test
cd mobile && npx expo install --check
```

The root `npm run build:all` command builds only the web client and API; run the native build commands below separately.

### Automated mobile releases

Pushing a `mobile-v*` tag runs the independent mobile release workflow. For example:

```bash
git tag mobile-v0.2.0
git push origin mobile-v0.2.0
```

The workflow validates the Expo project, builds both platforms in the default HTTPS-only mode, and creates a GitHub Release named `MangaDB Mobile 0.2.0` with:

- `mangadb-0.2.0.apk`: an Android test APK signed with the Expo template debug key
- `mangadb-0.2.0.ipa`: an unsigned iOS device application

The version embedded in each app is derived from the tag, while the native build number uses the GitHub Actions run number. The APK is intended for Android sideloading. The IPA must be re-signed with a valid Apple certificate and provisioning profile before it can be installed on a physical iPhone; it cannot be submitted directly to the App Store.

### Android test APK

The Release build requires JDK 17. On macOS, Android Studio's bundled runtime can be selected before building:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
npm run mobile:build:android
```

The APK is written to `mobile/android/app/build/outputs/apk/release/app-release.apk` and can be installed with `adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk`. It is signed with the Expo template's debug key for local testing and is not a store-distribution artifact.

Set `MANGADB_ALLOW_LAN_HTTP=true` on the same command only for a private sideloaded build that must connect to a trusted LAN HTTP server.

### iOS Simulator Release

```bash
npm run mobile:build:ios
```

To choose a specific simulator, list devices with `xcrun simctl list devices available`, then run `npm --prefix mobile run build:ios:simulator -- --device <simulator-UUID>`. The command builds, installs, and launches a Release Simulator app; it does not produce an IPA. The `.app` is normally under `~/Library/Developer/Xcode/DerivedData/MangaDB-*/Build/Products/Release-iphonesimulator/MangaDB.app`.

Simulator builds do not require an Apple Developer account. Physical iPhone installation and IPA output require Apple signing and provisioning and are outside this release's scope.

### Continuous Native Generation

`mobile/android/` and `mobile/ios/` are ignored generated directories. The native build scripts use a clean Expo prebuild, so do not make persistent changes inside them. A later clean Android build removes earlier Android build output; copy an APK elsewhere before rebuilding Android if it must be retained.

## Environment Variables

| Variable       | Default                                          | Description                            |
| -------------- | ------------------------------------------------ | -------------------------------------- |
| `DATABASE_URL` | `postgres://user:pass@localhost:5432/mangadb`    | PostgreSQL connection string           |
| `PORT`         | `3000`                                           | HTTP port the server listens on        |
| `DATA_DIR`     | `/data`                                          | Root directory where manga files live  |
| `JWT_SECRET`   | `change-this-secret`                             | Secret used to sign JWTs. Override in production. |
| `CORS_ORIGIN`  | _(unset)_                                        | Allowed CORS origin(s), comma-separated. Leave unset in production; set to `http://localhost:5173` for local development. |

## Data Directory

Manga image files are served directly from `DATA_DIR`. The `pages` field on each manga record stores the relative paths to page images within that directory.

### Large web imports

The web importer uses resumable upload sessions under `DATA_DIR/.uploads`, so archives larger than a reverse proxy's usual 1 MiB request limit do not need a larger Nginx body limit. ZIP/CBZ files and image folders are uploaded as 768 KiB chunks with four chunks in flight; a session is retained for 24 hours and can be resumed after a refresh or process restart. Each manga is limited to 10 GiB and 10,000 pages, and ZIP extraction is limited to 20 GiB. After all chunks arrive, import runs asynchronously and the page polls the session until it completes.

The existing `POST /api/admin/import/upload` multipart endpoint remains available for older clients and keeps its original fields and response. It is synchronous and is still subject to the configured proxy request-size and timeout limits; new web uploads use the session endpoints instead. Failed sessions retain their source chunks for retry or cancellation. Ensure `DATA_DIR` is persistent when running the application in a container.

## Docker

Pushing a `v*` tag runs the Docker-only release workflow and publishes the combined Web/API image to GitHub Container Registry for `linux/amd64`. Both the version tag and `latest` are updated:

```bash
git tag v0.5.0
git push origin v0.5.0
```

This produces `ghcr.io/wang-hz/mangadb:v0.5.0` and `ghcr.io/wang-hz/mangadb:latest`. Docker releases and `mobile-v*` releases are independent; neither workflow triggers the other.

```bash
docker run -d \
  -e DATABASE_URL=postgres://user:pass@db:5432/mangadb \
  -e DATA_DIR=/data \
  -e JWT_SECRET=your-secret \
  -v /your/manga:/data \
  -p 3000:3000 \
  ghcr.io/wang-hz/mangadb:latest
```

The container automatically runs `prisma migrate deploy` on startup.

### Docker Compose example

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: manga
      POSTGRES_PASSWORD: manga
      POSTGRES_DB: mangadb
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U manga -d mangadb"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  app:
    image: ghcr.io/wang-hz/mangadb:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://manga:manga@db:5432/mangadb
      DATA_DIR: /data
      JWT_SECRET: your-secret
    volumes:
      - /your/manga:/data
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

## OPDS

The OPDS v1.2 catalog is available at `/api/opds/v1.2/catalog`. It supports HTTP Basic Auth using your MangaDB username and password — no additional configuration required. A setup guide for common e-reader apps is available under the user menu → **OPDS Config**.

## Import Filename Convention

The import page auto-parses filenames using this pattern:

```
[YYYYMMDD] (Event) [Group (Artist)] Title｜Display Title (Parody) [tag1][tag2].zip
```

- `[YYYYMMDD]` or `[YYYY-MM]` → publish date
- `(Event)` → event tag
- `[Group (Artist)]` → group and artist tags; `[Author]` (no parens) → artist only
- `Title｜Display Title` → original and display title split on `｜`; single title used for both if no separator
- `(Parody)` trailing the title → parody tag
- `[tag]` → extra tags (tag type left blank, defaults to `other`)

All tag types are created automatically if they don't already exist.

## Deployment

For production or public-facing deployments:

- **Always place behind a reverse proxy** (e.g. Nginx, Caddy) that terminates TLS. Do not expose port 3000 directly to the internet.
- **Set a strong `JWT_SECRET`** — the default value `change-this-secret` is insecure.
- **Change the default database password** — do not use `manga`/`manga` from the example compose file.

## Building

```bash
# Build everything (frontend + backend)
npm run build:all

# Backend only
npm run build

# Frontend only
npm run web:build
```

Mobile builds are documented in [Expo Mobile App](#expo-mobile-app) and are intentionally not part of `build:all`.
