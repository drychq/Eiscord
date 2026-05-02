# 技术栈与仓库结构

## 技术栈

Eiscord 采用 TypeScript 单仓库方案，前后端共享类型和校验规则，降低接口漂移风险。

| 层级 | 固定选型 | 选择理由 |
|---|---|---|
| Web 客户端 | React + TypeScript + Vite | 适合构建频道列表、消息流、权限管理等高交互界面，开发启动快。 |
| 服务端 | NestJS + TypeScript | 模块边界清晰，适合账号、社区、消息、权限和实时网关分模块开发。 |
| ORM | Prisma | 与 PostgreSQL 结合稳定，迁移、类型生成和关系建模成本低。 |
| 主数据库 | PostgreSQL | 支持事务、索引、唯一约束和复杂关系，适合消息、权限和审计数据。 |
| 缓存与状态 | Redis | 承载会话摘要、在线状态、Socket 房间辅助状态、限流和短期去重。 |
| 实时通信 | Socket.IO | 提供命名空间、房间、重连和事件语义，满足消息、未读、状态同步。 |
| 对象存储 | MinIO/S3 兼容接口 | 本地可运行，后续可替换为云端 S3 兼容存储。 |
| 本地编排 | Docker Compose | 一条命令拉起 PostgreSQL、Redis、MinIO 和服务端依赖。 |
| 测试 | Vitest、React Testing Library、Jest、Supertest、Playwright | 分别覆盖前端组件、后端单测/API、端到端流程。 |

## 单仓库目录

```text
Eiscord/
  apps/
    web/                  # React + Vite 客户端
    api/                  # NestJS HTTP API 与 Socket.IO 网关
  packages/
    shared/               # 共享类型、枚举、DTO schema、事件载荷类型
    config/               # eslint、tsconfig、prettier 等共享配置
  prisma/
    schema.prisma         # Prisma 数据模型
    migrations/           # 数据库迁移
    seed.ts               # 本地演示数据
  docker/
    minio/                # 本地对象存储初始化配置
    postgres/             # 数据库初始化配置
  docs/
    dev/                  # 开发方案文档集
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
```

实现时使用 `pnpm` workspace 管理依赖。前端、后端和共享包都启用 `strict` TypeScript，禁止通过 `any` 绕过接口契约。

## 服务端模块边界

NestJS 中按业务能力拆分模块：

| 模块 | 主要职责 | 对应需求 |
|---|---|---|
| `AuthModule` | 注册、登录、刷新会话、密码哈希、登录审计。 | FR-01、FR-02 |
| `UsersModule` | 个人资料、头像元数据、在线状态摘要。 | FR-04、FR-05 |
| `FriendsModule` | 好友申请、好友关系、一对一会话入口。 | FR-06、FR-07 |
| `ServersModule` | 社区创建、邀请、加入、退出、成员管理。 | FR-08、FR-09、FR-10 |
| `ChannelsModule` | 文本/语音频道创建、编辑、排序、删除。 | FR-11、FR-12 |
| `MessagesModule` | 消息发送、历史加载、撤回、删除、附件引用。 | FR-13、FR-14、FR-15 |
| `NotificationsModule` | 通知生成、已读、未读计数。 | FR-18 |
| `PermissionsModule` | 角色、成员角色、频道覆盖、统一权限计算。 | FR-12、FR-19、FR-20 |
| `VoiceModule` | 语音频道成员状态、静音、闭麦、断线释放。 | FR-16、FR-17 |
| `RealtimeModule` | Socket.IO 网关、房间订阅、事件分发。 | FR-05、FR-13、FR-18 |
| `AuditModule` | 安全、权限和管理动作审计。 | NFR-12、NFR-14 |

公共能力如鉴权守卫、权限守卫、异常过滤器、请求追踪 ID、中间件和配置读取放入 `apps/api/src/common/`。

## 前端模块边界

前端以功能域和页面域混合组织：

```text
apps/web/src/
  app/                    # 路由、全局 Provider、应用启动
  features/
    auth/
    profile/
    friends/
    servers/
    channels/
    messages/
    notifications/
    permissions/
    voice/
  shared/
    api/                  # HTTP client、Socket client、错误处理
    components/           # 通用按钮、弹窗、表单、列表
    hooks/
    styles/
    types/
```

状态管理采用 TanStack Query 处理服务端数据缓存，Zustand 处理当前选择的社区、频道、语音连接面板和本地 UI 状态。实时事件进入后只更新有权可见的查询缓存和本地状态。

## 共享类型

`packages/shared` 输出以下内容：

- 枚举：`ChannelType`、`PresenceStatus`、`FriendshipStatus`、`MessageVisibility`、`VoiceConnectionStatus`、`NotificationType`。
- DTO schema：使用 Zod 定义 HTTP 请求、响应和 WebSocket 事件载荷。
- 事件名常量：与 SRS 保持一致，例如 `MessageCreated`、`UnreadUpdated`、`PermissionChanged`。
- 错误码常量：统一映射 HTTP 状态和前端提示。

后端以 schema 校验请求和响应，前端以同一 schema 校验服务端返回，避免接口文档和实现分离。

## 环境与配置

| 配置项 | 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串。 |
| `REDIS_URL` | Redis 连接串。 |
| `JWT_ACCESS_SECRET` | access token 签名密钥。 |
| `JWT_REFRESH_SECRET` | refresh token 签名密钥。 |
| `S3_ENDPOINT`、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY` | MinIO/S3 访问配置。 |
| `PUBLIC_API_BASE_URL` | 前端访问 HTTP API 的基地址。 |
| `PUBLIC_REALTIME_URL` | 前端访问 Socket.IO 的基地址。 |
| `UPLOAD_MAX_BYTES` | 附件、头像、社区图标上传大小限制。 |
| `SERVER_MEMBER_LIMIT` | 单社区成员上限，默认 5000。 |

配置由服务端启动时加载，并通过配置服务注入业务模块。文件上传限制、通知开关和社区成员上限需要支持运行期刷新，满足 NFR-16。

## 工程约束

- 所有数据库写操作默认由服务层控制，不允许前端或实时网关直接绕过业务服务写入。
- HTTP API 和实时事件共用同一套身份解析、权限计算和审计能力。
- 消息、权限、成员、角色、语音会话等跨实体写入必须放在数据库事务中。
- 后端日志必须包含 `request_id` 或 `event_id`，以满足失败请求 5 分钟内定位的要求。
- 前端不得把权限判断作为唯一安全边界，隐藏按钮只是体验优化，最终判断必须由服务端完成。

