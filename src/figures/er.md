# Eiscord 实体关系图

```mermaid
erDiagram
    USERS ||--o{ AUTH_SESSIONS : "拥有"
    USERS ||--o{ ATTACHMENTS : "上传"
    USERS ||--o{ FRIENDSHIPS : "建立"
    USERS ||--o{ DIRECT_CONVERSATIONS : "发起"
    FRIENDSHIPS }|..|{ DIRECT_CONVERSATIONS : "关联"
    USERS ||--o{ NOTIFICATIONS : "接收"

    USERS ||--o{ SERVERS : "创建"
    USERS ||--o{ MEMBERSHIPS : "加入"
    SERVERS ||--o{ MEMBERSHIPS : "管理"
    SERVERS ||--o{ INVITATIONS : "邀请"
    SERVERS ||--o{ ROLES : "拥有"
    SERVERS ||--o{ CHANNELS : "包含"

    USERS ||--o{ MESSAGES : "发送"
    CHANNELS ||--o{ MESSAGES : "归属"
    DIRECT_CONVERSATIONS ||--o{ MESSAGES : "记录"

    MEMBERSHIPS ||--o{ MEMBERSHIP_ROLES : "赋予"
    ROLES ||--o{ MEMBERSHIP_ROLES : "分配"
    CHANNELS ||--o{ PERMISSION_OVERWRITES : "配置"

    USERS ||--o{ READ_STATES : "产生"
    CHANNELS ||--o{ READ_STATES : "记录"
    DIRECT_CONVERSATIONS ||--o{ READ_STATES : "记录"

    CHANNELS ||--o{ VOICE_SESSIONS : "承载"
    USERS ||--o{ VOICE_SESSIONS : "参与"

    USERS ||--o{ AUDIT_LOGS : "触发"