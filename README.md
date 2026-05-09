# Eiscord

类 Discord 实时社区交流系统。

## 技术栈

Eiscord 使用 TypeScript 单仓库方案，当前工程骨架固定为：

| 层级 | 选型 |
|---|---|
| Web 客户端 | React + TypeScript + Vite |
| 服务端 | NestJS + TypeScript |
| ORM | Prisma |
| 主数据库 | PostgreSQL |
| 缓存与状态 | Redis |
| 实时通信 | Socket.IO |
| 对象存储 | MinIO/S3 兼容接口 |
| 本地编排 | Docker Compose |
| 测试 | Vitest、React Testing Library、Jest、Supertest、Playwright |

## 目录结构

```text
Eiscord/
  apps/
    web/                  # React + Vite 客户端
    api/                  # NestJS HTTP API 与 Socket.IO 网关骨架
    media/                # API 启动的 mediasoup Worker 子进程入口
  packages/
    shared/               # 共享枚举、事件名、错误码和 Zod schema
    config/               # 共享 tsconfig、eslint、prettier 配置
  prisma/
    schema.prisma         # Prisma 入口，业务模型后续补充
    seed.ts               # 本地演示数据入口
  docker/
    minio/                # MinIO bucket 初始化
    postgres/             # PostgreSQL 初始化预留目录
  docs/
    dev/                  # 开发方案文档集
  docker-compose.yml
  package.json
  pnpm-workspace.yaml
```

## 开发

```bash
git clone https://github.com/drychq/Eiscord.git
cd Eiscord
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres redis minio minio-init
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` 会先构建 `@eiscord/shared` 与 `@eiscord/media`，随后并行启动 API/Web。API 进程会按需 spawn `apps/media/dist/main.js` 作为 mediasoup worker 子进程。

默认端口：

| 服务 | 地址 |
|---|---|
| API | `http://localhost:3000/api/v1` |
| Web | `http://localhost:5173` |
| MinIO Console | `http://localhost:9001` |
| coturn | `turn:localhost:3478?transport=udp` |

API 冒烟接口：

```bash
curl http://localhost:3000/api/v1/health
```

演示账号由 `pnpm db:seed` 写入：`alice`、`bob`、`carol`，密码均为 `DemoPass1`。其中 Alice 是 `Course Discussion` 社区所有者，Bob 是好友和版主，Carol 是普通成员。

M6 验收命令：

```bash
pnpm e2e:api
pnpm e2e:web
pnpm perf:k6
```

E2E 命令会重建 `eiscord_test` 测试库。`perf:k6` 需要本机安装 k6。

## 当前范围

本仓库当前已落地 `docs/dev/03-module-design.md` 中 M1 至 M6 的 P0 范围：账号鉴权、好友与私聊、社区成员、频道消息、附件、通知未读、权限管理、实时事件、在线状态、语音状态，以及验收加固脚本和演示数据。

完整本地验证需要 Node.js、Corepack/pnpm 和 Docker。若 `docker` 不在 PATH 中，容器依赖服务需要等 Docker Desktop 安装并可用后再启动。
