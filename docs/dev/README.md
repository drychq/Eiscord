# Eiscord 开发方案文档集

本文档集用于把 `docs/srs` 分支中的软件需求规格说明书转化为可执行的开发方案。范围仅包含开发设计文档，不包含业务代码、数据库迁移脚本或部署产物。

原先单独维护的开发计划内容已经并入本目录：模块拆分口径见 [模块详细设计](03-module-design.md)，软件工程方法、迭代策略和联调安排见 [迭代开发计划](09-iteration-plan.md)。后续以 `docs/dev/` 作为唯一开发方案入口。

## 阅读顺序

| 顺序 | 文档 | 用途 |
|---|---|---|
| 1 | [技术栈与仓库结构](01-tech-stack-and-repo-structure.md) | 固化技术选择、工作区结构和基础工程约束。 |
| 2 | [系统架构设计](02-system-architecture.md) | 说明整体分层、模块依赖、请求链路和实时链路。 |
| 3 | [模块详细设计](03-module-design.md) | 将 FR-01 至 FR-20 拆到可开发模块。 |
| 4 | [数据模型设计](04-data-model.md) | 定义 PostgreSQL/Prisma 实体、关系和一致性规则。 |
| 5 | [HTTP API 契约](05-api-contracts.md) | 定义 `/api/v1` 接口、鉴权、分页、错误与幂等。 |
| 6 | [实时事件设计](06-realtime-events.md) | 定义 `/realtime` WebSocket 连接、房间和事件载荷。 |
| 7 | [权限与安全设计](07-permission-security.md) | 定义角色权限、频道覆盖、越权拦截和审计策略。 |
| 8 | [前端设计方案](08-frontend-design.md) | 定义页面、状态、交互流程和 UI 约束。 |
| 9 | [迭代开发计划](09-iteration-plan.md) | 定义 P0/P1 分期、任务拆分和联调顺序。 |
| 10 | [测试与验收方案](10-test-acceptance.md) | 定义测试策略、验收场景和需求追踪。 |
| 11 | [部署与运维方案](11-deployment-ops.md) | 定义本地开发、环境变量、容器和日志监控。 |

## 需求来源

开发方案以 `docs/srs` 分支为需求源，主要参考：

| SRS 文件 | 开发方案中的用途 |
|---|---|
| `src/chapters/introduction.tex` | 系统边界、术语、外部依赖。 |
| `src/chapters/overview.tex` | MVP 范围、目标角色、运行环境、关键假设。 |
| `src/chapters/functional.tex` | FR-01 至 FR-20 的模块、接口、事件和异常流程。 |
| `src/chapters/interface-data.tex` | 逻辑命令、实时事件、外部接口和实体定义。 |
| `src/chapters/traceability.tex` | 权限矩阵和需求追踪矩阵。 |
| `src/chapters/nonfunctional.tex` | 性能、容量、安全、可维护性和兼容性指标。 |
| `src/chapters/acceptance.tex` | AC、AC-E、AC-N 验收场景。 |

## MVP 范围

P0 必须交付以下能力：

| 领域 | 覆盖需求 |
|---|---|
| 账号与身份 | FR-01、FR-02、FR-04、FR-05 |
| 社交与私聊 | FR-06、FR-07 |
| 社区与频道 | FR-08、FR-09、FR-10、FR-11、FR-12 |
| 消息与附件 | FR-13、FR-14、FR-15 |
| 语音状态 | FR-16、FR-17 |
| 通知与未读 | FR-18 |
| 角色与权限 | FR-19、FR-20 |

P1 包含密码找回、多端细节适配、离线推送、社区搜索增强、审计查询界面和更多消息管理能力。P2 不进入 v1，包括真实多人语音媒体流、屏幕共享、机器人平台、开放接口市场、商业化订阅、广告投放、复杂内容审核和独立运营后台。

## 固定技术决策

| 层级 | 方案 |
|---|---|
| 前端 | React + TypeScript + Vite |
| 后端 | NestJS + TypeScript |
| 数据库 | PostgreSQL + Prisma |
| 缓存与在线状态 | Redis |
| 实时通信 | Socket.IO |
| 对象存储 | MinIO，本地实现 S3 兼容接口 |
| 本地环境 | Docker Compose |
| API 风格 | `/api/v1` JSON HTTP API |
| 实时入口 | `/realtime` Socket.IO 命名空间 |
| ID 与时间 | UUID 字符串 ID，ISO 8601 UTC 时间戳 |

## 全局约束

- 所有受控接口、实时订阅和附件访问必须经过权限校验。
- 权限计算固定为社区所有者最高优先级、显式拒绝优先、频道覆盖参与计算。
- 文本消息正常网络下端到端可见时间不超过 1 秒，未读与通知同步不超过 2 秒，语音状态同步不超过 3 秒。
- v1 语音频道只同步成员加入、退出、静音、闭麦和连接状态，不承载真实音频流。
- 文档中的接口、事件和实体名称应与 SRS 保持一致，代码实现可以采用更贴近框架的文件组织，但不得改变业务语义。
