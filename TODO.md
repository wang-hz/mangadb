# TODO

## 核心功能缺失

### 漫画导入
目前 `pages` 字段（JSON 文件路径数组）和漫画记录需要直接写入数据库，没有从 `DATA_DIR` 扫描文件系统并自动入库的机制。需要实现：
- 后端扫描接口：扫描 `DATA_DIR/<uuid>/` 目录，读取图片文件列表，写入 `Manga.pages`
- 或批量导入接口：接受目录名，自动创建 Manga 记录并填充 `pages`

### 在线阅读
前端只有封面预览和 CBZ 下载，没有翻页阅读功能。可在漫画详情页增加阅读模式（左右翻页或滚动条），复用现有 `/api/file/mangas/:uuid/pages/:page` 接口。

### ~~退出登录~~ ✅
已实现 `POST /api/auth/logout`，清除 httpOnly `token` cookie；前端 `handleLogout` 同步调用该接口再清除 localStorage。

### 漫画删除
没有删除漫画的 API（`DELETE /api/mangadb/mangas/:uuid`）和对应前端操作。删除时需决定是否同步删除 `DATA_DIR` 中的文件。

### Tag 编辑与删除
- 只能创建 Tag，无法重命名、更改所属 TagType 或删除
- 需要 `PATCH /api/mangadb/tags/:uuid`（改名/改类型）和 `DELETE /api/mangadb/tags/:uuid` 接口
- Tag name 在数据库层面是全局唯一约束，与按 TagType 隔离的直觉不符，删除前需评估

### TagType 管理
没有创建、编辑、删除 TagType 的 API 或前端页面，目前只能直接操作数据库。需要：
- `POST /api/mangadb/tag_types`、`PATCH /api/mangadb/tag_types/:uuid`、`DELETE /api/mangadb/tag_types/:uuid`
- 前端管理页面（或在现有 TagListPage 中集成）

---

## 健壮性

### ~~全局错误处理~~ ✅
Express 5 自动将 async 路由中的 rejected promise 传给 `next()`；在 `app.ts` 末尾新增四参数错误处理 middleware，数据库/服务异常统一返回 500。同时修复了 `getZip` 中 `archive.on('error', throw)` 在 event callback 中无法被捕获的问题。

### ~~文件流错误处理（`getImg`）~~ ✅
在 `createReadStream` 上监听 `'error'` 事件：ENOENT 返回 404，其他错误返回 500；仅在 `!res.headersSent` 时发送响应。

### ~~API 输入验证~~ ✅
引入 `zod`，为所有 POST/PATCH 请求体添加 schema 校验：auth 控制器（setup、login、createUser、changePassword）和 mangadb 控制器（updateManga、createMangaTags、createTag、batchAddTag、batchSetDate）。校验失败返回 400 + `error.flatten()` 详情。

### ~~OPDS 分页参数~~ ✅
`getPage()` 改为 `parseInt(query, 10)`，并用 `Number.isInteger(n) && n > 0` 校验，非法值 fallback 为 1。

---

## 安全性

### ~~登录接口无速率限制~~ ✅
已使用 `express-rate-limit` 限制 `POST /api/auth/login`：15 分钟窗口内同一 IP 最多 10 次，超限返回 429。

### ~~防止删除最后一个管理员~~ ✅
`deleteUser` 删除前先查目标用户角色，若为 admin 且当前只剩一个 admin，返回 400 拒绝删除。

### ~~JWT 无法撤销~~ ✅
使用数据库黑名单（`token_blacklist` 表）实现 JTI 级别的 token 撤销。login 时写入 `jti`，logout 时将 jti 插入黑名单；auth 中间件每次验证后查询黑名单。退出登录后旧 token 立即失效。

---

## 用户体验

### 批量操作作用范围
「批量设置出版日期」和「批量添加标签」的操作范围是该 Tag 下的**全部**漫画，而非当前搜索/筛选后的结果。弹窗提示中的数量是分页总数，用户可能误解为当前可见条目。需在 UI 上明确说明，或支持按当前筛选范围批量操作。

### 下载文件名
`GET /api/file/mangas/:uuid` 返回的 CBZ 文件名为 UUID（`Content-Disposition: attachment; filename=<uuid>.cbz`），不直观。应改为使用 `manga.displayTitle` 或 `manga.fullname`，并做文件名安全处理（去除特殊字符）。

### ~~OPDS 封面图 Content-Type~~ ✅
新增 `coverMimeType(pages, cover)` 辅助函数，从封面文件名通过 `mime-types` 推断类型，fallback 为 `image/jpeg`。`getTagsResContent` 和 `getMangasResContent`（含 PSE stream 链接）均改用动态类型。

### ~~前端图片无降级处理~~ ✅
`MangaDetailPage` 的主封面和封面选择器缩略图均添加 `onError` 回调，加载失败时替换为 2:3 灰色 SVG 占位图，并置空 `onerror` 防止循环触发。

### ~~漫画列表缺少封面缩略图~~ ✅
新增 `CoverImage` 和 `MangaGrid` 组件；`MangaListPage` 和 `TagMangaListPage` 工具栏新增 `Segmented` 视图切换（`BarsOutlined` 列表 ↔ `AppstoreOutlined` 卡片），偏好持久化到 `localStorage`。卡片视图使用 CSS Grid 自动分列，封面图 2:3 `object-fit: cover`，加载失败降级为灰色 SVG 占位图，顶部和底部各有独立分页控件。

---

## 部署与运维

### ~~缺少容器化配置~~ ✅
已提供完整容器化配置：
- `Dockerfile`：多阶段构建（`$BUILDPLATFORM` 编译前后端 → `$TARGETPLATFORM` 生产镜像），Prisma CLI 从 builder 复制，避免 npx 网络下载；`dumb-init` 作 PID 1，`/health` 端点健康检查，非 root `nodejs` 用户运行
- `docker-compose.yml`：`app` 服务 + `postgres:16-alpine`，data 和 db 均挂载具名卷，db 健康检查通过后 app 才启动
- `.dockerignore`：排除 `node_modules`、`dist`、`.env`、`.git` 等不必要文件，加速构建上下文

快速启动：
```bash
# 复制并编辑 .env（至少修改 POSTGRES_PASSWORD 和 JWT_SECRET）
cp .env.example .env
docker compose up -d
```

### 数据库备份
没有备份策略说明或脚本。DATA_DIR 的文件备份和数据库 pg_dump 均未涉及。

---

## 代码质量

### ~~控制器直接实例化服务~~ ✅
各 service 文件导出单例实例，controller 和 middleware 改为 named import，全进程只存在一个实例。

### ~~OPDS `getMangasResContent` 冗余 async~~ ✅
已移除 `async` 关键字。

### ~~前端缺乏统一请求状态管理~~ ✅
新增 `web/src/hooks/usePagedData.ts`，封装 loading/error/items/total 状态及竞态取消逻辑；MangaListPage、TagListPage、TagMangaListPage 均已迁移。