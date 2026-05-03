CREATE TABLE "friendships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requester_id" UUID NOT NULL,
  "addressee_id" UUID NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "friendships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "friendships_not_self_check" CHECK ("requester_id" <> "addressee_id"),
  CONSTRAINT "friendships_status_check" CHECK ("status" IN ('pending', 'accepted', 'rejected', 'deleted'))
);

CREATE TABLE "direct_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "participant_a_id" UUID NOT NULL,
  "participant_b_id" UUID NOT NULL,
  "last_message_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "direct_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "direct_conversations_order_check" CHECK ("participant_a_id" < "participant_b_id")
);

CREATE TABLE "servers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "icon_attachment_id" UUID,
  "description" VARCHAR(280),
  "status" VARCHAR(32) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "servers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "servers_status_check" CHECK ("status" IN ('active', 'archived', 'deleted'))
);

CREATE TABLE "invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "server_id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "created_by_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6),
  "max_uses" INTEGER,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitations_nonnegative_uses_check" CHECK (
    ("max_uses" IS NULL OR "max_uses" >= 0)
    AND "used_count" >= 0
  ),
  CONSTRAINT "invitations_status_check" CHECK ("status" IN ('active', 'revoked', 'expired'))
);

CREATE TABLE "memberships" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "server_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "nick_in_server" VARCHAR(64),
  "member_status" VARCHAR(32) NOT NULL DEFAULT 'active',
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memberships_status_check" CHECK ("member_status" IN ('active', 'muted', 'removed', 'banned'))
);

CREATE TABLE "roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "server_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "permission_bits" BIGINT NOT NULL DEFAULT 0,
  "color" VARCHAR(20),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "is_default" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_roles" (
  "membership_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "assigned_by_id" UUID,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membership_id", "role_id")
);

CREATE TABLE "channels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "server_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "type" VARCHAR(20) NOT NULL,
  "topic" VARCHAR(280),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "channels_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "channels_type_check" CHECK ("type" IN ('text', 'voice')),
  CONSTRAINT "channels_status_check" CHECK ("status" IN ('active', 'deleted'))
);

CREATE INDEX "friendships_requester_id_addressee_id_idx"
  ON "friendships"("requester_id", "addressee_id");
CREATE INDEX "friendships_addressee_id_status_idx"
  ON "friendships"("addressee_id", "status");
CREATE UNIQUE INDEX "friendships_active_pair_key"
  ON "friendships"(
    LEAST("requester_id", "addressee_id"),
    GREATEST("requester_id", "addressee_id")
  )
  WHERE "status" IN ('pending', 'accepted');

CREATE UNIQUE INDEX "direct_conversations_participant_a_id_participant_b_id_key"
  ON "direct_conversations"("participant_a_id", "participant_b_id");
CREATE INDEX "direct_conversations_participant_b_id_idx"
  ON "direct_conversations"("participant_b_id");

CREATE INDEX "servers_owner_id_status_idx" ON "servers"("owner_id", "status");

CREATE UNIQUE INDEX "invitations_code_key" ON "invitations"("code");
CREATE INDEX "invitations_server_id_status_idx" ON "invitations"("server_id", "status");

CREATE UNIQUE INDEX "memberships_server_id_user_id_key"
  ON "memberships"("server_id", "user_id");
CREATE INDEX "memberships_user_id_member_status_idx"
  ON "memberships"("user_id", "member_status");

CREATE INDEX "roles_server_id_priority_idx" ON "roles"("server_id", "priority");
CREATE INDEX "roles_server_id_is_default_idx" ON "roles"("server_id", "is_default");
CREATE UNIQUE INDEX "roles_one_default_per_server_key"
  ON "roles"("server_id")
  WHERE "is_default" = TRUE;

CREATE INDEX "membership_roles_role_id_idx" ON "membership_roles"("role_id");

CREATE INDEX "channels_server_id_sort_order_idx" ON "channels"("server_id", "sort_order");
CREATE INDEX "channels_server_id_type_idx" ON "channels"("server_id", "type");

ALTER TABLE "friendships"
  ADD CONSTRAINT "friendships_requester_id_fkey"
  FOREIGN KEY ("requester_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "friendships"
  ADD CONSTRAINT "friendships_addressee_id_fkey"
  FOREIGN KEY ("addressee_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_conversations"
  ADD CONSTRAINT "direct_conversations_participant_a_id_fkey"
  FOREIGN KEY ("participant_a_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_conversations"
  ADD CONSTRAINT "direct_conversations_participant_b_id_fkey"
  FOREIGN KEY ("participant_b_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "servers"
  ADD CONSTRAINT "servers_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "servers"
  ADD CONSTRAINT "servers_icon_attachment_id_fkey"
  FOREIGN KEY ("icon_attachment_id") REFERENCES "attachments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_server_id_fkey"
  FOREIGN KEY ("server_id") REFERENCES "servers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_server_id_fkey"
  FOREIGN KEY ("server_id") REFERENCES "servers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_server_id_fkey"
  FOREIGN KEY ("server_id") REFERENCES "servers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membership_roles"
  ADD CONSTRAINT "membership_roles_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "memberships"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membership_roles"
  ADD CONSTRAINT "membership_roles_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membership_roles"
  ADD CONSTRAINT "membership_roles_assigned_by_id_fkey"
  FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "channels"
  ADD CONSTRAINT "channels_server_id_fkey"
  FOREIGN KEY ("server_id") REFERENCES "servers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
