# MangaDB

A self-hosted manga library server with a web UI and OPDS feed support.

## Features

- Browse and manage your manga collection through a web interface
- Online reader with flip and scroll modes; set the cover from within the reader; touch swipe gestures on mobile
- Tag-based organization with customizable tag types; inline tag editing on the detail page
- Batch operations: set publish date or add a tag across all mangas in a tag
- **Bulk import**: drag-and-drop ZIP/CBZ archives or image folders; filenames are auto-parsed for title, group, artist, event, parody, publish date, and tags
- OPDS v1.2 catalog feed for compatibility with e-reader apps (e.g. Kyobook, Moon+ Reader)
- Download manga as ZIP archives
- User authentication with admin/user roles and a first-time setup wizard
- Admin login log: view login history with username, IP, user agent, and result
- PWA support — installable on mobile devices
- Mobile-responsive UI with bottom tab navigation
- Docker support with images published to GitHub Container Registry

## Tech Stack

- **Backend**: Node.js, Express 5, TypeScript, Prisma ORM
- **Database**: PostgreSQL
- **Frontend**: React 18, Ant Design, Vite
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

## Docker

Images are published to GitHub Container Registry on every `v*` tag push.

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