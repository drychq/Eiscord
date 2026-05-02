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
pnpm dev
```

默认端口：

| 服务 | 地址 |
|---|---|
| API | `http://localhost:3000/api/v1` |
| Web | `http://localhost:5173` |
| MinIO Console | `http://localhost:9001` |

API 冒烟接口：

```bash
curl http://localhost:3000/api/v1/health
```

## 当前范围

本仓库当前只落地 `docs/dev/01-tech-stack-and-repo-structure.md` 对应的工程骨架。账号、好友、社区、频道、消息、权限、通知和语音状态等业务实现会按后续开发文档继续补充。

完整本地验证需要 Node.js、Corepack/pnpm 和 Docker。若 `docker` 不在 PATH 中，容器依赖服务需要等 Docker Desktop 安装并可用后再启动。
