# MangaDB

A self-hosted manga library server with a web UI and OPDS feed support.

## Features

- Browse and manage your manga collection through a web interface
- Tag-based organization with customizable tag types
- OPDS v1.2 catalog feed for compatibility with e-reader apps (e.g. Kyobook, Moon+ Reader)
- Download manga as ZIP archives
- REST API for programmatic access

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

The server runs at `http://localhost:3000` by default.

## Environment Variables

| Variable       | Default                                          | Description                            |
| -------------- | ------------------------------------------------ | -------------------------------------- |
| `DATABASE_URL` | `postgres://user:pass@localhost:5432/mangadb`    | PostgreSQL connection string           |
| `PORT`         | `3000`                                           | HTTP port the server listens on        |
| `DATA_DIR`     | `/data`                                          | Root directory where manga files live  |

## Data Directory

Manga image files are served directly from `DATA_DIR`. The `pages` field on each manga record stores the relative paths to page images within that directory.

## Docker

Images are published to GitHub Container Registry on every `v*` tag push.

```bash
docker run -d \
  -e DATABASE_URL=postgres://user:pass@db:5432/mangadb \
  -e DATA_DIR=/data \
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
    environment:
      POSTGRES_USER: manga
      POSTGRES_PASSWORD: manga
      POSTGRES_DB: mangadb
    volumes:
      - pgdata:/var/lib/postgresql/data

  app:
    image: ghcr.io/wang-hz/mangadb:latest
    depends_on:
      - db
    environment:
      DATABASE_URL: postgres://manga:manga@db:5432/mangadb
      DATA_DIR: /data
    volumes:
      - /your/manga:/data
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

## API Reference

### Health

| Method | Path      | Description              |
| ------ | --------- | ------------------------ |
| GET    | `/health` | Database connection check |

### Manga

| Method | Path                          | Description                  |
| ------ | ----------------------------- | ---------------------------- |
| GET    | `/api/mangadb/mangas`         | List mangas (paginated)       |
| GET    | `/api/mangadb/mangas/:uuid`   | Get manga by UUID             |
| PATCH  | `/api/mangadb/mangas/:uuid`   | Update manga metadata         |
| POST   | `/api/mangadb/mangas/:uuid/tags` | Add tags to a manga        |

### Tags

| Method | Path                      | Description              |
| ------ | ------------------------- | ------------------------ |
| GET    | `/api/mangadb/tags`       | List tags (paginated)     |
| POST   | `/api/mangadb/tags`       | Create a new tag          |
| GET    | `/api/mangadb/tag_types`  | List tag types (paginated)|

### Files

| Method | Path                                       | Description               |
| ------ | ------------------------------------------ | ------------------------- |
| GET    | `/api/file/mangas/:uuid`                   | Download manga as ZIP     |
| GET    | `/api/file/mangas/:uuid/pages/:pageNumber` | Serve a single page image |

### OPDS v1.2

Base path: `/api/opds/v1.2`

| Method | Path                        | Description                      |
| ------ | --------------------------- | -------------------------------- |
| GET    | `/catalog`                  | Root catalog (all tag types)     |
| GET    | `/tag_types/:tagType`       | Tags under a tag type            |
| GET    | `/tags/:tagUuid`            | Mangas for a specific tag        |
| GET    | `/tags`                     | Search tags by keyword           |
| GET    | `/mangas`                   | Search mangas by keyword         |
| GET    | `/mangas/latest`            | Latest mangas feed               |
| GET    | `/search`                   | OpenSearch description           |

## Building

```bash
# Build everything (frontend + backend)
npm run build:all

# Backend only
npm run build

# Frontend only
npm run web:build
```