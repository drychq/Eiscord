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
| 403 | `PERMISSION_DENIED` | 已登录但无权访问资源或执行动作。 |
| 404 | `RESOURCE_NOT_FOUND` | 资源不存在，或为了防止泄露而按不存在处理。 |
| 409 | `CONFLICT` | 唯一约束、重复申请、重复加入、幂等冲突。 |
| 413 | `PAYLOAD_TOO_LARGE` | 消息或附件超过限制。 |
| 429 | `RATE_LIMITED` | 登录、消息或邀请等操作触发限流。 |
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

对应 `ResetPassword`，作为 P1 接口保留。验证凭据过期、重复使用或账号不存在时返回统一失败，不泄露账号存在性。

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

## 语音状态

### `POST /voice/channels/{channel_id}/join`

对应 `JoinVoiceChannel`，覆盖 FR-16。

请求：

```json
{
  "initial_mute_state": false,
  "initial_deafen_state": false
}
```

同一用户已有其他有效语音会话时，服务端先释放旧会话再加入新频道，或返回明确冲突。v1 推荐自动切换并发布旧频道 `VoiceMemberLeft`。

### `POST /voice/sessions/{session_id}/leave`

对应 `LeaveVoiceChannel`。重复离开必须幂等。

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

## 接口到需求映射

| FR | API |
|---|---|
| FR-01 | `POST /auth/register` |
| FR-02 | `POST /auth/login` |
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
| FR-16 | `POST /voice/channels/{id}/join`、`POST /voice/sessions/{id}/leave` |
| FR-17 | `PATCH /voice/sessions/{id}/state` |
| FR-18 | `GET /notifications`、`POST /notifications/read` |
| FR-19 | `POST/PATCH /roles`、成员角色接口 |
| FR-20 | 所有受控接口的服务端权限拦截 |

