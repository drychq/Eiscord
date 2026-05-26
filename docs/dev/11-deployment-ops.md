# 部署与运维方案

## 本地开发环境

本地开发使用 Docker Compose 提供依赖服务：

| 服务 | 默认端口 | 用途 |
|---|---|---|
| PostgreSQL | `5432` | 主业务数据库。 |
| Redis | `6379` | 在线状态、缓存、限流和短期去重。 |
| MinIO | `9000`、`9001` | S3 兼容对象存储和控制台。 |
| MailHog | `1025`（SMTP）、`8025`（Web UI） | 本地开发邮件捕获器；密码重置 OTP 邮件落地此处供调试。 |
| API | `3000` | NestJS HTTP API 和 Socket.IO。 |
| Web | `5173` | Vite 开发服务器。 |
| mediasoup worker | `40000-40100/UDP`（RTC） | API 进程 spawn 的 `apps/media` 子进程，承载 SFU 媒体路由；`3001` 健康端口仅用于独立运行/调试。 |
| coturn | `3478/UDP+TCP`、`5349/TLS` | STUN/TURN，签发短 TTL HMAC 凭证。 |

推荐启动顺序：

1. 启动 PostgreSQL、Redis 和 MinIO。
2. 运行 Prisma migration。
3. 执行 seed 写入演示数据。
4. 启动 API。
5. 启动 Web。

本地命令：

```bash
docker compose up -d postgres redis minio minio-init mailhog
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` 会先构建 `@eiscord/media`，API 随后按需 spawn `apps/media/dist/main.js`。Docker Compose 中的 `mediasoup` 服务是独立运行/健康检查用入口，当前本地开发默认不依赖它。MailHog 在 `pnpm infra:up` 中已包含；密码重置邮件可在 http://localhost:8025 查看。

M6 验收命令：

```bash
pnpm e2e:api
pnpm e2e:web
pnpm perf:k6
```

`e2e:*` 会重建 `eiscord_test` 测试库，不会复用开发库。`perf:k6` 依赖本机安装 k6，并默认使用 `pnpm db:seed` 写入的 Alice/Bob/Carol 演示数据。

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
| `REDIS_CONNECT_IN_TEST` | `false` | 测试环境是否仍连接 Redis；E2E 需要设为 `true`。 |
| `REALTIME_SWEEP_IN_TEST` | `false` | 测试环境是否开启实时断线 sweep；E2E 需要设为 `true`。 |
| `PRESENCE_SWEEP_INTERVAL_MS` | `5000` | 在线状态断线 sweep 间隔。 |
| `PRESENCE_OFFLINE_GRACE_MS` | `45000` | Socket 断开后标记离线前的宽限时间。 |
| `MEDIASOUP_LISTEN_IP` | `127.0.0.1` | mediasoup Worker 监听地址。 |
| `MEDIASOUP_ANNOUNCED_IP` | `127.0.0.1`（生产为公网 IP） | 客户端可达地址，用于 ICE 候选。 |
| `MEDIASOUP_RTC_MIN_PORT` | `40000` | RTC UDP 端口段下界。 |
| `MEDIASOUP_RTC_MAX_PORT` | `40100` | RTC UDP 端口段上界。 |
| `MEDIASOUP_NUM_WORKERS` | `4` | Worker 进程数，默认等于 CPU 核数。 |
| `TURN_URL` | `turn:localhost:3478?transport=udp` | coturn 服务地址。 |
| `TURN_SHARED_SECRET` | `change-me-turn` | HMAC 凭证签发密钥。 |
| `TURN_CREDENTIAL_TTL_SECONDS` | `300` | TURN 凭证有效期。 |
| `VOICE_MAX_PARTICIPANTS_PER_ROOM` | `20` | 单语音频道最大成员数；加入前由 API 校验。 |
| `SMTP_HOST` | `localhost` | 发送密码重置邮件用的 SMTP 主机；dev 指向 MailHog（1025）。 |
| `SMTP_PORT` | `1025` | SMTP 端口。生产建议 587（STARTTLS）或 465（SSL，触发自动 `secure=true`）。 |
| `SMTP_USER` | 空 | SMTP 鉴权用户名；为空表示匿名 SMTP（MailHog 即如此）。 |
| `SMTP_PASSWORD` | 空 | SMTP 鉴权密码；仅在 `SMTP_USER` 非空时使用。 |
| `SMTP_FROM_EMAIL` | `noreply@eiscord.local` | 邮件 `From` 地址。 |
| `SMTP_FROM_NAME` | `Eiscord` | 邮件 `From` 显示名。 |
| `PASSWORD_RESET_TTL_MINUTES` | `15` | OTP 失效时间，单位分钟。 |
| `PASSWORD_RESET_RESEND_COOLDOWN_SECONDS` | `60` | 同邮箱重发冷却秒数。 |
| `PASSWORD_RESET_MAX_ATTEMPTS` | `5` | 单 OTP 允许的最大错误核验次数。 |

生产环境必须通过密钥管理系统注入敏感变量，不提交到仓库。

## Docker Compose 设计

Compose 文件包含：

- `postgres`：持久化 volume，健康检查。
- `redis`：持久化可选，健康检查。
- `minio`：创建本地 bucket。
- `mailhog`：捕获本地 SMTP 流量供密码重置等流程调试；生产不部署，由真实 SMTP 服务替代。
- `api`：依赖数据库和 Redis，暴露 `3000`。
- `web`：开发模式暴露 `5173`，生产模式可由 Nginx 或静态托管提供。
- `mediasoup`：独立启动 `apps/media` 的可选调试服务；默认 API 仍使用子进程 worker。若生产改为独立服务，需要同步调整 API 与 worker 的 RPC 边界。
- `coturn`：挂载 `docker/coturn/turnserver.conf`，使用 `TURN_SHARED_SECRET` 启用 HMAC 时间凭证，禁用静态用户。

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
| mediasoup Producer/Consumer 数 | 验证 SFU 房间负载分布。 |
| RTP 入/出 bitrate | 监控音频流量，规划带宽。 |
| 音频丢包率与 jitter | 验证 AC-N6 媒体质量。 |
| active speaker 切换频率 | 检测节流是否生效，定位异常说话者抖动。 |
| Worker CPU 占用 | 评估 SFU 容量与扩容时机。 |
| Transport DTLS 失败率 | 排查 NAT/证书/防火墙问题。 |
| TURN relay 占比 | 评估 NAT 穿透成功率与 coturn 负载。 |
| PostgreSQL 连接数和慢查询 | 排查数据层瓶颈。 |
| Redis 命中率和内存使用 | 排查缓存与在线状态问题。 |
| MinIO 上传失败率 | 排查附件服务问题。 |

告警建议：

- API 5xx 错误率连续 5 分钟超过阈值。
- Socket 连接异常断开率持续升高。
- 消息广播 P95 超过 1 秒。
- 数据库连接池耗尽。
- 对象存储上传失败率异常。
- mediasoup Worker CPU 占用持续 1 分钟超过 80%。
- WebRTC Transport DTLS 失败率超过 5%。
- TURN relay 比例突增（提示 NAT 环境异常或 STUN 失效）。

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
6. 验证登录、消息、通知、权限、语音状态，以及双终端真实音频互通（mediasoup 协商 + 静音/闭麦/重协商）。
7. 观察日志和核心指标。

数据库迁移需要向前兼容当前主版本客户端。新增字段优先可空或带默认值，删除字段必须经过弃用周期。

## 降级策略

| 依赖故障 | 降级行为 |
|---|---|
| Redis 不可用 | 在线状态和限流降级，核心 HTTP 读写继续使用 PostgreSQL。 |
| MinIO 不可用 | 附件上传失败，纯文本消息、登录和社区浏览保持可用。 |
| Socket.IO 不稳定 | 客户端提示重连，通过 HTTP 拉取消息、通知和未读补偿。 |
| 通知生成失败 | 消息写入不回滚，记录错误并允许后续补偿。 |
| 邮件/短信不可用 | 注册可进入待验证状态，密码找回 OTP 邮件发送失败时 forgot-password 仍向客户端返回统一成功文案，仅审计 `failureReason=mail_send_failed`；用户可通过重发或人工渠道恢复。 |
| mediasoup Worker 不可用 | 受影响语音会话被关闭并广播 `worker_died`；客户端自动重新加入并重建 Transport/Producer。 |
| coturn 不可用 | 客户端走 STUN/直连，对称 NAT 用户提示「网络不支持语音」并降级，不影响文本与状态链路。 |

## 安全运维

- 生产环境开启 HTTPS/WSS。
- 管理密钥定期轮换。
- 数据库和对象存储使用最小权限账号。
- CORS 只允许受信任前端域名。
- 生产日志集中存储并限制访问。
- 审计日志不允许普通业务接口修改。
- mediasoup 媒体端口段（默认 40000-40100/UDP）只放行必要范围；信令端口仅在受信任内网监听。
- coturn 启用基于 `TURN_SHARED_SECRET` 的短 TTL HMAC 凭证，禁用静态用户与长效共享密钥的纯文本登录。
- 禁止开启 mediasoup 录音、PlainTransport RTP forward 或 ffmpeg 录制管道；服务端不允许混音和语音转写。
