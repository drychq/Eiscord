# HTTP API 契约

## 全局约定

- API 前缀固定为 `/api/v1`。
- 请求和响应使用 JSON，上传文件使用预签名上传或 `multipart/form-data` 初始化接口。
- ID 使用 UUID 字符串。
- 时间使用 ISO 8601 UTC 字符串。
- 认证使用 access token + refresh token。access token 放在 `Authorization: Bearer <token>`。
- 所有写请求必须携带或由服务端生成 `X-Request-Id`，用于审计和排错。

## 统一响应

成功响应：

```json
{
  "data": {},
  "request_id": "uuid",
  "server_time": "2026-05-01T12:00:00.000Z"
}
```

失败响应：

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "没有权限执行该操作",
    "details": {}
  },
  "request_id": "uuid",
  "server_time": "2026-05-01T12:00:00.000Z"
}
```

## 错误码

| HTTP | 错误码 | 说明 |
|---|---|---|
| 400 | `VALIDATION_FAILED` | 请求字段格式、长度或枚举值非法。 |
| 401 | `AUTH_REQUIRED` | 未登录或 access token 无效。 |
| 401 | `INVALID_CREDENTIALS` | 登录凭据无效（用户名或密码错误）；与 `AUTH_REQUIRED` 的区别在于：前者表示主动登录时凭据不正确，后者表示 access token 缺失或失效。 |
| 403 | `PERMISSION_DENIED` | 已登录但无权访问资源或执行动作。 |
| 404 | `RESOURCE_NOT_FOUND` | 资源不存在，或为了防止泄露而按不存在处理。 |
| 409 | `CONFLICT` | 唯一约束、重复申请、重复加入、幂等冲突。 |
| 413 | `PAYLOAD_TOO_LARGE` | 消息或附件超过限制。 |
| 429 | `RATE_LIMITED` | 登录、消息或邀请等操作触发限流。 |
| 400 | `PASSWORD_RESET_TOKEN_INVALID` | 密码重置 OTP 不存在、不匹配、已过期或对应账户无活动重置流程；统一返回此码以防邮箱枚举。 |
| 429 | `PASSWORD_RESET_TOO_MANY_ATTEMPTS` | 同一 OTP 累计错误次数达上限，已被强制作废，要求重新发起 forgot-password。 |
| 500 | `INTERNAL_ERROR` | 服务端未知错误。 |
| 503 | `DEPENDENCY_UNAVAILABLE` | 文件、通知、验证等依赖不可用。 |

## 分页与幂等

分页使用游标：

```json
{
  "items": [],
  "next_cursor": "opaque-cursor",
  "has_more": true
}
```

消息发送、通知已读、好友申请处理等重复提交风险较高的写接口必须支持幂等：

- 客户端发送消息携带 `client_message_id`。
- 服务端在发送者和目标会话范围内保证唯一。
- 重复请求返回第一次成功写入的消息。
- 幂等键对应的请求体不一致时返回 `CONFLICT`。

## 认证与账号

### `POST /auth/register`

对应 `RegisterUser`，覆盖 FR-01。

请求：

```json
{
  "username": "alice",
  "email_or_phone": "alice@example.com",
  "password": "password-value",
  "verification_token": "optional"
}
```

响应：

```json
{
  "user_id": "uuid",
  "account_status": "active"
}
```

### `POST /auth/login`

对应 `LoginUser`，覆盖 FR-02。

请求：

```json
{
  "login_identifier": "alice",
  "password": "password-value",
  "client": {
    "device_name": "Chrome",
    "timezone": "Asia/Hong_Kong"
  }
}
```

响应包含 token、用户摘要、好友摘要、社区列表、未读和通知摘要。登录成功发布 `PresenceChanged` 和必要的 `UnreadUpdated`。

### `POST /auth/refresh`

使用 refresh token 换取新的 access token。refresh token 失效、账号禁用或会话撤销时返回 `AUTH_REQUIRED`。

### `POST /auth/logout`

撤销当前会话，必要时触发 `PresenceChanged`。如果用户所有连接都已断开，在线状态转为离线。

### `POST /auth/password-reset`

> ⚠️ 历史接口名占位，实际拆分为下面两个端点（OTP 验证码两步流程）。

### `POST /auth/forgot-password`

对应 `ForgotPassword`，覆盖 FR-03。匿名访问，IP 维度限流 10 次/小时。

请求：

```json
{ "email": "alice@example.com" }
```

响应（**无论邮箱是否注册都返回相同结构**，防止邮箱枚举）：

```json
{ "message": "若邮箱已注册，验证码已发送至该邮箱" }
```

行为约定：

- 邮箱格式非法、邮箱未注册、账户非 `active`、或同邮箱 60 秒内重复请求时，**仍返回 200 + 上述统一响应**，仅在审计日志的 `failureReason` 中记录内部原因（`invalid_email_format` / `user_not_found` / `account_{status}` / `cooldown_blocked`）。
- 命中合法账户时签发 6 位十进制 OTP（`crypto.randomInt` + 左补 0），明文仅通过邮件发送给注册邮箱；服务端只存 SHA-256 哈希、过期时间（默认 15 分钟）和错误次数（重置为 0），并写入用户行。
- 邮件发送失败时仍返回成功响应，但审计 `failureReason=mail_send_failed`；不向客户端暴露 SMTP 状态。

### `POST /auth/reset-password`

对应 `ResetPassword`，覆盖 FR-03。匿名访问，IP 维度限流 20 次/小时。

请求：

```json
{
  "email": "alice@example.com",
  "code": "123456",
  "new_password": "NewPassword1"
}
```

响应：

```json
{ "message": "密码已重置，请使用新密码登录" }
```

错误：

- 邮箱未注册 / 无活动 OTP / OTP 不匹配 / OTP 已过期：统一返回 `PASSWORD_RESET_TOKEN_INVALID`（400）。
- 单个 OTP 累计错误次数 ≥ 5：返回 `PASSWORD_RESET_TOO_MANY_ATTEMPTS`（429），同时强制作废该 OTP，用户需重新走 forgot-password。
- 新密码不符合强度规则（至少 8 位、含字母与数字）：返回 `VALIDATION_FAILED`（400）。

成功路径在单个事务中完成：写入新 `password_hash` → 清空三个 `password_reset_*` 字段 → 将该用户全部活跃 `AuthSession` 置 `revoked_at = NOW()`；最后写一条 `ResetPassword/success` 审计。

## 用户与在线状态

### `GET /users/me`

返回当前用户资料、账号状态和可见配置。

### `PATCH /users/me/profile`

对应 `UpdateProfile`，覆盖 FR-04。

请求：

```json
{
  "nickname": "Alice",
  "avatar_attachment_id": "uuid",
  "bio": "hello"
}
```

资料变更后发布资料摘要更新，客户端刷新好友列表、私聊窗口和成员列表。

### `PATCH /users/me/presence`

对应 `UpdatePresence`，覆盖 FR-05。

请求：

```json
{
  "desired_status": "online"
}
```

服务端可根据连接状态覆盖客户端上报状态。隐身对他人表现为离线。

## 好友与私聊

### `GET /friends`

返回好友列表、关系状态和可见在线状态。

### `POST /friend-requests`

对应 `CreateFriendRequest`，覆盖 FR-06。

请求：

```json
{
  "target_user_id": "uuid",
  "message": "optional"
}
```

成功后向接收方发布 `NotificationCreated`。

### `POST /friend-requests/{friendship_id}/accept`

对应 `AcceptFriendRequest`。处理者必须是接收方，申请必须处于待处理状态。成功后创建或复用私聊会话。

### `POST /friend-requests/{friendship_id}/reject`

拒绝好友申请。重复处理返回 `CONFLICT`。

### `GET /dm-conversations`

返回当前用户可见的一对一私聊列表和最近消息摘要。

### `GET /dm-conversations/{conversation_id}/messages`

对应 `LoadMessages`，仅会话参与者可访问。

### `POST /dm-conversations/{conversation_id}/messages`

对应 `SendMessage`，覆盖 FR-07 和 FR-13。

## 社区与成员

### `POST /servers`

对应 `CreateServer`，覆盖 FR-08。

请求：

```json
{
  "name": "课程讨论",
  "description": "软件工程课程社区",
  "icon_attachment_id": "uuid"
}
```

成功后返回社区详情、所有者成员记录、默认角色和默认频道。

### `GET /servers`

返回当前用户已加入社区列表。

### `GET /servers/{server_id}`

返回社区详情、用户可见频道、成员摘要和权限摘要。

### `POST /servers/join`

对应 `JoinServer`，覆盖 FR-09。

请求：

```json
{
  "invite_code": "abc123"
}
```

### `POST /servers/{server_id}/leave`

对应 `LeaveServer`。所有者未转移所有权前不能直接退出。

### `GET /servers/{server_id}/members`

对应 `ManageMember` 的成员列表能力。只有社区成员可访问。

### `PATCH /servers/{server_id}/members/{member_id}`

对应 `ManageMember` 的管理动作能力。

请求：

```json
{
  "action": "mute",
  "reason": "spam"
}
```

## 频道

### `POST /servers/{server_id}/channels`

对应 `CreateChannel`，覆盖 FR-11。

请求：

```json
{
  "name": "general",
  "type": "text",
  "topic": "日常讨论",
  "sort_order": 10,
  "permission_overwrites": []
}
```

### `PATCH /channels/{channel_id}`

编辑频道名称、主题、排序或权限覆盖。需要频道管理权限。

### `DELETE /channels/{channel_id}`

删除频道。删除后禁止发送消息或加入语音状态。

### `GET /channels/{channel_id}/messages`

对应 `LoadMessages`，覆盖 FR-14。必须有频道查看权限。

### `POST /channels/{channel_id}/messages`

对应 `SendMessage`，覆盖 FR-13。必须有频道查看和发言权限。

## 消息与附件

### `POST /attachments/init`

创建附件上传意图，返回上传 URL 或上传表单字段。

请求：

```json
{
  "file_name": "image.png",
  "mime_type": "image/png",
  "size_bytes": 102400,
  "purpose": "message"
}
```

### `POST /attachments/{attachment_id}/complete`

标记附件上传完成并校验对象存储中实际文件元数据。

### `GET /attachments/{attachment_id}`

返回附件访问地址。必须结合业务上下文校验，例如消息所属频道或私聊权限。

### `POST /messages/{message_id}/delete`

对应 `DeleteMessage`，覆盖 FR-15。

请求：

```json
{
  "operation": "retract",
  "reason": "optional"
}
```

发送者只能撤回自己的消息；管理员删除频道消息需要消息管理权限。

### `POST /read-states`

对应 `MarkRead`，覆盖 FR-14。

请求：

```json
{
  "scope_type": "channel",
  "channel_id": "uuid",
  "last_read_message_id": "uuid"
}
```

## 通知

### `GET /notifications`

返回当前用户通知列表，支持 `is_read` 和游标分页。

### `POST /notifications/read`

对应 `MarkNotificationRead`，覆盖 FR-18。

请求：

```json
{
  "notification_ids": ["uuid"],
  "mark_all": false
}
```

只能处理自己的通知。

## 角色与权限

### `GET /servers/{server_id}/roles`

返回社区角色列表。普通成员可获取用于展示的角色摘要，管理字段按权限过滤。

### `POST /servers/{server_id}/roles`

对应 `AssignRole` 的创建能力，覆盖 FR-19。需要角色管理权限。

### `PATCH /roles/{role_id}`

修改角色名称、颜色、优先级和权限集合。不得授予超出自身能力的权限。

### `POST /servers/{server_id}/members/{member_id}/roles`

给成员分配角色。角色和成员必须属于同一社区。

### `DELETE /servers/{server_id}/members/{member_id}/roles/{role_id}`

移除成员角色。默认角色不可移除到成员无基础权限状态。

### `POST /permissions/check`

对应 `CheckPermission`，仅供内部管理界面、调试和测试使用。业务接口必须在服务端内部调用权限服务，不能依赖前端主动请求此接口完成安全控制。

## 语音

本节覆盖语音状态命令与媒体凭证签发。媒体协商（Transport/Producer/Consumer）通过 `/realtime` Socket 事件完成，详见 `06-realtime-events.md` §媒体信令事件；HTTP 仅承担状态命令、加入/离开和 TURN 凭证签发。

### `POST /voice/channels/{channel_id}/join`

对应 `JoinVoiceChannel`，覆盖 FR-16。

请求：

```json
{
  "initial_mute_state": false,
  "initial_deafen_state": false
}
```

响应：

```json
{
  "session_id": "uuid",
  "channel_id": "uuid",
  "media": {
    "router_rtp_capabilities": { },
    "active_producers": [
      {
        "channel_id": "uuid",
        "user_id": "uuid",
        "producer_id": "string",
        "kind": "audio",
        "paused": false
      }
    ],
    "ice_servers": [
      {
        "urls": ["turn:turn.example.com:3478?transport=udp"],
        "username": "1714915200:user-uuid",
        "credential": "<hmac-base64>",
        "credential_type": "password",
        "ttl_seconds": 300
      }
    ],
    "signaling_channel": "voice:{channel_id}"
  }
}
```

同一用户已有其他有效语音会话时，服务端先释放旧会话再加入新频道，或返回明确冲突。v1 推荐自动切换并发布旧频道 `VoiceMemberLeft`。30 秒内未完成媒体协商，服务端释放会话并广播 `VoiceMemberLeft(reason=signaling_timeout)`。
`active_producers` 用于让后加入成员主动创建 Consumer，避免只依赖加入后的广播事件。

### `POST /voice/sessions/{session_id}/leave`

对应 `LeaveVoiceChannel`。重复离开必须幂等，服务端同步关闭对应 Transport/Producer 并清理 Redis 运行期键。

### `PATCH /voice/sessions/{session_id}/state`

对应 `UpdateVoiceState`，覆盖 FR-17。

请求：

```json
{
  "mute_state": true,
  "deafen_state": false,
  "connection_status": "connected"
}
```

服务端在 `mute_state` 切换时调用 mediasoup `Producer.pause/resume`；`deafen_state` 由客户端关闭本地 Consumer 解码并通过本接口同步状态。

### `GET /voice/sessions/{session_id}/ice-servers`

刷新 TURN 凭证。当前客户端在重新加入/重协商时获取新凭证；本接口保留给后续长会话刷新使用。响应载荷与 `JoinVoiceChannel` 的 `media.ice_servers` 一致。频繁调用会触发限流。

## 接口到需求映射

| FR | API |
|---|---|
| FR-01 | `POST /auth/register` |
| FR-02 | `POST /auth/login` |
| FR-03 | `POST /auth/forgot-password`、`POST /auth/reset-password` |
| FR-04 | `PATCH /users/me/profile` |
| FR-05 | `PATCH /users/me/presence` |
| FR-06 | `POST /friend-requests`、`POST /friend-requests/{id}/accept` |
| FR-07 | `GET/POST /dm-conversations/{id}/messages` |
| FR-08 | `POST /servers` |
| FR-09 | `POST /servers/join`、`POST /servers/{id}/leave` |
| FR-10 | `GET/PATCH /servers/{id}/members` |
| FR-11 | `POST/PATCH/DELETE /channels` |
| FR-12 | 权限守卫、频道消息和订阅接口 |
| FR-13 | `POST /channels/{id}/messages`、`POST /dm-conversations/{id}/messages` |
| FR-14 | `GET /channels/{id}/messages`、`POST /read-states` |
| FR-15 | `POST /messages/{id}/delete` |
| FR-16 | `POST /voice/channels/{id}/join`、`POST /voice/sessions/{id}/leave`、`GET /voice/sessions/{id}/ice-servers` + Socket 媒体信令事件（`VoiceRouterCapabilities`、`VoiceTransportCreated`、`VoiceTransportConnect`、`VoiceProducerCreated`、`VoiceConsumerCreated`、`VoiceConsumerResumed`、`VoiceProducerClosed`） |
| FR-17 | `PATCH /voice/sessions/{id}/state` + Socket 媒体信令事件（`VoiceStateChanged`、`VoiceActiveSpeaker`） |
| FR-18 | `GET /notifications`、`POST /notifications/read` |
| FR-19 | `POST/PATCH /roles`、成员角色接口 |
| FR-20 | 所有受控接口的服务端权限拦截 |
