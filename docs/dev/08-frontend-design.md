# 前端设计方案

## 目标

前端以现代浏览器 Web 客户端为基线，实现 Discord 类三栏工作区：

- 左侧社区导航。
- 中间频道列表和当前社区成员/语音状态。
- 右侧主消息面板与上下文操作。

移动端宽度不低于 360 像素时保留核心入口，通过抽屉或分屏切换社区、频道和消息。

## 路由

| 路由 | 页面 |
|---|---|
| `/login` | 登录页，提供"忘记密码"入口链接。 |
| `/register` | 注册页。 |
| `/forgot-password` | 密码重置第一步：输入邮箱，提交后展示统一成功提示并提供进入第二步的按钮。 |
| `/reset-password` | 密码重置第二步：输入邮箱 / 6 位 OTP / 新密码 / 确认新密码；附 60 秒倒计时的"重新发送验证码"按钮。 |
| `/app` | 已登录默认入口，重定向到最近社区或私聊。 |
| `/app/friends` | 好友列表、好友申请和私聊入口。 |
| `/app/dm/:conversationId` | 一对一私聊。 |
| `/app/servers/:serverId/channels/:channelId` | 社区文本频道。 |
| `/app/servers/:serverId/voice/:channelId` | 语音频道状态视图。 |
| `/app/servers/:serverId/settings` | 社区设置、频道、角色和成员管理。 |
| `/app/notifications` | 通知列表和已读管理。 |

未登录访问 `/app/*` 重定向到 `/login`。已登录访问登录注册页重定向到 `/app`。

## 状态管理

| 状态 | 工具 | 说明 |
|---|---|---|
| 服务端数据 | TanStack Query | 用户、社区、频道、消息、通知、角色。 |
| 本地 UI | Zustand | 当前社区、当前频道、打开的设置面板、语音控制条。 |
| 表单 | React Hook Form + Zod | 登录、注册、资料、频道、角色配置。 |
| 实时连接 | 自定义 Socket client | 连接 `/realtime`，分发事件到查询缓存。 |
| 语音媒体 | 自定义 hook + Zustand | mediasoup-client `Device`、send/recv `Transport`、`Producer`、`Consumer` 引用，本地音轨、输入/输出设备、音量计、active speaker 列表。 |

实时事件只更新当前用户有权可见的缓存。收到 `PermissionChanged` 后强制刷新社区详情、频道列表和权限摘要。

## 页面布局

### 登录与注册

- 登录表单支持用户名、邮箱或手机号。
- 注册表单支持用户名、联系方式和密码校验。
- 错误信息使用统一错误码映射，不展示敏感服务端细节。
- 登录成功后拉取用户摘要、社区列表、好友摘要、未读和通知摘要。

### 主工作区

| 区域 | 内容 |
|---|---|
| 社区栏 | 已加入社区、创建社区、加入邀请入口。 |
| 频道栏 | 当前社区文本频道、语音频道、频道管理入口。 |
| 消息区 | 历史消息、未读定位、发送框、附件入口、提及提示。 |
| 成员区 | 在线成员、离线成员、角色摘要、语音成员状态。 |
| 顶部栏 | 当前频道名、通知入口、搜索入口 P1。 |
| 语音控制条 | 当前语音频道、静音、闭麦、离开、输入设备选择、输出设备选择、输入音量条、active speaker 高亮、重连提示、PTT (P1)。 |

频道栏和管理入口必须按服务端返回的权限摘要控制显示。

### 私聊与好友

- 好友页展示好友列表、待处理申请和添加好友入口。
- 添加好友入口使用搜索体验：输入至少 2 个字符后按 `username` / `nickname` 搜索公开用户资料，结果展示昵称、`@username`、在线状态和关系状态。
- 搜索结果按关系状态决定操作：`none` 显示添加按钮，`pending_outgoing` 显示已发送，`pending_incoming` 引导到待处理列表，`accepted` 和 `self` 禁止重复添加。
- 输入合法 `username` 后按 Enter 可直接发送好友申请；UUID 添加仅作为 API 兼容能力，不作为前端主路径。
- 私聊窗口复用消息面板和发送框。
- 非好友或会话参与者不匹配时展示无权访问状态，并清理相关订阅。

### 社区设置

- 频道管理：创建文本/语音频道、编辑名称、主题、排序、权限覆盖。
- 角色管理：创建角色、修改权限位、颜色、优先级。
- 成员管理：查看成员、分配角色、移除、禁言、恢复。
- 普通成员不能看到管理入口；服务端拒绝仍需要在 UI 上反馈。

## 关键交互流程

### 注册登录

1. 用户注册并进入账号状态页。
2. 用户登录成功后保存 token。
3. 前端建立 Socket 连接。
4. 拉取社区、好友、通知和未读摘要。
5. 进入最近访问的社区或好友页。

### 密码重置（OTP 两步流程）

1. 登录页点击「忘记密码？」跳转 `/forgot-password`。
2. 在 `/forgot-password` 输入邮箱并提交，调用 `POST /auth/forgot-password`。无论后端是否真的发送了邮件，前端都展示同一段成功提示（"若该邮箱已注册，验证码已发送…"），点击「我已收到验证码，去重置密码」跳转 `/reset-password?email=<email>`。
3. 在 `/reset-password` 自动填入邮箱（仍可修改），输入邮箱中收到的 6 位 OTP、新密码、确认新密码；提交调用 `POST /auth/reset-password`。
4. 成功时通过全局 toast 提示「密码已重置，请用新密码登录」并跳转 `/login`；前端不主动清理 Auth Store，因为该流程在 `PublicOnlyRoute` 守卫下匿名访问。
5. 失败时按错误码反馈：`PASSWORD_RESET_TOKEN_INVALID` 显示"验证码无效或已过期"，`PASSWORD_RESET_TOO_MANY_ATTEMPTS` 显示"错误次数过多，请重新申请验证码"，`VALIDATION_FAILED` 显示具体字段错误；不揭示账户是否存在。
6. 「重新发送验证码」按钮带 60 秒倒计时（与后端冷却保持一致）；倒计时结束后才允许再次调用 forgot-password。

### 加入社区并发送消息

1. 用户输入邀请码。
2. 调用 `JoinServer`。
3. 进入返回的默认频道。
4. 订阅社区和频道房间。
5. 加载历史消息和最近未读位置。
6. 发送消息，先显示本地 pending 状态。
7. 服务端返回或 `MessageCreated` 到达后替换为正式消息。

### 权限变化

1. 客户端收到 `PermissionChanged`。
2. 刷新社区详情、频道列表和权限摘要。
3. 如果当前频道已不可见，退出频道并显示无权提示。
4. 清理对应消息缓存和 Socket 订阅。

### 语音状态

1. 用户点击语音频道，调用 `JoinVoiceChannel`，获得 `session_id`、`media.router_rtp_capabilities` 与 `media.ice_servers`。
2. 基于 mediasoup-client 初始化 `Device`，加载 RTP capabilities。
3. 通过 Socket emit `VoiceTransportCreated` 两次，分别建立 send/recv `WebRtcTransport`，缓存 ICE/DTLS 参数。
4. 调用 `getUserMedia({ audio: true })` 获取本地麦克风音轨，处理 `NotAllowedError`（权限被拒）与 `NotFoundError`（无设备）。
5. 在 send Transport 上 produce 音轨，发送 `VoiceProducerCreated`；服务端校验 `SPEAK_VOICE` 通过后返回 `producer_id`。
6. 对 `JoinVoiceChannel.media.active_producers`、轮询到的 `sessions[].producer_id` 和后续 `VoiceProducerCreated` 广播逐个 emit `VoiceConsumerCreated` 创建本地 Consumer，随后 emit `VoiceConsumerResumed` 恢复服务端 Consumer，并将远端音轨绑定到隐藏 `<audio>` 元素。
7. 自动播放策略：当前桌面 E2E 使用用户手势/浏览器策略允许自动播放；移动端兜底按钮作为 P1 交互增强。
8. 静音切换：关闭/恢复本地麦克风 track，同时调用 `PATCH /voice/sessions/{id}/state`，服务端同步 `Producer.pause/resume`。
9. 闭麦切换：将所有远端 `<audio>` 元素静音，并 `PATCH state` 同步 `deafen_state`。
10. 收到 `VoiceActiveSpeaker` 时高亮当前发言成员（边框 + 图标 + aria-live 文本）。
11. TURN 凭证在 join 和 transport 创建时下发；长会话刷新接口已保留，当前客户端在重新加入/重协商时获取新凭证。
12. 离开 / 断线 / 收到 `VoiceProducerClosed(reason=permission_lost)` 时关闭所有 Transport、释放音轨、移除控制条；收到 `reason=worker_died` 时自动重新加入一次。

## 消息体验

- 消息列表支持游标加载，进入频道时定位最近未读。
- 发送框支持文本、附件入口和提及提示。
- 发送中消息显示 pending 状态，失败后允许重试。
- 撤回和删除消息展示为已撤回或已删除状态。
- 附件展示前调用受保护附件访问接口，不能直接拼接对象存储地址。

## 错误处理

| 错误码 | 前端行为 |
|---|---|
| `AUTH_REQUIRED` | 清理会话，跳转登录页。 |
| `INVALID_CREDENTIALS` | 在登录表单上展示"用户名或密码错误"，不清理会话状态。 |
| `PERMISSION_DENIED` | 显示无权提示，刷新权限摘要。 |
| `RESOURCE_NOT_FOUND` | 显示资源不存在或已失效。 |
| `CONFLICT` | 按业务场景展示重复申请、重复加入或幂等冲突。 |
| `RATE_LIMITED` | 禁用提交按钮并展示稍后重试。 |
| `PASSWORD_RESET_TOKEN_INVALID` | 在重置页提示"验证码无效或已过期，请检查后重试或重新申请"，不揭示账户是否存在。 |
| `PASSWORD_RESET_TOO_MANY_ATTEMPTS` | 提示"错误次数过多，请返回上一步重新申请验证码"，引导回到 `/forgot-password`。 |
| `DEPENDENCY_UNAVAILABLE` | 对附件、通知等非核心能力展示降级提示。 |

语音设备、媒体协商和 TURN 不可达的异常不通过服务端 `ErrorCode` 传递，由 `apps/web/src/features/voice/voice-client.ts` 在客户端层捕获并联动 UI：

- **麦克风权限被拒**（`NotAllowedError` / `NotFoundError` 等 `getUserMedia` 异常）：voice-client 切换状态为 `failed` 并清理控制条；UI 引导用户在浏览器权限设置中授予访问。
- **媒体协商超时**（Transport / Producer 创建未在客户端计时器内完成）：voice-client 自动重试一次完整协商；仍失败则切换为 `failed` 并提示"加入失败，请稍后重试"。
- **ICE 穿透失败 / TURN 不可达**（ICE 连接状态最终落入 `failed`）：voice-client 提示对称 NAT 环境穿透失败，建议切换网络或稍后重试。

服务端在 `JOIN_VOICE` / `SPEAK_VOICE` 等权限拒绝时仍走标准 `PERMISSION_DENIED`；前端按此区分用户引导文案。

## 响应式设计

- 桌面端使用社区栏、频道栏、消息区和成员区并列布局。
- 移动端使用底部或顶部入口切换社区、频道、消息和成员。
- 移动端核心任务“注册登录、加入社区、发送消息、加入语音频道”的主要路径不超过 3 次关键点击。
- 移动端语音控制条移至底部固定栏，至少包含静音、闭麦、离开三按钮，配合系统层音量键。
- 消息输入框、语音控制条和通知入口必须在移动端可访问。

## 可访问性与可用性

- 所有按钮、输入框和菜单有明确可读标签。
- 表单错误聚焦到对应字段。
- 消息列表支持键盘滚动和输入框快捷发送。
- 色彩不能作为权限或状态的唯一表达，在线、静音、闭麦等状态同时使用图标或文字。
- active speaker 高亮同时使用边框、图标与 `aria-live="polite"` 文本通告，不依赖颜色；说话停止时清除。
