CREATE TABLE "messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope_type" VARCHAR(20) NOT NULL,
  "channel_id" UUID,
  "conversation_id" UUID,
  "sender_id" UUID NOT NULL,
  "content" VARCHAR(4000),
  "visibility" VARCHAR(32) NOT NULL DEFAULT 'visible',
  "client_message_id" VARCHAR(120),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_scope_type_check" CHECK ("scope_type" IN ('channel', 'dm')),
  CONSTRAINT "messages_visibility_check" CHECK ("visibility" IN ('visible', 'retracted', 'deleted')),
  CONSTRAINT "messages_scope_target_check" CHECK (
    ("scope_type" = 'channel' AND "channel_id" IS NOT NULL AND "conversation_id" IS NULL)
    OR ("scope_type" = 'dm' AND "conversation_id" IS NOT NULL AND "channel_id" IS NULL)
  )
);

CREATE TABLE "message_attachments" (
  "message_id" UUID NOT NULL,
  "attachment_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("message_id", "attachment_id")
);

CREATE TABLE "message_mentions" (
  "message_id" UUID NOT NULL,
  "mentioned_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_mentions_pkey" PRIMARY KEY ("message_id", "mentioned_user_id")
);

CREATE TABLE "read_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "scope_type" VARCHAR(20) NOT NULL,
  "channel_id" UUID,
  "conversation_id" UUID,
  "last_read_message_id" UUID,
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "read_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "read_states_scope_type_check" CHECK ("scope_type" IN ('channel', 'dm')),
  CONSTRAINT "read_states_nonnegative_unread_check" CHECK ("unread_count" >= 0),
  CONSTRAINT "read_states_scope_target_check" CHECK (
    ("scope_type" = 'channel' AND "channel_id" IS NOT NULL AND "conversation_id" IS NULL)
    OR ("scope_type" = 'dm' AND "conversation_id" IS NOT NULL AND "channel_id" IS NULL)
  )
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "source_type" VARCHAR(40) NOT NULL,
  "source_id" UUID NOT NULL,
  "content_preview" VARCHAR(280) NOT NULL,
  "is_read" BOOLEAN NOT NULL DEFAULT FALSE,
  "dedupe_key" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMPTZ(6),

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messages_channel_id_created_at_idx"
  ON "messages"("channel_id", "created_at");
CREATE INDEX "messages_conversation_id_created_at_idx"
  ON "messages"("conversation_id", "created_at");
CREATE INDEX "messages_sender_id_client_message_id_idx"
  ON "messages"("sender_id", "client_message_id");
CREATE UNIQUE INDEX "messages_sender_id_channel_id_client_message_id_key"
  ON "messages"("sender_id", "channel_id", "client_message_id");
CREATE UNIQUE INDEX "messages_sender_id_conversation_id_client_message_id_key"
  ON "messages"("sender_id", "conversation_id", "client_message_id");

CREATE INDEX "message_attachments_attachment_id_idx"
  ON "message_attachments"("attachment_id");

CREATE INDEX "message_mentions_mentioned_user_id_idx"
  ON "message_mentions"("mentioned_user_id");

CREATE UNIQUE INDEX "read_states_user_id_channel_id_key"
  ON "read_states"("user_id", "channel_id");
CREATE UNIQUE INDEX "read_states_user_id_conversation_id_key"
  ON "read_states"("user_id", "conversation_id");
CREATE INDEX "read_states_user_id_unread_count_idx"
  ON "read_states"("user_id", "unread_count");

CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
CREATE INDEX "notifications_user_id_is_read_created_at_idx"
  ON "notifications"("user_id", "is_read", "created_at");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_conversations"
  ADD CONSTRAINT "direct_conversations_last_message_id_fkey"
  FOREIGN KEY ("last_message_id") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "message_attachments"
  ADD CONSTRAINT "message_attachments_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_attachments"
  ADD CONSTRAINT "message_attachments_attachment_id_fkey"
  FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_mentions"
  ADD CONSTRAINT "message_mentions_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_mentions"
  ADD CONSTRAINT "message_mentions_mentioned_user_id_fkey"
  FOREIGN KEY ("mentioned_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "read_states"
  ADD CONSTRAINT "read_states_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "read_states"
  ADD CONSTRAINT "read_states_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "read_states"
  ADD CONSTRAINT "read_states_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "read_states"
  ADD CONSTRAINT "read_states_last_read_message_id_fkey"
  FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
