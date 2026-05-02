# 实时事件设计

## 入口与认证

- Socket.IO 命名空间固定为 `/realtime`。
- 客户端握手携带 access token。
- 服务端验证 token 后建立连接，加入 `user:{user_id}` 房间。
- token 无效、账号禁用或会话撤销时拒绝连接。
- 每个连接记录 `connection_id`、`user_id`、`connected_at` 和最近心跳时间。

## 订阅协议

客户端连接成功后按当前界面订阅上下文：

```json
{
  "event": "Subscribe",
  "payload": {
    "scope_type": "channel",
    "scope_id": "uuid"
  }
}
```

服务端订阅前必须检查权限：

| 订阅范围 | 房间 | 权限要求 |
|---|---|---|
| 用户 | `user:{user_id}` | 连接本人自动加入。 |
| 私聊 | `dm:{conversation_id}` | 是会话参与者。 |
| 社区 | `server:{server_id}` | 是社区有效成员。 |
| 文本频道 | `channel:{channel_id}` | 有查看频道权限。 |
| 语音频道 | `voice:{channel_id}` | 当前处于语音会话，或有权查看语音成员列表。 |

取消订阅使用 `Unsubscribe`，连接断开时服务端自动移除全部房间。

## 事件信封

所有服务端事件使用统一信封：

```json
{
  "event_id": "uuid",
  "event_name": "MessageCreated",
  "occurred_at": "2026-05-01T12:00:00.000Z",
  "payload": {},
  "request_id": "uuid"
}
```

客户端用 `event_id` 去重。事件载荷只包含展示和增量更新所需摘要，不能成为越权读取的唯一来源。

## 服务端事件

### MessageCreated

触发：消息成功持久化并通过权限校验。

载荷：

```json
{
  "message_id": "uuid",
  "scope_type": "channel",
  "channel_id": "uuid",
  "conversation_id": null,
  "sender": {
    "user_id": "uuid",
    "nickname": "Alice",
    "avatar_url": "https://example"
  },
  "content": "hello",
  "attachments": [],
  "mentions": ["uuid"],
  "created_at": "2026-05-01T12:00:00.000Z"
}
```

接收方：私聊参与者，或有权查看目标频道的在线成员。

客户端动作：插入消息、更新最近会话、刷新未读和通知角标。

### MessageDeleted

触发：消息被发送者撤回或管理员删除。

载荷：

```json
{
  "message_id": "uuid",
  "operation": "retract",
  "actor": {
    "user_id": "uuid",
    "nickname": "Alice"
  },
  "deleted_at": "2026-05-01T12:00:00.000Z"
}
```

接收方：仍有权查看原会话或频道的相关客户端。事件必须幂等，重复接收不得恢复已删除消息。

### UnreadUpdated

触发：用户未读状态变化。

载荷：

```json
{
  "scope_type": "channel",
  "channel_id": "uuid",
  "conversation_id": null,
  "unread_count": 3,
  "last_read_message_id": "uuid"
}
```

接收方：未读状态所属用户的 `user:{user_id}` 房间。同步延迟不超过 2 秒。

### NotificationCreated

触发：好友申请、私聊新消息、频道提及或管理动作结果产生通知。

载荷：

```json
{
  "notification_id": "uuid",
  "type": "mention",
  "source_type": "message",
  "source_id": "uuid",
  "content_preview": "Alice 提及了你",
  "created_at": "2026-05-01T12:00:00.000Z"
}
```

接收方：通知目标用户。去重键相同的业务事件不得重复生成等价通知。

### PresenceChanged

触发：登录、离线、隐身、离开或手动切换状态。

载荷：

```json
{
  "user_id": "uuid",
  "visible_status": "online",
  "updated_at": "2026-05-01T12:00:00.000Z"
}
```

接收方：目标用户好友、同社区可见成员和本人客户端。隐身状态对他人按离线展示。

### MemberJoined

触发：用户加入社区或创建者成为首位成员。

载荷：

```json
{
  "server_id": "uuid",
  "member": {
    "membership_id": "uuid",
    "user_id": "uuid",
    "nickname": "Alice",
    "role_ids": ["uuid"]
  },
  "joined_at": "2026-05-01T12:00:00.000Z"
}
```

接收方：目标社区中有权查看成员列表的在线成员。

### MemberChanged

触发：成员资料、角色或基础管理状态变化。

载荷：

```json
{
  "server_id": "uuid",
  "membership_id": "uuid",
  "change_type": "role_assigned",
  "member": {}
}
```

成员被移除后不得继续接收该社区后续成员事件。

### ChannelChanged

触发：频道创建、编辑、排序或删除。

载荷：

```json
{
  "server_id": "uuid",
  "channel": {
    "channel_id": "uuid",
    "name": "general",
    "type": "text",
    "sort_order": 10
  },
  "change_type": "created"
}
```

接收方：对目标频道或频道列表有可见权限的社区成员。权限导致不可见的频道应从客户端列表中移除。

### PermissionChanged

触发：角色、成员角色或频道权限覆盖变化。

载荷：

```json
{
  "server_id": "uuid",
  "change_scope": "channel",
  "resource_id": "uuid",
  "affected_user_ids": ["uuid"]
}
```

接收方：受影响社区成员和管理者客户端。客户端收到后重新拉取可见频道、权限摘要和管理入口。

### VoiceMemberJoined

触发：用户成功加入语音频道状态房间。

载荷：

```json
{
  "channel_id": "uuid",
  "session_id": "uuid",
  "member": {
    "user_id": "uuid",
    "nickname": "Alice"
  },
  "mute_state": false,
  "deafen_state": false,
  "connection_status": "connected",
  "joined_at": "2026-05-01T12:00:00.000Z"
}
```

本事件只表示状态加入，不承诺真实音频媒体流已经建立。

### VoiceMemberLeft

触发：用户主动离开、断线超时或权限失效退出语音频道。

载荷：

```json
{
  "channel_id": "uuid",
  "user_id": "uuid",
  "reason": "manual_leave",
  "left_at": "2026-05-01T12:00:00.000Z"
}
```

事件必须幂等，重复接收不得造成成员列表异常。

### VoiceStateChanged

触发：语音频道成员切换静音、闭麦或连接状态。

载荷：

```json
{
  "session_id": "uuid",
  "channel_id": "uuid",
  "user_id": "uuid",
  "mute_state": true,
  "deafen_state": false,
  "connection_status": "connected",
  "updated_at": "2026-05-01T12:00:00.000Z"
}
```

状态变化同步时间不超过 3 秒。

## 客户端事件

| 事件 | 用途 | 服务端处理 |
|---|---|---|
| `Subscribe` | 订阅私聊、社区、频道或语音房间。 | 验证权限后加入房间。 |
| `Unsubscribe` | 取消订阅。 | 移除房间。 |
| `Heartbeat` | 保持连接和在线状态。 | 更新 Redis 心跳，必要时发布状态变化。 |
| `TypingStarted` | 输入中提示，P1 增强。 | v1 可忽略或只在当前会话内短期广播。 |

P0 写操作不通过客户端 Socket 事件直接执行，统一走 HTTP API，避免重复实现鉴权、校验和事务。

## 重连补偿

客户端重连后执行：

1. 重新连接 `/realtime` 并加入 `user:{user_id}`。
2. 调用 `GET /servers`、`GET /dm-conversations`、`GET /notifications` 获取摘要状态。
3. 对当前打开的频道或私聊调用 `LoadMessages`，使用最后一条本地消息作为游标补齐。
4. 调用 `GET /servers/{server_id}` 刷新可见频道和权限摘要。
5. 如果重连前处于语音频道，调用语音状态接口确认会话是否仍有效。

服务端事件只提供增量更新，客户端最终以 HTTP 查询结果为准。

## 性能与可靠性

- `MessageCreated` 正常网络下 1 秒内到达目标客户端。
- `UnreadUpdated` 和 `NotificationCreated` 2 秒内同步。
- `VoiceStateChanged` 3 秒内同步。
- 事件发布必须在数据库事务提交后执行。
- 事件重复接收必须幂等。
- 权限变化后，后续业务事件不得继续发给已无权用户。

