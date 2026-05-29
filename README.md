# Eiscord

类 Discord 实时社区交流系统。NestJS + React + Prisma + PostgreSQL + Redis + Socket.IO + MinIO 的 TypeScript monorepo。

## 快速开始

前置：Node.js ≥ 22、Corepack（启用 pnpm）、Docker。

```bash
git clone https://github.com/drychq/Eiscord.git
cd Eiscord
corepack enable
pnpm install
pnpm setup        # 一键：写 .env、起 docker、迁移、写入演示数据
pnpm dev          # 并行启动 API + Web
```

打开 [http://localhost:5173](http://localhost:5173)，登录 `alice / DemoPass1` 即可看到演示社区。

停止依赖容器：`pnpm infra:down`。

## 常用命令

| 命令                          | 说明                                                |
| ----------------------------- | --------------------------------------------------- |
| `pnpm dev`                    | 并行启动 API + Web（开发用）                        |
| `pnpm dev:api` / `pnpm dev:web` | 单独启动 API 或 Web                               |
| `pnpm check`                  | 质量门：typecheck → lint → test                     |
| `pnpm test` / `pnpm lint`     | 运行测试 / 检查代码风格                             |
| `pnpm db:reset`               | 重建开发库（drop → migrate → seed）                 |
| `pnpm e2e`                    | 运行全部 E2E（API + Web）                           |
| `pnpm e2e:api` / `pnpm e2e:web` / `pnpm e2e:voice` | 单项 E2E                       |
| `pnpm infra:up` / `pnpm infra:down` | 启停 Docker 依赖服务                          |

更完整的脚本清单见 [脚本参考](#脚本参考)。

## 端口与演示账号

| 服务          | 地址                                |
| ------------- | ----------------------------------- |
| API           | `http://localhost:3000/api/v1`      |
| Web           | `http://localhost:5173`             |
| MinIO Console | `http://localhost:9001`             |
| coturn        | `turn:localhost:3478?transport=udp` |

API 冒烟：`curl http://localhost:3000/api/v1/health`。

Windows 下如果 Ctrl+C 后再次启动 API 报 `EADDRINUSE: address already in use :::3000`，先定位并清理残留开发进程树：

```powershell
$pid = (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess
taskkill /PID $pid /T /F
```

`pnpm setup` 与 `pnpm db:reset` / `pnpm db:seed` 写入的演示账号：

| 用户  | 密码        | 角色                                       |
| ----- | ----------- | ------------------------------------------ |
| alice | DemoPass1   | `Course Discussion` 社区所有者             |
| bob   | DemoPass1   | 好友、版主                                 |
| carol | DemoPass1   | 普通成员                                   |

## 技术栈

| 层级       | 选型                                                       |
| ---------- | ---------------------------------------------------------- |
| Web 客户端 | React + TypeScript + Vite                                  |
| 服务端     | NestJS + TypeScript                                        |
| ORM        | Prisma                                                     |
| 主数据库   | PostgreSQL                                                 |
| 缓存与状态 | Redis                                                      |
| 实时通信   | Socket.IO                                                  |
| 对象存储   | MinIO/S3 兼容接口                                          |
| 本地编排   | Docker Compose                                             |
| 测试       | Vitest、React Testing Library、Jest、Supertest、Playwright |

## 目录结构

```text
Eiscord/
  apps/
    web/                  # React + Vite 客户端
    api/                  # NestJS HTTP API 与 Socket.IO 网关
    media/                # API 启动的 mediasoup Worker 子进程入口
  packages/
    shared/               # 共享枚举、事件名、错误码、Zod schema
    config/               # 共享 tsconfig、eslint、prettier 配置
  prisma/
    schema.prisma         # 数据模型
    seed.ts               # 演示数据入口
  scripts/                # 见下文「脚本参考」
  docker/                 # 本地依赖服务配置（MinIO/Postgres/coturn）
  deploy/                 # 生产/演示 Compose、Dockerfile、Caddy 与运维脚本
  tests/e2e/              # Playwright 浏览器 E2E
  docs/
    dev/                  # 开发方案文档集
    audit/                # 历史审计与一致性报告
  docker-compose.yml      # 本地 infra Compose
  package.json
  pnpm-workspace.yaml
```

源码内部按层组织：API 使用 `src/bootstrap`、`src/core`、`src/infra`、`src/modules` 和 `test/e2e`；Web 使用 `src/app`、`src/features`、`src/shared`，并通过 ESLint 禁止 `shared → features/app` 与 `features → app` 的反向依赖。

## 脚本参考

`scripts/` 目录存放开发、测试、运维辅助脚本。所有可执行入口均提供 `.sh`（Linux/macOS）与 `.ps1`（Windows）双重实现，由 `scripts/run.mjs` 按平台分发，对应的 `pnpm` 命令在两种 shell 下表现一致。

内部脚本（不通过 `pnpm` 直接调用，仅被其他脚本/入口引用）：

- `scripts/run.mjs` —— npm scripts 的平台分发器
- `scripts/e2e/env.test.sh` / `env.test.ps1` —— 测试环境变量，由 `e2e/*` 与 `db:test:reset` 在执行中 source
- `scripts/e2e/start-server.mjs` —— Playwright 启动 API/Web 的入口
- `scripts/generate-test-audio.mjs` —— 由 `pnpm e2e:audio` 调用

### 环境初始化

| 命令         | 底层脚本                                 | 说明                                                                                                                  |
| ------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm setup` | `scripts/setup.sh` / `scripts/setup.ps1` | 一键初始化：复制 `.env.example` → `.env`、`infra:up` 起 Docker 依赖、等 Postgres 就绪、生成 Prisma Client、迁移、seed。 |

### 依赖构建

| 命令              | 底层脚本                                           | 说明                                           |
| ----------------- | -------------------------------------------------- | ---------------------------------------------- |
| `pnpm deps:build` | `scripts/deps/build.sh` / `scripts/deps/build.ps1` | 构建 `@eiscord/shared`、`@eiscord/media`。     |
| `pnpm build`      | pnpm 递归构建                                      | `pnpm -r --if-present build`。                 |
| `pnpm typecheck`  | 先 `deps:build` 再递归 typecheck                   | 构建依赖后对所有子包执行类型检查。             |

### 开发启动

| 命令           | 底层脚本                                       | 说明                                                                          |
| -------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`     | `scripts/dev/full.sh` / `scripts/dev/full.ps1` | 构建 shared + media，并行启动 API 与 Web。API 会按需 spawn mediasoup Worker。 |
| `pnpm dev:api` | `scripts/dev/api.sh` / `scripts/dev/api.ps1`   | 单独启动 API 服务。                                                           |
| `pnpm dev:web` | `scripts/dev/web.sh` / `scripts/dev/web.ps1`   | 单独启动 Web 前端。                                                           |

### 数据库

| 命令                 | 底层脚本                                                 | 说明                                                                          |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm db:generate`   | Prisma CLI                                               | 重新生成 Prisma Client。                                                      |
| `pnpm db:migrate`    | Prisma CLI                                               | 创建并应用迁移（dev 模式）。                                                  |
| `pnpm db:seed`       | tsx 运行 `prisma/seed.ts`                                | 写入演示数据。                                                                |
| `pnpm db:reset`      | `scripts/db/reset.sh` / `scripts/db/reset.ps1`           | 重建开发库 `eiscord`（drop → migrate → seed）。                                |
| `pnpm db:test:reset` | `scripts/db/test-reset.sh` / `scripts/db/test-reset.ps1` | 重建 `eiscord_test` 测试库（drop → migrate，**不 seed**；E2E web 流程在调用方追加 seed）。 |
| `pnpm infra:up`      | docker compose                                           | 启动 PostgreSQL、Redis、MinIO 等基础服务。                                    |
| `pnpm infra:down`    | docker compose                                           | 停止并移除基础服务容器。                                                      |

### E2E 测试

| 命令             | 底层脚本                                         | 说明                                                                                                                                        |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm e2e:api`   | `scripts/e2e/api.sh` / `scripts/e2e/api.ps1`     | 运行 API 端到端测试（Jest + Supertest + Socket.IO，测试文件位于 `apps/api/test/e2e`）。                                                     |
| `pnpm e2e:web`   | `scripts/e2e/web.sh` / `scripts/e2e/web.ps1`     | 运行 Web 端到端测试（Playwright）。                                                                                                         |
| `pnpm e2e:voice` | `scripts/e2e/voice.sh` / `scripts/e2e/voice.ps1` | 运行语音频道 E2E（`tests/e2e/voice-media.spec.ts`）。                                                                                       |
| `pnpm e2e`       | `scripts/e2e/all.sh` / `scripts/e2e/all.ps1`     | 运行全部 E2E。共享单次 `deps:build` + `db:test:reset`，再依次执行 API E2E 与 Web E2E，避免重复前置。                                        |
| `pnpm e2e:audio` | `scripts/generate-test-audio.mjs`                | 生成语音测试所需的合成正弦波 WAV 文件（48000 Hz, 5 秒单声道 PCM16），输出到 `tests/e2e/fixtures/audio/`。幂等，文件已存在且大小一致时跳过。 |

E2E 与 `db:test:reset` 执行前会 source `scripts/e2e/env.test.sh`（Windows 下 dot-source `env.test.ps1`），将 `DATABASE_URL` 指向 `eiscord_test` 测试库并设置 Redis/Realtime/Presence 相关测试开关。

### 质量门

| 命令          | 底层脚本                                         | 说明                             |
| ------------- | ------------------------------------------------ | -------------------------------- |
| `pnpm check`  | `scripts/check/all.sh` / `scripts/check/all.ps1` | 依次执行 typecheck、lint、test。 |
| `pnpm test`   | pnpm 递归测试                                    | 运行所有子包的测试。             |
| `pnpm lint`   | pnpm 递归 lint                                   | 对所有子包执行 ESLint 检查。     |
| `pnpm format` | Prettier                                         | 格式化所有源码文件。             |

### 性能测试

| 命令           | 底层脚本                         | 说明                                                                               |
| -------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm perf:k6` | `scripts/k6/m6-realtime-load.js` | K6 实时负载测试。需要本机安装 [k6](https://k6.io/docs/get-started/installation/)。 |

## M6 验收

```bash
pnpm e2e:api
pnpm e2e:web
pnpm perf:k6
```

E2E 命令会重建 `eiscord_test` 测试库。`perf:k6` 需要本机安装 k6，使用 seed 写入的 Alice/Bob/Carol 演示数据。

## 当前范围

本仓库已落地 `docs/dev/03-module-design.md` 中 M1 至 M6 的 P0 范围：账号鉴权、好友与私聊、社区成员、频道消息、附件、通知未读、权限管理、实时事件、在线状态、语音状态，以及验收加固脚本和演示数据。

## 更多文档

开发方案入口：[docs/dev/README.md](docs/dev/README.md)。迭代计划：[docs/dev/09-iteration-plan.md](docs/dev/09-iteration-plan.md)。
