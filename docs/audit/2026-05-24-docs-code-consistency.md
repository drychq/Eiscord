# Eiscord 代码 vs docs/dev 文档一致性审核报告

**审核日期**: 2026-05-24
**审核分支**: `develop`（基线提交 `dd40ed4`）
**审核范围**: `docs/dev/` 全部 12 份开发文档 × `apps/api/`、`apps/web/`、`apps/media/`、`packages/shared/`、`prisma/`、根级配置
**审核方法**: 全量交叉比对（事实抽取 → 差异定位 → 行级引用）
**输出口径**: 只列差异与一致结论，不修改任何代码或文档

---

## v3 修复记录（2026-05-24 下午）

附录 B 的 **P0（4 项）+ P1（8 项）共 12 项**已在本次实施中修复。修复后通过 `pnpm typecheck`、`pnpm lint`、`pnpm test` 三道质量门（packages/shared 23 + apps/web 1 + apps/api 107 共 131 个测试用例全部通过）。

| 编号 | 处置 | 修复对象（核心文件） |
|------|------|---------------------|
| C6 | 修文档 | `CLAUDE.md:95` + `docs/dev/07-permission-security.md:100` 将密码哈希声明改为 `PBKDF2-SHA256（310,000 迭代）` |
| C8 | 修代码 | `packages/shared/src/constants/enums.ts:29` `Withdrawn → Retracted: 'RETRACTED'`；`apps/web/src/shared/components/MessageBubble.tsx` 同步比较字符串与变量名；`docs/dev/04-data-model.md:179` 取值改大写 |
| C1 | 修文档 | `docs/dev/04-data-model.md` VoiceSession 字段表删 `mediaRegion`，补 `negotiationDeadline / routerId / sendTransportId / recvTransportId / updatedAt` |
| C7 | 修文档 | `docs/dev/05-api-contracts.md` ErrorCode 表新增 `INVALID_CREDENTIALS`（401）并附与 `AUTH_REQUIRED` 的区分说明 |
| C9 | 修代码 + 文档 | `packages/shared/src/constants/enums.ts` 新增大写 `VoiceMediaState`；`prisma/schema.prisma` VoiceSession 默认值改大写；`apps/api/.../voice.service.ts` + `media-signaling.service.ts` + `mediasoup-router.registry.ts` 全部魔法字符串迁移到 enum；`apps/web/.../voice-client.ts` type alias 引用 `VoiceMediaState` 并改写所有 `setStatus`；`packages/shared/src/schemas/voice-media.ts` + `voice.ts` 同步大写；所有相关 spec 数据更新；3 份文档（01/03/04）取值描述同步 |
| C5 | 修文档 | `docs/dev/07-permission-security.md` 权限位章节后新增 "PermissionBit vs PermissionAction" 小节，列 14 个 Action 与 3 个内置 Action |
| C2 + C3 | 修文档 | `docs/dev/04-data-model.md` 新增 `MessageMention` + `AuthSession` 两个小节 |
| W19 | 修文档 | `docs/dev/04-data-model.md` VoiceConnectionStatus 取值补 `RECONNECTING` 并改大写 |
| W12 + W29 | 修文档 | `docs/dev/06-realtime-events.md` 新增服务端事件 `SyncState` 小节、客户端事件表新增 `SyncState` 行、重连补偿章节追加 SyncState 服务端补偿说明 |
| C10 | 修文档 | `docs/dev/01-tech-stack-and-repo-structure.md` 前端 features 列表移除 `permissions/`（实际为 8 个：auth/profile/friends/servers/channels/messages/notifications/voice） |
| C11 | 修文档 | `docs/dev/01-tech-stack-and-repo-structure.md` shared 子目录补 `state/` 与 `utils/` |
| C12 | 修文档 | `docs/dev/08-frontend-design.md` 错误处理表删除 3 个 `VOICE_*` 伪错误码，新增 `INVALID_CREDENTIALS` 行并追加 voice-client 客户端层异常处理说明 |

**未修复**：P2（13 项 W3-W8 等）保留至后续迭代；C8 的 data migration 按用户决策跳过（dev 环境用 `pnpm db:reset` 重建）；schema 默认值变更需在下一次 `pnpm db:migrate` 时生成对应迁移文件，无数据变更。

---

## 摘要

| 等级 | 数量 | 含义 |
|------|------|------|
| 🔴 **Critical** | **11** | 误导新成员、影响安全/契约理解，必须修复 |
| 🟡 **Warning** | **22** | 文档与代码一方落后另一方，建议修复但不阻塞 |
| 🟢 **Info** | **11** | P1 延后能力 / 命名风格 / 大小写差异，仅记录 |
| ✅ **完全一致** | **7 大类** | `package.json` scripts、12 个业务模块清单、错误码 HTTP 映射、JWT 双 token 设计、Redis 运行期键、AppModule 全局守卫顺序、前端核心技术栈与路由结构 |

**总体诊断**：文档的"骨架描述"（模块清单、端点路径、事件名、错误码 HTTP 码）准确度高（≈90%）；但"细节字段"（枚举取值、字段拼写、字段是否存在、安全算法名）准确度明显下降（≈60%），M5.5 与 M6 期间的代码演进未及时反向同步回文档。

**最高优先级修复 3 条**（详见附录 B）：
1. 🔴 密码哈希声明（Argon2id → PBKDF2-SHA256）—— 涉及安全审计
2. 🔴 `MessageVisibility` 枚举值（`retracted` → `WITHDRAWN`）—— 涉及契约可用性
3. 🔴 `VoiceSession.mediaRegion` 字段缺失 —— 涉及数据模型理解

**前端新增最值得关注 3 条**（见 §10）：
1. 🔴 `features/permissions/` 文档承诺但代码不存在（C10）
2. 🔴 `VOICE_DEVICE_DENIED / VOICE_NEGOTIATION_TIMEOUT / VOICE_TURN_UNAVAILABLE` 三个错误码文档列出但 ErrorCode 中不存在（C12）
3. 🟡 前端测试覆盖严重不足，仅 1 个 spec.ts 文件 vs 文档承诺的"全面组件单测"（W26）

---

## 1. 仓库结构与技术栈

### 1.1 完全一致项 ✅

| 维度 | 文档来源 | 代码实证 |
|------|---------|---------|
| 顶层目录 `apps/` `packages/` `prisma/` `docker/` `docs/` `docker-compose.yml` | `01-tech-stack-and-repo-structure.md § 单仓库目录` | 实际目录 ✓ |
| `apps/web` `apps/api` `apps/media` 三应用 | 同上 | `D:/Desktop/Eiscord/apps/` 实际包含 api/web/media |
| `pnpm-workspace.yaml` 含 `apps/*` + `packages/*` | 隐含 | `pnpm-workspace.yaml:1-3` ✓ |
| 技术栈：NestJS + React + Prisma + PostgreSQL + Redis + Socket.IO + MinIO + mediasoup + coturn | `01-tech-stack-and-repo-structure.md § 技术栈表` | 全部对应实体存在 ✓ |
| `/api/v1` 前缀 + `/realtime` 命名空间 | 同上 | `apps/api/src/common/bootstrap/configure-api-app.ts:15` 设 `setGlobalPrefix('api/v1')`；`apps/api/src/modules/realtime/realtime.gateway.ts:54-59` 设 `namespace: '/realtime'` |
| UUID 主键 + ISO 8601 时间戳 | 同上 | 全部 Prisma model 使用 `@db.Uuid` + `@db.Timestamptz(6)` ✓ |

### 1.2 不一致项

#### 🟡 W1 — `packages/config` 未在文档目录树中出现

- **文档**: `docs/dev/01-tech-stack-and-repo-structure.md § 单仓库目录` 列 `packages/shared` 与 `packages/config`，看似都在仓库
- **代码现状**: `D:/Desktop/Eiscord/packages/` 实际包含 `config/` 与 `shared/` 两个目录 ✓ 一致
- **结论**: 文档与代码 ✓ 一致；本条澄清留作记录

#### 🟡 W2 — `apps/media` 在 docker-compose 中的角色文档/代码描述存在歧义

- **文档**: `docs/dev/01-tech-stack-and-repo-structure.md` 描述 `apps/media` 为"API spawn 的 Node 子进程，承载 SFU 路由"；`docs/dev/11-deployment-ops.md:34` 又说"Docker Compose 中的 `mediasoup` 服务是独立运行/健康检查用入口，当前本地开发默认不依赖它"
- **代码现状**: `docker-compose.yml:75-93` 确实定义了独立 `mediasoup` 服务（command 是 `node apps/media/dist/main.js`），网络模式 `host`；同时 API 也会按需 spawn `apps/media/dist/main.js` 作子进程
- **影响**: 文档语义清晰，但**两种启动方式（子进程 vs 独立容器）的优先级与依赖关系未在一份文档中完整说明**，新成员第一次跑 `pnpm dev` 时容易困惑
- **建议处置**: 修文档，在 `docs/dev/11-deployment-ops.md` 增加一段"mediasoup 双启动模式对比表"

---

## 2. 后端模块清单

### 2.1 完全一致项 ✅

| 模块 | 文档（`03-module-design.md`） | 代码（`apps/api/src/modules/`） |
|------|-------------------------------|-------------------------------|
| AuthModule | ✓ | `auth/auth.module.ts` ✓ |
| UsersModule | ✓ | `users/` ✓ |
| FriendsModule | ✓ | `friends/friends.module.ts` ✓ |
| ServersModule | ✓ | `servers/servers.module.ts` ✓ |
| ChannelsModule | ✓ | `channels/channels.module.ts` ✓ |
| MessagesModule | ✓ | `messages/messages.module.ts` ✓ |
| NotificationsModule | ✓ | `notifications/notifications.module.ts` ✓ |
| PermissionsModule | ✓ | `permissions/permissions.module.ts` ✓ |
| VoiceModule | ✓ | `voice/voice.module.ts` ✓ |
| MediaSignalingModule | ✓ | `media-signaling/media-signaling.module.ts` ✓ |
| RealtimeModule | ✓ | `realtime/realtime.module.ts` ✓ |
| AuditModule | ✓ | `audit/audit.module.ts` ✓ |

**全 12 个业务模块文档与代码完全对齐 ✓**

### 2.2 不一致项

#### 🟡 W3 — AppModule 多注册了 2 个文档未列模块

- **文档**: `docs/dev/03-module-design.md § 模块总览` 列 12 个业务模块
- **代码**: `apps/api/src/app.module.ts:37-50` 额外注册 `HealthModule`、`AttachmentsModule`
- **影响**: 模块依赖图不完整；新成员看文档以为没有附件处理模块
- **建议处置**: 修文档，把 `HealthModule` 和 `AttachmentsModule` 补入模块总览表（前者承载健康检查 + 测试专用端点；后者承载附件上传/完成/访问）

#### 🟡 W4 — `@RequirePermissionForParam` 端点数量描述偏差

- **文档**: `docs/dev/03-module-design.md:28`（M4 任务交付物） — "`@RequirePermissionForParam` 已接入 4 个 Controller（14 个端点）"
- **代码**: Grep `@RequirePermissionForParam` 实际命中 **12 个端点**（voice:1 + messages:2 + channels:3 + servers:6）
- **影响**: 数字描述过时，可能 2 个端点已被移除或合并
- **建议处置**: 修文档为"12 个端点"

#### 🟢 I1 — `M5 实时与语音状态` 声明的 13 个服务端事件

- **文档**: `docs/dev/03-module-design.md:29` — "13 个服务端事件发布"
- **代码**: `packages/shared/src/constants/realtime-events.ts` 实际 RealtimeEvent 共 **21 个**（13 个服务端通知事件 + 7 个媒体信令事件 + 1 个 SyncState）
- **影响**: 表述无误（13 指 M5 阶段交付的"业务通知事件"），但**与 M5.5 媒体信令事件未在此处合并描述**，容易让人误以为媒体信令事件不在 RealtimeEvent 枚举内
- **建议处置**: 可在 `03-module-design.md M5.5` 一行补充"新增 7 个媒体信令事件 + 1 个 `SyncState`，共 21 个枚举值"

---

## 3. 数据模型（Prisma schema vs 04-data-model.md）

### 3.1 表数量与基础结构 ✅

文档列出 **18** 个实体（不含 `AuthSession` 与 `MessageMention`），代码实际有 **19** 个 model：

| 实体 | 文档 | 代码 |
|------|------|------|
| User / Friendship / DirectConversation / Server / Invitation / Membership / Role / MembershipRole / Channel / PermissionOverwrite / Message / Attachment / MessageAttachment / ReadState / VoiceSession / Notification / AuditLog | ✓ | ✓ |
| **AuthSession** | ✗ 文档未列 | ✓ `prisma/schema.prisma:45-62`（含 refreshTokenHash、clientDeviceName、clientTimezone、expiresAt 等字段） |
| **MessageMention** | ✗ 文档未列 | ✓ `prisma/schema.prisma:293-304`（复合主键 messageId+mentionedUserId） |

### 3.2 不一致项

#### 🔴 C1 — `VoiceSession.mediaRegion` 字段在 schema 中**不存在**

- **文档**: `docs/dev/04-data-model.md:246` — "`mediaRegion` | 媒体路由分区占位，默认 `local`，预留多区扩展"
- **代码**: `prisma/schema.prisma:346-369` VoiceSession 完整字段列表 **无** `mediaRegion` / `media_region`（Grep 整个仓库该字段仅命中文档本身一次）
- **代码反向：文档未列字段**:
  - `negotiationDeadline` (line 354)
  - `routerId` `sendTransportId` `recvTransportId` (lines 355-357)
  - `updatedAt` (line 361)
- **影响**: 多区域 SFU 部署判断失误；客户端按文档解析响应会取不到该字段
- **建议处置**: **要么修代码**（添加该字段并迁移）**要么修文档**（删掉该字段，并把 `routerId / sendTransportId / recvTransportId / negotiationDeadline / updatedAt` 补入字段表 + 把"运行期资源 ID 由 Redis 重建"的描述对应到这些字段）

#### 🔴 C2 — `MessageMention` 表完全缺失文档

- **文档**: `docs/dev/04-data-model.md` 仅在 `Message` 字段描述中提到"mentions"但没有独立小节
- **代码**: `prisma/schema.prisma:293-304` 存在 `MessageMention` 表（messageId + mentionedUserId 复合主键 + index）
- **影响**: 数据模型理解残缺；查 ER 图找不到这条多对多关系
- **建议处置**: 修文档，添加 `MessageMention` 小节（字段、约束、索引）

#### 🔴 C3 — `AuthSession` 表完全缺失文档

- **文档**: `docs/dev/04-data-model.md` 未列；权限文档 `07-permission-security.md § 凭证保护` 仅一句"refresh token 长有效期并可撤销"，未说明持久化结构
- **代码**: `prisma/schema.prisma:45-62` 完整定义 `AuthSession`（refreshTokenHash unique + expiresAt + revokedAt + clientDeviceName + clientTimezone + lastUsedAt）
- **影响**: refresh token 持久化机制不在数据模型范围内被描述，会让安全审计/会话撤销/多设备登录的设计无法溯源
- **建议处置**: 修文档，添加 `AuthSession` 小节

#### 🔴 C4 — `Message.deletedAt` 字段未在文档列出

- **文档**: `docs/dev/04-data-model.md:181` 仅写 "`createdAt`、`updatedAt`、`deletedAt` 时间字段"
- **代码**: `prisma/schema.prisma:262` 实际有 `deletedAt DateTime? @db.Timestamptz(6)`
- **结论**: 这一项**文档有提到**（字段列表中），算 ✓ 一致；保留此条作为澄清

#### 🟡 W5 — `voice_sessions` 索引差异

- **文档**: `docs/dev/04-data-model.md:323` — "`voice_sessions` | partial unique active session on `user_id`、`(channel_id, media_state)`"
- **代码**: `prisma/schema.prisma:366-368` 实际索引：
  - `@@index([channelId, endedAt])`
  - `@@index([userId, endedAt])`
  - `@@index([mediaState, negotiationDeadline])`
- **差异**:
  - ❌ 没有 **partial unique on user_id**（文档约定的"同一用户同时只能一个会话"靠业务层守护，不是 DB 约束）
  - ❌ 没有 `(channel_id, media_state)` 索引（变成 `(channel_id, endedAt)` + `(media_state, negotiation_deadline)`）
- **影响**: 单用户多会话约束在 DB 层缺失，并发竞态时可能短暂产生重复 VoiceSession
- **建议处置**: **修文档**确认当前以业务层约束 + endedAt 索引为准；或**修代码**添加 `@@unique([userId, endedAt])` partial（PostgreSQL where 子句）

#### 🟡 W6 — `Server.status` / `Channel.status` / `Membership.memberStatus` 等列为"enum"但实际是 VarChar(32)

- **文档**: `docs/dev/04-data-model.md` 多处用 enum 标记的格式列状态字段（`active | archived | deleted` 等）
- **代码**: 全部 `String @db.VarChar(32)`，**未使用 Prisma enum**，未使用 PostgreSQL ENUM
- **影响**: 看文档以为强类型，实际是字符串，写值时不会 DB 报错；前端/后端依赖 shared 常量来约束
- **建议处置**: 修文档（在建模约定中明确"状态字段以 String VarChar 存储 + 在 packages/shared 中以 const object 约束"），或修代码（改为 Prisma enum）

#### 🟡 W7 — `Notification.type` 与 `sourceType` 取值文档未明示

- **文档**: `docs/dev/04-data-model.md:260` 仅说"`type` 通知类型"；其他文档（08-frontend-design.md 等）也未列全
- **代码**: `packages/shared/src/constants/enums.ts:45-52` 有 `NotificationType` 6 个取值（FRIEND_REQUEST / DIRECT_MESSAGE / CHANNEL_MENTION / SERVER_INVITE / PERMISSION_CHANGED / VOICE_STATE）
- **建议处置**: 修文档列全 6 个取值

#### 🟡 W8 — `AuditLog.metadata` 字段未在文档列出

- **文档**: `docs/dev/04-data-model.md:272-283` 字段表未含 `metadata`
- **代码**: `prisma/schema.prisma:381` 有 `metadata Json?` 字段
- **影响**: 审计接口扩展性未被记录
- **建议处置**: 修文档添加该字段

---

## 4. HTTP API 端点（05-api-contracts.md vs Controllers）

### 4.1 端点对照矩阵

> 图例：✓ 文档与代码一致；➕ 代码有但文档未列；➖ 文档有但代码未实现

| 编号 | 方法 + 路径 | 文档 | 代码 | 备注 |
|------|------------|------|------|------|
| 1 | POST `/api/v1/auth/register` | ✓ | ✓ `auth.controller.ts:18` | |
| 2 | POST `/api/v1/auth/login` | ✓ | ✓ `auth.controller.ts:24` | |
| 3 | POST `/api/v1/auth/refresh` | ✓ | ✓ `auth.controller.ts:30` | |
| 4 | POST `/api/v1/auth/logout` | ✓ | ✓ `auth.controller.ts:35` | |
| 5 | POST `/api/v1/auth/password-reset` | ✓ (P1) | ➖ 未实现 | 🟢 I2 — 符合 P1 延后声明 |
| 6 | GET `/api/v1/users/me` | ✓ | ✓ `users.controller.ts:15` | |
| 7 | PATCH `/api/v1/users/me/profile` | ✓ | ✓ `users.controller.ts:20` | |
| 8 | PATCH `/api/v1/users/me/presence` | ✓ | ✓ `users.controller.ts:29` | |
| 9 | GET `/api/v1/friends` | ✓ | ✓ `friends.controller.ts:14` | |
| 10 | POST `/api/v1/friend-requests` | ✓ | ✓ `friends.controller.ts:19` | |
| 11 | POST `/api/v1/friend-requests/:id/accept` | ✓ | ✓ `friends.controller.ts:28` | |
| 12 | POST `/api/v1/friend-requests/:id/reject` | ✓ | ✓ `friends.controller.ts:37` | |
| 13 | GET `/api/v1/dm-conversations` | ✓ | ✓ `friends.controller.ts:46` | |
| 14 | GET `/api/v1/dm-conversations/:id/messages` | ✓ | ✓ `messages.controller.ts:40` | |
| 15 | POST `/api/v1/dm-conversations/:id/messages` | ✓ | ✓ `messages.controller.ts:49` | |
| 16 | POST `/api/v1/servers` | ✓ | ✓ `servers.controller.ts:21` | |
| 17 | GET `/api/v1/servers` | ✓ | ✓ `servers.controller.ts:30` | |
| 18 | GET `/api/v1/servers/:server_id` | ✓ | ✓ `servers.controller.ts:35` | |
| 19 | POST `/api/v1/servers/join` | ✓ | ✓ `servers.controller.ts:43` | |
| 20 | POST `/api/v1/servers/:server_id/leave` | ✓ | ✓ `servers.controller.ts:52` | |
| 21 | GET `/api/v1/servers/:server_id/members` | ✓ | ✓ `servers.controller.ts:61` | |
| 22 | PATCH `/api/v1/servers/:server_id/members/:member_id` | ✓ | ✓ `servers.controller.ts:69` | |
| 23 | POST `/api/v1/servers/:server_id/channels` | ✓ | ✓ `channels.controller.ts:17` | |
| 24 | PATCH `/api/v1/channels/:channel_id` | ✓ | ✓ `channels.controller.ts:28` | |
| 25 | DELETE `/api/v1/channels/:channel_id` | ✓ | ✓ `channels.controller.ts:39` | |
| 26 | GET `/api/v1/channels/:channel_id/messages` | ✓ | ✓ `messages.controller.ts:19` | |
| 27 | POST `/api/v1/channels/:channel_id/messages` | ✓ | ✓ `messages.controller.ts:29` | |
| 28 | POST `/api/v1/attachments/init` | ✓ | ✓ `attachments.controller.ts:14` | |
| 29 | POST `/api/v1/attachments/:id/complete` | ✓ | ✓ `attachments.controller.ts:22` | |
| 30 | GET `/api/v1/attachments/:id` | ✓ | ✓ `attachments.controller.ts:30` | |
| 31 | POST `/api/v1/messages/:id/delete` | ✓ | ✓ `messages.controller.ts:68` | |
| 32 | POST `/api/v1/read-states` | ✓ | ✓ `messages.controller.ts:59` | |
| 33 | GET `/api/v1/notifications` | ✓ | ✓ `notifications.controller.ts:13` | |
| 34 | POST `/api/v1/notifications/read` | ✓ | ✓ `notifications.controller.ts:21` | |
| 35 | GET `/api/v1/servers/:server_id/roles` | ✓ | ✓ `servers.controller.ts:81` | |
| 36 | POST `/api/v1/servers/:server_id/roles` | ✓ | ✓ `servers.controller.ts:89` | |
| 37 | PATCH `/api/v1/roles/:role_id` | ✓ | ✓ `roles.controller.ts:14` | |
| 38 | **DELETE `/api/v1/roles/:role_id`** | ❌ 文档未列 | ➕ `roles.controller.ts:24` | 🟡 **W9** |
| 39 | POST `/api/v1/servers/:server_id/members/:member_id/roles` | ✓ | ✓ `servers.controller.ts:121` | |
| 40 | DELETE `/api/v1/servers/:server_id/members/:member_id/roles/:role_id` | ✓ | ✓ `servers.controller.ts:139` | |
| 41 | **PATCH `/api/v1/servers/:server_id/roles/:role_id`** | ❌ 文档未列 | ➕ `servers.controller.ts:100` | 🟡 **W10** |
| 42 | **DELETE `/api/v1/servers/:server_id/roles/:role_id`** | ❌ 文档未列 | ➕ `servers.controller.ts:111` | 🟡 **W10** |
| 43 | POST `/api/v1/permissions/check` | ✓ | ✓ `permissions.controller.ts:12` | |
| 44 | POST `/api/v1/voice/channels/:channel_id/join` | ✓ | ✓ `voice.controller.ts:17` | |
| 45 | **GET `/api/v1/voice/channels/:channel_id/sessions`** | ❌ 文档未列 | ➕ `voice.controller.ts:28` | 🟡 **W11** |
| 46 | POST `/api/v1/voice/sessions/:session_id/leave` | ✓ | ✓ `voice.controller.ts:36` | |
| 47 | GET `/api/v1/voice/sessions/:session_id/ice-servers` | ✓ | ✓ `voice.controller.ts:45` | |
| 48 | PATCH `/api/v1/voice/sessions/:session_id/state` | ✓ | ✓ `voice.controller.ts:53` | |
| 49 | GET `/api/v1/health` | ❌ 文档未列具体路径 | ➕ `health.controller.ts:18` | 🟢 I3 — 文档说"健康检查端点"但未列 |
| 50 | GET `/api/v1/health/_test/media-worker-pid` | ❌ | ➕ `health.controller.ts:23`（NODE_ENV=test only）| 🟢 I4 — 测试专用 |
| 51 | POST `/api/v1/health/_test/kill-media-worker` | ❌ | ➕ `health.controller.ts:29`（NODE_ENV=test only）| 🟢 I4 — 测试专用 |

### 4.2 端点维度不一致汇总

#### 🟡 W9 — `DELETE /api/v1/roles/:role_id`

- **文档**: `docs/dev/05-api-contracts.md § 角色与权限` 只列 `PATCH /roles/:role_id`，**未列删除**
- **代码**: `apps/api/src/modules/servers/roles.controller.ts:24` 实现
- **建议处置**: 修文档补充

#### 🟡 W10 — `/servers/:server_id/roles/:role_id` 双路径（PATCH + DELETE）

- **文档**: 角色编辑/删除统一走 `/roles/:role_id`
- **代码**: 同时存在两种路径：`/roles/:role_id` 与 `/servers/:server_id/roles/:role_id`，且权限校验在后者用 `@RequirePermissionForParam(ManageRole, 'server', 'server_id')`
- **影响**: API 设计冗余；前端不知道用哪个；可能造成权限校验逻辑不对称（前者用 service 内部校验，后者用守卫）
- **建议处置**: 修代码（合并为一个路径，推荐保留 server 前缀版本，因为权限校验更直观）或修文档（明确两个路径的差异与推荐用法）

#### 🟡 W11 — `GET /api/v1/voice/channels/:channel_id/sessions`

- **文档**: 完全未列
- **代码**: `apps/api/src/modules/voice/voice.controller.ts:28` 实现（返回当前频道的在线 voice sessions 列表）
- **建议处置**: 修文档补入

#### 🟢 I3 — `GET /api/v1/health`

- **文档**: `11-deployment-ops.md` 提到健康检查但未列路径
- **代码**: `health.controller.ts:18` 实现
- **建议处置**: 修文档补具体路径

#### 🟢 I4 — `_test/*` 端点

- **文档**: 未列
- **代码**: `health.controller.ts:23, 29` 实现（NODE_ENV=test only，用于 voice E2E）
- **建议处置**: 修文档加一行"调试端点（仅测试环境）"

#### ✅ 一致性总结

- 文档列出 **44** 个端点 → 代码实现 **43** 个（缺 P1 的 `/auth/password-reset`，符合声明）
- 代码额外实现 **6** 个端点（W9 / W10×2 / W11 / I3 / I4×2）
- **核心 CRUD 端点 100% 匹配**

### 4.3 统一响应格式 ✅

| 维度 | 文档 | 代码 |
|------|------|------|
| 成功包装 `{ data, request_id, server_time }` | `05-api-contracts.md § 统一响应` | `apps/api/src/common/http/api-response.interceptor.ts` + `api-response.factory.ts` ✓ |
| 失败包装 `{ error: { code, message, details }, request_id, server_time }` | 同上 | `apps/api/src/common/http/api-exception.filter.ts:133-167` HTTP 状态映射全部对应 ✓ |
| `X-Request-Id` 中间件 | `05-api-contracts.md § 全局约定` | `apps/api/src/common/request/request-id.middleware.ts` ✓ |

---

## 5. Socket.IO 实时事件（06-realtime-events.md vs realtime/realtime-events.ts）

### 5.1 服务端事件对照矩阵

| 事件 | 文档 | 代码（`RealtimeEvent` 枚举） |
|------|------|---------------------------|
| MessageCreated | ✓ | ✓ `realtime-events.ts:2` |
| MessageDeleted | ✓ | ✓ `:3` |
| UnreadUpdated | ✓ | ✓ `:4` |
| PermissionChanged | ✓ | ✓ `:5` |
| NotificationCreated | ✓ | ✓ `:6` |
| PresenceChanged | ✓ | ✓ `:7` |
| ChannelChanged | ✓ | ✓ `:8` |
| MemberJoined | ✓ | ✓ `:9` |
| MemberChanged | ✓ | ✓ `:10` |
| VoiceMemberJoined | ✓ | ✓ `:11` |
| VoiceMemberLeft | ✓ | ✓ `:12` |
| VoiceStateChanged | ✓ | ✓ `:13` |
| VoiceRouterCapabilities | ✓ | ✓ `:14` |
| VoiceTransportCreated | ✓ | ✓ `:15` |
| VoiceTransportConnect | ✓ | ✓ `:16` |
| VoiceProducerCreated | ✓ | ✓ `:17` |
| VoiceConsumerCreated | ✓ | ✓ `:18` |
| VoiceConsumerResumed | ✓ | ✓ `:19` |
| VoiceProducerClosed | ✓ | ✓ `:20` |
| VoiceActiveSpeaker | ✓ | ✓ `:21` |
| **SyncState** | ❌ 文档未列 | ➕ `:22` 🟡 **W12** |

### 5.2 客户端事件对照

| 事件 | 文档 | 代码（`realtime.gateway.ts`） |
|------|------|------------------------------|
| Subscribe | ✓ | ✓ |
| Unsubscribe | ✓ | ✓ |
| Heartbeat | ✓ | ✓ |
| TypingStarted | ✓ (P1) | ➖ 未实现，符合 P1 声明 🟢 |
| **SyncState** | ❌ | ➕ 实现（重连状态同步） 🟡 |

### 5.3 不一致项

#### 🟡 W12 — `SyncState` 事件文档完全缺失

- **文档**: `docs/dev/06-realtime-events.md § 重连补偿` 提到重连流程，但**未引入** `SyncState` 事件名
- **代码**: `packages/shared/src/constants/realtime-events.ts:22` 与 `apps/api/src/modules/realtime/realtime.gateway.ts` 均实现
- **影响**: 客户端开发者不会知道有这个事件；同时此事件在 06-realtime-events.md 第 463 行的"调用 GET 接口刷新"流程外提供了**额外的服务端推送补偿机制**
- **建议处置**: 修文档，在 § 重连补偿 章节末尾新增 `SyncState` 事件描述（载荷、触发条件、与 HTTP 拉取的关系）

#### 🟡 W13 — `VoiceStateChanged.media_state` 取值未对齐共享枚举

- **文档**: `06-realtime-events.md:286` 示例 `"media_state": "connected"`
- **代码**: `packages/shared/src/constants/enums.ts` **完全没有** `VoiceMediaState` 枚举（详见 § 8.4 C5）
- **影响**: 客户端无法用类型约束 `media_state` 字段
- **建议处置**: 与 § 8.4 C5 合并修复（要么补枚举、要么改文档）

#### 🟡 W14 — `VoiceMemberLeft.reason` 取值未在 enum 中固化

- **文档**: `06-realtime-events.md:428` 列出 4 个 reason 取值：`manual_leave | signaling_timeout | worker_died | permission_lost`
- **代码**: Grep 仓库未发现对应的 const object / enum 导出；只在服务实现内以魔法字符串使用
- **影响**: 共享类型约束薄弱
- **建议处置**: 修代码（在 packages/shared 添加 `VoiceLeaveReason` const object）

### 5.4 房间模型 ✅

| 房间 | 文档 | 代码 |
|------|------|------|
| `user:{user_id}` | ✓ | ✓ `realtime.rooms.ts` |
| `dm:{conversation_id}` | ✓ | ✓ |
| `server:{server_id}` | ✓ | ✓ |
| `channel:{channel_id}` | ✓ | ✓ |
| `voice:{channel_id}` | ✓ | ✓ |

---

## 6. 权限模型（07-permission-security.md vs permission.types.ts / permissions.ts）

### 6.1 PermissionBit ✅

| 位 | 文档（位名） | 代码（`packages/shared/src/constants/permissions.ts`） |
|----|------------|---------------------------------------------------|
| 1 | VIEW_CHANNEL | ✓ ViewChannel = 1 |
| 2 | SEND_MESSAGE | ✓ SendMessage = 2 |
| 4 | MANAGE_MESSAGE | ✓ ManageMessage = 4 |
| 8 | MANAGE_CHANNEL | ✓ ManageChannel = 8 |
| 16 | JOIN_VOICE | ✓ JoinVoice = 16 |
| 32 | MANAGE_MEMBER | ✓ ManageMember = 32 |
| 64 | MANAGE_ROLE | ✓ ManageRole = 64 |
| 128 | CREATE_INVITE | ✓ CreateInvite = 128 |
| 256 | VIEW_AUDIT | ✓ ViewAudit = 256 |
| 512 | SPEAK_VOICE | ✓ SpeakVoice = 512 |
| 1024 | LISTEN_VOICE | ✓ ListenVoice = 1024 |

**全 11 个权限位完全一致 ✓**

### 6.2 PermissionAction（API 层动作枚举）— 不一致

#### 🔴 C5 — `PermissionAction` 比 `PermissionBit` 多 3 个，文档未说明

- **文档**: `docs/dev/07-permission-security.md § 权限位` 列 11 个权限位
- **代码**: `apps/api/src/common/permissions/permission.types.ts:3-18` 实际 `PermissionAction` 共 **14 个**，多出：
  - `AccessAttachment = 'ACCESS_ATTACHMENT'`
  - `SubscribeRealtime = 'SUBSCRIBE_REALTIME'`
  - `ViewMembers = 'VIEW_MEMBERS'`
- **影响**: 文档未澄清 **PermissionBit（角色可分配的位标志）** 与 **PermissionAction（服务端权限校验入口的动作名）** 是两套独立体系。三个额外 Action 是无法分配给角色的"内置动作"（用于附件访问、实时订阅、成员列表查看）
- **建议处置**: 修文档，新增一节"PermissionBit vs PermissionAction"，列出 14 个 Action 并标注哪些有对应 Bit、哪些是内置

### 6.3 ResourceType ✅

| 类型 | 文档 | 代码（`permission.types.ts:22-29`） |
|------|------|----------------------------------|
| `attachment` `channel` `dm` `message` `server` `user` `voice` | ✓ | ✓ 共 7 种 |

### 6.4 装饰器使用习惯 — 文档未覆盖包装函数

#### 🟢 I5 — 文档 `@RequirePermission` 描述准确，但未提及更常用的包装 `@RequirePermissionForParam`

- **文档（CLAUDE.md）**: "`PermissionGuard` + `@RequirePermission({ action, resourceType, resourceIdParam })`"
- **代码 `apps/api/src/common/permissions/require-permission.decorator.ts`**:
  - 第 13 行：`RequirePermission(requirement: { action, resourceIdParam, resourceType })` — **签名与文档完全一致** ✓
  - 第 17 行：`RequirePermissionForParam(action, resourceType, resourceIdParam)` — 简化的位置参数包装
- **实际使用**: 所有 12 个受控端点都用 `@RequirePermissionForParam`（位置参数版），**没有任何端点使用 `@RequirePermission` 对象参数版**
- **影响**: 不是错误，但新成员按 CLAUDE.md 抄出来的代码风格与仓库实际惯例不一致
- **建议处置**: 修 CLAUDE.md 加一行注脚 "实际项目中习惯用更简洁的 `@RequirePermissionForParam(action, resourceType, paramName)`"

### 6.5 权限计算顺序 ✅

文档 § 权限计算 列出 10 步顺序，与 `apps/api/src/modules/permissions/permissions.service.ts` 实现路径吻合（基于 Agent 2 报告）。

---

## 7. 安全策略（07-permission-security.md vs auth/）

### 7.1 不一致项

#### 🔴 C6 — 密码哈希算法声明错误（Argon2id → 实际 PBKDF2-SHA256）

- **文档**:
  - `docs/dev/07-permission-security.md:100` — "密码使用 Argon2id 或 bcrypt 存储，不保存明文"
  - `README.md` 开发检查清单 — "密码使用 Argon2id，不记录明文"
  - `CLAUDE.md` 开发检查清单 — "密码使用 Argon2id，不记录明文"
- **代码**: `apps/api/src/modules/auth/password.service.ts:1-7`
  ```typescript
  import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
  const PASSWORD_ALGORITHM = 'pbkdf2_sha256';
  const PASSWORD_HASH_BYTES = 32;
  const PASSWORD_ITERATIONS = 310_000;
  ```
  实际使用 **PBKDF2-SHA256**（OWASP 2023 推荐迭代数 310,000）
- **影响**:
  - 安全审计严重误判
  - 合规自评（如声称 Argon2id 实际未实现）违反真实性原则
  - 凭据迁移规划错误（PBKDF2 与 Argon2id 不能无缝迁移）
- **建议处置**: 修文档为 "PBKDF2-SHA256（310,000 迭代）"；或修代码切换到 Argon2id（需要引入 `@node-rs/argon2` 等库，迁移现有 hash）

#### 🟡 W16 — JWT 算法未在文档明示

- **文档**: 未明确声明
- **代码**: `apps/api/src/modules/auth/token.service.ts` 使用 HS256（HMAC-SHA256，Node 内建 crypto 直接实现，**未使用 `jsonwebtoken` 或 `@nestjs/jwt` 库**）
- **影响**: 新成员审计 token 安全性时会假设用了成熟库；自实现的 token 验证如有 timing 漏洞将引入风险
- **建议处置**: 修文档补充"JWT: HS256 自实现（基于 node:crypto createHmac），refresh token 以 SHA256 存储"

### 7.2 全局守卫 ✅

| 守卫 | 文档 | 代码（`app.module.ts:62-72`） |
|------|------|---------------------------|
| AccessTokenGuard（APP_GUARD） | ✓ | ✓ |
| PermissionGuard（APP_GUARD） | ✓ | ✓ |
| **RateLimitGuard（APP_GUARD）** | ❌ 文档未列守卫位置 | ➕ 实现 🟡 W17 |

#### 🟡 W17 — `RateLimitGuard` 未在文档守卫位置出现

- **文档**: `07-permission-security.md § 限流` 列出限流维度，未说明守卫机制
- **代码**: `apps/api/src/common/rate-limit/rate-limit.guard.ts` 实现全局守卫，提供 `@RateLimit({ windowMs, limit })` 装饰器；按 `userId/IP:Class.method` 分组的**内存桶**（非 Redis）
- **影响**: 文档读者不会预期到限流是装饰器粒度可控的；内存桶实现意味着多实例部署时限流不共享
- **建议处置**: 修文档，新增"限流实现"小节说明：
  - 守卫位置（全局 APP_GUARD）
  - 装饰器（`@RateLimit`）
  - 存储机制（内存，单实例）
  - 已知限制（多实例需要后续切换 Redis）

### 7.3 媒体安全 ✅

| 约束 | 文档 | 代码 |
|------|------|------|
| Producer 强制 `kind === 'audio'` | ✓ | ✓ Agent 2 报告确认；media-signaling.service.ts 实现 |
| TURN HMAC 短 TTL 凭证（默认 5 分钟） | ✓ | ✓ `TURN_CREDENTIAL_TTL_SECONDS=300` |
| 服务端不录音/不混音/不转写 | ✓ | ✓ 代码无 RecordingPlugin / PlainTransport / ffmpeg |

---

## 8. 共享枚举与错误码（packages/shared/src/constants/ vs 多份文档）

### 8.1 ErrorCode — 不一致

#### 🔴 C7 — 实际有 10 个错误码，文档只列 9 个（缺 `INVALID_CREDENTIALS`）

- **文档**: `docs/dev/05-api-contracts.md § 错误码` 列 9 个：`VALIDATION_FAILED / AUTH_REQUIRED / PERMISSION_DENIED / RESOURCE_NOT_FOUND / CONFLICT / PAYLOAD_TOO_LARGE / RATE_LIMITED / INTERNAL_ERROR / DEPENDENCY_UNAVAILABLE`
- **代码**: `packages/shared/src/constants/error-codes.ts:1-12` **10 个**，多了 `InvalidCredentials: 'INVALID_CREDENTIALS'`
- **影响**: 前端按文档处理会漏掉这个错误码，用户输入密码错误时 UI 兜底失效
- **建议处置**: 修文档补入 `INVALID_CREDENTIALS`，并标注它与 `AUTH_REQUIRED` 的差异（前者是密码错，后者是未登录或 token 失效）

### 8.2 ChannelType — 不一致

#### 🟡 W18 — 文档用小写 `text|voice`，代码用大写 `TEXT|VOICE`

- **文档**: `docs/dev/04-data-model.md:144` — "`type` | `text` 或 `voice`"
- **代码**: `packages/shared/src/constants/enums.ts:1-4`
  ```typescript
  export const ChannelType = { Text: 'TEXT', Voice: 'VOICE' } as const;
  ```
- **建议处置**: 修文档统一为大写

### 8.3 MessageVisibility — 不一致

#### 🔴 C8 — 文档 `retracted` vs 代码 `WITHDRAWN`

- **文档**: `docs/dev/04-data-model.md:179` — "`visibility` | `visible`、`retracted`、`deleted`"
- **代码**: `packages/shared/src/constants/enums.ts:27-31`
  ```typescript
  export const MessageVisibility = { Visible: 'VISIBLE', Withdrawn: 'WITHDRAWN', Deleted: 'DELETED' } as const;
  ```
- **影响**: 按文档查询 `visibility=retracted` 永远查不到数据
- **同时**: `docs/dev/05-api-contracts.md:331` 的 `POST /messages/:id/delete` 请求体 `operation` 字段用 `retract`（小写动词），与本枚举无直接关系，但术语统一性受影响
- **建议处置**: **强烈推荐修代码**，把枚举改回 `Retracted: 'RETRACTED'`（文档术语更准确，"withdraw" 在金融语境通常指"撤资"）；或修文档统一为 `WITHDRAWN`

### 8.4 VoiceConnectionStatus — 不一致

#### 🟡 W19 — 文档 3 值，代码 4 值（多 `RECONNECTING`）

- **文档**: `docs/dev/04-data-model.md:243` 与 `06-realtime-events.md:286` 都只说 3 值：`connecting | connected | disconnected`
- **代码**: `packages/shared/src/constants/enums.ts:35-40`
  ```typescript
  export const VoiceConnectionStatus = {
    Connecting: 'CONNECTING',
    Connected: 'CONNECTED',
    Reconnecting: 'RECONNECTING',
    Disconnected: 'DISCONNECTED',
  } as const;
  ```
- **影响**: 状态机不完整描述；客户端按文档不会处理 RECONNECTING 中间态
- **建议处置**: 修文档补入 `RECONNECTING`

### 8.5 VoiceMediaState — 缺失

#### 🔴 C9 — 文档明确声明的枚举在代码中不存在

- **文档**:
  - `docs/dev/01-tech-stack-and-repo-structure.md § 共享类型` — 列出 `VoiceMediaState`
  - `docs/dev/04-data-model.md:244` — "`mediaState` | `idle | negotiating | connected | reconnecting | failed`"
  - `docs/dev/03-module-design.md:202` — "媒体状态 `mediaState`（`idle | negotiating | connected | reconnecting | failed`）"
- **代码**: `packages/shared/src/constants/enums.ts` **完全没有** `VoiceMediaState` 导出；Prisma `VoiceSession.mediaState` 仅是 `String @db.VarChar(32) @default("idle")`
- **影响**:
  - 客户端用魔法字符串硬编码
  - 状态机断言无类型约束
  - 5 个声明值在代码中是否全部使用未知
- **建议处置**: 修代码（在 `packages/shared/src/constants/enums.ts` 添加 `VoiceMediaState` const object）

### 8.6 缺失的状态枚举集合

#### 🟡 W20 — 7 个状态字段未提取为共享枚举

| 字段 | 文档列出取值 | 代码常量 |
|------|------------|---------|
| `User.accountStatus` | `pending_verification | active | disabled` | ❌ 无 enum，散落字符串 |
| `Server.status` | `active | archived | deleted` | ❌ 无 enum |
| `Membership.memberStatus` | `active | muted | removed | banned` | ❌ 无 enum |
| `Channel.status` | `active | deleted` | ❌ 无 enum |
| `Invitation.status` | `active | revoked | expired` | ❌ 无 enum |
| `Attachment.status` | `pending | ready | hidden | deleted` | ❌ 无 enum |
| `Attachment.purpose` | `message | avatar | server_icon` | ❌ 无 enum |

- **影响**: 共享类型约束薄弱；每个 service 都可能用魔法字符串
- **建议处置**: 修代码补充共享枚举；或修文档承认"目前以字符串字段为契约，约束在 service 内部"

### 8.7 NotificationType ✅

| 取值 | 文档 | 代码 |
|------|------|------|
| FRIEND_REQUEST / DIRECT_MESSAGE / CHANNEL_MENTION / SERVER_INVITE / PERMISSION_CHANGED / VOICE_STATE | 仅 06-realtime-events.md 隐含提到部分 | ✓ `enums.ts:45-52` 全 6 个 |

但 § 3.2 W7 已经记录"文档未列全 6 个取值"的问题。

---

## 9. 命令脚本与环境变量

### 9.1 package.json scripts ✅ — 完全一致

| 命令 | CLAUDE.md / README.md | package.json |
|------|-----------------------|--------------|
| `pnpm setup` | ✓ | ✓ |
| `pnpm dev` / `dev:api` / `dev:web` | ✓ | ✓ |
| `pnpm deps:build` | ✓ | ✓ |
| `pnpm check` | ✓ | ✓ |
| `pnpm test` / `lint` / `format` | ✓ | ✓ |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:reset` / `db:test:reset` | ✓ | ✓ |
| `pnpm e2e` / `e2e:api` / `e2e:web` / `e2e:voice` / `e2e:audio` | ✓ | ✓ |
| `pnpm build` / `typecheck` | ✓ | ✓ |
| `pnpm infra:up` / `infra:down` | ✓ | ✓ |
| `pnpm perf:k6` | ✓ | ✓ |

**全 22 条命令完全一致 ✓**

### 9.2 docker-compose.yml 服务 — 部分不一致

| 服务 | 文档（11-deployment-ops.md） | docker-compose.yml |
|------|---------------------------|--------------------|
| PostgreSQL 5432 | ✓ | ✓ `:2-17` |
| Redis 6379 | ✓ | ✓ `:19-31` |
| MinIO 9000/9001 | ✓ | ✓ `:33-49` |
| **minio-init** | ❌ 文档未列 | ➕ `:51-64` 🟡 W21 |
| coturn 3478/UDP+TCP, 5349/TLS | ✓ | ⚠️ 实际用 `network_mode: host`，未显式 `ports` |
| mediasoup 40000-40100/UDP, 3001 health | ✓ | ⚠️ 实际用 `network_mode: host`，未显式 `ports` |
| **API 3000** | ✓ 文档列为 Compose 服务 | ❌ docker-compose.yml **无此服务**（由 `pnpm dev` 启动）🟡 W22 |
| **Web 5173** | ✓ 文档列为 Compose 服务 | ❌ docker-compose.yml **无此服务**（由 `pnpm dev` 启动）🟡 W22 |

#### 🟡 W21 — `minio-init` 服务未在文档列出

- **代码**: `docker-compose.yml:51-64` 一个一次性容器，自动创建 `eiscord-local` bucket 并设置权限
- **建议处置**: 修文档补入

#### 🟡 W22 — API/Web 不是 Docker Compose 服务

- **文档**: `docs/dev/11-deployment-ops.md:9-13` 把 API 与 Web 列在 Docker Compose 服务表中
- **现状**: 二者通过 `pnpm dev` 在本机启动，**不在 docker-compose.yml 内**（docker-compose.yml 仅含 6 个 infra 服务）
- **影响**: 新成员看文档以为 `docker compose up` 会启动 API 与 Web，实际不会
- **建议处置**: 修文档，把 API/Web 行从 Docker Compose 表中移出，单独列"本机进程"

### 9.3 .env.example 变量 — 多于文档

| 变量 | 文档（11-deployment-ops.md § 环境变量） | .env.example | 备注 |
|------|--------------------------------------|--------------|------|
| `NODE_ENV` `DATABASE_URL` `REDIS_URL` | ✓ | ✓ | |
| `JWT_*` (4 个) | ✓ | ✓ | |
| `S3_*` (4 个) | ✓ | ✓ | |
| `PUBLIC_API_BASE_URL` `PUBLIC_REALTIME_URL` | ✓ | ✓ | |
| **`PUBLIC_WEB_ORIGIN`** | ❌ | ➕ `:15` 🟡 W23 | CORS origin |
| `UPLOAD_MAX_BYTES` `SERVER_MEMBER_LIMIT` `LOG_LEVEL` | ✓ | ✓ | |
| `REDIS_CONNECT_IN_TEST` `REALTIME_SWEEP_IN_TEST` | ✓ | ✓ | |
| `PRESENCE_SWEEP_INTERVAL_MS` `PRESENCE_OFFLINE_GRACE_MS` | ✓ | ✓ | |
| `MEDIASOUP_*` (5 个) | ✓ | ✓ | |
| **`MEDIA_HEALTH_PORT`** | ❌ | ➕ `:28` 🟡 W23 | mediasoup 健康端口 |
| `TURN_*` (3 个) | ✓ | ✓ | |
| `VOICE_MAX_PARTICIPANTS_PER_ROOM` | ✓ | ✓ | |
| **`VOICE_NEGOTIATION_TIMEOUT_MS`** | ❌ | ➕ `:33` 🟡 W23 | 30s 协商超时 |
| **`VOICE_NEGOTIATION_SWEEP_INTERVAL_MS`** | ❌ | ➕ `:34` 🟡 W23 | 5s sweep |
| **`PORT`** | ❌ | ➕ `:2` 🟡 W23 | API 监听端口（默认 3000） |

#### 🟡 W23 — 5 个环境变量未在文档列出

- **建议处置**: 修文档 § 环境变量表补入 5 个变量及说明：
  - `PORT` (API listen port)
  - `PUBLIC_WEB_ORIGIN` (CORS allowlist)
  - `MEDIA_HEALTH_PORT` (mediasoup health probe port)
  - `VOICE_NEGOTIATION_TIMEOUT_MS` (与文档已声明的 "30 秒未完成协商释放" 对应)
  - `VOICE_NEGOTIATION_SWEEP_INTERVAL_MS`

### 9.4 测试框架 ✅

| 维度 | 文档 | 代码 |
|------|------|------|
| API 用 Jest + Supertest | `CLAUDE.md` + `10-test-acceptance.md` | ✓ Agent 2 报告确认（22 个 `*.spec.ts` 全部 Jest） |
| Web/Shared 用 Vitest | 同上 | ✓ `vitest@^1.6.0` in root package.json |
| E2E 用 Playwright | 同上 | ✓ `@playwright/test@^1.43.1` + `playwright.config.ts` |
| k6 压测 | 同上 | ✓ `scripts/k6/m6-realtime-load.js` |
| 测试数据：alice/bob/carol + DemoPass1 | `10-test-acceptance.md § 测试数据` | ✓ `prisma/seed.ts` + `test-accounts.md` 一致 |

---

## 10. 前端实现与设计文档一致性（08-frontend-design.md vs apps/web/）

> 本节于 **2026-05-24 二次审核** 追加，补全首次审核未深入的前端维度。
> **审核范围**: `apps/web/package.json` + `apps/web/src/` 全部模块 × `docs/dev/08-frontend-design.md` + `01-tech-stack-and-repo-structure.md § 前端模块边界`。

### 10.1 完全一致项 ✅

| 维度 | 文档来源 | 代码实证 |
|------|---------|---------|
| 核心技术栈 React + Vite + TS strict | `08-frontend-design.md` / `01-tech-stack` | `apps/web/package.json`：React 18.2.0、Vite 5.2.10、TypeScript ✓ |
| TanStack Query 管理服务端数据 | `08-frontend-design.md:34` | `@tanstack/react-query@^5.32.1` + `shared/api/query-client.ts:36` 行配置 ✓ |
| Zustand 管理本地 UI 状态 | `08-frontend-design.md:35` | `zustand@^4.5.2` + 4 个 store（auth/workspace/theme/toast） ✓ |
| React Hook Form + Zod 表单 | `08-frontend-design.md:36` | `react-hook-form@^7.52.0` + `@hookform/resolvers@^3.9.0` + 3 个表单页面（Login/Register/Profile）✓ |
| socket.io-client 实时连接 | `01-tech-stack:14` | `socket.io-client@^4.7.5` + `shared/api/socket-client.ts` ✓ |
| mediasoup-client 语音媒体 | `08-frontend-design.md:38` | `mediasoup-client@^3.7.18` + `features/voice/voice-client.ts` 561 行完整实现 ✓ |
| 路由 7 条受保护 + 2 条公开 | `08-frontend-design.md:17-26` | `app/router.tsx` 实现 11 条路由（含 2 条 fallback Navigate） ✓ |
| 路由守卫 ProtectedRoute / PublicOnlyRoute | 文档隐含 | `shared/components/ProtectedRoute.tsx` + `PublicOnlyRoute.tsx` ✓ |
| PUBLIC_API_BASE_URL + PUBLIC_REALTIME_URL | `01-tech-stack:117-118` | `shared/api/client-config.ts:1-8` 默认值完全一致 ✓ |
| 错误码常量从 `@eiscord/shared` 导入 | `01-tech-stack:104` | `shared/utils/error-message.ts:1` `import { ErrorCode } from '@eiscord/shared'` ✓ |
| 重连后 SyncState 同步 | `08-frontend-design.md:99-103` 重连补偿 | `shared/api/socket-client.ts:119` 重连后 emit `SyncState` ✓ |
| PermissionChanged 触发权限刷新 | `08-frontend-design.md:40` | `shared/hooks/use-realtime-sync.ts:9-34` `useRealtimePermissionSync` 实现 ✓ |
| mediasoup 加入流程（Device → Transport×2 → Producer → Consumer） | `08-frontend-design.md:106-117` | `features/voice/voice-client.ts:287-382` 完整对应 ✓ |
| Worker 崩溃自动重新加入 | `08-frontend-design.md:117` | `voice-client.ts` 监听 `VoiceProducerClosed(reason=worker_died)` 触发重连 ✓ |
| Bearer token 注入 + X-Request-Id | 文档隐含 / `05-api-contracts.md` | `shared/api/http-client.ts:52-58` ✓ |

### 10.2 不一致项

#### 🔴 C10 — `features/permissions/` 模块在代码中**完全不存在**

- **文档**: `docs/dev/01-tech-stack-and-repo-structure.md § 前端模块边界` 列出 `features/permissions/`
- **代码**: `apps/web/src/features/` 实际只有 **8 个**目录：`auth / channels / friends / messages / notifications / profile / servers / voice`，**没有 permissions/**
- **影响**: 文档承诺的"权限管理 feature 模块"实际不独立存在；权限相关 UI 散落在 `features/servers/`（角色管理）与 `shared/components/PermissionBitEditor.tsx`
- **建议处置**: **修文档**承认权限管理与 servers 模块合并；或**修代码**抽出独立 feature

#### 🔴 C11 — `shared/utils/` 与 `shared/state/` 子目录在文档中缺失

- **文档**: `docs/dev/01-tech-stack-and-repo-structure.md § 前端模块边界` 列 shared 子目录为 `api/ components/ hooks/ styles/ types/`（**5 个**）
- **代码**: `apps/web/src/shared/` 实际有 **7 个**子目录：`api / components / hooks / state / styles / types / utils`
- **缺失说明**:
  - `shared/state/` — 4 个 Zustand store 集中位置（auth/workspace/theme/toast）
  - `shared/utils/` — `error-message.ts`、`username-color.ts` 等工具函数
- **影响**: 新成员按文档目录树找 store 会找不到（实际不在 `features/*` 里也不在某个 feature 内）
- **建议处置**: **修文档**补入 `state/` 和 `utils/`

#### 🔴 C12 — 文档专属错误码 VOICE_DEVICE_DENIED / VOICE_NEGOTIATION_TIMEOUT / VOICE_TURN_UNAVAILABLE 在代码中不存在

- **文档**: `docs/dev/08-frontend-design.md:137-139` 列出 3 个语音专属错误码并定义前端行为
  ```
  VOICE_DEVICE_DENIED → 引导用户在浏览器权限设置中授予麦克风访问
  VOICE_NEGOTIATION_TIMEOUT → 自动重试一次媒体协商，仍失败则回退加入失败并清理控制条
  VOICE_TURN_UNAVAILABLE → 提示对称 NAT 环境无法穿透，建议切换网络或稍后重试
  ```
- **代码**:
  - `packages/shared/src/constants/error-codes.ts:1-12` 共 **10 个** ErrorCode，**没有** 任何 `VOICE_*` 错误码
  - `apps/web/src/shared/utils/error-message.ts:4-15` 映射表也只有 10 个标准错误码
- **影响**:
  - 后端无法抛出这些错误码
  - 前端文档承诺的"麦克风权限引导"等专属交互无对应实现
  - 真实场景下浏览器 `NotAllowedError` / `NotFoundError` 由 `voice-client.ts` 内部处理（catch 后用通用错误提示）
- **建议处置**:
  - **修文档**：去掉 3 个伪错误码，改为说明"麦克风/协商/TURN 失败由 voice-client 在客户端层捕获处理，不通过服务端错误码"
  - 或 **修代码**：在 packages/shared/error-codes.ts 添加 3 个枚举，在 error-message.ts 补映射

#### 🟡 W24 — `use-realtime-sync.ts` 未监听 `ChannelChanged` 事件

- **文档**: `06-realtime-events.md § ChannelChanged` 描述频道创建/编辑/排序/删除时广播事件；`08-frontend-design.md:40` 强调"实时事件进入后更新当前用户有权可见的查询缓存"
- **代码**: `apps/web/src/shared/hooks/use-realtime-sync.ts:82-94` 共监听 13 个事件 + `PermissionChanged`（共 14 个），但 **`ChannelChanged` 没有监听**
  - 影响：用户在 A 频道时，管理员在 B 频道做修改 → A 用户的频道列表缓存不会主动刷新（只能等下次 invalidate 或重连）
- **影响**: 频道增删改的实时同步可能延迟，与"消息可见时间 ≤ 1s / 未读 2s"等 SLA 间接相关
- **建议处置**: **修代码**，在 `use-realtime-sync.ts` 增加 `ChannelChanged` 监听，invalidate `['servers']` query

#### 🟡 W25 — 路由级 `errorElement` 与代码分割（lazy）未使用

- **文档**: 未明确要求路由级错误边界或懒加载
- **代码**:
  - `app/router.tsx` 12 条路由全部 **无 errorElement**（仅顶层 ErrorBoundary 兜底）
  - 全部组件 **eager import**，未使用 `React.lazy()`、`<Suspense>` 或 `startTransition`
- **影响**:
  - 单个页面出错时整个应用回退到顶层兜底，无法局部恢复
  - 首屏 JS bundle 较大（feature 模块全部加载）
- **建议处置**:
  - 修代码：给重型页面（ServerSettingsPage / ServerVoicePage / MessagesPage）加 lazy + Suspense
  - 给每个 Route 加 `errorElement` 利用 React Router v6 的错误边界能力
  - 或 修文档：声明"v1 不做代码分割与路由级错误边界"作为已知决策

#### 🟡 W26 — 测试覆盖严重不足

- **文档**: `docs/dev/10-test-acceptance.md` + `CLAUDE.md` 声明 Web 用 Vitest + React Testing Library，"组件单测、表单、消息列表、权限按钮、错误状态"全覆盖
- **代码**: `apps/web/src/` 下仅 **1 个** `*.spec.ts` 文件
  - `apps/web/src/features/voice/voice-client.spec.ts`（79 行）— 仅测试语音协商失败路径
- **缺失**:
  - 0 个 component test
  - 0 个 hook test（包括关键的 `use-realtime-sync.ts`）
  - 0 个 store test
  - 0 个 form schema test
  - 0 个 Storybook 故事
- **影响**:
  - "组件单测、React Testing Library"声明实际只在 devDeps 安装，未实际使用
  - 与 `10-test-acceptance.md` 描述的"前端组件测试 — React Testing Library — 表单、消息列表、权限按钮、错误状态"严重背离
- **建议处置**:
  - **修代码**（推荐）：至少补 5-10 个核心组件测试（LoginPage 表单校验、MessageComposer、ErrorBoundary、ProtectedRoute、formatErrorMessage 单测）
  - 或 修文档：把"前端组件测试由 Playwright E2E 覆盖，单元测试仅 voice-client"作为决策记录在 10-test-acceptance.md

#### 🟡 W27 — 主题系统在文档中完全未提

- **文档**: `docs/dev/08-frontend-design.md` 与 `01-tech-stack-and-repo-structure.md` 均**未提主题系统**
- **代码**: 完整的双主题系统
  - `shared/state/use-theme-store.ts` — 'dark' | 'light' | 'system' 三选项 + localStorage 持久化（key `eiscord.theme`）
  - `shared/hooks/use-theme.ts` — 监听 prefers-color-scheme 媒体查询
  - `shared/styles/tokens.css` — 双层 CSS 变量体系（调色板 + 语义 token）
  - `features/profile/ProfilePanel.tsx:18-22` UI 提供主题切换
- **影响**: 这是已交付的能力但文档完全没记录，相当于"看不见的功能"
- **建议处置**: **修文档**，在 `08-frontend-design.md` 新增"主题系统"小节，说明三选项、持久化机制、设计 token 双层结构

#### 🟡 W28 — Toast 自实现系统在文档中未提

- **文档**: 错误处理部分（`08-frontend-design.md § 错误码`）描述"展示提示"但未说明实现机制
- **代码**:
  - `shared/state/use-toast-store.ts` 自实现 toast 系统（kind: info/error/success/warning + TTL）
  - `shared/components/Toaster.tsx` 渲染层（aria-live="polite"）
- **影响**: 反馈机制未文档化
- **建议处置**: 修文档补一节"Toast 系统：自实现，无第三方库依赖，TTL 自动消失，aria-live 可访问"

#### 🟡 W29 — 客户端 `SyncState` 事件作为 emit 行为再次提醒

- **文档**: `06-realtime-events.md § 客户端事件` 表只列 Subscribe/Unsubscribe/Heartbeat/TypingStarted(P1)，**未列 SyncState**
- **代码**: `shared/api/socket-client.ts:119` 在 `reconnect` 回调中 emit `SyncState`，服务端响应通过 `onStateSync` 回调分发
- **影响**: 重连补偿机制不在文档客户端事件清单内（与 backend 审核 W12 是同一问题的两面）
- **建议处置**: 修文档 06-realtime-events.md 客户端事件表加入 `SyncState`（emit），并补一句"由 socket-client 在重连成功后自动 emit，不需要业务代码调用"

#### 🟢 I6 — 路由层级与文档高度一致（仅 1 处细微差异）

- **文档**: 7 条受保护路由，全部以 `/app` 为前缀
- **代码**: 完全实现 + 额外 2 条 fallback：
  - `/app/*` → Navigate to `friends`
  - `/*` → Navigate to `/app`
- **影响**: 无负面影响，反而是合理的兜底
- **建议处置**: 无须处置（或修文档加一句"未匹配路径自动重定向到 friends 页"）

#### 🟢 I7 — `lucide-react` / `@fontsource-variable/inter` 等基础设施库未在文档列出

- **文档**: 技术栈表未提
- **代码**: package.json 含 `lucide-react@^0.468.0`（图标）、`@fontsource-variable/inter@^5.0.20`（字体）
- **影响**: 不算错误，属于实现细节
- **建议处置**: 无须处置

#### 🟢 I8 — CSS 架构（无 CSS-in-JS / 无 Tailwind）文档未声明

- **文档**: 未声明 CSS 方案
- **代码**: 纯 CSS + CSS 变量（`shared/styles/tokens.css` 212 行 + `app/styles.css` 1963 行 + 各 feature 局部 CSS）
- **影响**: 信息缺失但非"错"
- **建议处置**: 修文档加一句"CSS 方案：原生 CSS + CSS Variables，无 CSS-in-JS / Tailwind / styled-components"

#### 🟢 I9 — 国际化（i18n）未实施，符合 v1 范围

- **文档**: 未承诺 i18n
- **代码**: UI 文本全部硬编码中文
- **影响**: 符合 v1 范围
- **建议处置**: 无须处置

#### 🟢 I10 — 移动端 PTT 与自动播放兜底按钮符合 P1 声明

- **文档**: `08-frontend-design.md:117 + 09-iteration-plan.md` 标 P1
- **代码**: 未实现 ✓ 符合
- **建议处置**: 无须处置

### 10.3 前端审核汇总

| 等级 | 数量 | 编号 |
|------|------|------|
| 🔴 Critical | 3 | C10 (permissions feature 缺失), C11 (utils/state 子目录漏文档), C12 (VOICE_* 错误码不存在) |
| 🟡 Warning | 6 | W24 (ChannelChanged 未监听), W25 (errorElement+lazy 未用), W26 (测试覆盖严重不足), W27 (主题系统漏文档), W28 (Toast 漏文档), W29 (SyncState emit 未列) |
| 🟢 Info | 5 | I6 (路由 fallback), I7 (基础库未列), I8 (CSS 方案未声明), I9 (i18n 未做), I10 (PTT P1 符合) |

### 10.4 前端审核中的"惊喜发现" ✨

1. **`voice-client.ts` 实现远超文档描述** — 文档只说"自定义 hook + Zustand"管理 mediasoup，代码实际是 561 行完整状态机（含 negotiating/connected/reconnecting/failed 五态、事件总线、worker_died 自愈、socket listener 解绑），质量远高于文档描述
2. **`use-realtime-sync.ts` 三个独立 hook 设计** — 把权限同步、事件同步、重连补偿分成三个 hook 而非一个，符合关注点分离原则，但文档没记录这种拆分
3. **设计 token 双层架构** — `tokens.css` 把颜色分成"调色板层（raw colors）+ 语义层（--bg-*/--text-*/--accent-*）"，是非常成熟的设计系统实践，文档零提及



| 文档章节 | 准确度 | 主要问题 | 建议 |
|---------|-------|---------|------|
| `README.md` | ⭐⭐⭐⭐ 85% | Argon2id 声明错（C6） | 修一处 |
| `CLAUDE.md` | ⭐⭐⭐⭐ 85% | Argon2id 声明错（C6）；装饰器风格未提及包装版（I5） | 修一处 + 加一注脚 |
| `01-tech-stack-and-repo-structure.md` | ⭐⭐⭐⭐ 90% | mediasoup 双启动模式描述歧义（W2） | 补 1 段 |
| `03-module-design.md` | ⭐⭐⭐⭐ 85% | 漏 Health/Attachments 模块（W3）；端点数过时（W4） | 修两处 |
| `04-data-model.md` | ⭐⭐⭐ 70% | mediaRegion 字段不存在（C1）；MessageVisibility 值错（C8）；缺 AuthSession（C3）/ MessageMention（C2）小节；VoiceConnectionStatus 缺值（W19）；状态字段未声明为字符串（W6） | **大幅重写** |
| `05-api-contracts.md` | ⭐⭐⭐⭐ 90% | 漏 4 个端点（W9-W11）；漏 INVALID_CREDENTIALS（C7） | 补 5 处 |
| `06-realtime-events.md` | ⭐⭐⭐⭐ 90% | 漏 SyncState（W12）；VoiceLeaveReason 未提取（W14） | 补 2 节 |
| `07-permission-security.md` | ⭐⭐⭐ 75% | **Argon2id 严重错（C6）**；漏 3 个 PermissionAction（C5）；漏 RateLimitGuard 实现（W17） | **优先修 C6** |
| `08-frontend-design.md` | ⭐⭐⭐ 75% | 主题系统/Toast 全漏（W27/W28）；VOICE_* 错误码不存在但文档列了 3 个（C12）；shared/utils + shared/state 子目录漏（C11）；features/permissions 不存在（C10）；ChannelChanged 未监听（W24）；测试声明与现实差距大（W26） | **较大重写** |
| `09-iteration-plan.md` | ⭐⭐⭐⭐⭐ 95% | M1-M6 状态描述与代码一致 ✓ | 无 |
| `10-test-acceptance.md` | ⭐⭐⭐⭐⭐ 95% | 测试框架与命令完全一致 ✓ | 无 |
| `11-deployment-ops.md` | ⭐⭐⭐ 70% | API/Web 误列为 Compose 服务（W22）；漏 minio-init（W21）；漏 5 个 env 变量（W23） | **重写 § Docker Compose 设计 + § 环境变量** |

**整体：⭐⭐⭐⭐ 82%**（核心契约 90%，数据模型 70%，前端文档 75%，部署 70%）

---

## 附录 B：建议的优先修复顺序

### 🔥 P0 — 立即修复（影响安全审计 / 契约可用性）

| # | ID | 修复对象 | 推荐方向 |
|---|----|---------|---------|
| 1 | C6 | `README.md` + `CLAUDE.md` + `07-permission-security.md` 密码哈希 | **修文档**为 PBKDF2-SHA256（除非有切换 Argon2id 计划） |
| 2 | C8 | `MessageVisibility` 枚举值 | **修代码**为 `Retracted: 'RETRACTED'`（与文档语义对齐） |
| 3 | C1 | `04-data-model.md` VoiceSession.mediaRegion | **修文档**移除 + 补入实际字段 |
| 4 | C7 | `05-api-contracts.md` ErrorCode 表 | **修文档**补入 `INVALID_CREDENTIALS` |

### 🟡 P1 — 一周内修复（影响新成员理解 / 减少返工）

| # | ID | 修复对象 | 推荐方向 |
|---|----|---------|---------|
| 5 | C9 | `packages/shared/.../enums.ts` 缺 `VoiceMediaState` | **修代码**补入 5 值 enum |
| 6 | C5 | `07-permission-security.md` 漏 3 个 PermissionAction | **修文档**新增"Bit vs Action"小节 |
| 7 | C2 + C3 | `04-data-model.md` 漏 MessageMention + AuthSession | **修文档**补两节 |
| 8 | W19 | `VoiceConnectionStatus` 漏 RECONNECTING | **修文档**补入 |
| 9 | W12 / W29 | `06-realtime-events.md` 漏 `SyncState`（同时是服务端事件 + 客户端 emit） | **修文档**新增小节，覆盖 emit + on 两侧 |
| 10 | C10 | `01-tech-stack-and-repo-structure.md` 列了不存在的 `features/permissions/` | **修文档**移除（权限 UI 散落在 servers + shared 中）|
| 11 | C11 | shared/ 子目录漏 `state/` 与 `utils/` | **修文档**补入两个子目录 |
| 12 | C12 | `08-frontend-design.md:137-139` 三个 VOICE_* 错误码不存在 | **修文档**改为"由 voice-client 客户端层处理麦克风/协商/TURN 异常" |

### 🟢 P2 — 有空时整理（减少陈旧描述）

| # | ID | 修复对象 |
|---|----|---------|
| 13 | W3 / W4 | 03-module-design.md 模块清单与端点数 |
| 14 | W9-W11 | 05-api-contracts.md 补 4 个端点 |
| 15 | W17 | 07-permission-security.md 补 RateLimitGuard 实现说明 |
| 16 | W21-W23 | 11-deployment-ops.md Compose 服务 + 环境变量 |
| 17 | W5-W8 | 04-data-model.md 索引、状态字段、Notification 取值、AuditLog.metadata |
| 18 | W6 / W18 / W20 | 状态字段枚举化策略统一（修代码或修文档二选一） |
| 19 | W14 | 共享 `VoiceLeaveReason` enum |
| 20 | W16 | 07-permission-security.md 补 JWT HS256 自实现说明 |
| 21 | W2 | 11-deployment-ops.md mediasoup 双启动模式表 |
| 22 | W7 | 04-data-model.md 补 NotificationType 6 取值 |
| 23 | I5 | CLAUDE.md 加注脚说明 `@RequirePermissionForParam` 是更常用包装 |
| 24 | W24 | `apps/web/src/shared/hooks/use-realtime-sync.ts` 补 `ChannelChanged` 监听 | **修代码** |
| 25 | W25 | 路由级 errorElement + lazy loading | 修代码或修文档（声明 v1 不做） |
| 26 | W26 | 前端测试覆盖严重不足（仅 1 个 spec） | **修代码**补组件测试，或修 `10-test-acceptance.md` 改声明 |
| 27 | W27 | `08-frontend-design.md` 补主题系统小节 | **修文档** |
| 28 | W28 | `08-frontend-design.md` 补 Toast 系统小节 | **修文档** |
| 29 | I8 | `08-frontend-design.md` 加 CSS 架构（无 CSS-in-JS / 无 Tailwind）声明 | **修文档** |

### 不处置（符合声明）

| ID | 说明 |
|----|------|
| I2 (`/auth/password-reset`) | 文档已标 P1，代码未实现 ✓ |
| I3 (`GET /health`) | 文档描述模糊但端点存在，可不修 |
| I4 (`_test/*` endpoints) | 测试专用，文档暴露反而增加滥用风险 |
| I1 (M5 "13 个事件" 描述) | M5 阶段交付物描述准确，加 M5.5 注脚即可 |
| `TypingStarted` 客户端事件 | 文档标 P1，代码未实现 ✓ |
| I6 (路由 fallback Navigate) | 合理兜底，无须处置 |
| I7 (lucide-react / Inter 字体未列) | 实现细节，无须处置 |
| I9 (i18n 未实施) | 符合 v1 范围 |
| I10 (PTT / 移动端兜底按钮) | 文档已标 P1，代码未实现 ✓ |

---

## 附录 C：本次审核未覆盖范围

| 范围 | 原因 | 建议下次审 |
|------|------|----------|
| `docs/dev/02-system-architecture.md` 数据流与事务边界 | 需要逐个 Service 读源码 | 重点审 ServersService / MessagesService / VoiceService |
| `docs/dev/09-iteration-plan.md` 各 FR 实现完整度 | 仅核对了里程碑状态字段 | 单独 FR-by-FR 验收 |
| `docs/dev/10-test-acceptance.md` 各 AC 实际覆盖率 | 仅核对了测试框架与数据 | 跑覆盖率统计 |
| 根目录 `agents.md` `test-accounts.md` | 不在 docs/dev 范围 | 按需 |
| `docker/*/README.md` `prisma/migrations/` | 不在 docs/dev 范围 | 按需 |

---

## 报告元信息

- **审核覆盖**: docs/dev 12 文件全部读取 + 前端 75 个 .ts/.tsx 文件抽样
- **数据采集**: 首轮 3 个 Explore agents（docs / backend / 前端+共享）；二轮 3 个 Explore agents（前端 docs / 前端代码 / 前端契约验证）+ 25+ 次 Read + 10+ 次 Grep
- **方法论**: 双向比对（文档 → 代码 / 代码 → 文档），每条不一致带行号引用
- **审核版本历史**:
  - **v1（2026-05-24 上午）**: 9 大维度（仓库、模块、数据模型、API、实时、权限、安全、共享枚举、命令/环境）— 共 30 条差异
  - **v2（2026-05-24 下午）**: 新增 §10 前端实现与设计文档一致性 — 追加 14 条差异（C10-C12 + W24-W29 + I6-I10）
- **下次复审建议时间**: 当代码完成下一个里程碑（M7 或类似）后；或 90 天后
- **本报告维护方**: 由用户决定（建议放入 `docs/audit/` 后由文档负责人定期更新）

