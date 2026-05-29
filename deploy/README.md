# Eiscord 单机演示部署

这套部署面向“能上线演示即可”的场景：一台 Linux VPS 运行 Docker Compose，
同时承载 PostgreSQL、Redis、MinIO、coturn、NestJS API 和 Vite Web 静态站点。
它不追求高可用，适合课程答辩、内部演示、小规模试用。

## 最低要求

- 服务器：Ubuntu 24.04 LTS；推荐 `2 vCPU / 4 GB RAM / 40 GB SSD`。不演示语音时
  `1 vCPU / 2 GB RAM` 也可以临时跑通。
- 运行时：Docker Engine 和 Docker Compose v2。
- 域名：至少准备前端域名和 S3 域名，例如：
  - `eiscord.example.com` 指向 VPS 公网 IPv4。
  - `s3.eiscord.example.com` 指向同一个 VPS。
  - 如演示语音，`turn.eiscord.example.com` 也指向同一个 VPS。
- 防火墙：
  - 必开：`80/tcp`、`443/tcp`。
  - 演示语音时再开：`3478/tcp`、`3478/udp`、`40000-40100/udp`、
    `TURN_RELAY_MIN_PORT` 到 `TURN_RELAY_MAX_PORT` 的 UDP 端口。
  - 不要开放 PostgreSQL、Redis、MinIO 控制台端口到公网。

## 环境变量

复制模板并替换占位符：

```bash
cp .env.production.example .env.production
vi .env.production
```

最少需要检查这些值：

- `PUBLIC_WEB_DOMAIN`：前端域名，例如 `eiscord.example.com`。
- `S3_PUBLIC_DOMAIN`：对象存储域名，例如 `s3.eiscord.example.com`。
- `PUBLIC_WEB_ORIGIN`：前端 HTTPS origin。
- `PUBLIC_API_BASE_URL`：通常是 `https://eiscord.example.com/api/v1`。
- `PUBLIC_REALTIME_URL`：通常是 `https://eiscord.example.com/realtime`。
- `MEDIASOUP_ANNOUNCED_IP`：VPS 公网 IPv4。
- `S3_ENDPOINT`：必须是浏览器可访问的 HTTPS 地址，例如
  `https://s3.eiscord.example.com`，否则附件预签名上传会失败。
- `JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`TURN_SHARED_SECRET`、数据库密码、
  S3 密钥、SMTP 密码：全部换成强随机值。

生产环境不要提交 `.env.production`。

## 首次部署

在仓库根目录执行：

```bash
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml build
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml --profile migrate run --rm migrate
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml up -d
```

数据库迁移使用 `prisma migrate deploy`，不要在生产环境使用 `migrate dev`。当前
`migrate` 服务已经封装了正确命令。

启动后查看状态：

```bash
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml ps
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml logs -f api caddy
```

烟测：

```bash
sh deploy/scripts/smoke-test.sh
```

也可以直接访问：

```bash
curl -fsS https://eiscord.example.com/api/v1/health
```

## 推荐演示流程

优先演示稳定链路：

1. 打开 `https://eiscord.example.com`。
2. 注册两个账号，分别在两个浏览器或无痕窗口登录。
3. 创建社区和文本频道。
4. 两个账号进入同一频道，互相发送消息，观察实时同步。
5. 上传附件并下载，确认 MinIO/S3 预签名 URL 正常。
6. 演示通知、未读数、频道切换等基础交互。

密码找回依赖真实 SMTP。演示时间紧时，可以跳过密码找回，只保留注册登录和消息链路。

## 语音演示可选

语音依赖 WebRTC、mediasoup、公网 UDP 和 coturn。它比文本消息更容易受云安全组、
系统防火墙、浏览器麦克风权限、NAT 类型影响。

演示语音前确认：

- `MEDIASOUP_ANNOUNCED_IP` 是 VPS 公网 IPv4。
- 已开放 `40000-40100/udp` 给 mediasoup。
- 已开放 `3478/tcp`、`3478/udp` 和 TURN relay UDP 端口段。
- `TURN_URL` 指向公网可访问的 TURN 域名。
- 浏览器允许麦克风权限。

如果现场网络不可控，建议把语音作为加分项，不要作为主演示链路。

## 回滚与更新

更新代码后重新构建并启动：

```bash
git pull
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml build
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml --profile migrate run --rm migrate
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml up -d
```

查看最近日志：

```bash
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml logs --tail=200 api caddy coturn
```

如果新版本启动失败，回到上一个 git tag 或 commit，再重新 build 和 `up -d`。数据库迁移
一旦执行，不要随意手工回滚；演示前先备份数据库。

## 备份

备份 PostgreSQL：

```bash
sh deploy/scripts/backup-postgres.sh
```

备份文件会写入 `backups/postgres/`。MinIO 文件位于 Docker volume `minio-data`，
演示环境可以在重要演示前做一次服务器快照。

Redis 只保存可恢复的运行态，不作为唯一事实来源。

## 常见问题

- 前端打不开：确认 DNS 指向 VPS，`80/443` 已开放，Caddy 日志没有证书申请失败。
- API 健康检查失败：看 `api` 日志，优先检查 `DATABASE_URL`、`REDIS_URL`、JWT 密钥和
  Prisma migration 是否执行。
- 附件上传失败：确认 `S3_ENDPOINT` 是公网 HTTPS 地址，`S3_PUBLIC_DOMAIN` 指向 VPS，
  MinIO 初始化脚本已成功执行 CORS 配置。
- 实时消息不同步：确认浏览器连接的是 `PUBLIC_REALTIME_URL`，Caddy 正在反代
  `/realtime*` 到 API。
- 语音无法连接：先确认 UDP 端口和云安全组，再检查 `MEDIASOUP_ANNOUNCED_IP`、
  `TURN_URL` 和浏览器麦克风权限。

## 当前部署结构

- `deploy/docker-compose.prod.yml`：单机生产/演示 Compose。
- `deploy/docker/api.Dockerfile`：API 镜像，内置 `apps/media/dist`，因为当前 API 会
  spawn mediasoup worker 子进程。
- `deploy/docker/web.Dockerfile`：Web 构建和 Caddy 静态站点镜像。
- `deploy/Caddyfile`：前端、API、Socket.IO、MinIO 反向代理。
- `deploy/minio/init.sh`：创建 bucket 并写入 CORS。
- `deploy/scripts/smoke-test.sh`：基础健康检查。
- `deploy/scripts/backup-postgres.sh`：PostgreSQL 备份脚本。
