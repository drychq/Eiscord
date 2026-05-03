# Eiscord Agent 配置

本项目预定义 4 个角色化 Agent。使用时将对应 Prompt 模板传入 Agent 工具。

---

## backend-developer — NestJS 模块开发

**触发**: 实现新 API、创建模块、编写 Service/Controller/DTO

**预加载文档**: `docs/dev/03-module-design.md` `docs/dev/04-data-model.md` `docs/dev/05-api-contracts.md` `docs/dev/07-permission-security.md`

**提示词模板**:
```
实现 [模块名] 的 [功能]，参考 FR-XX。

步骤：
1. 如需新表，先改 prisma/schema.prisma（UUID PK, timestamptz, snake_case @map）
2. 创建 dto/*.dto.ts（class-validator），presenter 放模块根目录
3. 创建 Service：注入 PrismaService/AuditService/RealtimePublisher，raw SQL + AS "camelCase"
4. 创建 Controller：@Controller, @CurrentUser(), @RequirePermission, getRequestId
5. 创建 *.spec.ts：mock $queryRaw/$executeRaw/$transaction
6. 更新 Module 导入，运行 pnpm test
```

**强制约定**:
- 跨表写入在 `$transaction` 内，写操作带 `FOR UPDATE`
- 受控端点加 `@RequirePermission({ action, resourceType, resourceIdParam })`
- 关键操作调用 `auditService.record()`，实时事件在事务后 `realtimePublisher.publishToRoom()`
- 错误用 `AppError(ErrorCode.XXX, msg, HttpStatus.XXX)`，不手动构造响应信封

---

## frontend-developer — React 前端开发

**触发**: 实现页面/组件、API 集成、状态管理、实时事件消费

**预加载文档**: `docs/dev/08-frontend-design.md` `docs/dev/05-api-contracts.md`

**提示词模板**:
```
实现 [功能/页面] 的前端。

步骤：
1. 在 features/[模块]/ 创建组件
2. TanStack Query 管理服务端数据，Zustand 管理本地 UI 状态
3. React Hook Form + Zod 处理表单
4. Socket.IO 客户端监听实时事件（收到事件后 invalidate 相关 query）
5. 处理 loading/empty/error 状态
```

**强制约定**:
- 服务端数据用 TanStack Query（`useQuery` / `useMutation`），不手动 fetch 缓存
- 收到 `PermissionChanged` 后刷新社区/频道数据
- 隐藏按钮不是安全边界，服务端拒绝后展示错误反馈
- 路由按 `docs/dev/08-frontend-design.md` 路由表配置

---

## database-architect — 数据库架构

**触发**: 修改 Prisma schema、创建迁移、索引优化

**预加载文档**: `docs/dev/04-data-model.md`

**提示词模板**:
```
设计/修改 [实体] 的数据模型。

检查：
1. 实体关系（1:N/M:N）、外键字段命名
2. 索引覆盖高频查询（@@index 复合索引）
3. 字段类型和约束（UUID, timestamptz, not null/default）
4. 删除策略（Cascade vs SetNull）
5. 迁移 SQL 与 schema.prisma 同步
```

**强制约定**:
- UUID PK: `@id @default(uuid()) @db.Uuid`，时间戳: `@db.Timestamptz(6)`
- 表名 `@@map("snake_case")`，列名 `@map("snake_case")`
- 复合唯一约束 `@@unique([a, b])`，复合索引 `@@index([a, b])`
- 改完运行 `pnpm db:generate`

---

## code-reviewer — 代码审查

**触发**: PR 审查、提交前检查、安全审计

**预加载文档**: 全部 `docs/dev/` 文档

**提示词模板**:
```
审查当前分支变更，逐项检查：
1. 模块结构完整性（module/controller/service/dto/presenter）
2. 受控端点权限检查（@RequirePermission 或 Service 内 assertAllowed）
3. 跨表写入事务保护
4. AuditLog 覆盖关键操作
5. 错误处理统一性（AppError, ErrorCode）
6. 数据库命名一致性（JS camelCase ↔ DB snake_case）
7. 测试覆盖正常/异常路径
8. 安全隐患（明文密码、越权、注入）
```

**审查清单**:
- [ ] Controller 路由和参数校验
- [ ] 权限: `@RequirePermission` 或 `permissionsService.assertAllowed`
- [ ] 事务: 跨表写入在 `$transaction`
- [ ] 审计: `auditService.record`
- [ ] 实时: `realtimePublisher.publishToRoom` 在事务后
- [ ] 错误: `AppError`，不直接抛 `HttpException`
- [ ] DTO: class-validator 装饰器
- [ ] 命名: JS camelCase，DB snake_case (`@map`)
- [ ] 测试: co-located `*.spec.ts`
- [ ] 安全: Argon2id 密码，敏感信息不记录日志

## 推荐协作流程

1. **database-architect** → 设计/修改数据模型
2. **backend-developer** → 实现 API 和业务逻辑
3. **test-engineer**（手动触发）→ 补充测试
4. **frontend-developer** → 实现前端页面
5. **code-reviewer** → 审查完整变更

每步完成后运行 `pnpm test`。
