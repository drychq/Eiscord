# Eiscord

类 Discord 实时社区系统 —— NestJS + React + Prisma + PostgreSQL + Redis + Socket.IO + MinIO monorepo。

## 常用命令

完整脚本说明见 [README.md](README.md#脚本参考)。以下表格仅列出日常开发常用入口。

| 命令 | 说明 |
|------|------|
| `pnpm setup` | 一键初始化：.env + 起 Docker + 迁移 + seed |
| `pnpm dev` | 并行启动 API + Web（先构建 shared、media） |
| `pnpm dev:api` / `pnpm dev:web` | 单独启动 API 或 Web |
| `pnpm deps:build` | 构建 `@eiscord/shared`、`@eiscord/media` |
| `pnpm check` | 质量门：typecheck → lint → test |
| `pnpm test` / `pnpm lint` / `pnpm format` | 测试 / 静态检查 / 格式化 |
| `pnpm db:generate` | 重新生成 Prisma Client |
| `pnpm db:migrate` | 创建并应用迁移（dev） |
| `pnpm db:seed` | 写入演示数据 |
| `pnpm db:reset` | 重建开发库（drop → migrate → seed） |
| `pnpm db:test:reset` | 重建 `eiscord_test` 测试库（不 seed） |
| `pnpm e2e` | 全量 E2E（单次前置 + API + Web） |
| `pnpm e2e:api` / `pnpm e2e:web` / `pnpm e2e:voice` | 单项 E2E |
| `pnpm e2e:audio` | 生成语音 E2E 所需的合成音频 |
| `pnpm build` | 构建所有子包 |
| `pnpm infra:up` / `pnpm infra:down` | 启动 / 停止 Docker 依赖服务 |
| `pnpm perf:k6` | K6 实时负载压测（需本机 k6） |

## 关键路径

```
apps/api/src/          # NestJS 后端
  common/              # auth/, permissions/, http/, errors/, persistence/, config/, request/
  modules/             # auth, users, friends, servers, channels, messages, notifications, permissions, voice, realtime, audit, health
apps/web/src/          # React 前端
  features/            # auth, profile, friends, servers, channels, messages, notifications, permissions, voice
  shared/              # api, components, hooks, state, styles, types
packages/shared/src/   # 共享枚举、错误码、事件名、Zod Schema
prisma/                # schema.prisma + migrations/
docs/dev/              # 12 份开发文档
```

## 架构约束

### 模块模式
- 每个模块: `xxx.module.ts` → `xxx.controller.ts` → `xxx.service.ts` → `dto/*.dto.ts` + `*.presenter.ts`
- Controller 只做参数提取和路由映射，业务逻辑全在 Service
- 数据库操作使用 raw SQL（`$queryRaw` / `$executeRaw`），返回列用 `AS "camelCase"` 别名
- 跨表写入必须在 `prisma.$transaction` 内

### API 约定
- 前缀 `/api/v1`，响应由 `ApiResponseInterceptor` 自动包装为 `{ data, request_id, server_time }`
- 错误通过 `AppError(code, message, httpStatus)` 抛出，由 `ApiExceptionFilter` 统一捕获
- 错误码从 `@eiscord/shared` 的 `ErrorCode` 导入
- 认证: `AccessTokenGuard`（全局 APP_GUARD），公开接口加 `@Public()`
- 用户身份: `@CurrentUser()` → `AuthenticatedUserContext`
- 写操作通过 `getRequestId(request)` 获取 requestId 传入 Service

### 权限
- 权限守卫: `PermissionGuard` + `@RequirePermission({ action, resourceType, resourceIdParam })`
- `PermissionAction` 是 const object（`SEND_MESSAGE`, `VIEW_CHANNEL`, `MANAGE_MEMBER` 等 10 个）
- 资源类型: `'server' | 'channel' | 'message' | 'attachment' | 'dm' | 'user' | 'voice'`
- 权限拒绝和管理操作必须记录 `AuditLog`

### 实时事件
- Socket.IO 命名空间 `/realtime`，握手 token 认证
- 统一事件信封: `{ event_id, event_name, occurred_at, payload, request_id? }`
- 事件名引用 `@eiscord/shared` 的 `RealtimeEvent`
- 房间命名: `user:{id}`, `dm:{id}`, `server:{id}`, `channel:{id}`, `voice:{id}`
- 事件在数据库事务提交后通过 `RealtimePublisher` 发布

### 数据库命名
- 表名列名 snake_case（`@@map` / `@map`），JS 字段 camelCase
- UUID 主键: `@id @default(uuid()) @db.Uuid`
- 时间戳: `@db.Timestamptz(6)`，字段 `createdAt` / `updatedAt`

## 测试约定

- API 模块用 **Jest**，Web/Shared 用 **Vitest**
- 测试文件 `*.spec.ts` 与源码 co-located
- Service 测试 mock `$queryRaw` / `$executeRaw` / `$transaction`，`$transaction` mock 为 `jest.fn((cb) => cb(tx))`

## Git 约定

Conventional Commits，中文描述: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`

## 开发检查清单

- [ ] 写入通过 Service，Controller 不直接操作 Prisma
- [ ] 受控端点有 `@RequirePermission` 或内部权限调用
- [ ] 跨表写入在 `$transaction` 内
- [ ] 关键操作记录 AuditLog（登录失败、权限拒绝、成员管理、频道/角色变更、消息删除）
- [ ] 实时事件在事务提交后发布
- [ ] UUID PKs，ISO 8601 时间戳
- [ ] 密码使用 PBKDF2-SHA256（310,000 迭代，Node 内建 `crypto.pbkdf2Sync`），不记录明文

## 参考文档

开发方案入口: `docs/dev/README.md`，里程碑: `docs/dev/09-iteration-plan.md`
