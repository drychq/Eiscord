# 数据模型设计

## 建模约定

- 主键统一使用 UUID 字符串。
- 时间字段统一使用 ISO 8601 UTC 语义，数据库类型使用 `timestamptz`。
- 软删除或失效状态优先于物理删除，用于保留消息、关系和审计可追踪性。
- 所有跨资源访问都通过业务上下文授权，数据库外键不能替代权限校验。
- Prisma schema 作为单一模型来源，迁移文件由 Prisma 生成并进入版本控制。

## 核心实体

### User

平台注册用户，承载身份、资料和在线状态。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `username` | 平台级唯一用户名。 |
| `emailOrPhone` | 平台级唯一绑定联系方式。 |
| `passwordHash` | 不可逆密码哈希。 |
| `nickname` | 展示昵称。 |
| `avatarAttachmentId` | 头像附件引用。 |
| `bio` | 个性签名。 |
| `accountStatus` | `pending_verification`、`active`、`disabled`。 |
| `presenceStatus` | 用户设置或系统推导的在线状态。 |
| `createdAt`、`updatedAt` | 创建和更新时间。 |

约束：`username` 和 `emailOrPhone` 唯一；禁用账号不能登录；删除或注销账号后登录凭证失效，历史消息按展示策略脱敏。

### Friendship

好友申请和好友关系。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `requesterId` | 发起人。 |
| `addresseeId` | 接收人。 |
| `status` | `pending`、`accepted`、`rejected`、`deleted`。 |
| `createdAt`、`updatedAt` | 创建和更新时间。 |

约束：同一对用户同一时间只允许一条有效关系；不能向自己申请；接受后可创建或复用 `DirectConversation`。

### DirectConversation

一对一私聊会话。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `participantAId`、`participantBId` | 两名参与者。 |
| `lastMessageId` | 最近消息。 |
| `createdAt`、`updatedAt` | 创建和更新时间。 |

约束：同一对用户复用同一会话；加载或发送消息时必须验证参与者身份。

### Server

社区空间。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `ownerId` | 社区所有者。 |
| `name` | 社区名称。 |
| `iconAttachmentId` | 社区图标附件。 |
| `description` | 社区简介。 |
| `status` | `active`、`archived`、`deleted`。 |
| `createdAt`、`updatedAt` | 创建和更新时间。 |

约束：每个社区必须有且仅有一个所有者；创建社区必须同时创建默认角色和默认文本频道。

### Invitation

社区邀请。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `serverId` | 所属社区。 |
| `code` | 邀请码，活动状态下唯一。 |
| `createdById` | 创建者。 |
| `expiresAt` | 过期时间。 |
| `maxUses`、`usedCount` | 使用次数限制和已用次数。 |
| `status` | `active`、`revoked`、`expired`。 |

约束：加入社区时必须校验状态、过期时间、使用次数和用户限制。

### Membership

社区成员关系。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `serverId` | 社区。 |
| `userId` | 用户。 |
| `nickInServer` | 社区内昵称。 |
| `memberStatus` | `active`、`muted`、`removed`、`banned`。 |
| `joinedAt` | 加入时间。 |

约束：同一用户在同一社区只允许一条有效成员记录；成员退出、移除或封禁后权限失效。

### Role

社区角色。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `serverId` | 所属社区。 |
| `name` | 角色名。 |
| `permissionBits` | 权限位集合。 |
| `color` | 展示颜色。 |
| `priority` | 角色优先级。 |
| `isDefault` | 是否默认角色。 |

约束：默认角色必须始终存在；角色只能分配给同社区成员；管理员不能授予超出自身能力的权限。

### MembershipRole

成员和角色的多对多关系。

| 字段 | 说明 |
|---|---|
| `membershipId` | 成员关系。 |
| `roleId` | 角色。 |
| `assignedById` | 分配者。 |
| `assignedAt` | 分配时间。 |

约束：`membershipId` 和 `roleId` 必须属于同一社区。

### Channel

文本频道或语音频道。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `serverId` | 所属社区。 |
| `name` | 频道名称。 |
| `type` | `text` 或 `voice`。 |
| `topic` | 频道主题。 |
| `sortOrder` | 排序值。 |
| `status` | `active`、`deleted`。 |
| `createdAt`、`updatedAt` | 创建和更新时间。 |

约束：频道必须属于一个社区；删除后禁止继续发消息或加入语音状态。

### PermissionOverwrite

频道级权限覆盖。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `channelId` | 所属频道。 |
| `targetType` | `role` 或 `member`。 |
| `targetId` | 角色 ID 或成员 ID。 |
| `allowBits` | 显式允许权限集合。 |
| `denyBits` | 显式拒绝权限集合。 |

约束：同一频道对同一目标只允许一条有效覆盖；目标删除或失效后覆盖规则同步失效。

### Message

文本频道或私聊消息。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `scopeType` | `channel` 或 `dm`。 |
| `channelId` | 文本频道消息所属频道。 |
| `conversationId` | 私聊消息所属会话。 |
| `senderId` | 发送者。 |
| `content` | 文本内容。 |
| `visibility` | `visible`、`retracted`、`deleted`。 |
| `clientMessageId` | 客户端临时消息 ID，用于幂等。 |
| `createdAt`、`updatedAt`、`deletedAt` | 时间字段。 |

约束：频道消息和私聊消息二选一关联；删除不物理移除；`clientMessageId` 在发送者和目标会话范围内唯一。

### Attachment

附件、头像或社区图标文件元数据。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `ownerId` | 上传者。 |
| `storageKey` | 对象存储 key。 |
| `fileName` | 原始文件名。 |
| `mimeType` | 文件类型。 |
| `sizeBytes` | 文件大小。 |
| `purpose` | `message`、`avatar`、`server_icon`。 |
| `status` | `pending`、`ready`、`hidden`、`deleted`。 |
| `createdAt` | 创建时间。 |

约束：访问附件必须结合消息、用户或社区上下文授权，禁止仅凭对象地址访问受保护资源。

### MessageAttachment

消息和附件关系。

| 字段 | 说明 |
|---|---|
| `messageId` | 消息。 |
| `attachmentId` | 附件。 |

约束：附件必须归属合法上传者，并在消息发送时确认可用。

### ReadState

用户在私聊或频道中的读取状态。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `userId` | 用户。 |
| `scopeType` | `channel` 或 `dm`。 |
| `channelId` | 频道维度读取状态。 |
| `conversationId` | 私聊维度读取状态。 |
| `lastReadMessageId` | 最近已读消息。 |
| `unreadCount` | 未读数量。 |
| `updatedAt` | 更新时间。 |

约束：同一用户对同一会话或频道最多一条有效读取状态；退出社区后读取状态不能授予访问权限。

### VoiceSession

语音频道状态会话。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `channelId` | 语音频道。 |
| `userId` | 用户。 |
| `joinedAt` | 加入时间。 |
| `muteState` | 是否静音。 |
| `deafenState` | 是否闭麦。 |
| `connectionStatus` | `connecting`、`connected`、`disconnected`。 |
| `endedAt` | 结束时间。 |

约束：同一用户同一时刻只允许一个有效语音会话；该实体只表示状态，不表示真实媒体流。

### Notification

站内通知。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `userId` | 接收者。 |
| `type` | 通知类型。 |
| `sourceType`、`sourceId` | 来源资源。 |
| `contentPreview` | 安全摘要。 |
| `isRead` | 是否已读。 |
| `dedupeKey` | 去重键。 |
| `createdAt`、`readAt` | 时间字段。 |

约束：通知只能由目标用户标记已读；来源失效后只保留不泄露内容的摘要。

### AuditLog

安全、权限和关键动作审计。

| 字段 | 说明 |
|---|---|
| `id` | UUID 主键。 |
| `actorId` | 操作者，可为空表示系统。 |
| `targetType`、`targetId` | 目标资源。 |
| `action` | 动作类型。 |
| `result` | `success` 或 `failure`。 |
| `failureReason` | 失败原因。 |
| `requestId` | 请求追踪 ID。 |
| `createdAt` | 创建时间。 |

约束：日志至少保留 180 天，不记录明文密码、完整 token、完整验证码或完整敏感凭证。

## 关系摘要

| 关系 | 类型 | 说明 |
|---|---|---|
| User - Friendship | 一对多 | 用户可发起或接收多个好友申请。 |
| User - DirectConversation | 多对多语义 | 通过 `participantAId` 和 `participantBId` 表示一对一会话。 |
| Server - Membership | 一对多 | 社区包含成员。 |
| Server - Role | 一对多 | 社区拥有角色集合。 |
| Membership - Role | 多对多 | 通过 `MembershipRole` 分配。 |
| Server - Channel | 一对多 | 社区包含频道。 |
| Channel - PermissionOverwrite | 一对多 | 频道拥有角色或成员覆盖规则。 |
| Channel/DirectConversation - Message | 一对多 | 消息归属频道或私聊。 |
| Message - Attachment | 多对多 | 消息可包含多个附件。 |
| User - ReadState | 一对多 | 用户对频道和私聊分别维护读取状态。 |
| Channel - VoiceSession | 一对多 | 语音频道包含当前成员状态。 |
| User - Notification | 一对多 | 用户接收通知。 |

## 索引建议

| 表 | 索引 |
|---|---|
| `users` | `username` unique、`email_or_phone` unique、`account_status` |
| `friendships` | `(requester_id, addressee_id)`、`(addressee_id, status)` |
| `direct_conversations` | `(participant_a_id, participant_b_id)` unique |
| `memberships` | `(server_id, user_id)` unique、`(user_id, member_status)` |
| `roles` | `(server_id, priority)`、`(server_id, is_default)` |
| `channels` | `(server_id, sort_order)`、`(server_id, type)` |
| `messages` | `(channel_id, created_at)`、`(conversation_id, created_at)`、`(sender_id, client_message_id)` |
| `read_states` | `(user_id, channel_id)` unique、`(user_id, conversation_id)` unique |
| `voice_sessions` | partial unique active session on `user_id` |
| `notifications` | `(user_id, is_read, created_at)`、`dedupe_key` unique |
| `audit_logs` | `(request_id)`、`(actor_id, created_at)`、`(target_type, target_id)` |

## 删除与失效规则

- 用户禁用后保留历史消息、通知和审计，但禁止登录。
- 社区归档或删除后邀请、频道、成员和语音会话全部失效。
- 成员退出、移除或封禁后，社区权限立即失效，实时房间必须移除。
- 频道删除后，历史消息可保留但不再允许新消息和语音加入。
- 消息撤回或删除后保留元数据用于审计和未读修正，不再以普通消息展示。
- 附件资源替换或消息删除后可以进入隐藏或待清理状态，访问仍需权限。
- 通知来源失效后可保留摘要，但不得继续暴露受限内容。

