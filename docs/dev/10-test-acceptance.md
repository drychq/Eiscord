# 测试与验收方案

## 测试层级

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 单元测试 | Vitest/Jest | 权限计算、DTO 校验、服务层业务规则。 |
| API 集成测试 | Supertest | HTTP 接口、鉴权、错误格式、事务结果。 |
| 实时集成测试 | Socket.IO client | 连接、订阅、事件分发、重连补偿、mediasoup 信令请求-响应。 |
| 前端组件测试 | React Testing Library | 表单、消息列表、权限按钮、错误状态。 |
| E2E 测试 | Playwright | 注册登录、好友私聊、社区频道、语音状态。 |
| 媒体集成测试 | Playwright + 双浏览器上下文 + 合成音频源 | mediasoup 真实协商、后加入成员消费已有 Producer、对端音频解码、静音/闭麦生效、Worker 崩溃后重新加入。 |
| 非功能测试 | k6 或 Artillery | 消息时延、并发在线、未读通知同步、语音媒体丢包/jitter。 |

## 自动化命令

| 命令 | 覆盖 |
|---|---|
| `pnpm test:e2e:api` | 重置 `eiscord_test` 数据库后运行 Jest + Supertest + Socket.IO E2E，覆盖 AC-01 至 AC-06、AC-E1 至 AC-E8 和 AC-N4。 |
| `pnpm test:e2e:web` | 重置 `eiscord_test`、执行演示 seed、启动 API/Web 并运行 Playwright 浏览器 E2E。 |
| `pnpm perf:k6` | 运行 `scripts/k6/m6-realtime-load.js`，用 seed 数据验证消息可见时延、Socket 在线和语音状态更新。 |
| `pnpm test:e2e:voice` | Playwright 双 context 模拟两名用户先后加入 `voice-room`，注入合成音轨，验证 mediasoup 协商完成、后加入成员可消费已有 Producer、对端 RTP 帧可解码、静音/闭麦生效；可选附加 Worker kill 用例验证自动重新加入。 |

E2E 默认使用 `postgresql://eiscord:eiscord@localhost:5432/eiscord_test`，脚本会通过 Docker Compose 重建该测试库。压测前需要先启动依赖、迁移并执行 `pnpm db:seed`。

## 功能验收

| 编号 | 场景 | 验收方式 |
|---|---|---|
| AC-01 | 用户注册、登录并发起私聊 | E2E 创建两个用户，建立好友关系，发送私聊消息并确认双方可见。 |
| AC-02 | 加入社区并发送文本消息 | E2E 使用邀请加入社区，在有权文本频道发送文字、附件元数据和提及。 |
| AC-03 | 语音频道状态与媒体协商 | E2E 加入语音频道，完成 mediasoup 信令协商（Router → Transport → Producer → Consumer），切换静音/闭麦/恢复/退出；使用合成音轨验证对端 RTP 帧可解码与音量包络变化，Worker kill 后自动重新加入。 |
| AC-04 | 权限控制有效 | API 和 E2E 验证无权成员无法访问频道、删消息、管理成员或分配角色。 |
| AC-05 | 通知与未读可达 | 实时测试好友申请、私聊新消息、频道提及和已读动作。 |
| AC-06 | 在线状态同步 | 实时测试登录、离线、隐身、离开和断线超时。 |

## 异常验收

| 编号 | 场景 | 验收方式 |
|---|---|---|
| AC-E1 | 重复注册或弱密码 | API 测试重复用户名、重复联系方式和弱密码返回校验错误。 |
| AC-E2 | 错误登录与敏感信息保护 | API 测试错误密码不创建会话，日志检查不含明文密码。 |
| AC-E3 | 非法好友操作 | API 测试向自己申请、重复申请、处理他人申请均失败。 |
| AC-E4 | 无效邀请与退出限制 | API 测试过期邀请、超限邀请、重复加入和所有者直接退出失败。 |
| AC-E5 | 非成员或无权访问频道 | API、Socket 和附件访问测试无权用户不能读取受限资源。 |
| AC-E6 | 消息、附件和通知异常 | API 测试空消息、超长消息、非法附件和通知去重。 |
| AC-E7 | 越权管理动作 | API 测试普通成员和低优先级管理员越权失败。 |
| AC-E8 | 断线和语音状态恢复 | 实时测试断线超时后状态离线，语音会话释放并广播离开；mediasoup Worker 异常时关闭受影响 Producer 并广播 `worker_died`。 |

## 非功能验收

| 编号 | 指标 | 验收方式 |
|---|---|---|
| AC-N1 | 文本消息时延不超过 1 秒 | 实时测试记录发送时间和目标客户端可见时间，抽样统计 P95。 |
| AC-N2 | 语音状态同步与媒体协商耗时 | 多客户端切换语音状态统计状态到达时间不超过 3 秒；从 `JoinVoiceChannel` 成功到 `media_state=connected` P95 不超过 3 秒。 |
| AC-N3 | 支撑 1000 并发在线用户 | 压测登录、Socket 连接、消息和通知链路，无明显不可用。 |
| AC-N4 | 权限与隐私保护 | 权限矩阵自动化测试覆盖 HTTP、Socket、附件和历史消息。 |
| AC-N5 | 可编译与可审阅性 | 文档和演示流程可审阅，接口、实体、验收映射完整。 |
| AC-N6 | 媒体音频质量 | 单房间 ≥4 人时端到端音频丢包率 ≤3%、jitter ≤30 ms（媒体集成测试 + k6 ICE/RTP 模拟脚本或本机 mediasoup-stats 抽样）。 |

## 需求追踪矩阵

| FR | 模块 | 接口/事件 | 实体 | 验收 |
|---|---|---|---|---|
| FR-01 | 账号与身份 | `RegisterUser`、`NotificationCreated` | User、AuditLog | AC-01、AC-E1 |
| FR-02 | 账号与身份 | `LoginUser`、`PresenceChanged`、`UnreadUpdated` | User、ReadState、Notification、AuditLog | AC-01、AC-E2 |
| FR-03 | 账号与身份 P1 | `ResetPassword`、`NotificationCreated` | User、AuditLog | AC-01 |
| FR-04 | 账号与身份 | `UpdateProfile`、`PresenceChanged` | User、Attachment | AC-01 |
| FR-05 | 账号与身份 | `UpdatePresence`、`PresenceChanged` | User、Membership | AC-06、AC-E8 |
| FR-06 | 社交与私聊 | `CreateFriendRequest`、`AcceptFriendRequest`、`NotificationCreated` | Friendship、Notification、AuditLog | AC-01、AC-E3 |
| FR-07 | 社交与私聊 | `SendMessage`、`MessageCreated`、`UnreadUpdated` | DirectConversation、Message、ReadState | AC-01、AC-05 |
| FR-08 | 社区与成员 | `CreateServer`、`MemberJoined`、`ChannelChanged` | Server、Membership、Role、Channel | AC-02 |
| FR-09 | 社区与成员 | `JoinServer`、`LeaveServer`、`PermissionChanged` | Invitation、Membership、Role | AC-02、AC-E4 |
| FR-10 | 社区与成员 | `ManageMember`、`MemberChanged`、`PermissionChanged` | Membership、Role、AuditLog | AC-04 |
| FR-11 | 频道 | `CreateChannel`、`ChannelChanged`、`PermissionChanged` | Channel、PermissionOverwrite | AC-02、AC-04 |
| FR-12 | 频道/权限 | `CheckPermission`、`PermissionChanged` | Role、PermissionOverwrite、Membership | AC-04、AC-E5、AC-E7 |
| FR-13 | 消息与附件 | `SendMessage`、`MessageCreated`、`NotificationCreated` | Message、Attachment、ReadState、Notification | AC-02、AC-05、AC-E6 |
| FR-14 | 消息与附件 | `LoadMessages`、`MarkRead`、`UnreadUpdated` | Message、ReadState、Channel、DirectConversation | AC-02、AC-05、AC-E5 |
| FR-15 | 消息与附件 | `DeleteMessage`、`MessageDeleted`、`UnreadUpdated` | Message、AuditLog、Notification | AC-04、AC-E7 |
| FR-16 | 语音 | `JoinVoiceChannel`、`LeaveVoiceChannel`、`VoiceMemberJoined`、`VoiceMemberLeft` + 媒体信令事件（`VoiceRouterCapabilities`、`VoiceTransportCreated`、`VoiceTransportConnect`、`VoiceProducerCreated`、`VoiceConsumerCreated`、`VoiceConsumerResumed`、`VoiceProducerClosed`） | VoiceSession、Channel、Membership | AC-03、AC-E8、AC-N6 |
| FR-17 | 语音 | `UpdateVoiceState`、`VoiceStateChanged` + `VoiceActiveSpeaker` | VoiceSession、PermissionOverwrite | AC-03、AC-N2、AC-N6 |
| FR-18 | 通知与未读 | `MarkNotificationRead`、`NotificationCreated`、`UnreadUpdated` | Notification、ReadState | AC-05、AC-E6 |
| FR-19 | 权限 | `AssignRole`、`PermissionChanged`、`MemberChanged` | Role、Membership、PermissionOverwrite | AC-04 |
| FR-20 | 权限 | `CheckPermission`、`PermissionChanged` | Role、PermissionOverwrite、AuditLog | AC-04、AC-N4、AC-E5、AC-E7 |

## 权限矩阵测试

| 操作 | 访客 | 注册用户 | 社区成员 | 管理员/版主 | 所有者 |
|---|---|---|---|---|---|
| 注册、登录 | 允许 | 本人 | 本人 | 本人 | 本人 |
| 维护个人资料 | 拒绝 | 本人 | 本人 | 本人 | 本人 |
| 发送好友申请 | 拒绝 | 允许 | 允许 | 允许 | 允许 |
| 发起私聊 | 拒绝 | 好友内允许 | 好友内允许 | 好友内允许 | 好友内允许 |
| 创建社区 | 拒绝 | 允许 | 允许 | 允许 | 允许 |
| 查看成员列表 | 拒绝 | 拒绝 | 允许 | 允许 | 允许 |
| 管理成员 | 拒绝 | 拒绝 | 拒绝 | 权限内允许 | 允许 |
| 管理频道 | 拒绝 | 拒绝 | 拒绝 | 权限内允许 | 允许 |
| 查看受限频道 | 拒绝 | 拒绝 | 按角色判断 | 按角色判断 | 允许 |
| 发送频道消息 | 拒绝 | 拒绝 | 按频道权限 | 按频道权限 | 允许 |
| 删除他人消息 | 拒绝 | 拒绝 | 拒绝 | 权限内允许 | 允许 |
| 访问附件 | 拒绝 | 按会话判断 | 按频道权限 | 按频道权限 | 允许 |
| 加入语音频道 | 拒绝 | 拒绝 | 按频道权限 | 按频道权限 | 允许 |
| 分配角色 | 拒绝 | 拒绝 | 拒绝 | 权限内允许 | 允许 |
| 查看通知 | 拒绝 | 本人 | 本人 | 本人 | 本人 |

## 测试数据

基础自动化测试需要创建：

- 三个普通用户：Alice、Bob、Carol。
- 一个社区：`课程讨论`，所有者 Alice。
- 两个频道：公开文本频道 `general`，受限文本频道 `private`。
- 一个语音频道：`voice-room`。
- 三个角色：默认成员、版主、受限频道角色。
- Alice 和 Bob 为好友，Carol 不是好友。

通过该数据集覆盖好友、私聊、社区、频道、权限、通知和语音状态。`voice-room` 在 seed 中预置至少 6 名成员的容量；媒体集成测试使用 1 kHz 正弦波作为合成音轨，避免依赖真实麦克风。

`prisma/seed.ts` 已提供幂等演示数据：

- 用户：`alice`、`bob`、`carol`，默认密码均为 `DemoPass1`。
- 社区：`Course Discussion`，邀请码 `COURSE-M6`。
- 频道：`general`、`private`、`voice-room`。
- 权限：Alice 为所有者，Bob 为好友且具备版主与受限频道角色，Carol 为普通成员且不能看到 `private`。

## 通过标准

- 所有 P0 FR 有自动化测试或明确手工验收步骤。
- 所有 AC、AC-E、AC-N 有对应验证方式。
- 权限矩阵中的拒绝项在服务端测试中覆盖。
- 实时事件测试覆盖连接、订阅、消息、权限变化和断线恢复。
- 文档中不把屏幕共享、商业化能力或服务端录音/混音/转写作为 v1 通过条件；这些能力被显式禁止。
- M6 通过时至少运行 `pnpm test:e2e:api`、`pnpm test:e2e:web`；非功能验收运行 `pnpm perf:k6` 并记录 P95 指标。
