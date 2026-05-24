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
| 语音频道 | `voice:{channel_id}` | 当前处于语音会话，或有权查看语音成员列表；同时承载媒体信令请求/响应与 active speaker 广播。 |

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

本事件表示状态加入；客户端随后完成 mediasoup 媒体协商，最终连接由 `VoiceStateChanged(connection_status=connected, media_state=connected)` 同步。

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
  "media_state": "connected",
  "updated_at": "2026-05-01T12:00:00.000Z"
}
```

状态变化同步时间不超过 3 秒。

### SyncState

触发：客户端 reconnect 成功后 emit `SyncState`（无载荷），服务端按订阅范围生成增量摘要并返回；作为 HTTP 拉取（`GET /servers`、`GET /dm-conversations`、`GET /notifications`）之外的快速补偿通道。

响应载荷至少包含：

- 用户当前订阅的频道与私聊未读摘要。
- 通知未读总数。
- 当前是否仍持有有效 `VoiceSession`。

接收方：仅触发 emit 的客户端 `user:{user_id}` 房间。客户端依据响应对齐本地缓存。事件必须幂等，重复 emit 不得放大副作用。

`SyncState` 用于在重连后快速对齐摘要；HTTP 接口仍是权威数据来源。客户端 `socket-client` 在 reconnect 回调中自动 emit，业务代码无需手动调用。

## 媒体信令事件

媒体信令事件均承载于 `voice:{channel_id}` 房间，由客户端 mediasoup-client 与服务端 `MediaSignalingModule` 协商。请求-响应类事件复用 Socket.IO `ack` 机制，事件信封中的 `request_id` 关联客户端请求与服务端响应。所有 Producer 创建必须 `kind === 'audio'`，video 与 screen 直接拒绝。

### VoiceRouterCapabilities

方向：client → server（请求）/ server → client（响应）。

请求：`{ "channel_id": "uuid", "session_id": "uuid" }`

响应：

```json
{
  "router_id": "string",
  "rtp_capabilities": { }
}
```

服务端校验 `JOIN_VOICE` 后返回，Router 不存在时按需创建。

### VoiceTransportCreated

方向：client → server（请求）/ server → client（响应）。

请求：

```json
{
  "session_id": "uuid",
  "direction": "send"
}
```

响应：

```json
{
  "transport_id": "string",
  "ice_parameters": { },
  "ice_candidates": [ ],
  "dtls_parameters": { },
  "ice_servers": [ ]
}
```

每个会话创建 `direction=send` 与 `direction=recv` 各一次。

### VoiceTransportConnect

方向：client → server。

载荷：`{ "session_id": "uuid", "transport_id": "string", "dtls_parameters": { } }`

响应：`{ "ok": true }`。服务端必须校验 `transport_id` 属于 `session_id` 对应的当前用户会话；失败需返回错误码并允许客户端重连一次。

### VoiceProducerCreated

方向：client → server（请求）/ server → 同房间客户端（广播）。

请求：

```json
{
  "session_id": "uuid",
  "transport_id": "string",
  "kind": "audio",
  "rtp_parameters": { }
}
```

服务端校验 `SPEAK_VOICE`、`kind === 'audio'`，并确认 `transport_id` 是该会话的 send Transport；校验通过后返回 `{ "producer_id": "string" }` 并广播：

```json
{
  "channel_id": "uuid",
  "user_id": "uuid",
  "producer_id": "string",
  "kind": "audio",
  "paused": false,
  "created_at": "2026-05-01T12:00:00.000Z"
}
```

### VoiceConsumerCreated

方向：client → server（请求）/ server → client（响应）。

请求：

```json
{
  "session_id": "uuid",
  "producer_id": "string",
  "rtp_capabilities": { }
}
```

响应：

```json
{
  "consumer_id": "string",
  "kind": "audio",
  "rtp_parameters": { },
  "producer_paused": false
}
```

服务端校验 `LISTEN_VOICE`（默认随 `JOIN_VOICE` 隐含），通过后以 `paused=true` 创建服务端 Consumer。客户端完成本地 `recvTransport.consume()` 后必须发送 `VoiceConsumerResumed`，避免 RTP 在浏览器 m-section 就绪前到达。

### VoiceConsumerResumed

方向：client → server。

载荷：`{ "session_id": "uuid", "consumer_id": "string" }`

响应：`{ "ok": true }`。服务端校验 `LISTEN_VOICE`，并确认 Consumer 属于该会话的 recv Transport 后调用 mediasoup `consumer.resume()`。

### VoiceProducerClosed

方向：server → 同房间客户端。

载荷：

```json
{
  "channel_id": "uuid",
  "user_id": "uuid",
  "producer_id": "string",
  "reason": "manual_leave",
  "closed_at": "2026-05-01T12:00:00.000Z"
}
```

`reason` 取值：`manual_leave | signaling_timeout | worker_died | permission_lost`。客户端在 `worker_died` 时必须重新加入语音频道并协商新的 Transport 与 Producer。

### VoiceActiveSpeaker

方向：server → 同房间客户端。

载荷：

```json
{
  "channel_id": "uuid",
  "user_id": "uuid",
  "audio_level": -32.5,
  "observed_at": "2026-05-01T12:00:00.000Z"
}
```

由 mediasoup AudioLevelObserver 触发，服务端节流不超过每秒 2 次；用户停止说话时发送一次 `user_id: null` 表示静默。

## 客户端事件

| 事件 | 用途 | 服务端处理 |
|---|---|---|
| `Subscribe` | 订阅私聊、社区、频道或语音房间。 | 验证权限后加入房间。 |
| `Unsubscribe` | 取消订阅。 | 移除房间。 |
| `Heartbeat` | 保持连接和在线状态。 | 更新 Redis 心跳，必要时发布状态变化。 |
| `SyncState` | 重连后请求服务端补偿订阅范围内的状态摘要。 | 校验身份后返回服务端事件 `SyncState`（见 § 服务端事件 § SyncState）；由 `socket-client` 在 reconnect 回调中自动 emit，业务代码无需手动调用。 |
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

此外，服务端通过 `SyncState` 事件（见 § 服务端事件 § SyncState）作为 HTTP 拉取之外的补偿通道：`socket-client` 在 reconnect 后自动 emit，服务端返回未读、通知与语音会话状态摘要，对齐流程不依赖业务代码主动调用。

## 性能与可靠性

- `MessageCreated` 正常网络下 1 秒内到达目标客户端。
- `UnreadUpdated` 和 `NotificationCreated` 2 秒内同步。
- `VoiceStateChanged` 3 秒内同步。
- 媒体信令一次完整协商（`JoinVoiceChannel` 成功 → `media_state=connected`）正常网络下 P95 不超过 3 秒。
- `VoiceActiveSpeaker` 端到端延迟不超过 500 ms，节流频率不超过每秒 2 次。
- 事件发布必须在数据库事务提交后执行。
- 事件重复接收必须幂等。
- 权限变化后，后续业务事件不得继续发给已无权用户。
