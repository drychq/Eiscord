# 部署与运维方案

## 本地开发环境

本地开发使用 Docker Compose 提供依赖服务：

| 服务 | 默认端口 | 用途 |
|---|---|---|
| PostgreSQL | `5432` | 主业务数据库。 |
| Redis | `6379` | 在线状态、缓存、限流和短期去重。 |
| MinIO | `9000`、`9001` | S3 兼容对象存储和控制台。 |
| API | `3000` | NestJS HTTP API 和 Socket.IO。 |
| Web | `5173` | Vite 开发服务器。 |

推荐启动顺序：

1. 启动 PostgreSQL、Redis 和 MinIO。
2. 运行 Prisma migration。
3. 执行 seed 写入演示数据。
4. 启动 API。
5. 启动 Web。

## 环境变量

| 名称 | 示例 | 说明 |
|---|---|---|
| `NODE_ENV` | `development` | 运行环境。 |
| `DATABASE_URL` | `postgresql://eiscord:eiscord@localhost:5432/eiscord` | PostgreSQL 连接串。 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接串。 |
| `JWT_ACCESS_SECRET` | `change-me-access` | access token 密钥。 |
| `JWT_REFRESH_SECRET` | `change-me-refresh` | refresh token 密钥。 |
| `JWT_ACCESS_TTL_SECONDS` | `900` | access token 有效期。 |
| `JWT_REFRESH_TTL_SECONDS` | `2592000` | refresh token 有效期。 |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO/S3 地址。 |
| `S3_BUCKET` | `eiscord-local` | 对象存储 bucket。 |
| `S3_ACCESS_KEY` | `minioadmin` | 对象存储访问 key。 |
| `S3_SECRET_KEY` | `minioadmin` | 对象存储密钥。 |
| `PUBLIC_API_BASE_URL` | `http://localhost:3000/api/v1` | 前端 API 地址。 |
| `PUBLIC_REALTIME_URL` | `http://localhost:3000/realtime` | 前端 Socket 地址。 |
| `UPLOAD_MAX_BYTES` | `10485760` | 默认上传大小限制。 |
| `SERVER_MEMBER_LIMIT` | `5000` | 单社区成员上限。 |
| `LOG_LEVEL` | `debug` | 日志级别。 |

生产环境必须通过密钥管理系统注入敏感变量，不提交到仓库。

## Docker Compose 设计

Compose 文件包含：

- `postgres`：持久化 volume，健康检查。
- `redis`：持久化可选，健康检查。
- `minio`：创建本地 bucket。
- `api`：依赖数据库和 Redis，暴露 `3000`。
- `web`：开发模式暴露 `5173`，生产模式可由 Nginx 或静态托管提供。

API 容器启动前执行迁移的策略必须谨慎。开发环境可自动迁移，生产环境使用显式迁移命令。

## 日志

服务端日志使用结构化 JSON：

```json
{
  "level": "info",
  "request_id": "uuid",
  "user_id": "uuid",
  "action": "SendMessage",
  "result": "success",
  "duration_ms": 42,
  "timestamp": "2026-05-01T12:00:00.000Z"
}
```

必须包含：

- HTTP 请求开始和结束。
- 业务错误和未捕获异常。
- 权限拒绝。
- 关键审计动作。
- Socket 连接、断开和订阅失败。

不得记录明文密码、完整 token、完整验证码或完整敏感凭证。

## 监控指标

| 指标 | 用途 |
|---|---|
| HTTP 请求量、错误率、P95 延迟 | 判断 API 可用性。 |
| Socket 连接数、断开率、订阅失败数 | 判断实时链路健康度。 |
| 消息发送到广播耗时 | 验证 NFR-01。 |
| 未读和通知生成耗时 | 验证 NFR-04。 |
| 语音状态同步耗时 | 验证 NFR-02。 |
| PostgreSQL 连接数和慢查询 | 排查数据层瓶颈。 |
| Redis 命中率和内存使用 | 排查缓存与在线状态问题。 |
| MinIO 上传失败率 | 排查附件服务问题。 |

告警建议：

- API 5xx 错误率连续 5 分钟超过阈值。
- Socket 连接异常断开率持续升高。
- 消息广播 P95 超过 1 秒。
- 数据库连接池耗尽。
- 对象存储上传失败率异常。

## 备份与恢复

- PostgreSQL 每日至少备份一次，保留最近 7 天本地或远端备份。
- 审计日志保留不少于 180 天。
- MinIO 对象数据按 bucket 进行周期性备份。
- Redis 只保存可恢复的短期状态，不能作为唯一事实来源。
- 严重故障后 4 小时内恢复核心服务：登录、社区浏览、文本消息和历史加载。

## 发布流程

1. 合并前运行单元测试、API 测试和前端构建。
2. 生成 Prisma migration 并审阅数据库变更。
3. 在预发布环境执行迁移和 smoke test。
4. 发布 API。
5. 发布 Web。
6. 验证登录、消息、通知、权限和语音状态。
7. 观察日志和核心指标。

数据库迁移需要向前兼容当前主版本客户端。新增字段优先可空或带默认值，删除字段必须经过弃用周期。

## 降级策略

| 依赖故障 | 降级行为 |
|---|---|
| Redis 不可用 | 在线状态和限流降级，核心 HTTP 读写继续使用 PostgreSQL。 |
| MinIO 不可用 | 附件上传失败，纯文本消息、登录和社区浏览保持可用。 |
| Socket.IO 不稳定 | 客户端提示重连，通过 HTTP 拉取消息、通知和未读补偿。 |
| 通知生成失败 | 消息写入不回滚，记录错误并允许后续补偿。 |
| 邮件/短信不可用 | 注册可进入待验证状态，密码找回返回依赖不可用。 |

## 安全运维

- 生产环境开启 HTTPS/WSS。
- 管理密钥定期轮换。
- 数据库和对象存储使用最小权限账号。
- CORS 只允许受信任前端域名。
- 生产日志集中存储并限制访问。
- 审计日志不允许普通业务接口修改。

