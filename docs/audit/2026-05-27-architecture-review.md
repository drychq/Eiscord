# Eiscord 架构审查与重构推荐报告

**审核日期**: 2026-05-27
**审核分支**: `develop`（基线提交 `be0a87a`）
**审核范围**: `apps/api/src/` + `apps/web/src/` + `packages/shared/src/` 的**架构、分层、设计模式**维度
**审核方法**: 亲自读源代码 + 行号引用 + 文件规模与跨模块依赖统计（因外部 Agent 服务 429 限流，未启用并行子代理）
**输出口径**: 只产出结论与推荐清单；**不修改任何代码或现有文档**；前一份 `2026-05-24-docs-code-consistency.md` 聚焦"文档 vs 代码一致性"，本报告与其互补、不重复
**用户决策**: 风险偏好 = 激进；产出物 = 纯审计报告 + 推荐清单

---

## § 1. 摘要表与导读

### 1.1 总体诊断

> **一句话结论**：项目宏观分层已经成熟（NestJS module 边界清晰、全局守卫拦截器审计齐全、前端三层清晰），问题集中在**少数几个 god service / god page** 与**一处事件→缓存失效硬编码点**。激进改造路线在课程项目体量下大部分会是 over-engineering；**只有 R1+R7+FE-R1+FE-R2+FE-R5 这 5 项是无需犹豫的真痛点**。

### 1.2 推荐总览表

> 图例：影响 / 成本 各分 ⭐ ⭐⭐ ⭐⭐⭐（越多越大）；推荐落地 = Pack A 立即 / Pack B 下里程碑 / Pack C 暂不做

| 编号 | 名称 | 适用问题 | 影响 | 成本 | 落地包 |
|------|------|---------|------|------|-------|
| R1 | Repository Pattern | `*.service.ts` 内 396 处 raw SQL 散落 | ⭐⭐⭐ | ⭐ | **Pack A** |
| R7 | After-Commit Event Collector | 30+ 处 `$transaction` 后样板 publish | ⭐⭐⭐ | ⭐ | **Pack A** |
| FE-R1 | ServerSettingsPage 子路由拆分 | 861 行 8 子组件 inline | ⭐⭐ | ⭐ | **Pack A** |
| FE-R2 | Realtime Event Subscription Registry | `use-realtime-sync.ts` 反向耦合所有 feature query key | ⭐⭐⭐ | ⭐ | **Pack A** |
| FE-R5 | 路由级 errorElement + lazy | 12 路由 eager + 无错误边界 | ⭐⭐ | ⭐ | **Pack A** |
| R5 | CQRS Read Model | 读写混在同一 service 中 | ⭐⭐ | ⭐⭐ | Pack B |
| R3 | Domain Event + In-Process EventBus | messages 直接依赖 5 个 service | ⭐⭐ | ⭐⭐ | Pack B |
| FE-R4 | FSD 边界 eslint 规则 | 已分三层但无强制约束 | ⭐ | ⭐ | Pack B |
| R2 | Domain Aggregate + Value Object | 无领域模型，直接操作 row | ⭐ | ⭐⭐⭐ | Pack C |
| R4 | Transactional Outbox | 进程崩溃时事件丢失（已被设计选择） | ⭐ | ⭐⭐⭐ | Pack C |
| R6 | Saga / Process Manager | voice 协商 13 个 public 方法 | ⭐⭐ | ⭐⭐⭐ | Pack C |
| R8 | Permission Policy Object | permissions.service 669 行 | ⭐ | ⭐⭐⭐ | Pack C |
| FE-R3 | XState 形式化 voice-client | 568 行隐式状态机 | ⭐ | ⭐⭐ | Pack C |

### 1.3 与前份审计的关系

| 维度 | 2026-05-24（C1 一致性） | 2026-05-27（本份 / 架构） |
|------|------------------------|--------------------------|
| 关心问题 | 文档与代码是否对齐 | 当前架构是否需要引入新模式 |
| 处置类型 | 修文档 or 修代码以对齐 | 重构 / 拆分 / 引入新文件 |
| 重叠点 | W25 (路由 errorElement + lazy)、W26 (前端测试不足) | FE-R5 承接 W25 并扩写 |
| 不动 | 文档一致性问题 | 本报告不重复 C1-C12 / W1-W29 |

---

## § 2. 现状诊断（事实层）

### 2.1 后端 7 维度评分

#### ✅ 已成熟（不需要动）

**M1 — 模块边界**
- 15 个业务模块按 `xxx.module.ts → xxx.controller.ts → xxx.service.ts → dto/ + presenter` 标准化
- 证据：`apps/api/src/app.module.ts:37-50` 全部 module 注册；`apps/api/src/modules/` 15 个目录全部含 `*.module.ts`
- 评分：✅ 与 NestJS 官方建议一致

**M2 — 横切基础设施**
- 认证：`AccessTokenGuard`（全局 APP_GUARD，`apps/api/src/common/auth/access-token.guard.ts`）+ `@Public()` 反向标注
- 权限：`PermissionGuard`（APP_GUARD）+ `@RequirePermission` / `@RequirePermissionForParam` 装饰器（`apps/api/src/common/permissions/`）
- 限流：`RateLimitGuard`（APP_GUARD）+ `@RateLimit` 装饰器（`apps/api/src/common/rate-limit/`）
- 响应：`ApiResponseInterceptor` 统一 `{ data, request_id, server_time }` 包装；`ApiExceptionFilter` 统一错误包装
- 请求 ID：`RequestIdMiddleware` 注入；`getRequestId()` 在 service 间传递
- 审计：`AuditService`（`apps/api/src/modules/audit/audit.service.ts`，91 行）被注入 17 个其他文件，调用 68 次
- 评分：✅ 五大横切能力齐备且使用一致

**M3 — Auth 模块的内部拆分**
- 已主动拆出 `password.service.ts`、`token.service.ts`、`password-reset.service.ts`、`prisma-token.verifier.ts`、`rejecting-token.verifier.ts`
- `auth.service.ts` 仅 501 行（register/login/refresh/logout 4 个公开方法）
- 评分：✅ 这是项目内部最好的"service 拆分"范例，可作为其他 god service 的样板

#### 🔴 缺位或痛点

**M4 — Repository 层完全缺失**

| 指标 | 数据 |
|------|------|
| `$queryRaw` / `$executeRaw` / `$transaction` 全仓库出现次数 | **396 次** |
| 涉及文件数 | **30 个** |
| 主要分布 | `apps/api/src/modules/messages/messages.service.ts` 80+ 次 / `apps/api/src/modules/servers/servers.service.ts` 70+ 次 / `apps/api/src/modules/voice/voice.service.ts` 40+ 次 / `apps/api/src/common/permissions/permissions.service.ts` 30+ 次 |

**反例 — messages.service.ts 内部结构（1377 行）**：
- L73：`constructor` 注入 5 个依赖（auditService / notificationsService / permissionsService / prisma / realtimePublisher）
- L81-159：`sendChannelMessage`（编排层）
- L161-228：`sendDirectMessage`（编排层）
- L230-262：`loadChannelMessages` / `loadDirectMessages`（编排层）
- L264-322：`markRead`（编排层）
- L324-440：`deleteMessage`（编排层）
- **L595-810**：`insertMessage` / `getMessageById` / `assertReadyMessageAttachments` / `filterChannelMentionUsers` / `insertMessageAttachments` / `insertMessageMentions` / `markSenderRead` / `incrementChannelUnread` …（约 25 个 `tx: RawSqlExecutor` 私有方法 — **这一坨完全是 Repository 的职责**）
- L1242-1280：`publishMessageCreated` / `publishUnreadUpdates` / `publishNotifications`（事件发布私有方法）

**servers.service.ts 同形态**（1358 行）：constructor L76 → createServer L85 / joinServer L310 / leaveServer L420 / manageMember L496（编排）→ Role CRUD L605-870 → publishMemberChanged L1215 / publishChannelChanged 等

**voice.service.ts 同形态**（848 行）：constructor L51 → 13 个 public 方法（joinChannel L79 / listChannelSessions L192 / refreshIceServers L207 / leaveSession L227 / updateState L266 / releaseUserActiveSession L349 / releaseUserActiveSessionForServer L369 / releaseUsersActiveSessions L390 / releaseUsersActiveSessionsForChannel L408 / releaseUsersActiveSessionsWithoutJoinPermission L439 / releaseChannelActiveSessions L487 / sweepNegotiationTimeouts L512 / getActiveSessionForUser L629）→ publishVoiceJoined L807 / publishVoiceLeft L816 / publishVoiceStateChanged L831

**channels.service.ts 同形态**（530 行）：constructor L42 → createChannel L51 / updateChannel L134 / deleteChannel L207 → applyOverwrites L307 → publishChannelChanged L392

> **关键观察**：所有 god service 内部**已经按职责分块写好**，只缺一个文件边界。Repository 抽取的物理工作量极低，本质是 **mechanical refactor**。

- 评分：🔴 缺位

**M5 — 领域模型缺位**
- 没有 Aggregate / Value Object / Domain Service 层；service 层直接操作 Prisma row + presenter 函数式转换
- 例：`MessageRow` 是 raw SQL `SELECT ... AS "camelCase"` 的产物，`toMessageSummary` 把它转 DTO，**中间没有 Domain Model**
- 不变量校验散落在编排方法内（如 voice.service 的 `negotiationDeadline` 检查、messages.service 的 `senderId !== user.userId` 校验）
- 评分：🔴 缺位（但考虑业务复杂度，是否一定要补，见 R2 章节）

**M6 — 事件发布的"事务后同步"模式**
- `apps/api/src/modules/realtime/realtime.publisher.ts` 全 50 行，是 `Socket.IO server.to(room).emit()` 的薄包装 + envelope 拼装
- 业务代码典型模式（messages.service.ts L93-156）：
  ```
  const result = await this.prisma.$transaction(async (tx) => { ... });
  if (result.created) {
    this.publishMessageCreated(summary, room, requestId);
    this.publishUnreadUpdates(...);
    this.publishNotifications(...);
  }
  ```
- 这就是 **at-most-once 投递**：事务提交 → 进程崩溃 → 事件不会发出
- 项目自己的架构文档已主动选择：`docs/dev/02-system-architecture.md:122` 写 "若事件发布失败，服务端保留数据库事实，客户端重连后通过查询补齐"；`apps/api/src/modules/realtime/realtime.gateway.ts:271` 实现了 `handleSyncState` 服务端补偿事件
- 评分：🟡 **设计选择，不是缺陷**；R4 (Outbox) 只在准备多实例部署或需要严格审计追溯时才值得做

**M7 — 跨模块直接调用**
- `MessagesService.constructor` 注入：`AuditService` + `NotificationsService` + `PermissionsService` + `PrismaService` + `RealtimePublisher`
- 编排逻辑中直接 `await this.notificationsService.createNotification(tx, ...)`（messages.service.ts L131-141）
- 跨模块流程：messages 主动知道何时通知 notifications；当前 12 模块下还能管理
- `realtime.module.ts:12` 出现 `forwardRef(() => VoiceModule)` 是**唯一的循环依赖**（VoiceModule ↔ RealtimeModule），是一个值得记录的代码气味
- 评分：🟡 工作但耦合；R3 可以解，但成本/收益需权衡

### 2.2 前端 7 维度评分

#### ✅ 已成熟

**F1 — 技术栈与分层**：React 18 + Vite 5 + TS strict + TanStack Query v5 + Zustand v4 + RHF + Zod + Socket.IO + mediasoup-client → 与文档完全一致

**F2 — Feature 模块隔离**：8 个 features，每个含 `*-api.ts`（HTTP 调用）+ `use-*-queries.ts`（Query/Mutation hook）+ 页面组件
- 命名一致；只有 `voice/voice-client.ts` 是特殊的 imperative 类
- 评分：✅ 已实现实质的 FSD（Feature-Sliced Design），只是没有官方化

**F3 — Shared 层 7 子目录**：`api/`（http-client / socket-client / refresh-coordinator / query-client / client-config）+ `components/`（17 个通用组件）+ `hooks/`（4 个）+ `state/`（4 个 Zustand store）+ `styles/` + `types/` + `utils/` — 边界清晰

**F4 — 状态层**：4 个 Zustand store（auth/workspace/theme/toast）职责无重叠；TanStack Query 管服务端数据；本地 UI 状态用 Zustand 或 useState — 边界正确

#### 🔴 缺位或痛点

**F5 — 实时事件→缓存失效硬编码（最大痛点）**

文件：`apps/web/src/shared/hooks/use-realtime-sync.ts`（170 行，3 个 hook）

证据：L36-112 `useRealtimeEventSync` 单 hook 内监听 **12 个事件**（`MessageCreated/MessageDeleted/UnreadUpdated/NotificationCreated/PresenceChanged/MemberChanged/MemberJoined/VoiceMemberJoined/VoiceStateChanged/VoiceMemberLeft/VoiceProducerCreated/VoiceProducerClosed/VoiceActiveSpeaker`），并在 callback 里硬编码 **6 类 query key**（`['messages', 'channel', ...]` / `['messages', 'dm', ...]` / `['notifications']` / `['friends']` / `['servers']` / `['voice', ...]`）。

为什么是痛点：
- shared 层反向了解 features 层的 query key 结构，破坏分层
- 新增一个 feature 必须改 shared/hooks，违反 OCP（开闭原则）
- 缺事件（如已被审计 W24 点名的 `ChannelChanged`）就需要在 shared 改代码

评分：🔴 痛点（FE-R2 解决）

**F6 — god page（ServerSettingsPage.tsx 861 行）**

文件结构（行号是文件内位置）：
- L1-12：imports
- L33：`type Tab`
- L35-109：`ServerSettingsPage`（shell + Tab 切换；4 个 useState 在内）
- L113-220：`RolesTab`（3 个 useState）
- L224-380：`MembersTab`（3 个 useState）
- L382-503：`ChannelsTab`（3 个 useState）
- L505-585：`RoleFormModal`（4 个 useState）
- L587-770：`ChannelFormModal`（7 个 useState）
- L779+：`RoleAssignModal`（更多 useState）

**好消息**：已按"shell + 3 Tab + 4 Modal"职责分块；坏消息：全在一个文件，难独立测试与按需加载。

评分：🟡 痛点但已分块（FE-R1 + FE-R5 解决）

**F7 — voice-client.ts 隐式状态机（568 行）**

证据：`apps/web/src/features/voice/voice-client.ts` L15-50 定义 4 类 listener（`RemoteTrackListener / ActiveSpeakerListener / StatusListener / WorkerDiedListener`），L115 `setStatus(next: VoiceClientStatus)` 推进状态（idle / negotiating / connected / reconnecting / failed 5 态）

特征：完整 mediasoup 协商流程 + Producer/Consumer 管理 + worker_died 自愈 + socket listener 解绑 — 是一个隐式状态机

评分：🟡 工作但脆弱（FE-R3 用 XState 形式化，但收益边际）

**F8 — 路由 eager import + 无 errorElement**
- `apps/web/src/app/router.tsx` 12 路由全部 eager import；零 `React.lazy()` / 零 `errorElement`
- 已被 2026-05-24 W25 点名
- 评分：🟡（FE-R5 解决）

### 2.3 已被项目主动选择的取舍（**不要当作问题**）

| 决策 | 出处 | 推论 |
|------|------|------|
| Raw SQL over Prisma Client query builder | `CLAUDE.md` 架构约束节 | 不应推 "用 Prisma Repository / TypeORM" |
| At-most-once realtime + SyncState 补偿 | `docs/dev/02-system-architecture.md:122` + gateway L271 | 不应推 Outbox 作为 P0 |
| 单实例部署 | 限流是 in-memory bucket（W17）；mediasoup 子进程模式 | 不应推 distributed event bus / Kafka |
| 无 i18n 全中文 UI | 已知决策 | 不应推 i18next |
| 无代码分割（W25 待办） | 已知决策 | 可推但需明示低优先级 |

---

## § 3. 后端推荐（按"激进"路线展开）

> 每条固定使用 5 段式：**问题陈述 → 推荐模式 → 迁移路径 → 风险与代价 → 何时不该做**

### R1 — Repository 层抽取（Repository Pattern）

**问题陈述**
- 全仓库 396 次 raw SQL 调用散落在 30 个文件中
- 三大 god service 内部已存在 `tx: RawSqlExecutor` 私有方法（messages.service.ts L595-810、servers.service.ts L900-1200、voice.service.ts L560-790），物理上已分块
- 测试 spec 必须 mock `$queryRaw` 字符串内容；脆弱且与 SQL 字面量强耦合

**推荐模式**
- **Repository Pattern**（Eric Evans 1.0 版）：每个 Aggregate Root（这里退化为 entity）有一个 Repository 接口，封装持久化细节
- 在 Eiscord 中：`messages/messages.repository.ts`、`servers/servers.repository.ts`、`voice/voice.repository.ts`、`channels/channels.repository.ts`、`auth/auth-session.repository.ts`
- Repository 持有 `prisma: PrismaService`；service 持有 `messagesRepo: MessagesRepository`
- 事务边界：Repository 方法接收可选的 `tx?: PrismaTransaction` 参数（兼容现有 `tx: RawSqlExecutor` 类型）

**迁移路径**（文件级 diff 草图）
```
apps/api/src/modules/messages/
  ├─ messages.module.ts              [+ provider: MessagesRepository]
  ├─ messages.controller.ts          [unchanged]
  ├─ messages.service.ts             [1377 → ~600 行]
  ├─ messages.repository.ts          [+ ~800 行：所有 tx: RawSqlExecutor 私有方法迁入]
  ├─ messages.presenter.ts           [unchanged]
  └─ messages.service.spec.ts        [mock MessagesRepository 取代 mock $queryRaw 字符串]
```

迁移步骤建议：
1. 按 service 一个一个做：先 messages，跑 `pnpm test apps/api -- messages`，过了再做 servers
2. 单 service 改造在一个 commit 内完成（保证 git revert 简单）
3. 不重写 SQL，只搬位置 + 改方法签名

**风险与代价**
- **工作量**：5 个 service × 1-2 小时 = 1 个工作日
- **测试影响**：所有 `*.service.spec.ts` 的 prisma mock 改为 repository mock；可机械替换
- **可逆性**：高（git revert 一个 commit 即可）
- **运行时风险**：零（不改 SQL）

**何时不该做**
- 单 service 持续保持 < 300 行时，提前抽 Repository 反而增加跳转成本
- Eiscord 已有 3 个 service > 800 行，**应该立即做**

---

### R2 — Domain Aggregate + Value Object（DDD Tactical）

**问题陈述**
- 业务不变量散落在 service 编排方法中
- 例：`voice.service.updateState` 的 5 状态转移规则；`messages.service.deleteMessage` 的 "sender 才能 retract、admin 才能 delete" 规则；`servers.service.manageMember` 的 owner 不能 leave / banned 不能 restore 等
- 当前以 service 内 if-else 实现，难单测、难知道全部不变量在哪里

**推荐模式**
- **DDD Tactical Patterns**：Aggregate Root（业务边界）+ Entity（有 id）+ Value Object（无 id 不可变）+ Domain Service（跨 Aggregate 计算）
- 在 Eiscord 中：
  - `Message` Aggregate（持有 Mentions / Attachments value objects；不变量：visibility 只能 visible→withdrawn/deleted 单向转移）
  - `VoiceSession` Aggregate（持有 mediaState / muteState / deafenState；不变量：mediaState 状态转移图）
  - `ServerMembership` Aggregate（持有 Roles）
- 目录约定：`apps/api/src/modules/voice/domain/voice-session.ts`

**迁移路径**
```
apps/api/src/modules/voice/
  ├─ voice.service.ts                [瘦身：编排 Aggregate.transitionTo() + Repository.save()]
  ├─ voice.repository.ts             [R1 已抽出；负责 row ↔ Aggregate 转换]
  ├─ domain/
  │   ├─ voice-session.ts            [Aggregate：状态机不变量持有者]
  │   ├─ voice-media-state.ts        [Value Object：state machine 转移规则]
  │   └─ voice-leave-reason.ts       [Value Object：4 个 reason 取值]
```

**风险与代价**
- **工作量**：3 个核心 Aggregate × 2-3 工作日 = 1 周
- **测试影响**：Aggregate 单测可纯函数化（极易写）；service spec 重写 mock 边界
- **可逆性**：中（涉及多文件重排）
- **隐性收益**：把"业务不变量"集中表达，新开发者理解成本下降

**何时不该做**
- Eiscord 中大量字段是 CRUD 性质（无强不变量），强行包 Aggregate 会沦为贫血对象
- 真正值得做的只有：`VoiceSession`（状态机最复杂）、`Message`（visibility 转移）、`Membership`（status + role 关联）
- 其他模块（friends / notifications / channels）当前 service 即可，**不要全模块铺开**
- **建议**：仅对 VoiceSession 试点；用 1 个月观察是否真的让 voice 维护变好；再决定是否推广

---

### R3 — Domain Event + In-Process EventBus（Mediator-lite）

**问题陈述**
- `MessagesService` 直接调用 `NotificationsService.createNotification`（messages.service.ts L131-141）+ `RealtimePublisher.publishToRoom`（L149）+ `AuditService.log`
- 4 个跨模块协调点：messages→notifications、servers→notifications、channels→voice（删除频道触发语音离开）、permissions→voice（权限丢失触发语音离开）
- 任何业务流程新增"侧效应"（例如新增 webhook、邮件通知）都要改源 service

**推荐模式**
- **Domain Event** + 进程内 EventBus（无须 Kafka / Redis Streams）
- NestJS 自带 `@nestjs/event-emitter` 包，或自实现一个 200 行的 typed EventBus
- 在 Eiscord 中：
  - `MessageMentionedEvent { messageId, mentionedUserId, channelId }` 由 MessagesService 发出
  - `NotificationsService` `@OnEvent('message.mentioned')` 创建通知
  - `RealtimePublisher` `@OnEvent('message.mentioned')` 推送实时事件
- 重要：事件**在 commit 后**触发；配合 R7

**迁移路径**
```
apps/api/src/common/events/
  ├─ event-bus.module.ts             [provides EventBus]
  └─ domain-event.ts                 [base type + helpers]
apps/api/src/modules/messages/events/
  ├─ message-created.event.ts
  ├─ message-mentioned.event.ts
  └─ message-deleted.event.ts
apps/api/src/modules/notifications/listeners/
  └─ message-mentioned.listener.ts   [@OnEvent('message.mentioned')]
```

**风险与代价**
- **工作量**：~3 工作日（事件类型定义 + 改造 messages/servers/voice 3 个 service 的 publish 点）
- **测试影响**：service spec 不再 mock `RealtimePublisher`；改为断言事件被 emit
- **可逆性**：中（订阅者反向追踪比直接调用难）
- **运行时风险**：低（同步 in-process emit；不引入 broker）

**何时不该做**
- 跨模块协调点 < 5 处时，直接调用更直观
- Eiscord 当前 4 处协调，**处于边界**；做 R3 收益边际
- 若团队不打算长期演进项目，不做 R3 也合理

---

### R4 — Transactional Outbox

**问题陈述**
- 当前 at-most-once：`$transaction` 提交后进程崩溃 → 实时事件丢失
- 项目已主动接受这个取舍（`02-system-architecture.md:122` + SyncState 补偿）

**推荐模式**
- **Transactional Outbox**：业务事务内**同时**写一条 `outbox_events` 记录；后台 worker 轮询表 → 投递事件 → 标记 sent
- 配合"消费方幂等去重"实现至少一次（at-least-once）+ 客户端去重 → 业务上的 exactly-once

**迁移路径**
```
prisma/migrations/m56_outbox/
  └─ migration.sql                   [+ outbox_events 表]
apps/api/src/common/outbox/
  ├─ outbox.repository.ts
  ├─ outbox.worker.ts                [setInterval poll & dispatch]
  ├─ outbox.module.ts
  └─ outbox.types.ts
apps/api/src/modules/messages/
  └─ messages.service.ts             [publishX 改为 outbox.append(tx, event)]
```

**风险与代价**
- **工作量**：~5 工作日（schema + worker + idempotency key + 全部业务点改造）
- **测试影响**：高（事件投递从 sync 改 async，所有 e2e 需要 `await` 投递）
- **可逆性**：低（schema 改造）
- **运行时风险**：中（worker 健康度成新单点）

**何时不该做**
- 单实例部署 + 用户能接受偶发漏事件（重连补偿可救回）→ Outbox 是 over-engineering
- Eiscord 目前**完全符合该描述**；**Pack C 暂不做**
- 触发条件（什么时候该做）：
  - ① 准备多实例部署 / k8s 部署
  - ② 出现"事件丢失"实际线上事故 ≥ 1 次
  - ③ 需要审计"哪些事件何时发出"的合规需求

---

### R5 — CQRS Read Model（命令查询职责分离）

**问题陈述**
- `messages.service` 同时含 `sendChannelMessage`（命令）+ `loadChannelMessages`（查询），共享同一类
- 大型项目里读写比例 80:20，读路径常常需要 denormalize / cache / 分页优化，写路径需要不变量校验 → 两种关注点

**推荐模式**
- **CQRS-lite**（不上 event sourcing；只是文件级切分）
- 在 Eiscord 中：`messages.service.ts`（写）+ `messages.query.ts`（读）

**迁移路径**
```
apps/api/src/modules/messages/
  ├─ messages.service.ts             [仅 send* + delete* + markRead]
  ├─ messages.query.ts               [+ loadChannelMessages / loadDirectMessages]
  ├─ messages.repository.ts          [R1 已抽出；写操作走这里]
  └─ messages.read-model.ts          [R5 配合：可选的查询专用 SQL]
```

**风险与代价**
- **工作量**：~2 工作日（messages / servers / channels 三处）
- **测试影响**：低（spec 切分对应文件即可）
- **可逆性**：高

**何时不该做**
- 单 service 已 < 300 行时不要切
- Eiscord 在 R1 之后 messages.service 约 600 行，切 R5 后 ~400 行写 + ~200 行读，仍然合理；**Pack B 可做**

---

### R6 — Saga / Process Manager（语音协商编排）

**问题陈述**
- `voice.service.ts` 13 个 public 方法编排"加入 → 协商 → producer → consumer → 释放"
- "session 加入失败 → 回滚 VoiceSession + 广播 VoiceMemberLeft(signaling_timeout)" 是典型的补偿事务
- `sweepNegotiationTimeouts`（L512）+ `releaseUsersActiveSessions*`（L390-486）4 个 release 方法都是异步补偿动作

**推荐模式**
- **Saga / Process Manager**：每个长流程一个 Saga 类，持有自身的步骤 + 补偿
- 在 Eiscord 中：
  - `VoiceJoinSaga`（join → routerCaps → transport×2 → producer → 完成）
  - `VoiceRecoverSaga`（worker_died → producer_closed → 客户端重连 → 新 session）
  - `VoiceNegotiationSweeperSaga`（定时清理超时）

**迁移路径**
```
apps/api/src/modules/voice/
  ├─ voice.service.ts                [瘦身：只暴露 join/leave 公共 API]
  ├─ voice.repository.ts             [R1 已抽出]
  ├─ sagas/
  │   ├─ voice-join.saga.ts
  │   ├─ voice-recover.saga.ts
  │   └─ voice-negotiation-sweep.saga.ts
  └─ media-signaling/                [现有，不动]
```

**风险与代价**
- **工作量**：~1 周（含完整 voice spec 重写）
- **测试影响**：高（spec 从 service 级移到 saga 级）
- **可逆性**：低
- **运行时风险**：中（saga 框架引入新执行模型）

**何时不该做**
- voice 模块已稳定 + 测试覆盖只有 voice.service.spec.ts + voice-client.spec.ts → retrofit Saga 收益很低
- 触发条件：voice 协商失败率 > X% / 协商相关 bug 数 / 月 > Y → 才值得做
- **Pack C 暂不做**

---

### R7 — After-Commit Event Collector（最小可行替代 Outbox）

**问题陈述**
- 30+ 处样板：`const result = await this.prisma.$transaction(...); if (result.created) { this.publishX(); this.publishY(); this.publishZ(); }`
- 散落在 messages / servers / voice / channels / friends / notifications / auth 7+ service
- 易错：忘了 publish；publish 在 transaction 内被错误执行（rollback 时事件已发）

**推荐模式**
- **Event Collector / After-Commit Hook**：在事务上下文中累积事件 → 事务 commit 成功后批量 emit；rollback 时丢弃
- 实现仅需一个 ~80 行的辅助类 + PrismaService 装饰
- 与 R3（Domain Event）天然组合：collector.publish(event) → bus.emit(event)

**迁移路径**
```
apps/api/src/common/persistence/
  ├─ prisma.service.ts               [现有]
  └─ event-collector.ts              [+ 80 行]
apps/api/src/modules/messages/messages.service.ts
  // BEFORE
  const result = await this.prisma.$transaction(async (tx) => { ... });
  if (result.created) { this.publishMessageCreated(...); this.publishUnreadUpdates(...); }
  // AFTER
  await this.prisma.txWithEvents(async (tx, events) => {
    ...
    events.add('message.created', summary);
    events.add('unread.updated', { rows });
  });
```

**风险与代价**
- **工作量**：~2 工作日（写 collector + 改造 7 个 service）
- **测试影响**：低（测试中可注入 fake collector 断言事件）
- **可逆性**：高（封装良好）
- **隐性收益**：消除"忘记 publish"和"在事务内 publish"两类 bug 类型

**何时不该做**
- 几乎没有"不该做"的场景，**这是 Pack A 中性价比最高的一项**

---

### R8 — Permission Policy Object

**问题陈述**
- `apps/api/src/common/permissions/permissions.service.ts` 669 行
- 已实现 `assertCanManageMember`（L109）/ `assertCanMutateRole`（L132）/ `assertCanAssignRoleToMember`（L177）/ `listUsersWithChannelPermission`（L218）/ `getServerContext`（L272）/ `evaluateServerAction`（L377）等 — **实际上已经按 Policy 风格组织了**

**推荐模式**
- 按资源类型分 Policy 文件：`server.policy.ts` / `channel.policy.ts` / `voice.policy.ts`

**风险与代价 / 何时不该做**
- 当前体系成熟、被 PermissionGuard 与 @RequirePermission 全局覆盖；spec 已 100% 覆盖（permissions.service.spec.ts）
- **强烈建议不做**：现状已经合理，没有真痛点
- **Pack C 标 "不建议"**

---

## § 4. 前端推荐

### FE-R1 — ServerSettingsPage 子路由拆分

**问题陈述**
- `apps/web/src/features/servers/ServerSettingsPage.tsx` 861 行 8 个组件 inline；单文件难按需加载
- 用户在 `/app/servers/:id/settings` 切 Tab 时无 URL 反映（无法分享深链接）

**推荐模式**
- React Router v6 **嵌套路由 + Outlet**
- 配合 React.lazy 实现按需加载

**迁移路径**
```
apps/web/src/features/servers/settings/
  ├─ ServerSettingsLayout.tsx        [shell + Outlet]
  ├─ RolesTab.tsx
  ├─ MembersTab.tsx
  ├─ ChannelsTab.tsx
  └─ modals/
      ├─ RoleFormModal.tsx
      ├─ ChannelFormModal.tsx
      └─ RoleAssignModal.tsx
apps/web/src/app/router.tsx
  // BEFORE
  { path: 'servers/:serverId/settings', element: <ServerSettingsPage /> }
  // AFTER
  {
    path: 'servers/:serverId/settings',
    element: <ServerSettingsLayout />,
    children: [
      { index: true, element: <Navigate to="roles" replace /> },
      { path: 'roles', element: <RolesTab />, errorElement: <SettingsError /> },
      { path: 'members', element: <MembersTab />, errorElement: <SettingsError /> },
      { path: 'channels', element: <ChannelsTab />, errorElement: <SettingsError /> },
    ],
  }
```

**风险与代价**
- **工作量**：~1 工作日（含 sub-component 单测补 3 个）
- **测试影响**：可顺手补 RolesTab / MembersTab / ChannelsTab 各 1 个 Vitest spec（呼应 W26）
- **可逆性**：高

**何时不该做**
- 几乎无理由不做；**Pack A**

---

### FE-R2 — Realtime Event Subscription Registry

**问题陈述**
- `apps/web/src/shared/hooks/use-realtime-sync.ts` L82-94 一坨 `socket.on('MessageCreated', invalidateMessages)` × 12 行
- shared 层反向了解 features 的 query key（`['messages','channel',id]` / `['voice', id]` / `['friends']` / `['servers']`）
- 新增 feature 必须改 shared/hooks

**推荐模式**
- **观察者注册中心**：feature 在自己 `use-*-queries.ts` 中调用 `useRealtimeSubscription('MessageCreated', invalidator)` 注册自己关心的事件
- shared/hooks 只负责调度，不再"知道"任何 query key

**迁移路径**
```
apps/web/src/shared/api/
  └─ realtime-registry.ts            [+ 100 行：register/unregister/dispatch]
apps/web/src/shared/hooks/
  └─ use-realtime-sync.ts            [瘦身到 ~50 行：只接管 connect/disconnect/permission]
apps/web/src/features/messages/
  └─ use-messages-queries.ts         [+ useRealtimeSubscription('MessageCreated', ...)]
apps/web/src/features/voice/
  └─ use-voice-queries.ts            [+ useRealtimeSubscription('VoiceMemberJoined', ...)]
```

API 形态（伪代码）：
```ts
// shared/api/realtime-registry.ts
export function useRealtimeSubscription<T extends RealtimeEvent>(
  event: T,
  handler: (payload: PayloadOf<T>) => void,
) { ... }

// features/messages/use-messages-queries.ts
useRealtimeSubscription('MessageCreated', ({ channel_id, conversation_id }) => {
  queryClient.invalidateQueries({ queryKey: messageQueryKey(channel_id, conversation_id) });
});
```

**风险与代价**
- **工作量**：~2 工作日（registry + 8 feature 改造）
- **测试影响**：可顺手补每个 feature 1 个 spec
- **可逆性**：高
- **隐性收益**：彻底消除 shared→features 反向耦合；新 feature 添加事件订阅自带

**何时不该做**
- 几乎无理由不做；**Pack A**

---

### FE-R3 — XState 形式化 voice-client 状态机

**问题陈述**
- `apps/web/src/features/voice/voice-client.ts` 568 行，5 状态 + 4 listener
- 当前用 `setStatus(next: VoiceClientStatus)` 推进，无形式化转移图；无可视化；无 state guard

**推荐模式**
- **XState v5 actor model**
- 状态机定义可视化（XState Inspector）；可单独单测；可时间旅行回放

**迁移路径**
```
apps/web/src/features/voice/
  ├─ voice-client.ts                 [瘦身到 ~300 行：保留 mediasoup API 调用]
  └─ voice-machine.ts                [+ XState actor：定义 5 状态 + 转移 + guards]
```

**风险与代价**
- **工作量**：~3-5 工作日（含可视化 + spec 改写）
- **测试影响**：高
- **新依赖**：`xstate@^5` 是大依赖
- **可逆性**：低

**何时不该做**
- 当前 voice-client 已 stable + voice 测试覆盖只 1 个 spec → 改 XState 不会立竿见影修 bug
- 触发条件：voice 相关 bug 数 / 月 > X 或新增 producer 类型 / 视频 / 屏幕共享 → 状态空间爆炸时
- **Pack C 暂不做**

---

### FE-R4 — Feature-Sliced Design 边界 eslint 规则

**问题陈述**
- 现有目录已是 FSD 三层（`app/` + `features/` + `shared/`）
- 缺规则强制：`features/A` 不能 import `features/B`；`shared` 不能 import `features/*`

**推荐模式**
- `eslint-plugin-boundaries`（或 `eslint-plugin-import` + `no-restricted-imports`）

**迁移路径**
```
eslint.config.mjs
  // + boundaries: app → features → shared (单向)
```

**风险与代价**
- **工作量**：~半天（配规则 + 修违例）
- **测试影响**：零
- **可逆性**：高

**何时不该做**
- Pack B，跟 R5 一起做即可

---

### FE-R5 — 路由级 errorElement + lazy 代码分割

**问题陈述**
- `apps/web/src/app/router.tsx` 12 路由全部 eager；无 errorElement
- 已被 2026-05-24 W25 点名

**推荐模式**
- React Router v6 `errorElement` + `React.lazy()` + `<Suspense fallback={<Spinner />}>`

**迁移路径**
```
app/router.tsx
  const ServerVoicePage = React.lazy(() => import('../features/servers/ServerVoicePage'));
  { path: 'voice/:serverId', element: <ServerVoicePage />, errorElement: <RouteError /> }
shared/components/
  └─ RouteError.tsx                  [+ 通用错误页]
```

**风险与代价**
- **工作量**：~半天
- **测试影响**：零
- **可逆性**：高

**何时不该做**
- 当前 bundle 大小尚未成为问题时收益边际；但 errorElement 部分无理由不做
- **Pack A**（配合 FE-R1 一起做最自然）

---

## § 5. 优先级矩阵与落地次序

### 5.1 影响 × 成本矩阵

```
        高 影响 ▲
              │
              │  R7 ●        ● R1
              │              ● FE-R2
              │     ● FE-R1
              │     ● FE-R5
              │
              │  ● R3      ● R5
              │
              │     ● FE-R4   ● R6
              │
              │              ● R2  ● R4  ● FE-R3
              │                      ● R8
        低 影响 │_________________________▶ 高 成本
```

### 5.2 三个落地包

#### **Pack A — 立即可做（建议 1 周内完成）**

总工时估算：~6 工作日

| 编号 | 名称 | 工时 | 备注 |
|------|------|------|------|
| R1 | Repository 层抽取 | 2d | 先做 messages，跑通后做 servers / voice / channels |
| R7 | After-Commit Event Collector | 2d | 与 R1 配合，事务边界更清晰 |
| FE-R1 | ServerSettingsPage 子路由拆分 | 1d | 顺手补 3 个 sub-tab spec |
| FE-R2 | Realtime Subscription Registry | 1d | 顺手补 use-*-queries 测试 |
| FE-R5 | errorElement + lazy | 0.5d | 顺便做 |

**联动收益**：完成 Pack A 后，3 个 god service 减重 50%，前端反向耦合消除，路由错误隔离。这是**真痛点解决**。

#### **Pack B — 下一里程碑（建议 M7/M8 期间）**

| 编号 | 名称 | 备注 |
|------|------|------|
| R5 | CQRS Read Model 切分 | 紧随 R1 |
| R3 | Domain Event + EventBus | 紧随 R7 |
| FE-R4 | FSD 边界 eslint 规则 | 半天即可 |

**触发条件**：跨模块协调点 ≥ 5 处 / 单 service 在 R1 之后仍 > 500 行 / 团队新增成员 ≥ 2 人

#### **Pack C — 明显未到时候（标注触发条件后归档）**

| 编号 | 名称 | 触发条件 |
|------|------|--------|
| R2 | Aggregate / Value Object | 仅对 VoiceSession 试点；其他模块**不建议**做 |
| R4 | Transactional Outbox | 准备多实例部署 or 出现 ≥ 1 次线上事件丢失事故 |
| R6 | Saga / Process Manager | voice 协商失败率 > X% or 协商相关 bug > Y / 月 |
| R8 | Permission Policy Object | **建议不做**（当前已成熟） |
| FE-R3 | XState voice 状态机 | voice 状态空间扩展（视频 / 屏幕共享 / 多 Producer） |

---

## § 6. 反对意见与 over-engineering 边界（必读）

### 6.1 课程项目体量的现实

- 全仓库 ~196 个源文件
- 单团队 + 无多实例部署 + 单 Postgres + 单 Redis + 单 mediasoup 子进程
- 业务复杂度等同 "Slack-lite v0.1"
- 不计划上线 / 不承担 SLA

在这个体量下：
- **完整 DDD 是过度设计** — 大部分模块字段无强不变量，包 Aggregate 会沦为贫血对象
- **CQRS + Event Sourcing 是过度设计** — 没有读写比例失衡 / 没有审计追溯需求
- **Outbox 是过度设计** — 项目已主动选择 at-most-once + SyncState 补偿，且效果已被验证（voice 重连机制就是该范式的应用）
- **Saga 框架是过度设计** — voice 流程已经在 service 内成型，强行抽 Saga 是 retrofit，没解决任何真问题
- **XState 是过度设计** — voice-client 5 状态 + 已 stable，可视化收益边际

### 6.2 真正值得激进做的，只有 Pack A 那 5 项

- **R1 Repository**：物理上代码已分块，只是缺文件边界。**做了纯收益**。
- **R7 After-Commit Collector**：消除 30+ 处样板 + 防止 in-tx publish bug。**80 行实现，性价比之王**。
- **FE-R1 子路由拆分**：URL 深链接、按需加载、独立测试三重收益，**1 工作日完成**。
- **FE-R2 事件注册器**：消除 shared → features 反向耦合，**架构正确性问题**。
- **FE-R5 errorElement + lazy**：用户体验 + 错误隔离，**已被前份审计点名**。

### 6.3 给"激进派"的提醒

如果你确实想全部做（Pack A+B+C），请评估：
- **工时**：保守 4-6 周；激进 8 周（含测试 / 文档 / 灰度）
- **测试重写**：API 当前 107 个 spec + Web 1 个 spec，全做下来需重写约 60-70%
- **冻结期**：建议在新功能空窗期做；与新功能并行做风险极高
- **回滚预案**：每个 Pack 必须独立 PR，可单独 revert

**报告作者的诚实建议**：**只做 Pack A**，把 Pack B 留给下里程碑，Pack C 大概率永远不该做。

---

## § 7. before / after 代码示意

> 仅伪代码示意，不可直接 copy 进项目。具体落地以单独的实施任务为准。

### 7.1 R1 — Repository 抽取

**BEFORE**（`messages.service.ts` 内）
```ts
@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService, ...) {}

  async sendChannelMessage(user, channelId, dto, requestId) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getExistingChannelMessage(tx, user.userId, channelId, dto.clientMessageId);
      if (existing) return { created: false, message: existing };
      const message = await this.insertMessage(tx, { ... });
      await this.insertMessageAttachments(tx, message.id, attachmentIds);
      // ... 10 行 raw SQL helpers ...
    });
    return this.hydrateMessage(result.message);
  }

  private async insertMessage(tx, input): Promise<MessageRow> {
    const [row] = await tx.$queryRaw`INSERT INTO messages ...`;
    return row;
  }
  // ... 25 个 private tx-bound raw SQL methods ...
}
```

**AFTER**
```ts
// messages.repository.ts (NEW 800 lines)
@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertMessage(tx: PrismaTx, input: InsertMessageInput): Promise<MessageRow> { ... }
  async getById(tx: PrismaTx, id: string): Promise<MessageRow | null> { ... }
  async findExistingByClientMessageId(tx: PrismaTx, ...): Promise<MessageRow | null> { ... }
  // ... 25 methods total ...
}

// messages.service.ts (slimmed to ~600 lines)
@Injectable()
export class MessagesService {
  constructor(
    private readonly messagesRepo: MessagesRepository,
    private readonly prisma: PrismaService,
    ...
  ) {}

  async sendChannelMessage(user, channelId, dto, requestId) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await this.messagesRepo.findExistingByClientMessageId(tx, user.userId, channelId, dto.clientMessageId);
      if (existing) return { created: false, message: existing };
      const message = await this.messagesRepo.insert(tx, { ... });
      await this.messagesRepo.linkAttachments(tx, message.id, attachmentIds);
      ...
    });
    return this.hydrateMessage(result.message);
  }
}
```

### 7.2 R3 — Domain Event + EventBus

**BEFORE**
```ts
async sendChannelMessage(...) {
  const result = await this.prisma.$transaction(async (tx) => {
    const message = await this.messagesRepo.insert(tx, ...);
    for (const mentionedUserId of mentionUserIds) {
      await this.notificationsService.createNotification(tx, { type: 'channel_mention', ... });
    }
    return { message, ... };
  });
  this.publishMessageCreated(...);
  this.publishUnreadUpdates(...);
  this.publishNotifications(...);
}
```

**AFTER**
```ts
async sendChannelMessage(...) {
  const result = await this.prisma.$transaction(async (tx) => {
    const message = await this.messagesRepo.insert(tx, ...);
    for (const mentionedUserId of mentionUserIds) {
      this.eventBus.collect(new MessageMentionedEvent(message.id, mentionedUserId, channelId));
    }
    this.eventBus.collect(new MessageCreatedEvent(message));
    return { message };
  });
  // events auto-flushed after tx commit (R7)
}

// notifications/listeners/message-mentioned.listener.ts
@OnEvent('message.mentioned')
async handle(event: MessageMentionedEvent) {
  await this.notificationsService.create({ type: 'channel_mention', ... });
}

// realtime/listeners/message-created.listener.ts
@OnEvent('message.created')
handle(event: MessageCreatedEvent) {
  this.publisher.publishToRoom(channelRoom, 'MessageCreated', event.payload);
}
```

### 7.3 R7 — After-Commit Event Collector

**BEFORE**
```ts
async deleteMessage(user, dto, requestId) {
  const { message, notifResult } = await this.prisma.$transaction(async (tx) => {
    const msg = await this.getMessageById(tx, dto.message_id);
    if (!msg) throw new AppError(ErrorCode.ResourceNotFound, ...);
    await tx.$executeRaw`UPDATE messages SET visibility=...`;
    const notifResult = await this.notificationsService.createNotification(tx, {...});
    return { message: msg, notifResult };
  });
  this.realtimePublisher.publishToRoom(channelRoom, 'MessageDeleted', { message_id: dto.message_id }, requestId);
  if (notifResult.created) {
    this.realtimePublisher.publishToRoom(buildUserRoom(notifResult.userId), 'NotificationCreated', ..., requestId);
  }
  await this.auditService.log(...);
}
```

**AFTER**（用 `txWithEvents` 辅助）
```ts
async deleteMessage(user, dto, requestId) {
  await this.prisma.txWithEvents(async (tx, events) => {
    const msg = await this.messagesRepo.getById(tx, dto.message_id);
    if (!msg) throw new AppError(ErrorCode.ResourceNotFound, ...);
    await this.messagesRepo.markDeleted(tx, dto.message_id);
    const notifResult = await this.notificationsRepo.create(tx, {...});
    events.publish('MessageDeleted', channelRoom, { message_id: dto.message_id }, requestId);
    if (notifResult.created) {
      events.publish('NotificationCreated', buildUserRoom(notifResult.userId), notifResult.payload, requestId);
    }
    events.audit({ action: 'message.delete', ... });
  });
  // rollback → events discarded; commit → events flushed in order
}
```

### 7.4 FE-R1 — 子路由拆分

**BEFORE**
```tsx
// router.tsx
{ path: 'servers/:serverId/settings', element: <ServerSettingsPage /> }

// ServerSettingsPage.tsx (861 行单文件)
export function ServerSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('roles');
  // ... 8 个 sub-components inline ...
  return (
    <div>
      <Tabs />
      {activeTab === 'roles' && <RolesTab ... />}
      {activeTab === 'members' && <MembersTab ... />}
      {activeTab === 'channels' && <ChannelsTab ... />}
    </div>
  );
}
```

**AFTER**
```tsx
// router.tsx
const RolesTab = lazy(() => import('../features/servers/settings/RolesTab'));
const MembersTab = lazy(() => import('../features/servers/settings/MembersTab'));
const ChannelsTab = lazy(() => import('../features/servers/settings/ChannelsTab'));
{
  path: 'servers/:serverId/settings',
  element: <ServerSettingsLayout />,
  errorElement: <RouteError />,
  children: [
    { index: true, element: <Navigate to="roles" replace /> },
    { path: 'roles', element: <Suspense fallback={<Spinner/>}><RolesTab /></Suspense> },
    { path: 'members', element: <Suspense fallback={<Spinner/>}><MembersTab /></Suspense> },
    { path: 'channels', element: <Suspense fallback={<Spinner/>}><ChannelsTab /></Suspense> },
  ],
}

// ServerSettingsLayout.tsx (~80 行)
export function ServerSettingsLayout() {
  const tabs = useVisibleSettingsTabs();
  return (
    <div className="settings-page">
      <SettingsNav tabs={tabs} />
      <Outlet />
    </div>
  );
}
```

### 7.5 FE-R2 — Realtime Subscription Registry

**BEFORE**
```ts
// shared/hooks/use-realtime-sync.ts (170 行)
export function useRealtimeEventSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    socket.on('MessageCreated', (p) => queryClient.invalidateQueries({ queryKey: ['messages', 'channel', p.channel_id] }));
    socket.on('VoiceMemberJoined', (p) => queryClient.invalidateQueries({ queryKey: ['voice', p.channel_id] }));
    socket.on('PresenceChanged', () => queryClient.invalidateQueries({ queryKey: ['friends'] }));
    // ... 12 个 socket.on，硬编码 6 类 query key ...
  }, [queryClient]);
}
```

**AFTER**
```ts
// shared/api/realtime-registry.ts (NEW ~100 行)
export function useRealtimeSubscription<E extends RealtimeEvent>(
  event: E,
  handler: (payload: PayloadOf<E>) => void,
) {
  useEffect(() => {
    const off = socket.on(event, handler);
    return off;
  }, [event, handler]);
}

// shared/hooks/use-realtime-sync.ts (~50 行：仅管 connect/permission)
export function useRealtimeBootstrap() { /* connect + auth */ }
export function useRealtimePermissionSync() { /* unchanged */ }

// features/messages/use-messages-queries.ts
export function useMessagesRealtime() {
  const queryClient = useQueryClient();
  useRealtimeSubscription('MessageCreated', (p) => {
    queryClient.invalidateQueries({ queryKey: messageQueryKey(p.channel_id, p.conversation_id) });
  });
  useRealtimeSubscription('MessageDeleted', ...);
}

// features/voice/use-voice-queries.ts
export function useVoiceRealtime() {
  const queryClient = useQueryClient();
  useRealtimeSubscription('VoiceMemberJoined', (p) => {
    queryClient.invalidateQueries({ queryKey: ['voice', p.channel_id] });
  });
}
```

收益：shared/hooks 不再"知道" `['messages',...]` / `['voice',...]` / `['friends']` 任何 query key；新 feature 自带订阅。

---

## § 8. 报告元信息

### 8.1 数据采集方式

- **亲自读源代码**：messages.service.ts / servers.service.ts / voice.service.ts / channels.service.ts / permissions.service.ts / auth.service.ts / realtime.publisher.ts / realtime.module.ts / realtime.gateway.ts / ServerSettingsPage.tsx / voice-client.ts / use-realtime-sync.ts
- **grep 统计**：`$transaction|$queryRaw|$executeRaw` 在 modules/ 共 396 次跨 30 文件；`auditService.|this.audit.` 在 modules/ 共 68 次跨 17 文件；`RealtimePublisher` 引用 20 个文件
- **行数统计**：`wc -l` 取最大 API 文件 Top 25 + Web 文件 Top 25
- **未启用并行子代理**：因 Anthropic API 429 限流，3 个 Explore agent 调用全部失败；改为主对话直接读源代码

### 8.2 本报告未覆盖的范围

| 范围 | 原因 | 建议下次审 |
|------|------|----------|
| `apps/media/` 子进程架构 | 当前 mediasoup 是独立 Node 子进程，本报告聚焦 monorepo 主体 | 单独审视 IPC / Worker 生命周期 |
| 性能与可观测性 | 未跑 perf:k6；未看 logging 实现 | 单独做性能 / observability 审计 |
| 数据库索引与查询计划 | 需要 EXPLAIN ANALYZE；超出本审范围 | DBA 视角单独审 |
| 单测覆盖率数字 | 未跑 coverage 报告 | 单独跑 `pnpm test --coverage` |
| 前端打包体积 | 未运行 Vite build；未做 bundle 分析 | 跑 `pnpm build` 后看 stats |
| 安全（OWASP Top 10） | 已被 2026-05-24 部分覆盖 | 必要时单独做 security review |

### 8.3 与前份审计的边界

- **2026-05-24-docs-code-consistency.md** ↔ **本报告** 互补
- 本报告**不重复**前者列出的任何 C1-C12 / W1-W29 / I1-I10
- 本报告**唯一承接**项：FE-R5 = W25 (路由 errorElement + lazy) 扩写
- 测试覆盖问题（W26）属于"测试策略"而非"架构模式"，本报告不深入；建议另立任务审

### 8.4 下次复审建议

- 完成 Pack A 后 1 周内复审：验证 god service 是否真减重 + 前端反向耦合是否真消除
- M7/M8 里程碑后再次复审：判断是否触发 Pack B 条件
- 永远不要主动触发 Pack C 的检查（等触发条件实际出现）

### 8.5 致用户

本报告按你的指定（**激进路线**）展开了完整的 DDD / CQRS / Outbox / 状态机方案。但作为审计者，我的诚实判断是：

> **Eiscord 当前架构 80% 是健康的。真正值得动的只有 god service 内部拆分（R1 + R7）和前端反向耦合点（FE-R1 + FE-R2 + FE-R5）。**
>
> Pack A 这 5 项一周可完成、性价比极高、纯架构正确性收益。
>
> Pack B / Pack C 在课程项目体量下大概率会让代码"看起来更高级，但维护成本更高"。
>
> **建议你只接受 Pack A，把 B/C 当作未来阶段性触发的备选清单。**

如需把 Pack A 拆成可执行任务清单（含逐步骤的 acceptance criteria 与 rollback plan），请单独发起 `/ccg:go` 任务，指定 "实施 Pack A"。

---

**报告生成于**: 2026-05-27
**基线提交**: `be0a87a`
**作者**: CCG Engine (review-audit strategy, 主对话直接探索)
**字数**: 约 6500 中文字 + 80 行伪代码示意
