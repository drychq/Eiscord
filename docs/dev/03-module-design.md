# 模块详细设计

## 模块总览

| 模块 | 范围 | 主要 FR | 核心实体 |
|---|---|---|---|
| 账号与身份模块 | 注册、登录、密码重置、会话摘要、个人资料和在线状态。 | FR-01 至 FR-05 | User、Attachment、ReadState、AuditLog |
| 社交与私聊模块 | 好友申请、好友关系、一对一会话、私聊消息入口。 | FR-06、FR-07 | Friendship、DirectConversation、Message |
| 社区与成员模块 | 社区创建、邀请、加入退出、成员列表和基础管理。 | FR-08、FR-09、FR-10 | Server、Invitation、Membership |
| 频道模块 | 文本频道、语音频道、频道创建、频道配置和访问控制。 | FR-11、FR-12 | Channel、PermissionOverwrite |
| 消息与附件模块 | 文本消息写入、历史加载、附件元数据、提及、消息撤回和删除。 | FR-13 至 FR-15 | Message、Attachment、ReadState |
| 通知与未读模块 | 通知生成、通知已读、频道和私聊未读计数、实时角标同步。 | FR-07、FR-13、FR-14、FR-18 | Notification、ReadState |
| 权限模块 | 角色、成员角色、频道覆盖规则、统一权限计算和越权拦截。 | FR-12、FR-19、FR-20 | Role、Membership、PermissionOverwrite |
| 语音模块 | 语音频道加入、退出、静音、闭麦、断线释放、媒体信令编排和 SFU 房间生命周期。 | FR-16、FR-17 | VoiceSession、Channel、VoiceRouter（Redis）、VoiceTransport（Redis） |
| 审计与支撑模块 | 关键动作审计、失败请求追踪、配置限制、日志与监控接口。 | FR-02、FR-10、FR-15、FR-20、NFR-08 至 NFR-16 | AuditLog |

## 实施任务拆分

本节把模块设计拆成可编码、可验收的开发任务。任务按 `docs/dev/09-iteration-plan.md` 的 M1 至 M6 顺序推进，当前实现状态以本表为准。

| 任务 | 状态 | 覆盖 FR | 交付物 | 依赖 | 验收依据 |
|---|---|---|---|---|---|
| M1 账号基础 | 已实现 | FR-01、FR-02、FR-04 | 用户、会话、头像附件最小模型；注册、登录、刷新、退出、当前用户和资料更新接口；审计落库。 | 工程骨架、统一响应、请求 ID。 | AC-01、AC-E1、AC-E2。 |
| M1 在线状态字段预留 | 已预留 | FR-05 | `presenceStatus` 字段和 token 会话上下文；完整心跳和断线释放延后。 | M1 账号基础。 | AC-06、AC-E8。 |
| M2 社交与私聊骨架 | 已实现 | FR-06、FR-07 | 好友申请处理、好友列表、一对一私聊会话创建和私聊入口。 | M1 用户与鉴权。 | AC-01、AC-E3。 |
| M2 社区与成员骨架 | 已实现 | FR-08、FR-09 | 社区创建、默认角色、默认频道、邀请加入和退出限制。 | M1 用户与审计。 | AC-02、AC-E4。 |
| M3 频道、消息和未读 | 已实现 | FR-11、FR-13、FR-14、FR-18 | 频道 CRUD、文本/私聊消息、游标分页、`ReadState`、通知基础记录、附件预签名上传与受保护访问。 | M2 社区、私聊和权限基础。 | AC-02、AC-05、AC-E6。 |
| M4 权限与管理 | 已实现 | FR-10、FR-12、FR-15、FR-19、FR-20 | 角色 CRUD、成员角色分配、频道权限覆盖、统一 CheckPermission、成员移除/禁言/恢复、消息撤回/管理员删除。`@RequirePermissionForParam` 已接入 4 个 Controller（14 个端点）。前端频道覆盖编辑 UI（复用 PermissionBitEditor）。测试: PermissionGuard(6)、权限层级(7)、ServersService(2)。 | M2/M3 资源模型。 | AC-04、AC-E5、AC-E7、AC-N4。 |
| M5 实时与语音状态 | 已实现 | FR-05、FR-16、FR-17、FR-18 | `/realtime` 订阅权限、13 个服务端事件发布、在线状态(Presence+Redis)、通知同步(5 类: 好友/私聊/提及/成员管理/权限变更)、语音状态会话(CRUD+约束)。重连补偿流程(服务端 SyncState + 客户端重连缓存刷新)。测试: RealtimeGateway(14)、PresenceService(5)。 | M3 消息/通知、M4 权限。 | AC-03、AC-05、AC-06、AC-N1、AC-N2。 |
| M5.5 语音媒体平面 | 已实现 | FR-16、FR-17 | `apps/media`（API spawn 的 mediasoup Worker 子进程与健康检查）、`MediaSignalingModule`（Router/Transport/Producer/Consumer 编排、AudioLevelObserver、TURN HMAC 凭证签发）、客户端 mediasoup-client 基础集成、已存在 Producer 消费、Worker 崩溃后自动重新加入、docker-compose 增加可选 `mediasoup` 调试服务与 `coturn`。Producer 强制 `kind=audio`，服务端不录音/混音/转写。 | M5 实时与权限、M4 权限位扩展（SPEAK_VOICE/LISTEN_VOICE）。 | AC-03、AC-N2、AC-N6。 |
| M6 验收加固 | 已实现 | AC、AC-E、AC-N | API+Socket E2E、Playwright 浏览器 E2E、权限矩阵测试、异常流程测试、k6 压测脚本、幂等演示数据和本地验收说明。测试: API E2E(AC/AC-E/AC-N4)、Playwright(核心用户路径)、k6(AC-N1/AC-N2/AC-N3 可执行验证)。 | M1 至 M5。 | AC-01 至 AC-06、AC-E1 至 AC-E8、AC-N1 至 AC-N5。 |

## 账号与身份模块

### 注册 FR-01

- 接口：`RegisterUser`
- 写入：`User`、必要的 `AuditLog`
- 事件：可触发 `NotificationCreated`
- 校验：用户名和绑定联系方式平台唯一；密码满足长度和复杂度；验证服务不可用时账号进入待验证状态。
- 成功结果：返回 `user_id`、账号验证状态和基础资料摘要。

### 登录 FR-02

- 接口：`LoginUser`
- 写入：登录会话、登录审计、在线状态更新时间。
- 事件：`PresenceChanged`、`UnreadUpdated`
- 返回：access token、refresh token、用户摘要、好友摘要、社区列表、未读数和通知摘要。
- 失败：账号不存在、密码错误、账号禁用或验证未完成时不创建会话，连续失败记录安全审计。

### 密码找回 FR-03 P1

- 接口：`ResetPassword`
- 写入：密码哈希更新、旧凭据失效和安全审计。
- 事件：可触发 `NotificationCreated`
- 校验：验证凭据必须与账号绑定，且未过期、未重复使用。
- 失败：账号不存在、凭据错误、凭据过期或新密码不合规时拒绝重置。

### 个人资料 FR-04

- 接口：`UpdateProfile`
- 可改字段：昵称、头像附件、个性签名。
- 事件：资料摘要变化后向好友列表、私聊窗口和社区成员列表可见范围同步。
- 限制：头像必须引用合法 `Attachment`，昵称和签名必须满足长度限制。

### 在线状态 FR-05

- 接口：`UpdatePresence`
- 状态：`online`、`idle`、`busy`、`invisible`、`offline`
- Redis 保存活跃连接和最近心跳，PostgreSQL 保存可恢复的最后状态。
- 隐身对他人展示为离线，本人客户端仍展示真实选择。
- 断线超时后发布 `PresenceChanged`，并释放必要的语音状态。

## 社交与私聊模块

### 好友申请 FR-06

- 接口：`CreateFriendRequest`、`AcceptFriendRequest`
- 状态：`pending`、`accepted`、`rejected`、`deleted`
- 规则：不能向自己申请；同一对用户同一时刻只能有一条有效关系；处理者必须是申请接收方。
- 接受后创建或复用 `DirectConversation`，并向双方发布好友和通知事件。

### 私聊会话 FR-07

- 入口：好友关系接受后可打开一对一会话。
- 发送：复用 `SendMessage`，目标为 `conversation_id`。
- 历史：复用 `LoadMessages` 和 `MarkRead`。
- 权限：双方必须是会话参与者；非好友不能新发起私聊。
- 好友删除后可隐藏入口，但历史消息保留并按隐私策略展示。

## 社区与成员模块

### 创建社区 FR-08

- 接口：`CreateServer`
- 同事务写入：`Server`、所有者 `Membership`、默认 `Role`、默认文本 `Channel`。
- 默认角色必须存在，默认频道必须可被所有者访问。
- 失败时不得留下不完整社区。

### 加入与退出 FR-09

- 接口：`JoinServer`、`LeaveServer`
- 加入校验：邀请存在、未过期、未超使用次数、用户未被限制、未重复加入。
- 加入写入：`Membership`、默认角色、初始 `ReadState`。
- 退出规则：普通成员可退出；所有者必须先转移所有权；退出后释放语音会话并移除实时房间。

### 成员管理 FR-10

- 接口：`ManageMember`
- 能力：查看成员列表、移除成员、禁言、恢复。
- 约束：管理员不能管理所有者或高于自身权限的成员。
- 事件：`MemberChanged`、`PermissionChanged`、`PresenceChanged`
- 审计：成员移除、禁言、恢复必须写入 `AuditLog`。

## 频道模块

### 频道配置 FR-11

- 接口：`CreateChannel`
- 类型：`text`、`voice`
- 字段：名称、主题、排序、可见性、权限覆盖。
- 删除频道后禁止继续发送消息或加入语音状态。
- 频道列表按用户权限过滤，客户端不展示无权频道。

### 频道访问控制 FR-12

- 接口：`CheckPermission`
- 判断场景：查看频道、发送消息、加入语音、删除消息、访问附件、管理频道。
- 规则：所有者最高优先级；显式拒绝优先；频道覆盖参与计算；角色优先级用于管理动作比较。
- 权限变化后立即影响后续接口和实时订阅。

## 消息与附件模块

### 消息发送 FR-13

- 接口：`SendMessage`
- 支持：纯文本、附件元数据、提及列表。
- 事务：保存消息、附件引用、提及、未读和通知。
- 事件：`MessageCreated`、`UnreadUpdated`、`NotificationCreated`
- 限制：空消息、超长消息、非法附件、无权发送和目标不存在均拒绝，失败消息不得广播。

### 历史与未读 FR-14

- 接口：`LoadMessages`、`MarkRead`
- 分页：游标分页，默认按创建时间倒序加载，进入界面后可定位最近未读。
- 权限：加载前检查会话或频道查看权限。
- 已读：读取位置不能指向无权消息，读取位置回退默认拒绝。

### 撤回与删除 FR-15

- 接口：`DeleteMessage`
- 发送者可撤回自己的消息；管理员可删除有权管理频道内的消息。
- 删除只改变消息可见状态并保留审计元数据。
- 私聊中不得删除对方历史记录的服务端存档。

## 通知与未读模块

本模块横跨私聊、频道消息、提及和阅读状态，除 FR-18 外，还承担 FR-07、FR-13 和 FR-14 中的未读角标与实时同步职责。

### 通知 FR-18

- 来源：好友申请、私聊新消息、频道提及、管理动作结果、未读变化。
- 接口：`MarkNotificationRead`
- 事件：`NotificationCreated`、`UnreadUpdated`
- 去重：同一业务事件不得重复生成等价通知。
- 权限：通知摘要不得泄露用户已无权访问的频道或附件内容。

### 未读

- `ReadState` 按用户与私聊/频道维度保存。
- 当前打开会话收到新消息时可自动标记已读，但必须由客户端上下文确认。
- 重连后以前端拉取的服务端未读状态为准。

## 权限模块

### 角色 FR-19

- 接口：`AssignRole`
- 能力：创建角色、修改权限、分配成员角色、删除非默认角色。
- 约束：默认角色不得删除到社区无默认权限状态；管理员不得授予超出自身能力的角色。
- 事件：`PermissionChanged`、`MemberChanged`

### 统一拦截 FR-20

- 所有受控接口先调用 `CheckPermission` 等效逻辑。
- 权限拒绝返回统一错误并记录必要审计。
- 实时订阅、附件访问和历史消息加载同样必须调用权限校验。

## 语音模块

### 加入与退出 FR-16

- 接口：`JoinVoiceChannel`、`LeaveVoiceChannel`
- 一个用户同一时刻只允许存在一个有效 `VoiceSession`。
- 加入前检查频道类型、成员身份和 `JOIN_VOICE` 权限。
- 加入成功后必须在 30 秒内完成 mediasoup 媒体协商，否则服务端释放会话并广播 `VoiceMemberLeft(reason=signaling_timeout)`。
- 断线、退出社区、权限移除或频道删除时释放语音会话，关闭对应 Transport/Producer 并清理 Redis 运行期键。

### 状态同步 FR-17

- 接口：`UpdateVoiceState`
- 状态：静音 `muteState`、闭麦 `deafenState`、连接状态 `connectionStatus`（`connecting`/`connected`/`disconnected`）、媒体状态 `mediaState`（`idle | negotiating | connected | reconnecting | failed`）。
- 静音切换 = 服务端调用 mediasoup `Producer.pause/resume`；闭麦 = 客户端关闭所有 Consumer 音频元素并标记 `deafenState`。
- 事件：`VoiceStateChanged`、必要时 `VoiceMemberLeft`、`VoiceProducerClosed`。
- 同步目标：同语音频道成员和有权查看该语音频道成员列表的用户，状态可达时间不超过 3 秒。

### 媒体信令 FR-16/FR-17

- 由 `MediaSignalingModule` 实现，复用 `/realtime` Socket.IO 命名空间承载请求-响应事件。
- 拓扑：1 个 mediasoup Worker 进程池 → 每个语音频道分配 1 个 Router → 每个用户 1 个 send Transport + 1 个 recv Transport → 每个发言者 1 个 audio Producer，每个监听者按发言者数量创建 Consumer。
- RTP capabilities 协商通过 `VoiceRouterCapabilities`；Transport 创建/连接通过 `VoiceTransportCreated` / `VoiceTransportConnect`；Producer/Consumer 生命周期通过 `VoiceProducerCreated` / `VoiceConsumerCreated` / `VoiceConsumerResumed` / `VoiceProducerClosed`。
- Producer 创建前强制校验 `SPEAK_VOICE` 权限与 `kind === 'audio'`，video 与 screen 直接拒绝。
- active speaker 检测使用 mediasoup AudioLevelObserver，结果由服务端节流（≤2 次/秒）后通过 `VoiceActiveSpeaker` 广播。
- TURN 凭证由服务端基于 `TURN_SHARED_SECRET` 用 HMAC 签发，TTL 默认 5 分钟，临近过期由客户端调用 `GET /voice/sessions/{id}/ice-servers` 续签。
- Worker 崩溃恢复：进程退出后服务端关闭受影响 `VoiceSession`，广播 `VoiceProducerClosed(reason=worker_died)` 与 `VoiceMemberLeft(reason=worker_died)`；客户端收到后自动重新加入并走完整协商。

## 审计与支撑模块

- 本模块服务于账号安全、社区管理、消息治理和权限拦截，覆盖 FR-02、FR-10、FR-15、FR-20 以及 NFR-08 至 NFR-16。
- 登录失败、权限拒绝、成员移除、角色变更、消息删除、频道删除必须记录审计。
- 审计日志不得包含明文密码、完整 token、完整验证码或完整敏感凭证。
- 请求和事件链路必须携带 `request_id` 或 `event_id`。
- 配置项包括上传限制、通知开关、成员上限和限流阈值，配置变更 5 分钟内生效。
