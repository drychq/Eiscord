# 权限与安全设计

## 权限目标

权限系统必须保证：

- 无权用户不能查看受限频道、历史消息、私聊内容或受保护附件。
- 普通成员不能执行频道管理、成员管理、角色管理或删除他人消息。
- 管理员不能管理社区所有者或高于自身权限的成员和角色。
- 权限变化会影响 HTTP 接口、实时订阅、附件访问和历史加载。
- 所有权限拒绝和关键管理动作都能审计。

## 权限位

权限位使用 bitset 存储在 `Role.permissionBits`、`PermissionOverwrite.allowBits` 和 `PermissionOverwrite.denyBits` 中。

| 权限 | 说明 |
|---|---|
| `VIEW_CHANNEL` | 查看频道和频道历史。 |
| `SEND_MESSAGE` | 在文本频道发送消息。 |
| `MANAGE_MESSAGE` | 删除他人频道消息。 |
| `MANAGE_CHANNEL` | 创建、编辑、排序或删除频道。 |
| `JOIN_VOICE` | 加入语音频道状态房间。 |
| `SPEAK_VOICE` | 在语音频道发送音频，对应 mediasoup audio Producer 创建。 |
| `LISTEN_VOICE` | 接收语音频道音频，默认随 `JOIN_VOICE` 隐含；用于实现「禁听」。 |
| `MANAGE_MEMBER` | 移除、禁言或恢复成员。 |
| `MANAGE_ROLE` | 创建、修改、删除角色或分配成员角色。 |
| `CREATE_INVITE` | 创建社区邀请。 |
| `VIEW_AUDIT` | 查看审计摘要，P1 管理界面使用。 |

私聊权限不走社区角色，按会话参与者和好友关系判断。

## PermissionBit vs PermissionAction

代码中存在两套相关但不同的权限标识体系：

- **PermissionBit** — 11 个 bitset 标志（见上表），存储在 `Role.permissionBits` 与 `PermissionOverwrite.allowBits/denyBits`，**可分配给角色或频道覆盖**。
- **PermissionAction** — 14 个权限校验动作枚举（`apps/api/src/core/permissions/permission.types.ts`），是服务端 `PermissionGuard` 与 `@RequirePermission` 装饰器的入口动作名。

其中 11 个 Action 与 11 个 Bit 一一对应（`VIEW_CHANNEL` / `SEND_MESSAGE` / `MANAGE_MESSAGE` / `MANAGE_CHANNEL` / `JOIN_VOICE` / `SPEAK_VOICE` / `LISTEN_VOICE` / `MANAGE_MEMBER` / `MANAGE_ROLE` / `CREATE_INVITE` / `VIEW_AUDIT`），守卫按 bitset 决定允许/拒绝。

另外 3 个 Action 是**内置动作**，没有对应 Bit，不能通过角色分配，由系统按资源关系自动判定：

| 内置 Action | 触发位置 | 判定逻辑 |
|---|---|---|
| `ACCESS_ATTACHMENT` | `GET /attachments/:id` | 校验当前用户是否对附件所属业务资源（消息所属频道或私聊）有可见权限。 |
| `SUBSCRIBE_REALTIME` | Socket.IO 订阅前置 | 按订阅范围（user/dm/server/channel/voice）走对应可见性校验。 |
| `VIEW_MEMBERS` | `GET /servers/:id/members` | 当前用户必须是该社区有效成员（`memberStatus !== removed/banned`）。 |

内置 Action 不通过 `Role.permissionBits` 调整；如需更细粒度的成员列表查看控制，应在 service 层引入额外字段，而非扩展 Bit 集合。

## 角色层级

| 角色类别 | 规则 |
|---|---|
| 社区所有者 | 拥有社区最高权限，不受角色权限位限制。 |
| 管理员/版主 | 由角色权限位授予管理能力，受角色优先级限制。 |
| 普通成员 | 通过默认角色和分配角色获得基础访问能力。 |
| 访客/非成员 | 只能访问登录、注册和邀请预览。 |

管理动作比较使用最高角色 `priority`。操作者最高角色优先级必须高于目标成员最高角色优先级，所有者除外。管理员可在频道覆盖中拒绝目标角色或成员的 `SPEAK_VOICE` 实现「闭麦房」，拒绝 `LISTEN_VOICE` 实现「禁听」。

## 权限计算

输入：

```text
actor_user_id
server_id
optional channel_id
operation
target_resource
```

计算顺序：

1. 如果操作是访客可用能力，直接按访客规则处理。
2. 验证用户账号有效且未禁用。
3. 私聊场景校验用户是否为会话参与者，必要时校验好友关系。
4. 社区场景加载 `Server`、`Membership`、成员角色和频道覆盖。
5. 若用户是社区所有者，允许社区内受控操作，但仍校验资源存在和输入合法。
6. 合并默认角色和成员角色权限位，得到基础权限。
7. 如果存在频道覆盖，先应用角色覆盖，再应用成员覆盖。
8. 显式拒绝优先于显式允许。
9. 管理动作额外比较操作者和目标角色优先级。
10. 返回允许或拒绝结果，拒绝时提供内部原因并记录必要审计。

## 频道覆盖规则

频道覆盖支持对角色或成员设置允许和拒绝权限。

| 场景 | 结果 |
|---|---|
| 基础角色允许，频道角色覆盖拒绝 | 拒绝。 |
| 基础角色拒绝，频道角色覆盖允许 | 允许，除非成员覆盖拒绝。 |
| 多个角色覆盖冲突 | 任一显式拒绝优先。 |
| 成员覆盖允许，角色覆盖拒绝 | 若无成员显式拒绝，成员显式允许可覆盖角色拒绝。 |
| 成员覆盖拒绝 | 最终拒绝。 |

实现时必须把规则封装在 `PermissionsModule`，禁止各业务模块复制判断逻辑。

## 接口拦截

| 入口 | 拦截要求 |
|---|---|
| HTTP API | Controller guard 解析身份，Service 调用权限服务后执行业务写入。 |
| Socket 订阅 | 加入房间前校验可见权限，权限变化后移除无权房间。 |
| 附件访问 | 返回下载地址前校验附件所属业务资源的访问权限。 |
| 历史消息 | 查询前校验会话或频道查看权限，查询结果过滤删除和无权内容。 |
| 管理动作 | 执行前校验操作权限和角色优先级。 |
| 媒体信令 | mediasoup Transport connect/produce 前校验 session 归属；Producer 创建前校验 `SPEAK_VOICE` 与 `kind === 'audio'`；Consumer 创建/恢复前校验 `LISTEN_VOICE`；TURN 凭证签发前校验 `JOIN_VOICE`。 |

前端隐藏按钮不能作为安全边界。即使客户端展示错误，服务端仍必须拒绝越权请求。

## 安全策略

### 凭证保护

- 密码使用 PBKDF2-SHA256（310,000 迭代，Node 内建 `crypto.pbkdf2Sync`）存储，不保存明文。
- access token 短有效期，refresh token 长有效期并可撤销。
- 日志不得记录明文密码、完整 token、完整验证码或完整敏感凭证。
- 登录失败记录审计，并按账号和 IP 维度限流。

### 密码重置（OTP 两步流程）

- `POST /auth/forgot-password` 与 `POST /auth/reset-password` 均匿名访问，并通过 `@RateLimit` 装饰器各自限流。
- OTP 为 6 位十进制，由 `crypto.randomInt` 生成，仅以 SHA-256 哈希落库；明文仅经邮件发送给注册邮箱，不写日志、不进审计 metadata（审计层对名为 `code`/`password`/`token` 的元数据键自动 `[redacted]`）。
- TTL 15 分钟，单 OTP 最多 5 次失败核验；达到上限或 OTP 过期时强制清空所有 `password_reset_*` 字段，要求用户重新走 forgot-password。
- 反枚举铁律：forgot-password 始终返回 `200 + 统一文案`（即使邮箱未注册、格式非法、账户被禁、命中冷却），实际内部状态仅在审计 `failureReason` 中体现；reset-password 对 {无用户/无活动 token/code 错/已过期} 统一返回 `PASSWORD_RESET_TOKEN_INVALID`，仅 `PASSWORD_RESET_TOO_MANY_ATTEMPTS` 单独可见。
- 重置成功必须在单个 `prisma.$transaction` 内完成：写入新 `password_hash` → 清空 `password_reset_*` → 吊销该用户全部活跃 `AuthSession`，确保旧 access/refresh 凭据立即失效。
- 同邮箱 60 秒重发冷却通过比对 `passwordResetExpiresAt - now > TTL - cooldown` 实现，不引入新数据列。
- 邮件基础设施（`MailerService`）仅服务于本流程；不引入异步队列，发送同步完成；SMTP 失败时仍向客户端返回统一成功文案，仅审计 `failureReason=mail_send_failed`。

### 传输与存储

- 生产环境必须使用 HTTPS/WSS。
- 对象存储私有桶保存附件，下载通过短期签名 URL 或后端代理。
- 受保护附件必须绑定业务上下文，不能只靠随机 URL 保护。

### 输入校验

- 所有 DTO 使用 Zod 或 class-validator 校验。
- 消息内容限制长度，附件限制类型和大小。
- 昵称、频道名、社区名和角色名限制长度与可见字符范围。
- 富文本和 Markdown 渲染必须进行 XSS 防护。

### 限流

| 操作 | 限流维度 |
|---|---|
| 登录 | 账号、IP |
| 注册 | IP、联系方式 |
| 密码重置申请 (`POST /auth/forgot-password`) | IP（10/小时）+ 同邮箱 60 秒重发冷却（基于 DB 中现有 OTP 过期时间推算） |
| 密码重置确认 (`POST /auth/reset-password`) | IP（20/小时）+ 单 OTP 最多 5 次错误核验（DB `passwordResetAttempts` 计数） |
| 发送消息 | 用户、频道或私聊 |
| 创建邀请 | 用户、社区 |
| 附件初始化 | 用户、文件大小总量 |
| Socket 连接 | 用户、IP |
| 媒体信令 | 用户、频道；限制 Producer/Consumer 创建频次与 Transport 重建频次 |
| TURN 凭证签发 | 用户；防止凭证滥用与 NAT 嗅探 |

触发限流返回 `RATE_LIMITED`，并记录请求摘要。

### 媒体安全

- 媒体面强制 DTLS-SRTP，不接受明文 RTP。
- 入站 Producer 强制 `kind === 'audio'`；视频与屏幕共享轨直接拒绝并审计。
- TURN 使用基于 `TURN_SHARED_SECRET` 的短 TTL HMAC 凭证（默认 5 分钟），由 `GET /voice/sessions/{id}/ice-servers` 续签；禁止前端持久化或硬编码长效凭证。
- 服务端不录音、不混音、不转写；mediasoup 不接入 RecordingPlugin、PlainTransport RTP 转发或 ffmpeg 录制管道。
- mediasoup 信令端口仅在受信任内网监听；UDP 媒体端口段（默认 40000-40100）只对外开放必要范围。
- coturn 禁用静态用户与长效共享密钥的纯文本登录，仅支持 HMAC 时间凭证。

## 审计

必须记录：

- 登录失败、账号禁用登录尝试。
- 密码重置：`ForgotPassword`（result 一律 success 防枚举，`failureReason` 区分 `sent` / `user_not_found` / `cooldown_blocked` / `mail_send_failed` / `invalid_email_format` / `account_{status}`）、`ResetPassword`（success 或 failure，`failureReason` 区分 `weak_password` / `invalid_input` / `no_active_token` / `expired` / `too_many_attempts` / `invalid_code`）。
- 权限拒绝。
- 成员移除、禁言、恢复。
- 频道创建、编辑、删除。
- 角色创建、修改、删除、分配。
- 消息删除或管理员删除他人消息。
- 附件访问拒绝。
- 权限拒绝 `SPEAK_VOICE` 或 `LISTEN_VOICE`、Producer 异常关闭（`worker_died` / `permission_lost`）、TURN 凭证签发失败。

审计字段至少包含操作者、目标资源、动作、结果、失败原因、请求 ID 和创建时间。日志保留不少于 180 天。

## 隐私边界

- 非好友不得查看私聊内容。
- 非社区成员不得查看社区成员列表、频道内容和受保护附件。
- 无频道权限的成员不得通过历史链接、实时事件或附件地址查看频道内容。
- 隐身用户对他人表现为离线。
- 通知预览在来源失效或权限失效后不得泄露原文内容。

## 权限验收映射

| 验收项 | 设计覆盖 |
|---|---|
| AC-04 权限控制有效 | 统一权限服务、频道覆盖、管理动作角色比较。 |
| AC-03 语音状态与媒体协商 | `JOIN_VOICE` / `SPEAK_VOICE` / `LISTEN_VOICE` 双轨校验、Producer kind 限制、TURN 凭证签发。 |
| AC-E5 非成员或无权访问频道 | HTTP、Socket、附件和历史消息统一校验。 |
| AC-E7 越权管理动作 | 管理权限位和角色优先级比较。 |
| AC-N4 权限与隐私保护 | 服务端拦截、对象存储私有化、审计记录。 |
