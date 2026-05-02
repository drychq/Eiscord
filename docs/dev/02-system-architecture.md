# 系统架构设计

## 架构目标

系统围绕“社区 + 频道 + 实时互动”设计，目标是在课程项目范围内交付一个可运行、可演示、可验收的 MVP。架构必须同时满足：

- 注册登录、好友私聊、社区频道、文本消息、通知未读、权限和语音状态同步的 P0 需求。
- 文本消息 1 秒内可见、未读通知 2 秒内同步、语音状态 3 秒内同步的非功能指标。
- 所有受控资源都经过统一权限判断，不能通过历史链接、附件地址或实时事件绕过授权。
- v1 只实现语音频道成员状态同步，不实现真实音频媒体流。

## 逻辑分层

```text
Browser
  |
  | HTTP JSON / Socket.IO
  v
API Gateway Layer
  - Auth guard
  - Request validation
  - Permission guard
  - Rate limit
  |
  v
Application Services
  - Auth, Users, Friends
  - Servers, Channels, Permissions
  - Messages, Notifications, Voice
  |
  v
Domain and Persistence
  - Prisma repositories
  - PostgreSQL transactions
  - Redis presence/cache
  - MinIO object metadata linkage
  |
  v
External Services
  - Object storage
  - Mail/SMS verification
  - Logs and monitoring
```

HTTP API 负责命令型业务动作，Socket.IO 负责状态分发和订阅。两者共用同一套应用服务，实时网关不得直接实现业务写入逻辑。

## 模块依赖

| 上游模块 | 依赖 | 说明 |
|---|---|---|
| Auth | Users、Audit | 登录注册创建用户、会话和审计。 |
| Users | Attachments、Realtime | 资料变更和状态变更需要同步给可见用户。 |
| Friends | Users、Notifications、Realtime | 好友申请、接受、私聊入口和通知。 |
| Servers | Permissions、Notifications、Realtime、Audit | 社区创建、加入、退出和成员管理。 |
| Channels | Permissions、Realtime、Audit | 频道结构变化和权限覆盖变化。 |
| Messages | Permissions、Notifications、Realtime、Audit | 消息写入、历史加载、删除和未读。 |
| Voice | Permissions、Realtime、Audit | 语音状态房间加入、退出和状态变化。 |
| Notifications | Realtime | 通知生成、未读更新和已读同步。 |
| Permissions | Audit | 所有受控操作的权限计算和拒绝审计。 |

依赖方向必须保持由业务入口指向公共能力，禁止公共模块反向依赖具体业务模块。权限模块可以读取角色、成员、频道覆盖和所有者信息，但不能直接修改业务数据。

## HTTP 请求链路

以发送频道消息为例：

1. 前端调用 `POST /api/v1/channels/{channel_id}/messages`，携带 access token、客户端临时消息 ID 和内容。
2. API 层验证 token，生成或透传 `request_id`。
3. DTO 校验消息内容、附件 ID、提及列表和长度限制。
4. `PermissionsModule` 计算用户是否能查看频道并发送消息。
5. `MessagesModule` 在事务中写入 `Message`、修正 `ReadState`、生成必要 `Notification`。
6. `AuditModule` 记录成功或失败的关键动作。
7. `RealtimeModule` 向频道房间发布 `MessageCreated`、向相关用户发布 `UnreadUpdated` 和 `NotificationCreated`。
8. HTTP 返回持久化消息、服务端时间和分发摘要。

权限失败时在第 4 步结束，返回统一错误，不写入消息，不广播事件。

## 实时事件链路

Socket.IO 连接建立后执行以下流程：

1. 客户端连接 `/realtime`，在握手阶段携带 access token。
2. 服务端验证会话，建立用户级房间 `user:{user_id}`。
3. 客户端显式订阅当前社区、频道或私聊上下文。
4. 服务端订阅前再次进行权限校验，只把用户加入有权接收的房间。
5. 业务服务完成写入后调用统一事件发布器。
6. 事件发布器根据权限和接收范围发布到用户房间、频道房间、私聊房间或语音房间。
7. 客户端收到事件后更新 TanStack Query 缓存和本地 UI 状态。

客户端重连后必须重新订阅上下文，并通过 HTTP 拉取历史消息、未读状态、通知摘要和语音状态列表作为补偿。

## 数据写入原则

| 场景 | 一致性要求 |
|---|---|
| 创建社区 | `Server`、所有者 `Membership`、默认 `Role`、默认 `Channel` 必须同事务成功。 |
| 加入社区 | 邀请校验、成员创建、默认角色分配、未读初始化必须同事务成功。 |
| 发送消息 | 消息、附件引用、提及、通知和未读更新必须以业务事务为边界。 |
| 删除消息 | 消息可见状态、审计、通知/未读修正必须一致。 |
| 权限变更 | 角色、成员角色或覆盖规则写入后必须同步发布 `PermissionChanged`。 |
| 语音退出 | `VoiceSession` 失效和 `VoiceMemberLeft` 发布必须最终一致，重复事件必须幂等。 |

实时事件只在数据库提交成功后发布。若事件发布失败，服务端保留数据库事实，客户端重连后通过查询补齐。

## 房间模型

| 房间 | 成员 | 用途 |
|---|---|---|
| `user:{user_id}` | 用户自己的所有活跃连接 | 通知、未读、个人状态、私有反馈。 |
| `dm:{conversation_id}` | 私聊参与者的活跃连接 | 私聊消息、删除、已读变化。 |
| `server:{server_id}` | 有权查看成员列表的社区成员 | 成员变化、权限刷新、社区级通知。 |
| `channel:{channel_id}` | 有权查看目标频道的成员 | 文本频道消息和频道状态变化。 |
| `voice:{channel_id}` | 当前语音频道成员 | 语音加入、退出、静音、闭麦状态。 |

用户权限变化后，服务端必须从用户无权继续访问的房间中移除对应连接，并发送或触发 `PermissionChanged` 后的界面刷新。

## 外部依赖

| 依赖 | MVP 行为 |
|---|---|
| MinIO/S3 | 存储头像、社区图标和消息附件文件，业务数据库保存附件元数据和访问上下文。 |
| 邮件/短信验证 | P0 注册可进入待验证状态；P1 密码找回使用验证凭据。 |
| 推送通知 | v1 至少生成站内通知；外部离线推送失败不得影响消息写入。 |
| 日志监控 | 记录请求、错误、权限拒绝和关键审计动作。 |

## 故障与降级

- Redis 短暂不可用时，HTTP 核心读写仍可访问 PostgreSQL；在线状态、限流和实时房间辅助能力降级。
- MinIO 不可用时，发送纯文本消息、登录、社区浏览和历史加载保持可用；附件上传返回明确错误。
- Socket.IO 断线时，客户端进入离线提示状态，重连后通过 HTTP 补齐消息和未读。
- 通知生成失败不得回滚已经成功的消息写入，但必须记录错误并允许后续补偿。

