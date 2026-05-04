CREATE TABLE "voice_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "channel_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "mute_state" BOOLEAN NOT NULL DEFAULT false,
  "deafen_state" BOOLEAN NOT NULL DEFAULT false,
  "connection_status" VARCHAR(32) NOT NULL DEFAULT 'connecting',
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "voice_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voice_sessions_connection_status_check"
    CHECK ("connection_status" IN ('connecting', 'connected', 'reconnecting', 'disconnected'))
);

CREATE UNIQUE INDEX "voice_sessions_active_user_key"
  ON "voice_sessions"("user_id")
  WHERE "ended_at" IS NULL;

CREATE INDEX "voice_sessions_channel_id_ended_at_idx"
  ON "voice_sessions"("channel_id", "ended_at");

CREATE INDEX "voice_sessions_user_id_ended_at_idx"
  ON "voice_sessions"("user_id", "ended_at");

ALTER TABLE "voice_sessions"
  ADD CONSTRAINT "voice_sessions_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_sessions"
  ADD CONSTRAINT "voice_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
