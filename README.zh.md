# MangaDB

自托管漫画库服务器，提供 Web 管理界面和 OPDS 订阅支持。

[English](README.md)

## 功能特性

- 通过 Web 界面浏览和管理漫画
- 在线阅读器，支持翻页和滚动模式；可在阅读器内设置封面；移动端支持触摸滑动翻页
- 标签体系，支持自定义标签类型；详情页内联编辑标签
- 批量操作：对某标签下的所有漫画批量设置出版日期或添加标签
- **批量导入**：拖放 ZIP/CBZ 压缩包或图片文件夹；自动解析文件名中的标题、社团、作者、活动、原作、出版日期和标签
- OPDS v1.2 订阅目录，兼容主流 e-reader 应用（KOReader、Moon+ Reader、Chunky、Panels 等）；用户菜单内置连接配置说明
- 以 ZIP 格式下载漫画
- 用户认证，支持管理员/普通用户角色，首次使用引导创建初始管理员账号
- 管理员登录日志：查看登录历史，包含用户名、IP、User-Agent 及结果
- PWA 支持，可安装至移动设备主屏
- 移动端响应式 UI，底部标签栏导航
- 多语言界面：简体中文、繁体中文、日本语、英文
- Docker 支持，镜像发布至 GitHub Container Registry

## 技术栈

- **后端**：Node.js、Express 5、TypeScript、Prisma ORM
- **数据库**：PostgreSQL
- **前端**：React 18、Ant Design、Vite
- **容器**：Docker，镜像发布至 GitHub Container Registry

## 运行要求

- Node.js 20+
- PostgreSQL

## 快速开始

```bash
# 安装依赖
npm install
cd web && npm install && cd ..

# 配置环境变量
cp .env.example .env
# 编辑 .env，填写 DATABASE_URL、PORT 和 DATA_DIR

# 执行数据库迁移
npx prisma migrate dev

# 启动后端（开发模式，支持热重载）
npm run dev

# 启动前端（另开终端）
npm run web:dev
```

服务默认运行在 `http://localhost:3000`。首次启动会跳转至初始化页面，创建管理员账号。

## 环境变量

| 变量           | 默认值                                           | 说明                                   |
| -------------- | ------------------------------------------------ | -------------------------------------- |
| `DATABASE_URL` | `postgres://user:pass@localhost:5432/mangadb`    | PostgreSQL 连接字符串                  |
| `PORT`         | `3000`                                           | HTTP 监听端口                          |
| `DATA_DIR`     | `/data`                                          | 漫画文件根目录                         |
| `JWT_SECRET`   | `change-this-secret`                             | JWT 签名密钥，生产环境必须修改         |
| `CORS_ORIGIN`  | _(未设置)_                                       | 允许的 CORS 来源，多个用逗号分隔。生产环境留空；本地开发设为 `http://localhost:5173` |

## 数据目录

漫画图片文件直接从 `DATA_DIR` 提供访问。每条漫画记录的 `pages` 字段存储页面图片相对于该目录的路径。

## Docker

每次推送 `v*` tag 时，镜像会自动发布至 GitHub Container Registry。

```bash
docker run -d \
  -e DATABASE_URL=postgres://user:pass@db:5432/mangadb \
  -e DATA_DIR=/data \
  -e JWT_SECRET=your-secret \
  -v /your/manga:/data \
  -p 3000:3000 \
  ghcr.io/wang-hz/mangadb:latest
```

容器启动时会自动执行 `prisma migrate deploy`。

### Docker Compose 示例

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

OPDS v1.2 订阅目录地址：`/api/opds/v1.2/catalog`，使用 MangaDB 用户名和密码通过 HTTP Basic Auth 连接，无需额外配置。用户菜单 → **OPDS 配置** 内有常见 e-reader 应用的配置说明。

## 导入文件名规范

导入页面按以下规则自动解析文件名：

```
[YYYYMMDD] (活动) [社团 (作者)] 原始标题｜显示标题 (原作) [tag1][tag2].zip
```

- `[YYYYMMDD]` 或 `[YYYY-MM]` → 出版日期
- `(活动)` → 活动标签
- `[社团 (作者)]` → 社团和作者标签；`[作者]`（无括号）→ 仅作者
- `原始标题｜显示标题` → 以 `｜` 分隔原始标题和显示标题；无分隔符时两者相同
- 标题后的 `(原作)` → 原作标签
- `[tag]` → 额外标签（标签类型留空，默认为 `other`）

所有标签类型若不存在会自动创建。

## 生产部署

面向公网或生产环境部署时请注意：

- **务必放在反向代理（Nginx、Caddy 等）后面**，由代理终止 TLS，不要将 3000 端口直接暴露至公网。
- **设置强 `JWT_SECRET`**，默认值 `change-this-secret` 不安全。
- **修改默认数据库密码**，不要使用示例 Compose 文件中的 `manga`/`manga`。

## 构建

```bash
# 构建全部（前端 + 后端）
npm run build:all

# 仅构建后端
npm run build

# 仅构建前端
npm run web:build
```
