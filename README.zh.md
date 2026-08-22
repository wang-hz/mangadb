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
- 原生 Android/iPhone 客户端，支持漫画与标签浏览、详情以及翻页/连续滚动阅读
- 多语言界面：简体中文、繁体中文、日本语、英文
- Docker 支持，镜像发布至 GitHub Container Registry

## 技术栈

- **后端**：Node.js、Express 5、TypeScript、Prisma ORM
- **数据库**：PostgreSQL
- **前端**：React 18、Ant Design、Vite
- **移动端**：Expo SDK 55、React Native、Expo Router、TanStack Query
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

## Expo 移动端

`mobile/` 下是独立的 Android/iPhone 客户端，双端应用标识均为 `top.wanghaizhou.mangadb`。界面使用简体中文，支持服务器配置、登录、漫画与标签浏览、漫画详情、翻页与连续滚动阅读、本机按账号隔离的阅读位置、设置和退出。

移动端只提供在线阅读，不包含管理功能、离线下载、收藏、历史列表或跨设备进度同步。

### 移动端环境

- Node.js 20 系列的 20.19.4 或更高版本；本项目已使用 Node.js 20.20.2 验证
- Android Studio 自带或独立的 JDK 17、Android SDK Platform 36、Build Tools 36.0.0、NDK 27.1.12297006 和 CMake 3.22.1
- iOS Simulator 构建需要 Xcode 26.2 和 CocoaPods

移动端依赖需要单独安装；安装仓库根目录依赖不会创建 `mobile/node_modules`：

```bash
npm --prefix mobile ci
```

版本要求遵循 [Expo SDK 55 兼容矩阵](https://docs.expo.dev/versions/v55.0.0/)。缺少 Platform 36 或 Build Tools 36.0.0 时，请参考 [Android SDK 36 配置说明](https://developer.android.com/about/versions/16/setup-sdk)。接受 Android SDK 许可后，首次 Gradle 构建可自动安装固定版本的 NDK 和 CMake。

### 开发与服务器连接

在两个终端分别启动 API 和 Expo：

```bash
npm run dev
npm run mobile:dev
```

使用 `npm run mobile:android` 或 `npm run mobile:ios` 生成并运行本地原生工程。常用服务器地址如下：

- Android Emulator：`http://10.0.2.2:3000`
- iOS Simulator：`http://localhost:3000`
- 同一 Wi-Fi 下的真机：`http://<电脑局域网-IP>:3000` 或 `.local` 主机名

公网服务器必须使用可信 HTTPS。应用会拒绝公共 HTTP，直接允许 loopback HTTP，私网 IP 或 `.local` 的 HTTP 需确认明文风险后才能保存；自签名 HTTPS 的证书错误不会被绕过。iOS 首次连接局域网服务器时会请求本地网络权限。Android 原生层为本地开发开放明文流量，公共 HTTP 限制由应用的地址校验执行。

### 验证

```bash
npm run mobile:typecheck
npm run mobile:test
cd mobile && npx expo install --check
```

根目录的 `npm run build:all` 只构建 Web 与 API；原生应用需使用下方命令单独构建。

### 自动发布移动端

推送 `mobile-v*` 标签会运行独立的移动端发布工作流。例如：

```bash
git tag mobile-v0.2.0
git push origin mobile-v0.2.0
```

工作流会验证 Expo 项目、构建两个平台，并创建名为 `MangaDB Mobile 0.2.0` 的 GitHub Release，其中包含：

- `mangadb-0.2.0.apk`：使用 Expo 模板调试密钥签名的 Android 测试 APK
- `mangadb-0.2.0.ipa`：未签名的 iOS 真机应用

应用内版本来自标签，原生构建号使用 GitHub Actions 的运行编号。APK 用于 Android 侧载；IPA 必须使用有效的 Apple 证书和 provisioning profile 重新签名后才能安装到 iPhone 真机，不能直接提交 App Store。

### Android 测试 APK

Release 构建需要 JDK 17。在 macOS 上可以直接选择 Android Studio 自带的运行时：

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
npm run mobile:build:android
```

产物位于 `mobile/android/app/build/outputs/apk/release/app-release.apk`，可使用 `adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk` 安装。该 APK 使用 Expo 模板的调试密钥签名，仅用于本地测试，不是应用商店发行包。

### iOS Simulator Release

```bash
npm run mobile:build:ios
```

如需指定 Simulator，先执行 `xcrun simctl list devices available`，再运行 `npm --prefix mobile run build:ios:simulator -- --device <Simulator-UUID>`。该命令会构建、安装并启动 Release Simulator 应用，不会生成 IPA。`.app` 通常位于 `~/Library/Developer/Xcode/DerivedData/MangaDB-*/Build/Products/Release-iphonesimulator/MangaDB.app`。

Simulator 构建不需要 Apple 开发者账号；iPhone 真机安装和 IPA 输出需要 Apple 签名与 provisioning，不在本轮交付范围内。

### Continuous Native Generation

`mobile/android/` 和 `mobile/ios/` 是已忽略的生成目录。原生构建脚本会执行 clean Expo prebuild，因此不要在这些目录中保存持久修改。后续 clean Android 构建会删除之前的 Android 产物；如需保留 APK，请在 Android 重建前复制到其他位置。

## 环境变量

| 变量           | 默认值                                           | 说明                                   |
| -------------- | ------------------------------------------------ | -------------------------------------- |
| `DATABASE_URL` | `postgres://user:pass@localhost:5432/mangadb`    | PostgreSQL 连接字符串                  |
| `PORT`         | `3000`                                           | HTTP 监听端口                          |
| `DATA_DIR`     | `/data`                                          | 漫画文件根目录                         |
| `JWT_SECRET`   | `change-this-secret`                             | JWT 签名密钥，生产环境必须修改         |
| `CORS_ORIGIN`  | _(未设置)_                                       | 允许的 CORS 来源，多个用逗号分隔。生产环境留空；本地开发设为 `http://localhost:5173` |

## 数据目录

漫画图片直接存放在 `DATA_DIR`，漫画记录中的 `pages` 字段保存该目录下的相对路径。

### 网页端大文件导入

网页端使用保存在 `DATA_DIR/.uploads` 的可续传分片会话，因此不需要调大反向代理常见的 1 MiB 请求体限制。ZIP/CBZ 和图片文件夹均按 768 KiB 分片、单部漫画最多四路并发上传；会话保留 24 小时，刷新页面或进程重启后可以继续。每部漫画源文件最多 10 GiB、10000 页，ZIP 解压后的图片总量最多 20 GiB。分片齐全后由服务端异步解压和入库，页面轮询处理状态。

现有 `POST /api/admin/import/upload` multipart 接口及其字段和响应继续保留，供旧客户端使用。该接口仍是同步请求，受现有 Nginx 请求体和超时限制；网页端新上传使用分片会话接口。失败会话会保留源分片，可重试或取消。容器部署时请确保 `DATA_DIR` 使用持久化卷。

## Docker

推送 `v*` 标签会运行仅发布 Docker 的工作流，将 Web/API 合并镜像以 `linux/amd64` 平台发布至 GitHub Container Registry，同时更新版本标签和 `latest`：

```bash
git tag v0.5.0
git push origin v0.5.0
```

以上操作会生成 `ghcr.io/wang-hz/mangadb:v0.5.0` 和 `ghcr.io/wang-hz/mangadb:latest`。Docker 发布与 `mobile-v*` 移动端发布相互独立，不会互相触发。

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

移动端构建见 [Expo 移动端](#expo-移动端)，并且不会包含在 `build:all` 中。
